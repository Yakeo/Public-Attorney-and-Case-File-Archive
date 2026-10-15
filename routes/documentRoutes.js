const express = require('express');
const router = express.Router();
const upload = require('../config/multer');
const documentController = require('../controllers/documentController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Apply authentication middleware to all document routes
router.use(authenticateToken);

// 0. List documents (optionally by case_id)
router.get('/', documentController.listDocuments);

// 1. Full-text search across extracted OCR text
router.get('/search', documentController.searchDocumentText);

// 2. Initial document upload (Async OCR)
router.post(
  '/upload', 
  authenticateToken,
  authorizeRoles(1, 2, 3),
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
  authenticateToken,
  authorizeRoles(1, 2, 3),
  upload.single('document'), 
  documentController.uploadNewVersion
);

router.get('/:document_id/download', documentController.downloadDocument);

module.exports = router;