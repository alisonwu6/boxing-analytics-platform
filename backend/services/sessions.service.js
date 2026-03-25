// business logic for sessions management
const sessionsRepository = require("../repositories/sessions.repository.js");

async function getSessions() {
  return sessionsRepository.findAllSessions();
}

module.exports = {
  getSessions
}
