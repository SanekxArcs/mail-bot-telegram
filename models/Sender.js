const mongoose = require("mongoose");

const senderSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  category: { type: String, required: true },
});

module.exports = mongoose.model("Sender", senderSchema);

