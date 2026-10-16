const Redis = require('ioredis');
const logger = require('../../utils/logger');

// Create Redis client with explicit authentication
const createRedisClient = () => {
  // Get Redis config from environment or use defaults
  const host = process.env.REDIS_HOST || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6379');
  const password = process.env.REDIS_PASSWORD || undefined;
  const db = parseInt(process.env.REDIS_DB || '0');

  // Create Redis client
  const client = new Redis({
    host,
    port,
    password,
    db,
    connectionName: 'gifty-backend',
    showFriendlyErrorStack: true, // For better error messages
    enableOfflineQueue: true,
    // Defer the TCP connection until the first command so merely requiring
    // this module (e.g. in tests) doesn't open three live connections
    lazyConnect: true,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  });

  // Handle events
  client.on('connect', () => logger.info('Redis client connected'));
  client.on('ready', () => logger.info('Redis client ready'));
  client.on('error', (err) => logger.error('Redis client error:', err));
  client.on('close', () => logger.warn('Redis client connection closed'));
  client.on('reconnecting', () => logger.info('Redis client reconnecting'));
  client.on('end', () => logger.warn('Redis client connection ended'));

  return client;
};

// Create Redis clients
const mainClient = createRedisClient();
const publisherClient = createRedisClient();
const subscriberClient = createRedisClient();

// Export Redis clients
module.exports = {
  redisClient: mainClient,
  publisherClient,
  subscriberClient,
  
  // Cache keys prefixes
  keyPrefixes: {
    gifts: 'gifty:gifts:',
    recipients: 'gifty:recipients:',
    events: 'gifty:events:',
    user: 'gifty:user:',
    suggestions: 'gifty:suggestions:',
    analytics: 'gifty:analytics:',
    session: 'gifty:session:'
  },
  
  // Cache TTL values (in seconds)
  ttl: {
    short: 60, // 1 minute
    medium: 300, // 5 minutes
    long: 3600, // 1 hour
    veryLong: 86400, // 1 day
    session: 1800 // 30 minutes
  }
};
