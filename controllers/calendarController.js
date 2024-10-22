const calendarService = require("../services/calendarService");
const telegramController = require("./telegramController");
const logger = require("../utils/logger");

async function addTaskToCalendar(taskTitle, taskDescription, dueDate) {
  try {
    await calendarService.addEvent(taskTitle, taskDescription, dueDate);
    await telegramController.sendMessage(
      `Завдання "${taskTitle}" додано до Google Календаря.`
    );
  } catch (error) {
    logger.error("Помилка при додаванні завдання до календаря:", error);
    await telegramController.sendMessage(
      "Не вдалося додати завдання до календаря."
    );
  }
}

module.exports = {
  addTaskToCalendar,
};
