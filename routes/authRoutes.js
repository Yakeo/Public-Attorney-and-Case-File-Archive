const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

// Public endpoints
router.post('/register', authController.register);
router.post('/login', authController.login);

// Authenticated user profile
router.get('/me', authenticateToken, authController.getProfile);

module.exports = router;