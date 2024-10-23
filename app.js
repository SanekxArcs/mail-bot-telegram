// app.js

require("dotenv").config();

const telegramController = require("./controllers/telegramController");
const emailController = require("./controllers/emailController");
const logger = require("./utils/logger");

// Запускаємо перевірку пошти з інтервалом, що налаштовується
setInterval(() => {
  emailController.checkEmail();
}, emailController.settings.updateInterval);

// Запускаємо Telegram бота
telegramController.startBot();

logger.info("Бот запущено та готовий до роботи.");
