const express = require('express');
const router = express.Router();
const hearingController = require('../controllers/hearingController');
const { authenticateToken } = require('../middleware/auth');

// Protect all hearing endpoints
router.use(authenticateToken);

// POST /api/v1/hearings -> Schedule a hearing
router.post('/', hearingController.createHearing);

// GET /api/v1/hearings/calendar?startDate=...&endDate=... -> Fetch hearings for calendar view
router.get('/calendar', hearingController.getHearingsByDateRange);

// GET /api/v1/hearings/case/:caseId -> Fetch hearings for a specific case
router.get('/case/:caseId', hearingController.getHearingsByCase);

// PATCH /api/v1/hearings/:hearingId -> Update hearing status or details
router.patch('/:hearingId', hearingController.updateHearing);

module.exports = router;