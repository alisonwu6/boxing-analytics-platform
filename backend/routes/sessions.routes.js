const express = require('express');
const upload = require('../middleware/upload.middleware');
const sessionsController = require('../controllers/sessions.controller');

const router = express.Router();

router.post(
  '/upload',
  upload.fields([
    { name: 'csvFile', maxCount: 1 },
    { name: 'movFile', maxCount: 1 },
  ]),
  sessionsController.uploadSessionFiles
);

router.get("/", sessionsController.getSessions);
router.get('/:id', sessionsController.getSessionById);

module.exports = router;
