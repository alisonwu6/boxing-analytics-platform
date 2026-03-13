// request → service → response

const sessionsService = require("../services/sessions.service");

async function getSessions(req, res) {
  const sessions = await sessionsService.getSessions();
  res.json(sessions);
}

module.exports = {
  getSessions
};
