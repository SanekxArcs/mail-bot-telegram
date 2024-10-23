// controllers/emailController.js

const gmailService = require("../services/gmailService");
const openaiService = require("../services/openaiService");
const calendarController = require("./calendarController");
const { sendMessage, bot } = require("../utils/bot");
const logger = require("../utils/logger");
const senderStore = require("../utils/senderStore");
const categoryStore = require("../utils/categoryStore");

const pendingEmails = {};
const emailTimestamps = {};
const telegramChatId = process.env.TELEGRAM_CHAT_ID;

async function checkEmail() {
  try {
    const messages = await gmailService.getUnreadEmails();

    // Фільтруємо листи, які ще не оброблені
    const newMessages = messages.filter(
      (message) => !pendingEmails.hasOwnProperty(message.id)
    );

    // Обмежуємо кількість листів до 20
    const maxPendingEmails = 20;
    const availableSlots = maxPendingEmails - Object.keys(pendingEmails).length;
    const messagesToProcess = newMessages.slice(0, availableSlots);

    for (const message of messagesToProcess) {
      const { id, sender, subject, content } =
        await gmailService.getEmailDetails(message.id);

      // Перевірка, чи відправник відомий
      const senderCategory = senderStore.getSenderCategory(sender);

      if (!senderCategory) {
        // Зберігаємо деталі листа
        pendingEmails[id] = { sender, content, id };
        emailTimestamps[id] = Date.now();

        await askForSorting(sender, content, id);
      } else {
        await handleEmailByCategory(senderCategory, content);
        // Позначаємо лист як прочитаний
        await gmailService.markEmailAsRead(id);
      }
    }

    // Перевіряємо листи, які очікують понад 1 день
    const oneDayInMillis = 24 * 60 * 60 * 1000;
    for (const emailId in emailTimestamps) {
      if (Date.now() - emailTimestamps[emailId] >= oneDayInMillis) {
        // Видаляємо лист з очікування та залишаємо його непрочитаним
        delete pendingEmails[emailId];
        delete emailTimestamps[emailId];
      }
    }

    logger.info("Перевірка пошти виконана успішно");
  } catch (error) {
    logger.error("Помилка при перевірці пошти:", error);
  }
}

async function askForSorting(emailSender, emailContent, emailId) {
  const categories = categoryStore.loadCategories();

  // Створюємо кнопки категорій
  const categoryButtons = categories.map((category) => ({
    text: category,
    callback_data: `category_${category}_${emailId}`,
  }));

  // Додаємо кнопку "Нова категорія" та "Надіслати до GPT"
  categoryButtons.push({
    text: "Нова категорія",
    callback_data: `new_category_${emailId}`,
  });
  categoryButtons.push({
    text: "Надіслати до GPT",
    callback_data: `send_gpt_${emailId}`,
  });

  // Розбиваємо кнопки на рядки по 2 кнопки
  const inline_keyboard = [];
  for (let i = 0; i < categoryButtons.length; i += 2) {
    inline_keyboard.push(categoryButtons.slice(i, i + 2));
  }

  const options = {
    reply_markup: {
      inline_keyboard,
    },
  };

  await sendMessage(
    telegramChatId,
    `Як ви хочете відсортувати лист від ${emailSender}?`,
    options
  );
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
      await sendMessage(
        telegramChatId,
        'Лист віднесено до категорії "Важливе".'
      );
      break;
    case "other":
      await sendMessage(telegramChatId, 'Лист віднесено до категорії "Інше".');
      break;
    default:
      await sendMessage(
        telegramChatId,
        `Лист віднесено до категорії "${category}".`
      );
      break;
  }
}

function extractTaskFromEmail(emailContent) {
  // Реалізуйте логіку вилучення завдання з листа
  // Поверніть об'єкт { title: 'Назва завдання', dueDate: '2024-12-31T23:59:59Z' }
  return null;
}

async function handleCallbackQuery(callbackQuery) {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;

  if (data.startsWith("category_")) {
    const [_, category, emailId] = data.split("_");

    const emailDetails = pendingEmails[emailId];

    if (emailDetails) {
      senderStore.saveSender(emailDetails.sender, category);
      await sendMessage(
        msg.chat.id,
        `Лист від ${emailDetails.sender} збережено в категорію "${category}".`
      );
      await handleEmailByCategory(category, emailDetails.content);
      await gmailService.markEmailAsRead(emailId);

      // Видаляємо лист з списку очікування та часових міток
      delete pendingEmails[emailId];
      delete emailTimestamps[emailId];

      // Завантажуємо наступний лист
      await checkEmail();
    }
  } else if (data.startsWith("send_gpt_")) {
    const emailId = data.replace("send_gpt_", "");
    const emailDetails = pendingEmails[emailId];

    if (emailDetails) {
      const summary = await openaiService.summarizeEmail(emailDetails.content);
      await sendMessage(msg.chat.id, `Підсумок листа:\n\n${summary}`);
    } else {
      await sendMessage(
        msg.chat.id,
        "Помилка: Не вдалося знайти деталі листа."
      );
    }
  } else if (data.startsWith("new_category_")) {
    const emailId = data.replace("new_category_", "");
    const emailDetails = pendingEmails[emailId];

    if (emailDetails) {
      // Запитуємо назву нової категорії
      await sendMessage(msg.chat.id, "Введіть назву нової категорії:");

      // Очікуємо введення тексту
      bot.once("message", async (msg) => {
        const newCategory = msg.text.trim();

        // Додаємо нову категорію
        categoryStore.addCategory(newCategory);

        // Зберігаємо відправника з новою категорією
        senderStore.saveSender(emailDetails.sender, newCategory);

        await sendMessage(
          msg.chat.id,
          `Категорію "${newCategory}" додано. Лист від ${emailDetails.sender} збережено в цю категорію.`
        );
        await handleEmailByCategory(newCategory, emailDetails.content);

        // Позначаємо лист як прочитаний
        await gmailService.markEmailAsRead(emailId);

        // Видаляємо лист з списку очікування
        delete pendingEmails[emailId];
        delete emailTimestamps[emailId];
      });
    } else {
      await sendMessage(
        msg.chat.id,
        "Помилка: Не вдалося знайти деталі листа."
      );
    }
  }
}

module.exports = {
  checkEmail,
  handleCallbackQuery,
};
