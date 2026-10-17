const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const CustomError = require('../utils/customError');

// Kept outside /uploads so Express's public static mount cannot expose these files.
const uploadDir = path.join(__dirname, '../private-storage/public-summaries');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.pdf`)
});

const fileFilter = (_req, file, cb) => {
  const hasPdfExtension = path.extname(file.originalname).toLowerCase() === '.pdf';
  if (file.mimetype === 'application/pdf' && hasPdfExtension) return cb(null, true);
  cb(new CustomError('Only PDF public summaries are accepted.', 400), false);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 5 }
});
