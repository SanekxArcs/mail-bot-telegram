// utils/auth.js

const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const TOKEN_PATH = path.join(__dirname, "..", "token.json");
const CREDENTIALS_PATH = path.join(__dirname, "..", "credentials.json");

async function authorize() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
  const { client_secret, client_id, redirect_uris } = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  try {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  } catch (err) {
    throw new Error(
      "Токен не знайдено або недійсний. Будь ласка, авторизуйтеся через бота."
    );
  }
}

module.exports = {
  authorize,
};
