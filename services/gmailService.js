// services/gmailService.js

const { google } = require("googleapis");
const { authorize } = require("../utils/auth");
const axios = require("axios");
const logger = require("../utils/logger");

let gmail;

async function getGmailClient() {
  if (gmail) {
    logger.info("Gmail клієнт вже ініціалізовано.");
    return gmail;
  }
  logger.info("Ініціалізація Gmail клієнта...");
  const authClient = await authorize();
  gmail = google.gmail({ version: "v1", auth: authClient });
  return gmail;
}

async function getUnreadEmails() {
  const gmailClient = await getGmailClient();
  const res = await gmailClient.users.messages.list({
    userId: "me",
    q: "is:unread",
  });
  return res.data.messages || [];
}

async function getEmailDetails(emailId) {
  try {
    const gmailClient = await getGmailClient();
    const res = await gmailClient.users.messages.get({
      userId: "me",
      id: emailId,
      format: "full",
    });
    const message = res.data;

    // Обробка заголовків
    const headers = message.payload.headers;
    const fromHeader = headers.find((header) => header.name === "From");
    const subjectHeader = headers.find((header) => header.name === "Subject");
    const dateHeader = headers.find((header) => header.name === "Date");

    const sender = fromHeader ? fromHeader.value : "Unknown Sender";
    const subject = subjectHeader ? subjectHeader.value : "No Subject";
    const date = dateHeader ? new Date(dateHeader.value) : new Date();

    // Обробка вмісту
    let content = "";
    if (message.payload.parts) {
      const part = message.payload.parts.find(
        (part) => part.mimeType === "text/plain"
      );
      if (part && part.body && part.body.data) {
        content = Buffer.from(part.body.data, "base64").toString("utf-8");
      }
    } else if (message.payload.body && message.payload.body.data) {
      content = Buffer.from(message.payload.body.data, "base64").toString(
        "utf-8"
      );
    }

    return { id: emailId, sender, subject, date, content };
  } catch (error) {
    console.error(
      `Помилка при отриманні деталей листа з ID ${emailId}:`,
      error
    );
    return null;
  }
}

async function markEmailAsRead(emailId) {
  const gmailClient = await getGmailClient();
  await gmailClient.users.messages.modify({
    userId: "me",
    id: emailId,
    resource: { removeLabelIds: ["UNREAD"] },
  });
}

async function deleteEmail(emailId) {
  const gmailClient = await getGmailClient();
  await gmailClient.users.messages.delete({
    userId: "me",
    id: emailId,
  });
}

async function unsubscribeFromNewsletter(emailContent) {
  // Ваш код для відписки від розсилки
}

module.exports = {
  getUnreadEmails,
  getEmailDetails,
  markEmailAsRead,
  deleteEmail,
  unsubscribeFromNewsletter,
};
