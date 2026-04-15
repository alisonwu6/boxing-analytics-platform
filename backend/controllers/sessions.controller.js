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

async function getSessionResults(req, res) {
  try {
    const results = await sessionsService.getSessionResults(req.params.id, req.userId);
    res.json(results);
  } catch (error) {
    handleControllerError(res, error, 'Failed to load session results');
  }
}

async function createUploadSession(req, res) {
  try {
    const session = await sessionsService.createUploadSession(req.userId, req.body);
    res.status(201).json(session);
  } catch (error) {
    handleControllerError(res, error, 'Failed to create upload session');
  }
}

async function createUploadPresign(req, res) {
  try {
    const payload = await sessionsService.createUploadPresign(
      req.params.id,
      req.userId,
      req.body
    );
    res.json(payload);
  } catch (error) {
    handleControllerError(res, error, 'Failed to create presigned upload URL');
  }
}

async function completeUploadSessionFile(req, res) {
  try {
    const session = await sessionsService.completeUploadSessionFile(
      req.params.id,
      req.userId,
      req.body
    );
    res.json({
      message: 'Upload session updated',
      session,
    });
  } catch (error) {
    handleControllerError(res, error, 'Failed to complete upload session file');
  }
}

module.exports = {
  getSessions,
  getSessionById,
  getSessionStatus,
  startSessionAnalysis,
  getSessionResults,
  createUploadSession,
  createUploadPresign,
  completeUploadSessionFile,
};
