const fs = require("fs");
const path = require("path");

const senderFilePath = path.join(__dirname, "senders.json");

function loadSenders() {
  if (fs.existsSync(senderFilePath)) {
    const data = fs.readFileSync(senderFilePath);
    return JSON.parse(data);
  }
  return {};
}

function saveSenders(senders) {
  fs.writeFileSync(senderFilePath, JSON.stringify(senders, null, 2));
}

function getSenderCategory(email) {
  const senders = loadSenders();
  return senders[email] || null;
}

function saveSender(email, category) {
  const senders = loadSenders();
  senders[email] = category;
  saveSenders(senders);
}

function deleteSender(email) {
  const senders = loadSenders();
  delete senders[email];
  saveSenders(senders);
}

function getAllSendersByCategory(category) {
  const senders = loadSenders();
  return Object.keys(senders).filter((email) => senders[email] === category);
}

module.exports = {
  getSenderCategory,
  saveSender,
  deleteSender,
  getAllSendersByCategory,
};
