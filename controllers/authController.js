const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const catchAsync = require('../utils/catchAsync');
const { logAction, getRequestMeta } = require('../utils/auditLog');
const CustomError = require('../utils/customError');

// 1. Register a new user
exports.register = catchAsync(async (req, res, next) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return next(new CustomError('Please provide username, email, and password.', 400));
  }

  // Check existing user query
  const [existingUser] = await db.execute(
    'SELECT user_id FROM user_account WHERE email = ? OR username = ?',
    [email, username]
  );

  if (existingUser.length > 0) {
    return next(new CustomError('Username or Email already registered.', 400));
  }

  // Hash password
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  // Insert user into DB
  const [result] = await db.execute(
    'INSERT INTO user_account (username, email, password_hash, role_id) VALUES (?, ?, ?, ?)',
    [username, email, passwordHash, 5] // Default to standard user role
  );

  const metaR = getRequestMeta(req);
  await logAction({ user_id: result.insertId, event_type: 'CREATE', action_taken: 'Registered user', ...metaR });

  res.status(201).json({
    status: 'success',
    message: 'User registered successfully',
    data: {
      userId: result.insertId
    }
  });
});

// 2. User Login
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new CustomError('Please provide email and password.', 400));
  }

  const [users] = await db.execute(
    'SELECT user_id, username, email, password_hash, role_id, is_active FROM user_account WHERE email = ?',
    [email]
  );

  if (users.length === 0 || !users[0].is_active) {
    return next(new CustomError('Invalid credentials', 401));
  }

  const user = users[0];
  const isMatch = await bcrypt.compare(password, user.password_hash);

  if (!isMatch) {
    return next(new CustomError('Invalid credentials', 401));
  }

  // Sign JWT Token
  const token = jwt.sign(
    { user_id: user.user_id, role_id: user.role_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  const metaL = getRequestMeta(req);
  await logAction({ user_id: user.user_id, event_type: 'AUTH', action_taken: 'User login', ...metaL });

  res.status(200).json({
    status: 'success',
    message: 'Login successful',
    token,
    user: {
      id: user.user_id, // Fixed: mapped to user_id
      username: user.username,
      full_name: user.username,
      email: user.email,
      role_id: user.role_id
    }
  });
});

// 3. Get Current User Profile
exports.getProfile = catchAsync(async (req, res, next) => {
  const [users] = await db.execute(
    'SELECT user_id, username, email, role_id, is_active FROM user_account WHERE user_id = ?',
    [req.user.user_id]
  );

  if (users.length === 0 || !users[0].is_active) {
    return next(new CustomError('User profile not found.', 404));
  }

  const u = users[0];
  res.status(200).json({
    status: 'success',
    data: { ...u, full_name: u.username }
  });
});