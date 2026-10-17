const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const CustomError = require('../utils/customError');

// Ensure upload destination directory exists on disk before processing writes
const uploadDir = path.join(__dirname, '../uploads/documents');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Set up disk storage engine
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const extensions = { 'application/pdf': '.pdf', 'image/png': '.png',
      'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/tiff': '.tiff' };
    cb(null, `doc-${randomUUID()}${extensions[file.mimetype]}`);
  }
});

// File validation filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf', 
    'image/png', 
    'image/jpeg', 
    'image/jpg',
    'image/tiff'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // Accept file stream
  } else {
    cb(new CustomError('Invalid file type. Only PDF, PNG, JPEG, and TIFF files are allowed.', 400), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max file size limit
});

module.exports = upload;