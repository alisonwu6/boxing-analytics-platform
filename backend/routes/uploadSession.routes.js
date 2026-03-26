const express = require('express');
const { create } = require('../controllers/uploadSession.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/', requireAuth, create);

module.exports = router;