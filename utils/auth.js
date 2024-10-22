const fs = require("fs");
const { google } = require("googleapis");
const logger = require("./logger");

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
];
const TOKEN_PATH = "token.json";

function authorize() {
  const credentials = JSON.parse(fs.readFileSync("credentials.json"));
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Перевіряємо, чи є токен
  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH);
    oauth2Client.setCredentials(JSON.parse(token));
  } else {
    getNewToken(oauth2Client);
  }
  return oauth2Client;
}

function getNewToken(oauth2Client) {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("Авторизуйтесь за цим URL:", authUrl);

  // Просимо користувача ввести код
  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("Введіть код з сторінки авторизації: ", (code) => {
    rl.close();
    oauth2Client.getToken(code, (err, token) => {
      if (err) {
        console.error("Не вдалося отримати токен", err);
        return;
      }
      oauth2Client.setCredentials(token);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
      console.log("Токен збережено до", TOKEN_PATH);
    });
  });
}


module.exports = {
  authorize,
};
