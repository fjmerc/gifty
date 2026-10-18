const { redactUrl } = require('../utils/redactUrl');
const logger = require('../utils/logger');

/**
 * Middleware for tracking API response times and performance metrics
 * @returns {Function} Express middleware
 */
const performanceMiddleware = () => {
  return (req, res, next) => {
    // Record start time
    const start = process.hrtime();

    // Track memory usage at start
    const memoryStart = process.memoryUsage();

    // Store original end method
    const originalEnd = res.end;

    // Override end method to log performance metrics (but NOT set headers)
    res.end = function(chunk, encoding) {
      // Calculate response time in milliseconds
      const diff = process.hrtime(start);
      const responseTime = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);

      // Node has no 'header' event; set the header here, before the final write
      if (!res.headersSent) {
        res.setHeader('X-Response-Time', `${responseTime}ms`);
      }

      // Track memory usage at end
      const memoryEnd = process.memoryUsage();
      
      // Calculate memory difference (in MB)
      const memoryDiff = {
        rss: ((memoryEnd.rss - memoryStart.rss) / 1024 / 1024).toFixed(2),
        heapTotal: ((memoryEnd.heapTotal - memoryStart.heapTotal) / 1024 / 1024).toFixed(2),
        heapUsed: ((memoryEnd.heapUsed - memoryStart.heapUsed) / 1024 / 1024).toFixed(2),
        external: ((memoryEnd.external - memoryStart.external) / 1024 / 1024).toFixed(2)
      };
      
      // Determine if request is slow (over 500ms)
      const isSlow = responseTime > 500;
      
      // Log performance metrics for all requests
      const logLevel = isSlow ? 'warn' : 'info';
      logger[logLevel]('API Performance', {
        method: req.method,
        url: redactUrl(req.originalUrl),
        statusCode: res.statusCode,
        responseTime: `${responseTime}ms`,
        contentLength: res.get('Content-Length') || 0,
        memoryDiff,
        userId: req.user?._id?.toString() || 'anonymous',
        slow: isSlow
      });
      
      // Publish metrics to Redis if available
      try {
        const { publisherClient } = require('../config/redis');
        // ioredis exposes status, not a .connected flag
        if (publisherClient && publisherClient.status === 'ready') {
          publisherClient.publish('gifty:metrics:api', JSON.stringify({
            timestamp: Date.now(),
            method: req.method,
            path: redactUrl(req.originalUrl || req.path),
            statusCode: res.statusCode,
            responseTime: parseFloat(responseTime),
            contentLength: parseInt(res.get('Content-Length') || 0),
            slow: isSlow,
            userId: req.user?._id?.toString() || 'anonymous'
          }));
        }
      } catch (err) {
        // Ignore redis errors
      }
      
      // Call original end method
      return originalEnd.apply(this, arguments);
    };
    
    next();
  };
};

/**
 * Middleware for handling request timeouts
 * @param {Number} timeout - Timeout in milliseconds (default: 30000)
 * @returns {Function} Express middleware
 */
const requestTimeoutMiddleware = (timeout = 30000) => {
  return (req, res, next) => {
    // Track if timeout has been cleared to prevent multiple clears
    let timeoutCleared = false;

    const clearRequestTimeout = () => {
      if (!timeoutCleared && req.timeoutId) {
        clearTimeout(req.timeoutId);
        timeoutCleared = true;
      }
    };

    // Set timeout
    req.timeoutId = setTimeout(() => {
      // Only process timeout if not already cleared
      if (timeoutCleared) return;

      // Log timeout
      logger.error('Request timeout', {
        method: req.method,
        url: redactUrl(req.originalUrl),
        timeout: `${timeout}ms`,
        userId: req.user?._id?.toString() || 'anonymous'
      });

      // If headers have not been sent yet, send timeout response
      if (!res.headersSent) {
        res.status(408).json({
          status: 'error',
          message: 'Request timeout'
        });
      }
    }, timeout);

    // Clear once the response has been sent
    res.on('finish', clearRequestTimeout);

    // Clear on connection close (client disconnect)
    res.on('close', clearRequestTimeout);

    // Expose clear function for manual clearing if needed
    req.clearTimeout = clearRequestTimeout;

    // Continue to next middleware
    next();
  };
};

/**
 * Route-level middleware that replaces the app-wide request timeout with a
 * longer one. Clearing the existing timer matters: overwriting req.timeoutId
 * alone would not cancel the global 30s timer, which fires regardless.
 * @param {Number} timeout - Timeout in milliseconds
 * @returns {Function} Express middleware
 */
const extendRequestTimeout = (timeout) => {
  const applyTimeout = requestTimeoutMiddleware(timeout);
  return (req, res, next) => {
    if (req.clearTimeout) {
      req.clearTimeout();
    }
    applyTimeout(req, res, next);
  };
};

module.exports = {
  performanceMiddleware,
  requestTimeoutMiddleware,
  extendRequestTimeout
};
