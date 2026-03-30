const express = require('express');
const upload = require('../middleware/upload.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const sessionsController = require('../controllers/sessions.controller');

const router = express.Router();

router.post(
  '/upload',
  requireAuth,
  upload.fields([
    { name: 'csvFile', maxCount: 1 },
    { name: 'movFile', maxCount: 1 },
  ]),
  sessionsController.uploadSessionFiles
);

router.get("/", requireAuth, sessionsController.getSessions);
router.get('/:id/status', requireAuth, sessionsController.getSessionStatus);
router.post('/:id/analyze', requireAuth, sessionsController.startSessionAnalysis);
router.get('/:id/results', requireAuth, sessionsController.getSessionResults);
router.get('/:id', requireAuth, sessionsController.getSessionById);

module.exports = router;
