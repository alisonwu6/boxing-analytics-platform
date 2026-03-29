const fs = require('fs');
const multer = require('multer');
const path = require('path');

const uploadsDirectory = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDirectory, { recursive: true });

function fileFilter(req, file, cb) {
  const extension = path.extname(file.originalname).toLowerCase();

  if (file.fieldname === 'csvFile' && extension !== '.csv') {
    return cb(new Error('csvFile must be a .csv file'));
  }

  if (file.fieldname === 'movFile' && extension !== '.mov') {
    return cb(new Error('movFile must be a .mov file'));
  }

  cb(null, true);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDirectory);
  },
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() + '-' + Math.round(Math.random() * 1e9);

    cb(null, uniqueName + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 250 * 1024 * 1024,
  },
});

module.exports = upload;
