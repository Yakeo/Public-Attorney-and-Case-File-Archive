const express = require('express');
const router = express.Router();
const caseController = require('../controllers/caseController');
const publicSummaryController = require('../controllers/publicSummaryController');
const caseAssignmentController = require('../controllers/caseAssignmentController');
const clientController = require('../controllers/clientController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const publicSummaryUpload = require('../config/publicSummaryUpload');

// Public routes expose only a specifically approved public-summary record.
router.get('/public', publicSummaryController.listPublishedSummaries);
router.get('/public/:id/summary.pdf', publicSummaryController.downloadPublishedSummary);

// Admin-only publication controls. Uploading a PDF here is the explicit approval action.
router.get('/public-summaries/manage', authenticateToken, authorizeRoles(1), publicSummaryController.listManagedSummaries);
router.post(
  '/:id/public-summary',
  authenticateToken,
  authorizeRoles(1),
  publicSummaryUpload.single('summary_pdf'),
  publicSummaryController.publishSummary
);
router.delete('/:id/public-summary', authenticateToken, authorizeRoles(1), publicSummaryController.unpublishSummary);

// Protect remaining case endpoints
router.use(authenticateToken);

router.post('/', authenticateToken, authorizeRoles(1, 3), caseController.createCase);
router.get('/', caseController.getAllCases);
router.get('/:id', caseController.getCaseById);

// Case <-> Attorney assignment
router.post('/:id/attorneys', caseAssignmentController.assignAttorney);
router.get('/:id/attorneys', caseAssignmentController.listCaseAttorneys);

// Case <-> Client links
router.get('/:id/clients', clientController.listCaseClients);

module.exports = router;
