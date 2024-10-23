// app.js

require("dotenv").config();

const telegramController = require("./controllers/telegramController");
const emailController = require("./controllers/emailController");
const logger = require("./utils/logger");

// Запускаємо Telegram бота
telegramController.startBot();

// Логування
logger.info("Бот запущено та готовий до роботи.");
