const jwt = require('jsonwebtoken');
const db = require('../config/db');
const CustomError = require('../utils/customError');
const catchAsync = require('../utils/catchAsync');

// Signed claims establish identity; current database state establishes access.
// This revokes access immediately after deactivation or a role change.
const authenticateToken = catchAsync(async (req, res, next) => {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  if (!match) return next(new CustomError('Access denied. No token provided.', 401));
  let claims;
  try { claims = jwt.verify(match[1], process.env.JWT_SECRET); }
  catch { return next(new CustomError('Invalid or expired token.', 401)); }
  if (!claims || !Number.isInteger(claims.user_id)) return next(new CustomError('Invalid token identity.', 401));
  const [users] = await db.execute(
    'SELECT user_id, role_id, is_active FROM user_account WHERE user_id = ?', [claims.user_id]
  );
  if (!users.length || !users[0].is_active) {
    return next(new CustomError('Account is inactive or unavailable.', 401));
  }
  req.user = { user_id: users[0].user_id, role_id: users[0].role_id };
  next();
});

const authorizeRoles = (...allowedRoles) => (req, res, next) => {
  if (!req.user) return next(new CustomError('Authentication required.', 401));
  if (!allowedRoles.includes(req.user.role_id)) {
    return next(new CustomError('Forbidden: Insufficient permissions.', 403));
  }
  next();
};
module.exports = { authenticateToken, authorizeRoles };
