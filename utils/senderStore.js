// utils/senderStore.js

const fs = require("fs");
const path = require("path");

const sendersFilePath = path.join(__dirname, "senders.json");

function loadSenders() {
  if (fs.existsSync(sendersFilePath)) {
    const data = fs.readFileSync(sendersFilePath);
    return JSON.parse(data);
  }
  return {};
}

function saveSenders(senders) {
  fs.writeFileSync(sendersFilePath, JSON.stringify(senders, null, 2));
}

function getSenderCategory(sender) {
  const senders = loadSenders();
  return senders[sender];
}

function saveSender(sender, category) {
  const senders = loadSenders();
  senders[sender] = category;
  saveSenders(senders);
}

module.exports = {
  getSenderCategory,
  saveSender,
};
