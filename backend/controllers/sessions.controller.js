const sessionsService = require('../services/sessions.service');

function handleControllerError(res, error, fallbackMessage) {
  console.error(error);
  res.status(error.status || 500).json({
    error: error.message || fallbackMessage,
  });
}

async function getSessions(req, res) {
  try {
    const sessions = await sessionsService.getSessions({ userId: req.userId });
    res.json(sessions);
  } catch (error) {
    handleControllerError(res, error, 'Failed to load sessions');
  }
}

async function getSessionById(req, res) {
  try {
    const session = await sessionsService.getSessionById(req.params.id, req.userId);
    res.json(session);
  } catch (error) {
    handleControllerError(res, error, 'Failed to load session');
  }
}

async function getSessionStatus(req, res) {
  try {
    const status = await sessionsService.getSessionStatus(req.params.id, req.userId);
    res.json(status);
  } catch (error) {
    handleControllerError(res, error, 'Failed to load session status');
  }
}

async function startSessionAnalysis(req, res) {
  try {
    const payload = await sessionsService.startSessionAnalysis(req.params.id, req.userId);
    res.status(202).json(payload);
  } catch (error) {
    handleControllerError(res, error, 'Failed to start session analysis');
  }
}

async function updateSessionStatus(req, res) {
  try {
    const payload = await sessionsService.updateSessionStatus(req.params.id, req.body);
    res.json(payload);
  } catch (error) {
    handleControllerError(res, error, 'Failed to update session status');
  }
}

async function getSessionResults(req, res) {
  try {
    const results = await sessionsService.getSessionResults(req.params.id, req.userId);
    res.json(results);
  } catch (error) {
    handleControllerError(res, error, 'Failed to load session results');
  }
}

async function saveSessionResults(req, res) {
  try {
    const payload = await sessionsService.saveSessionResults(req.params.id, req.body);
    res.json(payload);
  } catch (error) {
    handleControllerError(res, error, 'Failed to record session results');
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
      session: sessionsService.serialiseSessionSummary(updatedSession),
    });
  } catch (error) {
    handleControllerError(res, error, 'Failed to upload session files');
  }
}

module.exports = {
  getSessions,
  getSessionById,
  getSessionStatus,
  startSessionAnalysis,
  updateSessionStatus,
  getSessionResults,
  saveSessionResults,
  uploadSessionFiles,
};
