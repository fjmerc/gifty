const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { redisClient } = require('../config/redis');
const logger = require('../utils/logger');
const os = require('os');
const { cleanupQueue } = require('../queues');

const { getVersion } = require('../config/runtime');
const { protect } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/roleMiddleware');

/**
 * @route   GET /api/health
 * @desc    Compact health for the Docker HEALTHCHECK and bug reports
 * @access  Public
 */
router.get('/', async (req, res) => {
  const mongo = mongoose.connection.readyState === 1 ? 'up' : 'down';
  let redis = 'down';
  try {
    redis = (await redisClient.ping()) === 'PONG' ? 'up' : 'down';
  } catch (err) {
    redis = 'down';
  }
  const ok = mongo === 'up' && redis === 'up';
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', version: getVersion(), mongo, redis });
});

/**
 * @route   GET /api/health/liveness
 * @desc    Basic liveness probe for load balancers
 * @access  Public
 */
router.get('/liveness', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   GET /api/health/readiness
 * @desc    Readiness probe to check if the application is ready to serve traffic
 * @access  Public
 */
router.get('/readiness', async (req, res) => {
  try {
    // Check MongoDB connection
    const dbStatus = mongoose.connection.readyState === 1 ? 'UP' : 'DOWN';
    
    // Check Redis connection
    let redisStatus = 'DOWN';
    try {
      const redisResult = await redisClient.ping();
      redisStatus = redisResult === 'PONG' ? 'UP' : 'DOWN';
    } catch (redisError) {
      logger.error('Redis health check failed:', redisError);
    }
    
    // Overall status
    const isReady = dbStatus === 'UP' && redisStatus === 'UP';
    
    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'UP' : 'DOWN',
      timestamp: new Date().toISOString(),
      components: {
        database: {
          status: dbStatus
        },
        redis: {
          status: redisStatus
        }
      }
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'DOWN',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * @route   GET /api/health/detailed
 * @desc    Detailed health check for system monitoring: server internals,
 *          so for the instance owner only
 * @access  Private (instance owner)
 */
router.get('/detailed', protect, requireAdmin, async (req, res) => {
  try {
    // Check MongoDB connection
    const dbStatus = mongoose.connection.readyState === 1 ? 'UP' : 'DOWN';
    
    // Check Redis connection
    let redisStatus = 'DOWN';
    let redisInfo = null;
    try {
      const redisResult = await redisClient.ping();
      redisStatus = redisResult === 'PONG' ? 'UP' : 'DOWN';
      
      // Get Redis info
      if (redisStatus === 'UP') {
        const info = await redisClient.info();
        redisInfo = parseRedisInfo(info);
      }
    } catch (redisError) {
      logger.error('Redis health check failed:', redisError);
    }
    
    // Check queue status
    let queueStatus = 'UNKNOWN';
    let queueStats = null;
    try {
      const activeCount = await cleanupQueue.getActiveCount();
      const waitingCount = await cleanupQueue.getWaitingCount();
      const completedCount = await cleanupQueue.getCompletedCount();
      const failedCount = await cleanupQueue.getFailedCount();
      const delayedCount = await cleanupQueue.getDelayedCount();
      
      queueStatus = 'UP';
      queueStats = {
        active: activeCount,
        waiting: waitingCount,
        completed: completedCount,
        failed: failedCount,
        delayed: delayedCount
      };
    } catch (queueError) {
      logger.error('Queue health check failed:', queueError);
      queueStatus = 'DOWN';
    }
    
    // System info
    const systemInfo = {
      uptime: os.uptime(),
      loadAvg: os.loadavg(),
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        percentUsed: 100 * (1 - os.freemem() / os.totalmem())
      },
      cpu: os.cpus().length,
      nodeEnv: process.env.NODE_ENV,
      processId: process.pid,
      instanceId: process.env.INSTANCE_ID || 'unknown'
    };
    
    // Node.js memory usage
    const memoryUsage = process.memoryUsage();
    const heapSizeLimit = require('v8').getHeapStatistics().heap_size_limit;
    
    // Overall status
    const isHealthy = dbStatus === 'UP' && redisStatus === 'UP' && queueStatus === 'UP';
    
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'UP' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      components: {
        database: {
          status: dbStatus,
          connected: mongoose.connection.readyState === 1,
          name: mongoose.connection.name
        },
        redis: {
          status: redisStatus,
          info: redisInfo
        },
        queues: {
          status: queueStatus,
          stats: queueStats
        }
      },
      system: systemInfo,
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        // Against V8's limit: the current heap (heapTotal) grows on demand,
        // so used/total reads high on a small idle server
        heapSizeLimit,
        percentHeapUsed: 100 * (memoryUsage.heapUsed / heapSizeLimit)
      }
    });
  } catch (error) {
    logger.error('Detailed health check failed:', error);
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * Helper function to parse Redis INFO command output
 * @param {String} info - Raw Redis INFO output
 * @returns {Object} Parsed Redis info
 */
function parseRedisInfo(info) {
  const result = {};
  // Handle different line endings properly (\r\n, \n)
  const lines = info.split(/\r?\n/);
  
  let currentSection = 'unknown';
  
  for (const rawLine of lines) {
    const line = rawLine.trim(); // Trim to remove carriage returns and whitespace
    
    // Skip empty lines
    if (!line) continue;
    
    // Check for section header
    if (line.startsWith('# ')) {
      currentSection = line.substring(2).toLowerCase().trim();
      result[currentSection] = {};
      continue;
    }
    
    // Parse key-value pairs
    const parts = line.split(':');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      // Handle values that might contain colons by joining remaining parts
      let value = parts.slice(1).join(':').trim();
      
      // Try to convert to number if possible
      if (!isNaN(value) && value !== '') {
        value = Number(value);
      }
      
      if (currentSection && key) {
        result[currentSection][key] = value;
      }
    }
  }
  
  // Extract the most important metrics
  return {
    uptime_seconds: result.server?.uptime_in_seconds || 0,
    connected_clients: result.clients?.connected_clients || 0,
    used_memory_human: result.memory?.used_memory_human || '0B',
    used_memory_peak_human: result.memory?.used_memory_peak_human || '0B',
    total_connections_received: result.stats?.total_connections_received || 0,
    total_commands_processed: result.stats?.total_commands_processed || 0
  };
}

module.exports = router;
