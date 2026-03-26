const express = require('express');
const upload = require('../middleware/upload.middleware');

const router = express.Router();

router.post(
  '/',
  upload.fields([
    { name: 'csvFile', maxCount: 1 },
    { name: 'movFile', maxCount: 1 },
  ]),
  (req, res) => {
    res.json({
      message: 'Files uploaded successfully',
      files: req.files,
    });
  }
);

module.exports = router;