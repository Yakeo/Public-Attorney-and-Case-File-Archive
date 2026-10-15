const express = require('express');
const router = express.Router();
const attorneyController = require('../controllers/attorneyController');
const caseAssignmentController = require('../controllers/caseAssignmentController');
const { authenticateToken } = require('../middleware/auth');

// Public directory endpoints (no auth required)
router.get('/attorneys', attorneyController.listAttorneys);
router.get('/:id', attorneyController.getAttorney);

// Convenience: list all
router.get('/', attorneyController.listAttorneys);

// Authenticated: list cases assigned to an attorney
router.get('/:id/cases', authenticateToken, caseAssignmentController.listAttorneyCases);

module.exports = router;
