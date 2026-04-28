const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const sessionsController = require('../controllers/sessions.controller');

const router = express.Router();

router.post('/upload-sessions', requireAuth, sessionsController.createUploadSession);
router.post('/upload-sessions/:id/presign', requireAuth, sessionsController.createUploadPresign);
router.post('/upload-sessions/:id/complete', requireAuth, sessionsController.completeUploadSessionFile);

router.get('/sessions', requireAuth, sessionsController.getSessions);
router.get('/sessions/:id/status', requireAuth, sessionsController.getSessionStatus);
router.post('/sessions/:id/analyze', requireAuth, sessionsController.startSessionAnalysis);
router.get('/sessions/:id/results', requireAuth, sessionsController.getSessionResults);
router.get('/sessions/:id/results/video', requireAuth, sessionsController.getSessionVideoUrl);
router.get('/sessions/:id', requireAuth, sessionsController.getSessionById);

module.exports = router;
