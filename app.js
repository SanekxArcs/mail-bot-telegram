require("dotenv").config();
const bot = require("./controllers/telegramController");
const checkEmail = require("./controllers/emailController");
const logger = require("./utils/logger");

// Запуск перевірки пошти кожні 5 хвилин
setInterval(() => {
  checkEmail();
}, 5 * 60 * 1000); // 5 хвилин

// Обробка глобальних помилок
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});
