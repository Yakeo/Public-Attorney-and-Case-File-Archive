const express = require('express');
const router = express.Router();
const caseController = require('../controllers/caseController');
const caseAssignmentController = require('../controllers/caseAssignmentController');
const clientController = require('../controllers/clientController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Public, non-confidential case summaries (no auth)
router.get('/public', caseController.getPublicCases);

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
