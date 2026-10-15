const express = require('express');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

// Process-level safety: catch synchronous errors thrown outside route handlers
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! Shutting down process...');
  console.error(err.name, err.message);
  process.exit(1);
});

const db = require('./config/db');
const CustomError = require('./utils/customError');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded documents statically (if needed for file preview/download)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'frontend')));

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// API Route Mounts (Versioned /api/v1 standards)
app.use('/api/v1/auth', require('./routes/authRoutes'));
app.use('/api/v1/cases', require('./routes/caseRoutes'));
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

const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

// Process-level safety: catch unhandled promise rejections gracefully
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! Shutting down gracefully...');
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Native Express error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        error: err.message || 'An unexpected backend error occurred.'
    });
});
