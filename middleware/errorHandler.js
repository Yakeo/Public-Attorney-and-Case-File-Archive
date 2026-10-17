const fs = require('fs/promises');

const errorHandler = async (err, req, res, next) => {
  console.error('🔥 Central Error Handler Caught:', err.message);

  // 1. FAIL-SAFE CLEANUP: Remove orphaned uploaded file(s) from disk on failure
  const filesToDelete = [];
  if (!req.uploadCommitted && req.file && req.file.path) {
    filesToDelete.push(req.file.path);
  } else if (!req.uploadCommitted && req.files) {
    if (Array.isArray(req.files)) {
      req.files.forEach((f) => filesToDelete.push(f.path));
    } else if (typeof req.files === 'object') {
      Object.values(req.files).flat().forEach((f) => filesToDelete.push(f.path));
    }
  }

  for (const filePath of filesToDelete) {
    try {
      await fs.unlink(filePath);
      console.log(`🧹 Cleaned up orphaned file from disk: ${filePath}`);
    } catch (unlinkErr) {
      // Ignore if file doesn't exist on disk
      if (unlinkErr.code !== 'ENOENT') {
        console.error(`Failed to remove orphaned file (${filePath}):`, unlinkErr);
      }
    }
  }

  // 2. FAIL-SAFE CLEANUP: Rollback database transaction if attached to request
  if (req.dbConnection) {
    try {
      await req.dbConnection.rollback();
      console.log('🔄 Rolled back uncommitted database transaction.');
    } catch (dbErr) {
      console.error('Failed to rollback transaction:', dbErr);
    } finally {
      if (typeof req.dbConnection.release === 'function') {
        req.dbConnection.release(); // Always release leased connection back to pool
      }
    }
  }

  // 3. MULTER ERROR FORMATTING
  let statusCode = err.statusCode || (err.type === 'entity.parse.failed' ? 400 : 500);
  let message = err.isOperational ? err.message : 'Internal Server Error during processing.';

  if (err.name === 'MulterError') {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File size exceeds the 25MB maximum limit.';
    } else {
      message = `File upload error: ${err.message}`;
    }
  }

  // 4. RESPOND TO CLIENT
  res.status(statusCode).json({
    status: statusCode >= 500 ? 'error' : 'fail',
    statusCode,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;