/**
 * Enhanced error handling middleware
 */
const { redactUrl } = require('../utils/redactUrl');
const logger = require('../utils/logger');

// Error handler middleware
const errorHandler = (err, req, res, next) => {
  // Get context for logging
  const context = logger.addRequestContext ? logger.addRequestContext(req) : {};
  
  // Bad input from the client is a 400, not a server error
  if (err && err.name === 'CastError' && !err.statusCode) {
    err.statusCode = 400;
    err.message = `Invalid ${err.path}`;
  } else if (err && err.name === 'MulterError' && !err.statusCode) {
    // Upload limits (file too large, too many files): the client's fault
    err.statusCode = 400;
  } else if (err && err.name === 'ValidationError' && !err.statusCode) {
    err.statusCode = 400;
    err.message = Object.values(err.errors || {}).map((e) => e.message).join('; ') || err.message;
  }

  // Default to 500 if no status code is set
  const statusCode = err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);
  
  // Determine error severity
  const logLevel = statusCode >= 500 ? 'error' : 'warn';
  
  // Log the error with context
  if (logger[logLevel]) {
    logger[logLevel](
      `Error processing request: ${err.message || 'Unknown error'}`, 
      {
        ...context,
        statusCode,
        error: err.message,
        stack: err.stack,
        name: err.name,
        code: err.code
      }
    );
  } else {
    console.error(`Error processing request: ${err.message || 'Unknown error'}`, {
      statusCode,
      error: err.message,
      stack: err.stack
    });
  }
  
  // Prepare safe error response
  const isProduction = process.env.NODE_ENV === 'production';
  const response = {
    status: 'error',
    message: isProduction && statusCode === 500 && !err.expose
      ? 'Internal server error' 
      : err.message || 'An error occurred',
    requestId: req.id
  };
  
  // Include stack trace in development
  if (!isProduction) {
    response.stack = err.stack;
    
    // Include more error details in development
    if (err.details) {
      response.details = err.details;
    }
  }
  
  // Send JSON response with appropriate status code only if not already sent
  if (!res.headersSent) {
    res.status(statusCode).json(response);
  } else {
    // Headers already sent - log the error instead
    logger.error('Attempted to send error response after headers were already sent', {
      error: err.message,
      statusCode,
      path: redactUrl(req.originalUrl || req.path),
      method: req.method
    });
  }
};

module.exports = errorHandler;
