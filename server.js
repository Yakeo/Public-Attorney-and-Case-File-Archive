require('dotenv').config();
const app = require('./app');
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
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

