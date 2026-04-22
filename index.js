require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');
const FormData = require('form-data');

const bot = new Telegraf(process.env.BOT_TOKEN);
const joplinUrl = process.env.JOPLIN_URL || 'http://127.0.0.1:41184';
const joplinToken = process.env.JOPLIN_TOKEN;
const folderId = process.env.JOPLIN_FOLDER_ID;

// Load new environment variables
const disableStartMsg = process.env.DISABLE_START_MESSAGE === 'true';
const allowedUsers = process.env.ALLOWED_USER_IDS ? process.env.ALLOWED_USER_IDS.split(',').map(id => id.trim()) : [];
const unauthorizedMsg = process.env.UNAUTHORIZED_MESSAGE || "⛔ Access Denied.";

const mediaGroupCache = new Map();

// --- SECURITY MIDDLEWARE ---
// This runs before anything else. If the user isn't allowed, it stops here.
bot.use(async (ctx, next) => {
    if (allowedUsers.length > 0) {
        const userId = ctx.from?.id?.toString();
        if (!userId || !allowedUsers.includes(userId)) {
            console.log(`[Security] Blocked unauthorized attempt from User ID: ${userId}`);

            // Only reply if it's a private chat to avoid spamming groups if someone adds the bot there
            if (ctx.chat?.type === 'private') {
                await ctx.reply(unauthorizedMsg);
            }
            return; // Stops the execution chain
        }
    }
    return next(); // User is allowed, proceed to the handlers
});

/**
 * Converts Telegram Entities to Markdown
 */
function applyFormatting(text, entities) {
    if (!entities || !text) return text;
    let result = text;
    const sortedEntities = [...entities].sort((a, b) => b.offset - a.offset);
    for (const entity of sortedEntities) {
        const { offset, length, type, url } = entity;
        const part = result.substring(offset, offset + length);
        let replacement = part;
        switch (type) {
            case 'bold': replacement = `**${part}**`; break;
            case 'italic': replacement = `*${part}*`; break;
            case 'code': replacement = `\`${part}\``; break;
            case 'pre': replacement = `\`\`\`\n${part}\n\`\`\``; break;
            case 'text_link': replacement = `[${part}](${url})`; break;
            case 'url': replacement = `[${part}](${part})`; break;
        }
        result = result.substring(0, offset) + replacement + result.substring(offset + length);
    }
    return result;
}

/**
 * Downloads a file from Telegram and uploads it to Joplin
 */
async function uploadToJoplin(fileId, ctx, extension = 'jpg') {
    try {
        const fileLink = await ctx.telegram.getFileLink(fileId);
        const response = await axios.get(fileLink.href, {
            responseType: 'arraybuffer',
            timeout: 30000
        });
        const buffer = Buffer.from(response.data, 'binary');

        const form = new FormData();
        const filename = `tg_${Date.now()}_${Math.floor(Math.random() * 1000)}.${extension}`;

        form.append('props', JSON.stringify({ title: filename }));
        form.append('data', buffer, filename);

        const res = await axios.post(`${joplinUrl}/resources?token=${joplinToken}`, form, {
            headers: form.getHeaders(),
        });
        return { id: res.data.id, filename };

    } catch (error) {
        if (error.response && error.response.description?.includes('file is too big')) {
            throw new Error('TELEGRAM_LIMIT: This file exceeds the 20MB limit allowed for Telegram bots.');
        }
        if (error.code === 'ECONNREFUSED') {
            throw new Error('JOPLIN_OFFLINE: Could not connect to Joplin. Is it running?');
        }
        throw error;
    }
}

/**
 * Finalizes the note with all collected media
 */
async function finalizeNote(data) {
    let body = data.text || '';

    for (const item of data.media) {
        try {
            const resource = await uploadToJoplin(item.id, data.ctx, item.ext);
            body += `\n\n![${resource.filename}](:/${resource.id})`;
        } catch (e) {
            // If Joplin is offline, STOP the loop and throw the error upward
            if (e.message.includes('JOPLIN_OFFLINE')) {
                throw e;
            }
            // For other errors (like file too big), just notify and keep going
            console.error(e.message);
            await data.ctx.reply(`❌ ${e.message}`);
        }
    }

    const title = (data.rawText || 'Telegram Media').substring(0, 50).split('\n')[0] || 'Telegram Note';

    await axios.post(`${joplinUrl}/notes?token=${joplinToken}`, {
        title,
        body,
        parent_id: folderId
    });
}

/**
 * Master handler for all incoming content types
 */
async function handleIncoming(ctx) {
    const msg = ctx.message;
    const mgId = msg.media_group_id;

    let type = 'text';
    let fileId = null;
    let ext = 'jpg';

    if (msg.photo) {
        type = 'photo';
        fileId = msg.photo[msg.photo.length - 1].file_id;
    } else if (msg.video) {
        type = 'video';
        fileId = msg.video.file_id;
        ext = 'mp4';
    } else if (msg.video_note) {
        type = 'video_note';
        fileId = msg.video_note.file_id;
        ext = 'mp4';
    }

    if (type === 'text' && msg.text?.startsWith('/') && !mgId) return;

    const textContent = applyFormatting(msg.text || msg.caption || '', msg.entities || msg.caption_entities);
    const rawContent = msg.text || msg.caption || '';

    if (!mgId) {
        await finalizeNote({ text: textContent, rawText: rawContent, media: fileId ? [{ id: fileId, ext }] : [], ctx });
        return ctx.reply('✅ Saved to Joplin!');
    }

    if (!mediaGroupCache.has(mgId)) {
        mediaGroupCache.set(mgId, { text: '', rawText: '', media: [], ctx, timeout: null });
    }

    const group = mediaGroupCache.get(mgId);
    if (group.timeout) clearTimeout(group.timeout);

    if (textContent) {
        group.text = textContent;
        group.rawText = rawContent;
    }
    if (fileId) {
        group.media.push({ id: fileId, ext });
    }

    group.timeout = setTimeout(async () => {
        try {
            await finalizeNote(group);
            await ctx.reply(`✅ Saved album (${group.media.length} items)!`);
        } catch (err) {
            // Check if it's our custom offline error or a standard connection error
            if (err.message.includes('JOPLIN_OFFLINE') || err.code === 'ECONNREFUSED') {
                console.log("Joplin connection failed. Message not saved.");
                await ctx.reply('⚠️ Joplin is offline! Please open Joplin and try again.');
            } else {
                console.error("Unexpected Error:", err);
                await ctx.reply('❌ An unexpected error occurred while saving.');
            }
        } finally {
            mediaGroupCache.delete(mgId);
        }
    }, 1500);
}

// Check the env variable before sending the welcome message
bot.start((ctx) => {
    if (!disableStartMsg) {
        return ctx.reply('Bot is ready! I handle text, photos, videos, and mixed albums.');
    }
});

bot.on(['text', 'photo', 'video', 'video_note'], (ctx) => handleIncoming(ctx));

bot.launch().then(() => console.log('🚀 Secured Bot Version Running...'));
