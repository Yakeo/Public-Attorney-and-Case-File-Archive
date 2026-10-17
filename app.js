const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./config/db');
const CustomError = require('./utils/customError');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// CORS for API testing / frontend dev
app.use(cors());

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Raw storage URLs must never bypass authenticated document downloads.
app.use('/uploads', (req, res) => res.status(404).json({ status: 'fail', message: 'Not found.' }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'frontend')));

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Readiness is separate from process liveness.
app.get('/ready', async (req, res) => {
  try { await db.execute('SELECT 1'); res.json({ status: 'ready' }); }
  catch { res.status(503).json({ status: 'unavailable', message: 'Database unavailable.' }); }
});

// API Route Mounts (Versioned /api/v1 standards)
app.use('/api/v1/auth', require('./routes/authRoutes'));
app.use('/api/v1/cases', require('./routes/caseRoutes'));
app.use('/api/v1/clients', require('./routes/clientRoutes'));
app.use('/api/v1/users', require('./routes/attorneyRoutes'));
app.use('/api/v1/attorneys', require('./routes/attorneyRoutes'));
app.use('/api/v1/hearings', require('./routes/hearingRoutes'));
app.use('/api/v1/documents', require('./routes/documentRoutes'));

// 404 Route Catch-All for /api routes, otherwise serve frontend index.html
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api')) {
    return next(new CustomError(`Can't find ${req.originalUrl} on this server!`, 404));
  }
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Centralized Global Error Handler Middleware
app.use(errorHandler);

module.exports = app;
