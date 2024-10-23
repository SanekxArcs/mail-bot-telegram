// app.js

require("dotenv").config();

const telegramController = require("./controllers/telegramController");
const emailController = require("./controllers/emailController");
const logger = require("./utils/logger");

// Запускаємо перевірку пошти кожні 5 хвилин
setInterval(() => {
  emailController.checkEmail();
}, 5 * 60 * 1000); // 5 хвилин

// Запускаємо щоденне надсилання підсумку о 18:00
scheduleDailySummary(18, 0); // Час у 24-годинному форматі: 18:00

// Запускаємо Telegram бота
telegramController.startBot();

logger.info("Бот запущено та готовий до роботи.");

// Функція для планування щоденного підсумку
function scheduleDailySummary(hour, minute) {
  const now = new Date();
  const nextTime = new Date();

  nextTime.setHours(hour);
  nextTime.setMinutes(minute);
  nextTime.setSeconds(0);

  if (now > nextTime) {
    // Якщо час уже пройшов, плануємо на наступний день
    nextTime.setDate(nextTime.getDate() + 1);
  }

  const timeUntilNext = nextTime - now;

  setTimeout(() => {
    emailController.sendDailySummary();
    // Після виконання плануємо наступне виконання через 24 години
    setInterval(() => {
      emailController.sendDailySummary();
    }, 24 * 60 * 60 * 1000); // 24 години
  }, timeUntilNext);
}
