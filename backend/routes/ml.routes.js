const express = require('express');
const sessionsController = require('../controllers/sessions.controller');

const router = express.Router();

router.patch('/sessions/:id/status', sessionsController.updateSessionStatus);
router.post('/sessions/:id/results', sessionsController.saveSessionResults);

module.exports = router;
