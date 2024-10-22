const TelegramBot = require("node-telegram-bot-api");
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const logger = require("../utils/logger");
const senderStore = require("../utils/senderStore");
const gmailService = require("../services/gmailService");

const telegramChatId = process.env.TELEGRAM_CHAT_ID;

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Вітаю! Я ваш бот для управління поштою. Ви можете використовувати наступні команди:\n/settings - Налаштування бота\n/subscriptions - Керування підписками"
  );
});

bot.onText(/\/settings/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Тут ви можете змінити налаштування бота. (Ця функція ще в розробці)"
  );
});

bot.onText(/\/subscriptions/, async (msg) => {
  const senders = senderStore.getAllSendersByCategory("newsletter");
  if (senders.length > 0) {
    const subscriptions = senders.join("\n");
    bot.sendMessage(
      msg.chat.id,
      `Ваші підписки:\n${subscriptions}\n\nВведіть email, щоб відписатися.`
    );
    bot.once("message", async (replyMsg) => {
      const emailToUnsubscribe = replyMsg.text;
      senderStore.deleteSender(emailToUnsubscribe);
      bot.sendMessage(msg.chat.id, `Ви відписалися від ${emailToUnsubscribe}.`);
    });
  } else {
    bot.sendMessage(msg.chat.id, "У вас немає активних підписок.");
  }
});

bot.on("message", async (msg) => {
  if (msg.text.startsWith("/")) return; // Ігноруємо команди
  const emailData = getEmailDataForReply();
  if (emailData) {
    await sendEmailReply(emailData, msg.text);
  }
});

async function sendMessage(text, options = {}) {
  await bot.sendMessage(telegramChatId, text, options);
}

function getEmailDataForReply() {
  // Реалізуйте логіку для отримання даних листа, на який потрібно відповісти
  // Це може бути останній лист або лист, вибраний користувачем
  return null;
}

async function sendEmailReply(emailData, replyMessage) {
  try {
    await gmailService.sendEmailReply(emailData, replyMessage);
    await sendMessage(`Відповідь надіслано ${emailData.sender}.`);
  } catch (error) {
    logger.error("Помилка при відправці відповіді на лист:", error);
    await sendMessage(
      "Не вдалося відправити відповідь. Спробуйте ще раз пізніше."
    );
  }
}

module.exports = {
  bot,
  sendMessage,
};
