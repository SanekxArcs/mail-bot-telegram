const openaiService = require("../services/openaiService");

async function analyzeEmail(emailContent) {
  const isImportant = await openaiService.analyzeEmailWithGPT(emailContent);
  return isImportant;
}

module.exports = {
  analyzeEmail,
};

async function summarizeEmail(emailContent) {
  const response = await axios.post(
    "https://api.openai.com/v1/completions",
    {
      model: "text-davinci-003",
      prompt: `Підсумуй наступний лист українською мовою:\n\n${emailContent}`,
      max_tokens: 150,
    },
    {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    }
  );

  const result = response.data.choices[0].text.trim();
  return result;
}

module.exports = {
  analyzeEmailWithGPT,
  summarizeEmail,
};

