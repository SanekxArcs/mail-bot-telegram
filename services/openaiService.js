const axios = require("axios");

async function analyzeEmailWithGPT(emailContent) {
  const response = await axios.post(
    "https://api.openai.com/v1/completions",
    {
      model: "text-davinci-003",
      prompt: `Проаналізуй цей лист і скажи, чи важливо його переглядати: ${emailContent}`,
      max_tokens: 100,
    },
    {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    }
  );

  const result = response.data.choices[0].text;
  return result.toLowerCase().includes("важливо");
}

module.exports = {
  analyzeEmailWithGPT,
};
