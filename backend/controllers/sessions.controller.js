const sessionsService = require('../services/sessions.service');

function handleControllerError(res, error, fallbackMessage) {
  console.error(error);
  res.status(error.status || 500).json({
    error: error.message || fallbackMessage,
  });
}

async function getSessions(req, res) {
  try {
    const sessions = await sessionsService.getSessions();
    res.json(sessions);
  } catch (error) {
    handleControllerError(res, error, 'Failed to load sessions');
  }
}

async function getSessionById(req, res) {
  try {
    const session = await sessionsService.getSessionById(req.params.id);
    res.json(session);
  } catch (error) {
    handleControllerError(res, error, 'Failed to load session');
  }
}

async function uploadSessionFiles(req, res) {
  try {
    const csvFile = req.files?.csvFile?.[0] || null;
    const movFile = req.files?.movFile?.[0] || null;

    if (!csvFile && !movFile) {
      return res.status(400).json({
        error: 'At least one CSV or MOV file is required',
      });
    }

    const session = await sessionsService.createUploadSession(req.userId, req.body);
    const updatedSession = await sessionsService.attachFilesToSession(session.id, {
      csvFile,
      movFile,
    });

    res.status(201).json({
      message: 'Files uploaded successfully',
      session: updatedSession,
    });
  } catch (error) {
    handleControllerError(res, error, 'Failed to upload session files');
  }
}

module.exports = {
  getSessions,
  getSessionById,
  uploadSessionFiles,
};
