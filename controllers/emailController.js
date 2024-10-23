// controllers/emailController.js
const fs = require("fs");
const { TOKEN_PATH } = require("../utils/auth");

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

const settings = {
  updateInterval: 5 * 60 * 1000, // 5 хвилин
  dailySummaryTime: { hour: 18, minute: 0 }, // 18:00
  maxEmailsPerCheck: 20,
};

let emailCheckIntervalId = null;
let dailySummaryTimeoutId = null;
let dailySummaryIntervalId = null;

async function checkEmail() {
  try {
    const messages = await gmailService.getUnreadEmails();

    // Фільтруємо листи, які ще не оброблені
    const newMessages = messages.filter(
      (message) => !pendingEmails.hasOwnProperty(message.id)
    );

    // Обмежуємо кількість листів
    const availableSlots =
      settings.maxEmailsPerCheck - Object.keys(pendingEmails).length;
    const messagesToProcess = newMessages.slice(0, availableSlots);

    for (const message of messagesToProcess) {
      const emailDetails = await gmailService.getEmailDetails(message.id);
      const { id, sender, subject, date, content } = emailDetails;

      // Зберігаємо деталі листа
      pendingEmails[id] = { sender, subject, date, content, id, emailDetails };
      emailTimestamps[id] = Date.now();

      await askForAction(emailDetails);
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
function scheduleDailySummary() {
  if (dailySummaryTimeoutId) {
    clearTimeout(dailySummaryTimeoutId);
  }
  if (dailySummaryIntervalId) {
    clearInterval(dailySummaryIntervalId);
  }

  const now = new Date();
  const nextTime = new Date();
  nextTime.setHours(settings.dailySummaryTime.hour);
  nextTime.setMinutes(settings.dailySummaryTime.minute);
  nextTime.setSeconds(0);

  if (now > nextTime) {
    // Якщо час уже пройшов, плануємо на наступний день
    nextTime.setDate(nextTime.getDate() + 1);
  }

  const timeUntilNext = nextTime - now;

  dailySummaryTimeoutId = setTimeout(() => {
    sendDailySummary();

    // Після виконання плануємо наступне виконання через 24 години
    dailySummaryIntervalId = setInterval(() => {
      sendDailySummary();
    }, 24 * 60 * 60 * 1000); // 24 години
  }, timeUntilNext);

  logger.info(
    `Щоденний підсумок заплановано на ${settings.dailySummaryTime.hour}:${
      settings.dailySummaryTime.minute < 10
        ? "0" + settings.dailySummaryTime.minute
        : settings.dailySummaryTime.minute
    }.`
  );
}

async function sendDailySummary() {
  // Отримуємо всі листи, отримані сьогодні
  const messages = await gmailService.getEmailsReceivedToday();

  if (messages.length === 0) {
    await sendMessage(telegramChatId, "Сьогодні ви не отримали нових листів.");
    return;
  }

  let summaryMessage = `Підсумок отриманої пошти за сьогодні:\n\nКількість листів: ${messages.length}\n\n`;

  for (const message of messages) {
    const emailDetails = await gmailService.getEmailDetails(message.id);
    if (emailDetails) {
      const formattedDate = emailDetails.date.toLocaleString();
      summaryMessage += `📧 **Від:** ${emailDetails.sender}\n**Тема:** ${emailDetails.subject}\n**Дата:** ${formattedDate}\n\n`;
    }
  }

  const options = {
    parse_mode: "Markdown",
  };

  await sendMessage(telegramChatId, summaryMessage, options);
}
// async function checkEmail() {
//   try {
//     const messages = await gmailService.getUnreadEmails();

//     // Фільтруємо листи, які ще не оброблені
//     const newMessages = messages.filter(
//       (message) => !pendingEmails.hasOwnProperty(message.id)
//     );

//     // Обмежуємо кількість листів
//     const availableSlots =
//       settings.maxEmailsPerCheck - Object.keys(pendingEmails).length;
//     const messagesToProcess = newMessages.slice(0, availableSlots);

//     for (const message of messagesToProcess) {
//       const emailDetails = await gmailService.getEmailDetails(message.id);
//       const { id, sender, subject, date, content } = emailDetails;

//       // Додаємо лист до щоденного підсумку
//       dailyEmails.push({
//         id,
//         sender,
//         subject,
//         date,
//       });

//       // Зберігаємо деталі листа
//       pendingEmails[id] = { sender, subject, date, content, id, emailDetails };
//       emailTimestamps[id] = Date.now();

//       await askForAction(emailDetails);
//     }

//     // Перевіряємо листи, які очікують понад 1 день
//     const oneDayInMillis = 24 * 60 * 60 * 1000;
//     for (const emailId in emailTimestamps) {
//       if (Date.now() - emailTimestamps[emailId] >= oneDayInMillis) {
//         // Видаляємо лист з очікування та залишаємо його непрочитаним
//         delete pendingEmails[emailId];
//         delete emailTimestamps[emailId];
//       }
//     }

//     logger.info("Перевірка пошти виконана успішно");
//   } catch (error) {
//     logger.error("Помилка при перевірці пошти:", error);
//   }
// }

// function startEmailChecking() {
//   if (emailCheckIntervalId) {
//     clearInterval(emailCheckIntervalId);
//   }
//   emailCheckIntervalId = setInterval(() => {
//     checkEmail();
//   }, settings.updateInterval);
//   logger.info(
//     `Інтервал перевірки пошти встановлено на ${
//       settings.updateInterval / 60000
//     } хвилин.`
//   );
// }

// function scheduleDailySummary() {
//   if (dailySummaryTimeoutId) {
//     clearTimeout(dailySummaryTimeoutId);
//   }
//   if (dailySummaryIntervalId) {
//     clearInterval(dailySummaryIntervalId);
//   }

//   const now = new Date();
//   const nextTime = new Date();
//   nextTime.setHours(settings.dailySummaryTime.hour);
//   nextTime.setMinutes(settings.dailySummaryTime.minute);
//   nextTime.setSeconds(0);

//   if (now > nextTime) {
//     // Якщо час уже пройшов, плануємо на наступний день
//     nextTime.setDate(nextTime.getDate() + 1);
//   }

//   const timeUntilNext = nextTime - now;

//   dailySummaryTimeoutId = setTimeout(() => {
//     sendDailySummary();

//     // Після виконання плануємо наступне виконання через 24 години
//     dailySummaryIntervalId = setInterval(() => {
//       sendDailySummary();
//     }, 24 * 60 * 60 * 1000); // 24 години
//   }, timeUntilNext);

//   logger.info(
//     `Щоденний підсумок заплановано на ${settings.dailySummaryTime.hour}:${
//       settings.dailySummaryTime.minute < 10
//         ? "0" + settings.dailySummaryTime.minute
//         : settings.dailySummaryTime.minute
//     }.`
//   );
// }

// async function sendDailySummary() {
//   if (dailyEmails.length === 0) {
//     await sendMessage(telegramChatId, "Сьогодні ви не отримали нових листів.");
//     return;
//   }

//   let summaryMessage = `Підсумок отриманої пошти за сьогодні:\n\nКількість листів: ${dailyEmails.length}\n\n`;

//   for (const email of dailyEmails) {
//     const formattedDate = email.date.toLocaleString();
//     summaryMessage += `📧 **Від:** ${email.sender}\n**Тема:** ${email.subject}\n**Дата:** ${formattedDate}\n\n`;
//   }

//   const options = {
//     parse_mode: "Markdown",
//   };

//   await sendMessage(telegramChatId, summaryMessage, options);

//   // Очищуємо масив після відправки підсумку
//   dailyEmails.length = 0;
// }

// async function checkEmail() {
//   try {
//     const messages = await gmailService.getUnreadEmails();

//     // Фільтруємо листи, які ще не оброблені
//     const newMessages = messages.filter(
//       (message) => !pendingEmails.hasOwnProperty(message.id)
//     );

//     // Обмежуємо кількість листів
//     const availableSlots =
//       settings.maxEmailsPerCheck - Object.keys(pendingEmails).length;
//     const messagesToProcess = newMessages.slice(0, availableSlots);

//     for (const message of messagesToProcess) {
//       const emailDetails = await gmailService.getEmailDetails(message.id);
//       const { id, sender, subject, date, content } = emailDetails;

//       // Зберігаємо деталі листа
//       pendingEmails[id] = { sender, subject, date, content, id, emailDetails };
//       emailTimestamps[id] = Date.now();

//       await askForAction(emailDetails);
//     }

//     // Перевіряємо листи, які очікують понад 1 день
//     const oneDayInMillis = 24 * 60 * 60 * 1000;
//     for (const emailId in emailTimestamps) {
//       if (Date.now() - emailTimestamps[emailId] >= oneDayInMillis) {
//         // Видаляємо лист з очікування та залишаємо його непрочитаним
//         delete pendingEmails[emailId];
//         delete emailTimestamps[emailId];
//       }
//     }

//     logger.info("Перевірка пошти виконана успішно");
//   } catch (error) {
//     logger.error("Помилка при перевірці пошти:", error);
//   }
// }

async function askForAction(emailDetails) {
  const { sender, subject, date, id } = emailDetails;

  // Кнопки дій
  const actionButtons = [
    { text: "Відповісти", callback_data: `reply_${id}` },
    { text: "GPT", callback_data: `send_gpt_${id}` },
    { text: "Відмітити прочитаним", callback_data: `mark_read_${id}` },
    { text: "Пропустити", callback_data: `skip_${id}` },
    { text: "Фільтрувати", callback_data: `filter_${id}` },
  ];

  // Розбиваємо кнопки на рядки по 2 кнопки
  const inline_keyboard = [];
  for (let i = 0; i < actionButtons.length; i += 2) {
    inline_keyboard.push(actionButtons.slice(i, i + 2));
  }

  const options = {
    reply_markup: {
      inline_keyboard,
    },
    parse_mode: "Markdown",
  };

  const formattedDate = date.toLocaleString();

  const messageText = `Ви отримали новий лист:

**Від:** ${sender}
**Тема:** ${subject}
**Дата:** ${formattedDate}

Що ви хочете зробити з цим листом?`;

  await sendMessage(telegramChatId, messageText, options);
}

async function handleCallbackQuery(callbackQuery) {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;

  if (data.startsWith("reply_")) {
    const emailId = data.replace("reply_", "");
    const emailDetails = pendingEmails[emailId];

    if (emailDetails) {
      await sendMessage(msg.chat.id, "Напишіть відповідь на лист:");

      // Очікуємо введення тексту
      bot.once("message", async (replyMsg) => {
        const replyText = replyMsg.text.trim();

        await gmailService.sendEmailReply(emailDetails.emailDetails, replyText);

        await sendMessage(msg.chat.id, "Ваша відповідь відправлена.");

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
  } else if (data.startsWith("mark_read_")) {
    const emailId = data.replace("mark_read_", "");
    const emailDetails = pendingEmails[emailId];

    if (emailDetails) {
      await gmailService.markEmailAsRead(emailId);
      await sendMessage(msg.chat.id, "Лист позначено як прочитаний.");
      // Видаляємо лист з списку очікування
      delete pendingEmails[emailId];
      delete emailTimestamps[emailId];
    } else {
      await sendMessage(
        msg.chat.id,
        "Помилка: Не вдалося знайти деталі листа."
      );
    }
  } else if (data.startsWith("skip_")) {
    const emailId = data.replace("skip_", "");
    const emailDetails = pendingEmails[emailId];

    if (emailDetails) {
      await sendMessage(msg.chat.id, "Лист пропущено.");
      // Видаляємо лист з списку очікування, залишаючи його непрочитаним
      delete pendingEmails[emailId];
      delete emailTimestamps[emailId];
    } else {
      await sendMessage(
        msg.chat.id,
        "Помилка: Не вдалося знайти деталі листа."
      );
    }
  } else if (data.startsWith("filter_")) {
    const emailId = data.replace("filter_", "");
    const emailDetails = pendingEmails[emailId];

    if (emailDetails) {
      // Отримуємо список міток Gmail
      const labels = await gmailService.getGmailLabels();

      // Створюємо кнопки з мітками
      const labelButtons = labels.map((label) => ({
        text: label.name,
        callback_data: `label_${label.id}_${emailId}`,
      }));

      // Розбиваємо кнопки на рядки по 2 кнопки
      const inline_keyboard = [];
      for (let i = 0; i < labelButtons.length; i += 2) {
        inline_keyboard.push(labelButtons.slice(i, i + 2));
      }

      const options = {
        reply_markup: {
          inline_keyboard,
        },
        parse_mode: "Markdown",
      };

      await sendMessage(
        msg.chat.id,
        "Оберіть мітку для фільтрації листа:",
        options
      );
    } else {
      await sendMessage(
        msg.chat.id,
        "Помилка: Не вдалося знайти деталі листа."
      );
    }
  } else if (data.startsWith("label_")) {
    const [_, labelId, emailId] = data.split("_");
    const emailDetails = pendingEmails[emailId];

    if (emailDetails) {
      await gmailService.addLabelToEmail(emailId, labelId);
      await sendMessage(msg.chat.id, "Мітку додано до листа.");

      // Видаляємо лист з списку очікування
      delete pendingEmails[emailId];
      delete emailTimestamps[emailId];
    } else {
      await sendMessage(
        msg.chat.id,
        "Помилка: Не вдалося знайти деталі листа."
      );
    }
  }
}
function startEmailChecking() {
  if (
    !process.env.TELEGRAM_CHAT_ID ||
    !process.env.OPENAI_API_KEY ||
    !fs.existsSync(TOKEN_PATH)
  ) {
    logger.error(
      "Необхідні налаштування відсутні. Перевірка пошти не може бути запущена."
    );
    return;
  }

  if (emailCheckIntervalId) {
    clearInterval(emailCheckIntervalId);
  }
  emailCheckIntervalId = setInterval(() => {
    checkEmail();
  }, settings.updateInterval);
  logger.info(
    `Інтервал перевірки пошти встановлено на ${
      settings.updateInterval / 60000
    } хвилин.`
  );
}
module.exports = {
  checkEmail,
  handleCallbackQuery,
  sendDailySummary,
  startEmailChecking,
  scheduleDailySummary,
  settings,
};