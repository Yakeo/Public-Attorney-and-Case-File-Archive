const jwt = require('jsonwebtoken');
const CustomError = require('../utils/customError');

// Verify standard JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Expecting "Bearer <TOKEN>"

  if (!token) {
    return next(new CustomError('Access denied. No token provided.', 401));
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return next(new CustomError('Invalid or expired token.', 401));
    }
    req.user = user; // Attach payload (user_id, role_id) to request object
    next();
  });
};

// Restrict route to specific roles (accepts role_id integers or role names)
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new CustomError('Authentication required.', 401));
    }

    // Supports checking either role_id or role property from token payload
    const userRole = req.user.role_id !== undefined ? req.user.role_id : req.user.role;

    if (!allowedRoles.includes(userRole)) {
      return next(new CustomError('Forbidden: Insufficient permissions.', 403));
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  authorizeRoles
};