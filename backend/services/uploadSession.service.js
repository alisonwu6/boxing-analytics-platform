const sessionsService = require('./sessions.service');

async function createUploadSession(userId, input = {}) {
  return sessionsService.createUploadSession(userId, input);
}

async function getUploadSessionById(id) {
  return sessionsService.getSessionById(id);
}

async function updateUploadSession(id, filesOrPatch) {
  return sessionsService.attachFilesToSession(id, {
    csvFile: filesOrPatch.csvFile || null,
    movFile: filesOrPatch.movFile || null,
  });
}

module.exports = {
  createUploadSession,
  getUploadSessionById,
  updateUploadSession,
};
