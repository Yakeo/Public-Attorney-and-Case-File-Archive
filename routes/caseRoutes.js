const express = require('express');
const router = express.Router();
const caseController = require('../controllers/caseController');
const { authenticateToken } = require('../middleware/auth');

// Protect all case endpoints
router.use(authenticateToken);

router.post('/', caseController.createCase);
router.get('/', caseController.getAllCases);
router.get('/:id', caseController.getCaseById);

module.exports = router;