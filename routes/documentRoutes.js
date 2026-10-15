const express = require('express');
const router = express.Router();
const upload = require('../config/multer');
const documentController = require('../controllers/documentController');
const { authenticateToken } = require('../middleware/auth'); // Fixed path and export name

// Apply authentication middleware to all document routes
router.use(authenticateToken);

// 1. Full-text search across extracted OCR text
router.get('/search', documentController.searchDocumentText);

// 2. Initial document upload (Async OCR)
router.post(
  '/upload', 
  upload.single('document'), 
  documentController.uploadAndProcessDocument
);

// 3. Version management
router.get(
  '/:document_id/versions', 
  documentController.getDocumentVersions
);

router.post(
  '/:document_id/versions', 
  upload.single('document'), 
  documentController.uploadNewVersion
);

module.exports = router;