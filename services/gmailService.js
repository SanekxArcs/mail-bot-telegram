const fs = require("fs");
const { google } = require("googleapis");
const auth = require("../utils/auth");
const axios = require("axios");
const logger = require("../utils/logger");

const gmail = google.gmail({ version: "v1", auth: auth.authorize() });

async function getUnreadEmails() {
  const res = await gmail.users.messages.list({ userId: "me", q: "is:unread" });
  return res.data.messages || [];
}

async function getEmailDetails(emailId) {
  const res = await gmail.users.messages.get({
    userId: "me",
    id: emailId,
    format: "full",
  });
  const message = res.data;

  const headers = message.payload.headers;
  const fromHeader = headers.find((header) => header.name === "From");
  const subjectHeader = headers.find((header) => header.name === "Subject");

  const sender = fromHeader ? fromHeader.value : "Unknown Sender";
  const subject = subjectHeader ? subjectHeader.value : "No Subject";

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

  return { id: emailId, sender, subject, content };
}

async function markEmailAsRead(emailId) {
  await gmail.users.messages.modify({
    userId: "me",
    id: emailId,
    resource: { removeLabelIds: ["UNREAD"] },
  });
}

async function unsubscribeFromNewsletter(emailContent) {
  const unsubscribeLinkMatch = emailContent.match(
    /<a href="([^"]+)"[^>]*>.*?(unsubscribe|відписатися).*?<\/a>/i
  );
  if (unsubscribeLinkMatch) {
    const url = unsubscribeLinkMatch[1];
    await axios.get(url);
    logger.info("Відписка від розсилки успішна");
  } else {
    logger.warn("Не вдалося знайти посилання для відписки");
  }
}

async function sendEmailReply(emailData, replyMessage) {
  const rawMessage = [
    `To: ${emailData.sender}`,
    `Subject: Re: ${emailData.subject}`,
    "",
    replyMessage,
  ].join("\n");

  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
      threadId: emailData.id,
    },
  });
}

module.exports = {
  getUnreadEmails,
  getEmailDetails,
  markEmailAsRead,
  unsubscribeFromNewsletter,
  sendEmailReply,
};
