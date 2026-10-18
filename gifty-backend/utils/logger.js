const { redactUrl } = require('./redactUrl');
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// File logs are off in the container (LOG_TO_FILE=false): stdout only
const logToFile = process.env.LOG_TO_FILE !== 'false';
const logsDir = path.join(__dirname, '../logs');
if (logToFile && !fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create a format that filters sensitive data - FIXED VERSION
const filterSensitiveData = winston.format((info) => {
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'apikey', 'api_key', 'authorization'];
  
  // Create a shallow copy instead of deep clone to avoid issues
  const filteredInfo = { ...info };
  
  // Function to recursively filter sensitive data
  const filterSensitive = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    
    Object.keys(obj).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        // Avoid circular references and null values
        try {
          filterSensitive(obj[key]);
        } catch (err) {
          // If we hit a circular reference or other issue, just redact the whole field
          obj[key] = '[FILTERED]';
        }
      }
    });
  };
  
  try {
    filterSensitive(filteredInfo);
    return filteredInfo;
  } catch (err) {
    // If filtering fails entirely, return the original info
    console.error('Winston filter error:', err.message);
    return info;
  }
});

const SPLAT = Symbol.for('splat');
const isPrimitive = (value) => value === null || ['string', 'number', 'boolean', 'bigint'].includes(typeof value);

// logger.warn('Tracking failed:', err.message): winston's splat would spread a
// string into "0","1",… keys and drop numbers. Without %-placeholders, plain
// values join the message; objects and errors stay meta (stack kept).
const joinPlainArgs = winston.format((info) => {
  const args = info[SPLAT];
  if (!Array.isArray(args) || typeof info.message !== 'string' || /%[sdifjoOc%]/.test(info.message)) return info;
  if (!args.some(isPrimitive)) return info;
  info.message = [info.message, ...args.filter(isPrimitive).map(String)].join(' ');
  info[SPLAT] = args.filter((arg) => !isPrimitive(arg));
  return info;
});

// Levels are filtered at the transports, after every format has run: drop a
// disabled level first, so debug calls cost nothing in production
const dropDisabledLevels = winston.format((info) =>
  (logger && typeof logger.isLevelEnabled === 'function' && !logger.isLevelEnabled(info.level) ? false : info));

// Define log levels based on environment
const getLogLevel = () => {
  const env = process.env.NODE_ENV || 'development';
  if (env === 'production') {
    return process.env.LOG_LEVEL || 'info';
  }
  return process.env.LOG_LEVEL || 'debug';
};



// Create logger instance with FIXED configuration
let logger; // Declare logger using let to allow reassignment for fallback

try {
  const winstonLogger = winston.createLogger({
    level: getLogLevel(),
    format: winston.format.combine(
      dropDisabledLevels(),
      joinPlainArgs(),
      filterSensitiveData(), // Call the factory returned by winston.format() to get the Format instance
      logFormat             // Then apply standard formatting
    ),
    defaultMeta: {
      service: 'gifty-backend',
      environment: process.env.NODE_ENV || 'development',
      instanceId: process.env.INSTANCE_ID || 'local'
    },
    transports: [
      // Write all logs to console with environment-specific formatting
      new winston.transports.Console({
        format: (process.env.NODE_ENV === 'production') 
          ? winston.format.json()
          : winston.format.combine(
              winston.format.colorize(),
              winston.format.simple()
            )
      }),
      ...(logToFile ? [
        // Write all logs with level 'error' and below to error.log
        new winston.transports.File({ 
          filename: path.join(logsDir, 'error.log'), 
          level: 'error',
          format: winston.format.json(),
          maxFiles: 5,
          maxsize: 10 * 1024 * 1024, // 10MB
          tailable: true
        }),
        // Write all logs to combined.log  
        new winston.transports.File({ 
          filename: path.join(logsDir, 'combined.log'),
          format: winston.format.json(),
          maxFiles: 5,
          maxsize: 10 * 1024 * 1024, // 10MB
          tailable: true
        })
      ] : [])
    ]
  });

  if (!winstonLogger || typeof winstonLogger.info !== 'function') {
    // This case handles if winston.createLogger returns null/undefined or a non-functional object
    console.error('Winston logger initialization returned invalid instance. Using fallback console logger.');
    throw new Error('Winston logger initialization failed, returned invalid instance.'); // Force fallback
  }
  logger = winstonLogger;

} catch (error) {
  // This catch block handles errors during winston.createLogger or the explicit throw above
  console.error('CRITICAL: Failed to initialize Winston logger due to error:', error.message, error.stack);
  console.error('Using basic console logger as fallback.');
  logger = {
    info: (...args) => console.info('FALLBACK_LOGGER:', ...args),
    warn: (...args) => console.warn('FALLBACK_LOGGER:', ...args),
    error: (...args) => console.error('FALLBACK_LOGGER:', ...args),
    debug: (...args) => console.debug('FALLBACK_LOGGER:', ...args),
    // Define dummy methods for what's expected to be assigned later,
    // so that assignments like logger.addRequestContext don't fail.
    // These will be overwritten by the actual functions later if logger is this fallback.
    addRequestContext: (req) => {
      console.debug('FALLBACK_LOGGER: addRequestContext called');
      if (!req) return {};
      return {
        requestId: req.id || req.requestId || 'fallback_unknown_id',
        ip: req.ip || (req.connection && req.connection.remoteAddress) || 'fallback_unknown_ip',
        method: req.method || 'FALLBACK_METHOD',
        path: redactUrl(req.originalUrl || req.url) || '/fallback_path'
      };
    },
    requestMiddleware: (req, res, next) => {
      console.debug('FALLBACK_LOGGER: requestMiddleware called');
      if (next && typeof next === 'function') {
        next();
      } else {
        console.error('FALLBACK_LOGGER: next is not a function in requestMiddleware');
      }
    }
  };
}

// Build defaultMeta with instanceId and environment
const defaultMeta = {
  service: 'gifty-backend',
  environment: process.env.NODE_ENV || 'development',
  instanceId: process.env.INSTANCE_ID || 'local'
};

// Helper function to add request context to logs
logger.addRequestContext = (req) => {
  if (!req) return {};
  
  const context = {
    requestId: req.id || req.requestId || 'unknown',
    ip: req.ip || (req.connection && req.connection.remoteAddress) || 'unknown',
    method: req.method,
    path: redactUrl(req.originalUrl || req.url)
  };
  
  // Add user ID if authenticated
  if (req.user && req.user.id) {
    context.userId = req.user.id;
  }
  
  return context;
};

// Expose a middleware function to add request ID
logger.requestMiddleware = (req, res, next) => {
  // Generate a unique request ID if not already present
  // A client- or proxy-sent id is kept only when it is a plain id
  // (uuid-like: letters, digits, dashes, 8-64 long); anything else could
  // forge log lines or be reflected, so a fresh one replaces it
  const sent = req.headers['x-request-id'];
  const plain = typeof sent === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(sent) ? sent : null;
  req.id = req.id || plain || require('crypto').randomUUID();
  
  // Add request ID to response headers
  res.set('X-Request-ID', req.id);
  
  // Log the request
  logger.info(`Incoming request: ${req.method} ${redactUrl(req.originalUrl)}`, logger.addRequestContext(req));
  
  // Calculate response time
  const start = Date.now();
  
  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`Request completed: ${res.statusCode} in ${duration}ms`, {
      ...logger.addRequestContext(req),
      statusCode: res.statusCode,
      responseTime: duration
    });
  });
  
  next();
};

// Global unhandled error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.stack || error.toString() });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', { 
    reason: reason instanceof Error ? reason.stack : reason,
    promise: promise.toString()
  });
});

module.exports = logger;
