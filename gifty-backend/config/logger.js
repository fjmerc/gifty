const { redactUrl } = require('../utils/redactUrl');
const winston = require('winston');
const path = require('path');
const { createLogger, format, transports } = winston;
const { combine, timestamp, printf, colorize, json } = format;

// Create logs directory if it doesn't exist
const fs = require('fs');
const logToFile = process.env.LOG_TO_FILE !== 'false';
const logsDir = path.join(__dirname, 'logs');
if (logToFile && !fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Define formats
const consoleFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  printf(({ level, message, timestamp, ...metadata }) => {
    const metaString = Object.keys(metadata).length ? 
      JSON.stringify(metadata, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaString}`;
  })
);

const fileFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  json()
);

// Get environment from NODE_ENV
const environment = process.env.NODE_ENV || 'development';

// Set log level based on environment
const logLevel = environment === 'production' ? 'info' : 'debug';

// Create the logger instance
const logger = createLogger({
  level: logLevel,
  defaultMeta: { service: 'gifty-backend' },
  transports: [
    // Console transport with color
    new transports.Console({
      format: consoleFormat
    }),
    ...(logToFile ? [
      // Write all logs with level 'info' and below to combined.log
      new transports.File({
        filename: path.join(logsDir, 'combined.log'),
        format: fileFormat,
      }),
      // Write all logs with level 'error' and below to error.log
      new transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        format: fileFormat,
      })
    ] : [])
  ],
  // Do not exit on handled exceptions
  exitOnError: false
});

// Add request ID to log context when available
logger.addRequestId = (req) => {
  return {
    requestId: req.id || 'unknown',
    ip: req.ip || req.connection.remoteAddress,
    method: req.method,
    path: redactUrl(req.originalUrl || req.url)
  };
};

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.stack || error.toString() });
  // Give the logger some time to flush the logs before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Log unhandled promise rejections
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Promise Rejection', { error: error.stack || error.toString() });
});

module.exports = logger;
