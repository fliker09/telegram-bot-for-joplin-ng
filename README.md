# Telegram bot for Joplin

This is a simple bot to create notes in Joplin note-taking app via its Web Clipper service from the messages forwarded in Telegram messaging app.

## Installation

1.  Clone this repo.
2.  Replace the tokens in the .env file.
3.  Set your Telegram user ID in .env file.
4.  Set your notebook ID in .env file.
5.  Run `npm install telegraf axios form-data dotenv` in the project's folder
6.  Run Joplin app with Web Clipper service active.
7.  Run `node.js index.js` and see how the bot works for you.
8.  (Optional) If all good and you want it as a service then edit `tg2joplin.service` file accordingly (adjust the username and paths).
9.  (Optional) Run `sudo cp tg2joplin.service /etc/systemd/system/tg2joplin.service`
10.  (Optional) Run `sudo systemctl daemon-reload && sudo systemctl start tg2joplin.service && sudo systemctl enable tg2joplin.service`
11.  Congrats, you are done!

## FAQ

Q: Telegram bots are public! Doesn't it mean that anyone can forward a message to my bot instance and create a note in my personal Joplin instance?!  
A: Nope, that won't happen, that's why step 3 exists in the Installation procedure. Go find `@userinfobot` and get your user ID from him, so you can limit access to yourself alone. There is even a dedicated parameter which allows you to set the message you want to show to non-authorized users.

Q: Where do I get Joplin's token?  
A: Just go to Tools -> Options -> Web Clipper. In Advanced options section you will see your token (you even have `Copy token` button there for convenience).

Q: How to get notebook ID from Joplin?  
A: Choose the desired notebook, right-click on it, choose Copy external link. You will get something like `joplin://x-callback-url/openFolder?id=ZZZZ` in your clipboard. You need the ZZZZ part!

Q: What happens when Joplin is not running?  
A: Bot will let you know that it can't reach Joplin. Please launch it and forward the message again!

Q: What happens when bot is not running?  
A: Next time you run it - all the unsaved messages will get sent to Joplin! Do note - if at that moment Joplin is not running then this won't work and you will have to forward once more.

Q: Did you vibecode it?  
A: Yeeep, shamelessly! Took the base from the fork I made and asked Gemini in Pro mode to add the features I was missing. It worked out really nice!

Q: I am missing some features! Will you add it?!  
A: It depends. If some minor fix/adjustment/feature - just let me know in the Issues. You can also open a Pull Request. If I won't agree to implement / merge your code - I will politely ask you to make your own fork and work on it there!

Q: I need banner and logo images for the bot. You got something?  
A: Yep, there are two PNG files in the repo, please use them if you like them. Both generated with Gemini. License-wise should be safe to use!