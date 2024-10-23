// controllers/telegramController.js

const { bot, sendMessage } = require("../utils/bot");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const { SCOPES, TOKEN_PATH } = require("../utils/auth");
const emailController = require("./emailController");
const gmailService = require("../services/gmailService");
const logger = require("../utils/logger");

const settingsFilePath = path.join(__dirname, "..", "settings.json");

let oAuth2Client;
let awaitingGoogleCode = false;

// Завантажуємо налаштування
let settings = loadSettings();

// Запускаємо бота
function startBot() {
  bot.onText(/\/start/, async (msg) => {
    await checkAndRequestSettings(msg.chat.id);
  });

  bot.onText(/\/settings/, async (msg) => {
    const options = {
      reply_markup: {
        keyboard: [
          ["/change_update_interval", "/change_daily_summary_time"],
          ["/change_max_emails", "/change_keys"],
          ["/back"],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    };
    await sendMessage(msg.chat.id, "Оберіть опцію налаштувань:", options);
  });

  bot.onText(/\/change_update_interval/, async (msg) => {
    await sendMessage(
      msg.chat.id,
      "Введіть новий інтервал оновлення (у хвилинах):"
    );
    bot.once("message", async (msg) => {
      const interval = parseInt(msg.text.trim());
      if (isNaN(interval) || interval <= 0) {
        await sendMessage(msg.chat.id, "Невірне значення. Спробуйте ще раз.");
      } else {
        emailController.settings.updateInterval = interval * 60 * 1000;
        emailController.startEmailChecking(); // Перезапускаємо перевірку пошти з новим інтервалом
        await sendMessage(
          msg.chat.id,
          `Інтервал оновлення встановлено на ${interval} хвилин.`
        );
        sendStartupMessage(); // Відправляємо оновлені налаштування
      }
    });
  });

  bot.onText(/\/change_daily_summary_time/, async (msg) => {
    await sendMessage(
      msg.chat.id,
      "Введіть новий час щоденного підсумку (у форматі HH:MM):"
    );
    bot.once("message", async (msg) => {
      const timeParts = msg.text.trim().split(":");
      if (timeParts.length !== 2) {
        await sendMessage(
          msg.chat.id,
          "Невірний формат часу. Спробуйте ще раз."
        );
      } else {
        const hour = parseInt(timeParts[0]);
        const minute = parseInt(timeParts[1]);
        if (
          isNaN(hour) ||
          isNaN(minute) ||
          hour < 0 ||
          hour > 23 ||
          minute < 0 ||
          minute > 59
        ) {
          await sendMessage(
            msg.chat.id,
            "Невірне значення часу. Спробуйте ще раз."
          );
        } else {
          emailController.settings.dailySummaryTime = { hour, minute };
          emailController.scheduleDailySummary(); // Переплановуємо щоденний підсумок
          await sendMessage(
            msg.chat.id,
            `Час щоденного підсумку встановлено на ${hour}:${
              minute < 10 ? "0" + minute : minute
            }.`
          );
          sendStartupMessage(); // Відправляємо оновлені налаштування
        }
      }
    });
  });

  bot.onText(/\/change_max_emails/, async (msg) => {
    await sendMessage(
      msg.chat.id,
      "Введіть максимальну кількість листів для обробки за раз:"
    );
    bot.once("message", async (msg) => {
      const maxEmails = parseInt(msg.text.trim());
      if (isNaN(maxEmails) || maxEmails <= 0) {
        await sendMessage(msg.chat.id, "Невірне значення. Спробуйте ще раз.");
      } else {
        emailController.settings.maxEmailsPerCheck = maxEmails;
        await sendMessage(
          msg.chat.id,
          `Максимальна кількість листів встановлена на ${maxEmails}.`
        );
        sendStartupMessage(); // Відправляємо оновлені налаштування
      }
    });
  });

  bot.onText(/\/change_keys/, async (msg) => {
    const options = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Ввести API ключ OpenAI",
              callback_data: "set_openai_api_key",
            },
          ],
          [
            {
              text: "Ввести Telegram Chat ID",
              callback_data: "set_telegram_chat_id",
            },
          ],
          [{ text: "Логін через Google", callback_data: "login_google" }],
        ],
      },
    };
    await sendMessage(msg.chat.id, "Оберіть опцію для зміни ключів:", options);
  });

  bot.on("callback_query", async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;

    if (data === "set_openai_api_key") {
      await sendMessage(msg.chat.id, "Введіть новий API ключ OpenAI:");
      bot.once("message", async (msg) => {
        const openAiApiKey = msg.text.trim();
        await saveEnvVariable("OPENAI_API_KEY", openAiApiKey);
        await sendMessage(msg.chat.id, "API ключ OpenAI збережено.");
        sendStartupMessage(); // Відправляємо оновлені налаштування
      });
    } else if (data === "set_telegram_chat_id") {
      await sendMessage(msg.chat.id, "Введіть новий Telegram Chat ID:");
      bot.once("message", async (msg) => {
        const chatId = msg.text.trim();
        settings.telegramChatId = chatId;
        saveSettings();
        await sendMessage(msg.chat.id, "Telegram Chat ID збережено.");
        sendStartupMessage(); // Відправляємо оновлені налаштування
      });
    } else if (data === "login_google") {
      await startGoogleLogin(msg.chat.id);
    } else if (data === "use_current_chat_id") {
      settings.telegramChatId = callbackQuery.message.chat.id;
      saveSettings();
      await sendMessage(
        callbackQuery.message.chat.id,
        `Встановлено Telegram Chat ID: ${settings.telegramChatId}`
      );
      await checkAndRequestSettings(callbackQuery.message.chat.id);
    } else if (data === "enter_chat_id") {
      await sendMessage(
        callbackQuery.message.chat.id,
        "Введіть Telegram Chat ID:"
      );
      bot.once("message", async (msg) => {
        const enteredChatId = msg.text.trim();
        settings.telegramChatId = enteredChatId;
        saveSettings();
        await sendMessage(
          callbackQuery.message.chat.id,
          `Встановлено Telegram Chat ID: ${enteredChatId}`
        );
        await checkAndRequestSettings(callbackQuery.message.chat.id);
      });
    } else {
      // Інші обробки callback_query
      await emailController.handleCallbackQuery(callbackQuery);
    }
  });

  bot.on("message", async (msg) => {
    if (awaitingGoogleCode && msg.text) {
      const code = msg.text.trim();
      try {
        await authorizeWithCode(code);
        awaitingGoogleCode = false;
        await sendMessage(msg.chat.id, "Авторизація через Google успішна.");
        settings.googleAuthorized = true;
        saveSettings();
        // Перевіряємо інші налаштування
        await checkAndRequestSettings(msg.chat.id);
      } catch (error) {
        await sendMessage(
          msg.chat.id,
          "Помилка при авторизації через Google. Спробуйте ще раз."
        );
      }
    }
  });
}

// Функція для перевірки та запиту налаштувань
async function checkAndRequestSettings(chatId) {
  let missingSettings = [];

  if (!settings.telegramChatId) {
    missingSettings.push("Telegram Chat ID");
  }
  if (!process.env.OPENAI_API_KEY) {
    missingSettings.push("OpenAI API Key");
  }
  if (!fs.existsSync(TOKEN_PATH)) {
    missingSettings.push("Google Tokens");
  }

  if (missingSettings.length === 0) {
    await sendMessage(
      chatId,
      "✅ Бот активовано з усіма необхідними налаштуваннями."
    );
    // Відправляємо повідомлення з поточними налаштуваннями
    sendStartupMessage();
    // Запускаємо перевірку пошти та щоденний підсумок
    emailController.startEmailChecking();
    emailController.scheduleDailySummary();
  } else {
    await sendMessage(
      chatId,
      `Необхідно налаштувати наступні параметри: ${missingSettings.join(", ")}`
    );
    for (const setting of missingSettings) {
      if (setting === "Telegram Chat ID") {
        await requestTelegramChatId(chatId);
      } else if (setting === "OpenAI API Key") {
        await requestOpenAIApiKey(chatId);
      } else if (setting === "Google Tokens") {
        await startGoogleLogin(chatId);
      }
    }
  }
}

// Функція для запиту Telegram Chat ID
async function requestTelegramChatId(chatId) {
  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Використати поточний чат",
            callback_data: "use_current_chat_id",
          },
        ],
        [{ text: "Ввести інший Chat ID", callback_data: "enter_chat_id" }],
      ],
    },
  };
  await sendMessage(
    chatId,
    "Оберіть Telegram Chat ID для використання:",
    options
  );
}

// Функція для запиту OpenAI API Key
async function requestOpenAIApiKey(chatId) {
  await sendMessage(chatId, "Введіть ваш OpenAI API Key:");
  bot.once("message", async (msg) => {
    const openAiApiKey = msg.text.trim();
    await saveEnvVariable("OPENAI_API_KEY", openAiApiKey);
    await sendMessage(chatId, "OpenAI API Key збережено.");
    // Перевіряємо інші налаштування
    await checkAndRequestSettings(chatId);
  });
}

// Функція для запуску авторизації через Google
async function startGoogleLogin(chatId) {
  const { client_id, client_secret } = getGoogleCredentials();
  oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    "urn:ietf:wg:oauth:2.0:oob"
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });

  awaitingGoogleCode = true;

  await sendMessage(
    chatId,
    `Перейдіть за цим посиланням для авторизації через Google:\n${authUrl}\n\nПісля авторизації ви отримаєте код. Будь ласка, надішліть цей код мені.`
  );
}

// Функція для авторизації з кодом
async function authorizeWithCode(code) {
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
}

// Завантаження Google Credentials
function getGoogleCredentials() {
  const credentialsPath = path.join(__dirname, "..", "credentials.json");
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  const { client_secret, client_id } = credentials.installed;
  return { client_id, client_secret };
}

// Функція для збереження налаштувань
function saveSettings() {
  fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2));
}

// Функція для завантаження налаштувань
function loadSettings() {
  if (fs.existsSync(settingsFilePath)) {
    return JSON.parse(fs.readFileSync(settingsFilePath, "utf8"));
  } else {
    return {};
  }
}

// Функція для збереження змінної в .env
async function saveEnvVariable(key, value) {
  const envFilePath = path.join(__dirname, "..", ".env");
  const envConfig = fs.readFileSync(envFilePath, "utf-8").split("\n");
  let keyFound = false;

  const newConfig = envConfig.map((line) => {
    if (line.startsWith(`${key}=`)) {
      keyFound = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!keyFound) {
    newConfig.push(`${key}=${value}`);
  }

  fs.writeFileSync(envFilePath, newConfig.join("\n"));
  process.env[key] = value;
}

// Функція для відправки повідомлення з налаштуваннями
function sendStartupMessage() {
  const updateIntervalMinutes = emailController.settings.updateInterval / 60000;
  const summaryTime = `${
    emailController.settings.dailySummaryTime.hour
  }:${emailController.settings.dailySummaryTime.minute
    .toString()
    .padStart(2, "0")}`;
  const maxEmails = emailController.settings.maxEmailsPerCheck;

  const message = `✅ Бот активовано!

**Поточні налаштування:**
- Інтервал оновлення: ${updateIntervalMinutes} хвилин
- Час щоденного підсумку: ${summaryTime}
- Кількість листів для обробки за раз: ${maxEmails}`;

  sendMessage(settings.telegramChatId, message, { parse_mode: "Markdown" });
}

module.exports = {
  startBot,
  sendStartupMessage,
  sendMessage,
};
