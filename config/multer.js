const multer = require('multer');
const path = require('path');
const fs = require('fs');
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
    // Generate a collision-proof unique filename using timestamp + random integer
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `doc-${uniqueSuffix}${ext}`);
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