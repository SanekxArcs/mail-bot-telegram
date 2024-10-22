const gmailService = require("../services/gmailService");
const openaiService = require("../services/openaiService");
const calendarController = require("./calendarController");
const telegramController = require("./telegramController");
const logger = require("../utils/logger");
const senderStore = require("../utils/senderStore"); // Новий модуль для зберігання відправників

const emailIds = {};

async function checkEmail() {
  try {
    const messages = await gmailService.getUnreadEmails();
    for (const message of messages) {
      const { id, sender, subject, content } =
        await gmailService.getEmailDetails(message.id);

      // Перевірка, чи відправник відомий
      const senderCategory = senderStore.getSenderCategory(sender);

      if (!senderCategory) {
        await askForSorting(sender, content);
      } else {
        await handleEmailByCategory(senderCategory, content);
      }

      // Зберігаємо дані листа для можливості відповіді
      emailIds[id] = { id, sender, subject };
      await telegramController.sendMessage(
        `Новий лист від ${sender} з темою "${subject}".\n\nЩоб відповісти, напишіть повідомлення.`
      );

      // Позначаємо лист як прочитаний
      await gmailService.markEmailAsRead(id);
    }
    logger.info("Перевірка пошти виконана успішно");
  } catch (error) {
    logger.error("Помилка при перевірці пошти:", error);
  }
}

async function askForSorting(emailSender, emailContent) {
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Розсилка", callback_data: "newsletter" }],
        [{ text: "Завдання", callback_data: "task" }],
        [{ text: "Важливе", callback_data: "important" }],
        [{ text: "Інше", callback_data: "other" }],
      ],
    },
  };

  await telegramController.sendMessage(
    `Як ви хочете відсортувати лист від ${emailSender}?`,
    options
  );

  telegramController.bot.once("callback_query", async (callbackQuery) => {
    const category = callbackQuery.data;
    senderStore.saveSender(emailSender, category);
    await telegramController.sendMessage(
      `Лист від ${emailSender} збережено в категорію "${category}".`
    );
    await handleEmailByCategory(category, emailContent);
  });
}

async function handleEmailByCategory(category, emailContent) {
  switch (category) {
    case "newsletter":
      await gmailService.unsubscribeFromNewsletter(emailContent);
      break;
    case "task":
      const task = extractTaskFromEmail(emailContent);
      if (task) {
        await calendarController.addTaskToCalendar(
          task.title,
          emailContent,
          task.dueDate
        );
      }
      break;
    case "important":
      await telegramController.sendMessage(
        'Лист віднесено до категорії "Важливе".'
      );
      break;
    case "other":
      await telegramController.sendMessage(
        'Лист віднесено до категорії "Інше".'
      );
      break;
  }
}

function extractTaskFromEmail(emailContent) {
  const taskTitleMatch = emailContent.match(/Завдання: (.+)/i);
  const dueDateMatch = emailContent.match(/Дедлайн: (.+)/i);

  if (taskTitleMatch && dueDateMatch) {
    return {
      title: taskTitleMatch[1],
      dueDate: new Date(dueDateMatch[1]).toISOString(),
    };
  }
  return null;
}

module.exports = checkEmail;
