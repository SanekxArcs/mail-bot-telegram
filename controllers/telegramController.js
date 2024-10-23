// controllers/telegramController.js

const { bot, sendMessage } = require("../utils/bot");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const { SCOPES, TOKEN_PATH } = require("../utils/auth");
const emailController = require("./emailController");
const gmailService = require("../services/gmailService");
const logger = require("../utils/logger");

const telegramChatId = process.env.TELEGRAM_CHAT_ID;

let oAuth2Client;
let awaitingGoogleCode = false;

// Запускаємо бота
function startBot() {
  bot.onText(/\/start/, (msg) => {
    sendMessage(
      msg.chat.id,
      "Вітаю! Я ваш бот для управління поштою. Ви можете використовувати наступні команди:\n/settings - Налаштування бота"
    );
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
        await sendMessage(
          msg.chat.id,
          `Інтервал оновлення встановлено на ${interval} хвилин.`
        );
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
          await sendMessage(
            msg.chat.id,
            `Час щоденного підсумку встановлено на ${hour}:${
              minute < 10 ? "0" + minute : minute
            }.`
          );
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
        await saveSetting("OPENAI_API_KEY", openAiApiKey);
        await sendMessage(msg.chat.id, "API ключ OpenAI збережено.");
      });
    } else if (data === "set_telegram_chat_id") {
      await sendMessage(msg.chat.id, "Введіть новий Telegram Chat ID:");
      bot.once("message", async (msg) => {
        const chatId = msg.text.trim();
        await saveSetting("TELEGRAM_CHAT_ID", chatId);
        await sendMessage(msg.chat.id, "Telegram Chat ID збережено.");
      });
    } else if (data === "login_google") {
      await startGoogleLogin(msg.chat.id);
    } else {
      // Інші обробки callback_query
      await emailController.handleCallbackQuery(callbackQuery);
    }
  });

  bot.on("message", async (msg) => {
    // Додаткові обробники повідомлень
  });
}

async function saveSetting(key, value) {
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

async function authorizeWithCode(code) {
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
}

function getGoogleCredentials() {
  const credentialsPath = path.join(__dirname, "..", "credentials.json");
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  const { client_secret, client_id } = credentials.installed;
  return { client_id, client_secret };
}

module.exports = {
  startBot,
  sendMessage,
};
