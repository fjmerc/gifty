const dotenv = require('dotenv');
dotenv.config();

// Boot order matters: validate config and load secrets before any module
// reads JWT_SECRET/COOKIE_SECRET/ENCRYPTION_KEY from process.env.
const runtime = require('./config/runtime');
const { validateEnv, summaryLine, checkWritableDirs } = require('./config/validateEnv');
const { loadSecrets } = require('./config/secrets');

const configErrors = [
  ...validateEnv(process.env),
  ...checkWritableDirs([runtime.DATA_DIR, runtime.UPLOADS_DIR, runtime.BACKUP_DIR])
];
if (configErrors.length > 0) {
  console.error(`Gifty cannot start — configuration errors:\n  - ${configErrors.join('\n  - ')}`);
  process.exit(1);
}
try {
  const { generated } = loadSecrets({ dataDir: runtime.DATA_DIR });
  if (generated.length > 0) console.log(`Generated ${generated.join(', ')} in ${runtime.DATA_DIR}/secrets.json`);
} catch (err) {
  console.error(`Gifty cannot start — ${err.message}`);
  process.exit(1);
}

const express = require('express');
const { connectDB, disconnectDB } = require('./config/db');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { startReminderProcessor } = require('./services/notificationService');
const { startCleanupScheduler } = require('./services/cleanupService'); // Import the cleanup scheduler
const { processMissedNotifications } = require('./services/catchupService'); // Import the catch-up service
const { initializeSchedulers, stopSchedulers } = require('./services/schedulerService'); // All cron jobs
const logger = require('./utils/logger'); // Enhanced structured logger
const holidayService = require('./services/holidayService'); // Import the holiday service
const mongoose = require('mongoose'); // Import mongoose for closing connection

// Initialize Express app
const app = express();
app.set('trust proxy', runtime.getTrustProxy()); // see config/runtime.js

// Middleware to parse JSON bodies
app.use(express.json());

// No MongoDB operators ($-prefixed or dotted keys) in bodies or query strings
app.use(require('./middleware/sanitizeMongoKeys').stripMongoOperators);

// Apply enhanced security headers
const configureSecurityHeaders = require('./middleware/securityHeadersMiddleware');
configureSecurityHeaders(app);

// Add cookie parser - needed for JWT cookie handling
const cookieParser = require('cookie-parser');
app.use(cookieParser(process.env.COOKIE_SECRET || process.env.JWT_SECRET));

// Compression middleware
app.use(compression());

// CORS: the combined image serves UI and API from one origin; see config/corsOptions
const { corsOptionsDelegate } = require('./config/corsOptions');
app.use(cors(corsOptionsDelegate));

// Serve uploaded images from the data dir. Helmet's default
// Cross-Origin-Resource-Policy (same-site) would block the dev frontend
// (port 3000) from embedding them, since a different port is a different origin.
fs.mkdirSync(runtime.UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(runtime.UPLOADS_DIR, {
  setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
}));

// Performance monitoring middleware
const { performanceMiddleware, requestTimeoutMiddleware } = require('./middleware/performanceMiddleware');
const { memoryMonitorMiddleware } = require('./middleware/memoryMonitorMiddleware');

// Add request logger middleware before other middleware
app.use(logger.requestMiddleware);

// Warn once when a proxy's X-Forwarded-For arrives but TRUST_PROXY is unset
app.use(require('./middleware/rateLimitMiddleware').warnIfProxyHeadersIgnored);

// Apply performance middleware to all requests
app.use(performanceMiddleware());

// Apply timeout middleware with 30 second timeout
app.use(requestTimeoutMiddleware(30000));

// Apply memory monitoring middleware
app.use(memoryMonitorMiddleware());

// Import main API router
const apiRouter = require('./routes/api');
const databaseRoutes = require('./routes/databaseRoutes');

// Mount the main API router first
app.use('/api', apiRouter);

// Mount database routes
app.use('/api/database', databaseRoutes);

// Add 404 handler for API routes
app.use('/api/*', (req, res) => {
    logger.warn(`API endpoint not found: ${req.originalUrl}`);
    res.status(404).json({
        status: 'error',
        message: 'API endpoint not found: The requested service is not available or not properly set up on the server'
    });
});

// Serve the React build (combined image only) after the /api 404 handler
const { mountSpa } = require('./middleware/spaMiddleware');
if (mountSpa(app, runtime.PUBLIC_DIR)) {
  logger.info(`Serving web UI from ${runtime.PUBLIC_DIR}`);
}

// Import enhanced error handler middleware
const errorHandler = require('./middleware/errorHandler');

// Apply enhanced error handling middleware
app.use(errorHandler);

// Connect to the database and start the server
const startServer = async () => {
  try {
    // Connect to MongoDB
    const connection = await connectDB();
    logger.info('MongoDB connection established');
    
    // Initialize Redis
    try {
      const { redisClient } = require('./config/redis');
      await redisClient.ping();
      logger.info('Redis connection verified');
    } catch (redisError) {
      logger.error('Failed to initialize Redis:', redisError);
      throw redisError;
    }
    
    try {
      // One-time migrations (money model, text repair), default data and
      // repairs, before requests are served. A database restore runs the same.
      await require('./services/dataUpgrade').upgradeData();

      // No accounts yet: the first registration needs a one-time setup code
      await require('./services/setupCodeService').ensureSetupCode();

      // Process any missed notifications during server downtime
      const missedCount = await processMissedNotifications();
      logger.info(`Processed ${missedCount} missed notifications on startup`);
      
      // Start the reminder processor for ongoing notifications
      const reminderInterval = startReminderProcessor();
      
      // Start the cleanup scheduler
      startCleanupScheduler();
      
      // Holiday events are generated when a user registers, when their
      // holiday settings change and on Refresh Holidays; the calendar job
      // (at startup and monthly) carries each one on to the next year
      
      // Initialize recurring event schedulers
      try {
        initializeSchedulers({ timezone: process.env.TZ || 'UTC' });
        logger.info('Recurring event schedulers initialized');
      } catch (error) {
        logger.error('Failed to initialize recurring event schedulers:', error);
        logger.warn('Server will continue without recurring event schedulers');
      }
      
      // Start the server after all initialization is complete
      const PORT = process.env.PORT || 5000; // image sets PORT=3000
      const server = app.listen(PORT, () => {
        logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
        logger.info(summaryLine());
      });
      
      // Graceful shutdown handling
      const gracefulShutdown = async (signal) => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        stopSchedulers();
        clearInterval(reminderInterval);
        server.closeIdleConnections?.();
        await Promise.race([
          new Promise((resolve) => server.close(resolve)),
          new Promise((resolve) => setTimeout(resolve, 5000))
        ]);
        logger.info('HTTP server closed');
        try {
          const { cleanupQueue } = require('./queues');
          // Let an in-flight cleanup job finish, but never hang shutdown past 30s
          await Promise.race([
            cleanupQueue.close(),
            new Promise((resolve) => setTimeout(resolve, 30000))
          ]);
          logger.info('Queues closed');
          await disconnectDB();
          const { redisClient, publisherClient, subscriberClient } = require('./config/redis');
          await Promise.allSettled([redisClient.quit(), publisherClient.quit(), subscriberClient.quit()]);
          logger.info('Graceful shutdown complete');
          process.exit(0);
        } catch (err) {
          logger.error('Error during graceful shutdown:', err);
          process.exit(1);
        }
      };
      
      // Listen for termination signals
      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));
      
      // Handle unhandled rejections
      process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled rejection:', reason);
        // Don't shut down for unhandled rejections, just log them
      });
    } catch (initError) {
      logger.error('Error during startup services:', initError);
      throw initError;
    }
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
};

// Start the server
if (process.env.WORKER_ROLE !== 'true') {
  startServer().catch(err => {
    logger.error('Server startup failed:', err);
    process.exit(1);
  });
} else {
  logger.info('Worker role detected, skipping server startup');
}
