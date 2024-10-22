const { google } = require("googleapis");
const auth = require("../utils/auth");

const calendar = google.calendar({ version: "v3", auth: auth.authorize() });

async function addEvent(summary, description, startDateTime) {
  const event = {
    summary,
    description,
    start: { dateTime: startDateTime, timeZone: "Europe/Kiev" },
    end: { dateTime: startDateTime, timeZone: "Europe/Kiev" },
  };

  await calendar.events.insert({
    calendarId: "primary",
    resource: event,
  });
}

module.exports = {
  addEvent,
};

