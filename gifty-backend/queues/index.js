const Queue = require('bull');
const logger = require('../utils/logger');

// Redis connection configuration for Bull
const redisConfig = {
  redis: {
    port: parseInt(process.env.REDIS_PORT || '6379'),
    host: process.env.REDIS_HOST || 'localhost',
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    // Advanced Redis configuration
    showFriendlyErrorStack: true,
    enableOfflineQueue: true
  }
};

// Create Bull queue with configuration
const createQueue = (name, options = {}) => {
  const defaultOptions = {
    ...redisConfig,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      },
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 200 // Keep last 200 failed jobs
    }
  };
  
  const queueOptions = { ...defaultOptions, ...options };
  const queue = new Queue(name, queueOptions);
  
  // Set up event handlers
  queue
    .on('error', error => {
      logger.error(`Queue ${name} error:`, error);
    })
    .on('failed', (job, error) => {
      logger.error(`Job ${job.id} in ${name} queue failed:`, error);
    })
    .on('completed', job => {
      logger.info(`Job ${job.id} in ${name} queue completed`, {
        jobName: job.name,
        result: typeof job.returnvalue === 'object' ? 
          'object-result' : 
          (job.returnvalue || 'no-result')
      });
    })
    .on('stalled', job => {
      logger.warn(`Job ${job.id} in ${name} queue stalled`);
    });
  
  return queue;
};

// Create the queues (cleanup is the only background job queue)
const cleanupQueue = createQueue('cleanup_jobs', {
  limiter: { max: 2, duration: 1000 } // Rate limit to 2 jobs per second
});

// Log initialization
logger.info('Bull queues initialized', {
  queueNames: ['cleanupQueue']
});

// Export queues
module.exports = {
  cleanupQueue
};
