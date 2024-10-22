const openaiService = require("../services/openaiService");

async function analyzeEmail(emailContent) {
  const isImportant = await openaiService.analyzeEmailWithGPT(emailContent);
  return isImportant;
}

module.exports = {
  analyzeEmail,
};
