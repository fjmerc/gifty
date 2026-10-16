const logger = require('../utils/logger');
const os = require('os');
const v8 = require('v8');

/**
 * Middleware for monitoring memory usage and handling potential leaks
 */
const memoryMonitorMiddleware = () => {
  // Percentages of V8's heap limit (heapTotal is no measure: it grows on
  // demand, so a small heap is nearly always "full")
  const WARNING_THRESHOLD = 75;
  const CRITICAL_THRESHOLD = 90;
  
  // Track memory stats
  let lastMemoryUsage = process.memoryUsage();
  let lastCheck = Date.now();
  let memoryGrowthRate = 0;
  let memoryGrowthCount = 0;
  
  // Check memory every 5 minutes
  const memoryCheckInterval = setInterval(() => {
    // Get current usage
    const memoryUsage = process.memoryUsage();
    const now = Date.now();
    const elapsedSecs = (now - lastCheck) / 1000;
    
    // Calculate heap usage percentage
    const heapUsedPercent = (memoryUsage.heapUsed / v8.getHeapStatistics().heap_size_limit) * 100;
    const rssGrowthMB = (memoryUsage.rss - lastMemoryUsage.rss) / (1024 * 1024);
    const heapGrowthMB = (memoryUsage.heapUsed - lastMemoryUsage.heapUsed) / (1024 * 1024);
    
    // Calculate growth rate per minute
    const growthRatePerMinute = heapGrowthMB * (60 / elapsedSecs);
    
    // Update memory growth tracking
    if (heapGrowthMB > 0) {
      memoryGrowthCount++;
      memoryGrowthRate = (memoryGrowthRate * (memoryGrowthCount - 1) + growthRatePerMinute) / memoryGrowthCount;
    }
    
    // Log memory stats at different levels based on usage
    // Warn at most: the process keeps serving, and an operator can act on it
    const logLevel = heapUsedPercent > WARNING_THRESHOLD ? 'warn' : 'debug';
    
    logger[logLevel]('Memory usage stats:', {
      rss: `${Math.round(memoryUsage.rss / (1024 * 1024))}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / (1024 * 1024))}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / (1024 * 1024))}MB`,
      external: `${Math.round(memoryUsage.external / (1024 * 1024))}MB`,
      heapUsedPercent: `${heapUsedPercent.toFixed(1)}%`,
      rssGrowthMB: rssGrowthMB.toFixed(2),
      heapGrowthMB: heapGrowthMB.toFixed(2),
      growthRatePerMinute: growthRatePerMinute.toFixed(2),
      avgGrowthRatePerMinute: memoryGrowthRate.toFixed(2),
      systemFreeMem: `${Math.round(os.freemem() / (1024 * 1024))}MB`,
      systemTotalMem: `${Math.round(os.totalmem() / (1024 * 1024))}MB`,
      systemMemUsedPercent: `${(100 - os.freemem() / os.totalmem() * 100).toFixed(1)}%`
    });
    
    // Check for potential memory leaks
    if (heapUsedPercent > CRITICAL_THRESHOLD) {
      logger.warn('Memory use is close to the heap limit', {
        heapUsedPercent: `${heapUsedPercent.toFixed(1)}%`,
        consistentGrowth: memoryGrowthCount > 3 && memoryGrowthRate > 5
      });
      
      if (process.env.NODE_ENV === 'production') {
        // In production, force garbage collection if available
        if (global.gc) {
          logger.warn('Forcing garbage collection');
          global.gc();
        } else {
          logger.warn('Cannot force garbage collection. Start with --expose-gc flag to enable this feature.');
        }
      }
    } else if (heapUsedPercent > WARNING_THRESHOLD) {
      logger.warn('WARNING: Memory usage is high', {
        heapUsedPercent: `${heapUsedPercent.toFixed(1)}%`,
        consistentGrowth: memoryGrowthCount > 3 && memoryGrowthRate > 5
      });
      
      // Suggest garbage collection
      if (global.gc && memoryGrowthCount > 3 && memoryGrowthRate > 10) {
        logger.info('Suggesting garbage collection');
        global.gc();
      }
    }
    
    // Update last usage and time
    lastMemoryUsage = memoryUsage;
    lastCheck = now;
  }, 5 * 60 * 1000); // Check every 5 minutes

  // Don't let the monitoring interval keep the process alive on its own
  memoryCheckInterval.unref();

  // Ensure interval is cleaned up if the app is shut down
  process.on('SIGTERM', () => {
    clearInterval(memoryCheckInterval);
  });
  
  process.on('SIGINT', () => {
    clearInterval(memoryCheckInterval);
  });
  
  // Return middleware function
  return (req, res, next) => {
    // For high memory routes, we can check per-request memory usage
    const isHighMemoryRoute = req.path.includes('/suggestions') || 
                             req.path.includes('/analytics');
    
    if (isHighMemoryRoute) {
      const before = process.memoryUsage();
      
      // Continue request processing
      res.on('finish', () => {
        const after = process.memoryUsage();
        const heapGrowthMB = (after.heapUsed - before.heapUsed) / (1024 * 1024);
        
        // Only log high-memory requests (> 10MB growth)
        if (heapGrowthMB > 10) {
          logger.warn('High memory usage for request', {
            path: req.path,
            method: req.method,
            heapGrowthMB: heapGrowthMB.toFixed(2),
            rssGrowthMB: ((after.rss - before.rss) / (1024 * 1024)).toFixed(2),
            userAgent: req.get('user-agent')
          });
        }
      });
    }
    
    next();
  };
};

module.exports = {
  memoryMonitorMiddleware
};
