const express = require('express');
const upload = require('../middleware/upload.middleware');
const { uploadFiles } = require('../controllers/upload.controller');
const { requireAuth } = require('../middleware/auth.middleware');
const router = express.Router();

router.post(
  '/',
  requireAuth,
  upload.fields([
    { name: 'csvFile', maxCount: 1 },
    { name: 'movFile', maxCount: 1 },
  ]),
  uploadFiles
  // (req, res) => {
  //   res.json({
  //     message: 'Files uploaded successfully',
  //     files: req.files,
  //   });
  // }
);

module.exports = router;