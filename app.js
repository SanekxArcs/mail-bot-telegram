require("dotenv").config();

const telegramController = require("./controllers/telegramController");
const emailController = require("./controllers/emailController");
const logger = require("./utils/logger");

// Запускаємо перевірку пошти кожні 5 хвилин
setInterval(() => {
  emailController.checkEmail();
},  1 * 60 * 1000);

// Запускаємо Telegram бота
telegramController.startBot();

logger.info("Бот запущено та готовий до роботи.");
