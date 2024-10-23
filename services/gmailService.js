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

async function getEmailsReceivedToday() {
  const gmailClient = await getGmailClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Початок дня
  const afterDate = Math.floor(today.getTime() / 1000); // Unix timestamp
  const query = `after:${afterDate}`;
  const res = await gmailClient.users.messages.list({
    userId: "me",
    q: query,
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

    return {
      id: emailId,
      sender,
      subject,
      date,
      content,
      threadId: message.threadId,
    };
  } catch (error) {
    console.error(
      `Помилка при отриманні деталей листа з ID ${emailId}:`,
      error
    );
    return null;
  }
}

// async function getGmailClient() {
//   if (gmail) {
//     logger.info("Gmail клієнт вже ініціалізовано.");
//     return gmail;
//   }
//   logger.info("Ініціалізація Gmail клієнта...");
//   const authClient = await authorize();
//   gmail = google.gmail({ version: "v1", auth: authClient });
//   return gmail;
// }

// async function getUnreadEmails() {
//   const gmailClient = await getGmailClient();
//   const res = await gmailClient.users.messages.list({
//     userId: "me",
//     q: "is:unread",
//   });
//   return res.data.messages || [];
// }

// async function getEmailDetails(emailId) {
//   try {
//     const gmailClient = await getGmailClient();
//     const res = await gmailClient.users.messages.get({
//       userId: "me",
//       id: emailId,
//       format: "full",
//     });
//     const message = res.data;

//     // Обробка заголовків
//     const headers = message.payload.headers;
//     const fromHeader = headers.find((header) => header.name === "From");
//     const subjectHeader = headers.find((header) => header.name === "Subject");
//     const dateHeader = headers.find((header) => header.name === "Date");

//     const sender = fromHeader ? fromHeader.value : "Unknown Sender";
//     const subject = subjectHeader ? subjectHeader.value : "No Subject";
//     const date = dateHeader ? new Date(dateHeader.value) : new Date();

//     // Обробка вмісту
//     let content = "";
//     if (message.payload.parts) {
//       const part = message.payload.parts.find(
//         (part) => part.mimeType === "text/plain"
//       );
//       if (part && part.body && part.body.data) {
//         content = Buffer.from(part.body.data, "base64").toString("utf-8");
//       }
//     } else if (message.payload.body && message.payload.body.data) {
//       content = Buffer.from(message.payload.body.data, "base64").toString(
//         "utf-8"
//       );
//     }

//     return {
//       id: emailId,
//       sender,
//       subject,
//       date,
//       content,
//       threadId: message.threadId,
//     };
//   } catch (error) {
//     console.error(
//       `Помилка при отриманні деталей листа з ID ${emailId}:`,
//       error
//     );
//     return null;
//   }
// }

async function markEmailAsRead(emailId) {
  const gmailClient = await getGmailClient();
  await gmailClient.users.messages.modify({
    userId: "me",
    id: emailId,
    resource: { removeLabelIds: ["UNREAD"] },
  });
}

async function sendEmailReply(emailData, replyMessage) {
  const gmailClient = await getGmailClient();
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

  await gmailClient.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
      threadId: emailData.threadId,
    },
  });
}

async function addLabelToEmail(emailId, labelName) {
  const gmailClient = await getGmailClient();
  // Отримуємо список міток
  const labelsRes = await gmailClient.users.labels.list({ userId: "me" });
  let label = labelsRes.data.labels.find((l) => l.name === labelName);

  // Якщо мітки немає, створюємо її
  if (!label) {
    const labelRes = await gmailClient.users.labels.create({
      userId: "me",
      requestBody: {
        name: labelName,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });
    label = labelRes.data;
  }

  // Додаємо мітку до листа
  await gmailClient.users.messages.modify({
    userId: "me",
    id: emailId,
    resource: {
      addLabelIds: [label.id],
    },
  });
}
async function getGmailLabels() {
  const gmailClient = await getGmailClient();
  const res = await gmailClient.users.labels.list({ userId: "me" });
  return res.data.labels;
}

module.exports = {
  getUnreadEmails,
  getEmailsReceivedToday,
  getGmailLabels,
  getEmailDetails,
  markEmailAsRead,
  sendEmailReply,
  addLabelToEmail,
};
