const express = require('express');
const router = express.Router();
const hearingController = require('../controllers/hearingController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Protect all hearing endpoints
router.use(authenticateToken, authorizeRoles(1, 2, 3));

// GET /api/v1/hearings?case_id=... -> list by case (convenience)
router.get('/', (req, res, next) => {
  if (req.query.case_id) {
    req.params = req.params || {};
    req.params.caseId = req.query.case_id;
    return require('../controllers/hearingController').getHearingsByCase(req, res, next);
  }
  res.json({ status: 'success', results: 0, data: [] });
});

// POST /api/v1/hearings -> Schedule a hearing
router.post('/', authenticateToken, authorizeRoles(1, 2, 3), hearingController.createHearing);

// GET /api/v1/hearings/calendar?startDate=...&endDate=... -> Fetch hearings for calendar view
router.get('/calendar', hearingController.getHearingsByDateRange);

// GET /api/v1/hearings/case/:caseId -> Fetch hearings for a specific case
router.get('/case/:caseId', hearingController.getHearingsByCase);

// PATCH /api/v1/hearings/:hearingId -> Update hearing status or details
router.patch('/:hearingId', authenticateToken, authorizeRoles(1, 2, 3), hearingController.updateHearing);

module.exports = router;