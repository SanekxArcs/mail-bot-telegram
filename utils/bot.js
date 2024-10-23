// utils/bot.js

const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

async function sendMessage(chatId, text, options = {}) {
  await bot.sendMessage(chatId, text, options);
}

module.exports = {
  bot,
  sendMessage,
};
