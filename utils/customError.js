class CustomError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // Identifies user/validation errors vs server crashes
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = CustomError;