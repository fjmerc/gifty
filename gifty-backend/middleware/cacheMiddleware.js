const { redisClient, keyPrefixes, ttl } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Middleware for caching responses
 * @param {Object} options - Cache options
 * @param {String} options.prefix - Cache key prefix
 * @param {Number} options.expire - Cache expiration time in seconds
 * @param {Function} options.getKey - Function to generate cache key from request
 * @returns {Function} Express middleware
 */
const cacheMiddleware = (options = {}) => {
  const prefix = options.prefix || keyPrefixes.gifts;
  const expire = options.expire || ttl.medium;
  const getKey = options.getKey || ((req) => {
    // Default key generation based on URL and query params
    const userId = req.user?._id?.toString() || 'anon';
    const queryString = Object.keys(req.query)
      .sort()
      .map(key => `${key}=${req.query[key]}`)
      .join('&');
    return `${prefix}${userId}:${req.path}${queryString ? `:${queryString}` : ''}`;
  });

  return async (req, res, next) => {
    // Skip cache for non-GET methods
    if (req.method !== 'GET') {
      return next();
    }

    try {
      // Generate cache key
      const cacheKey = getKey(req);
      
      // Check if request is already in cache
      const cachedData = await redisClient.get(cacheKey);
      
      if (cachedData) {
        // Parse cached data
        const parsedData = JSON.parse(cachedData);
        logger.debug(`Cache hit for key: ${cacheKey}`);
        
        // Set header to indicate cache hit
        res.set('X-Cache', 'HIT');
        
        // Send cached response
        return res.status(200).json(parsedData);
      }
      
      // Set header to indicate cache miss
      res.set('X-Cache', 'MISS');
      
      // Store original json method
      const originalJson = res.json;
      
      // Override json method to cache response
      res.json = function(data) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Don't cache error responses
          if (!data.error) {
            // Store in cache with expiration
            redisClient.setex(cacheKey, expire, JSON.stringify(data))
              .catch(err => logger.error(`Error setting cache: ${err.message}`));
              
            logger.debug(`Cache miss, stored data with key: ${cacheKey}, TTL: ${expire}s`);
          }
        }
        
        // Call original json method
        return originalJson.call(this, data);
      };
      
      next();
    } catch (error) {
      logger.error(`Cache middleware error: ${error.message}`);
      next();
    }
  };
};

/**
 * Clear cache for a specific prefix pattern
 * @param {String} pattern - Cache key pattern to clear
 * @returns {Promise<Number>} Number of keys removed
 */
const clearCache = async (pattern) => {
  try {
    // Get all keys matching pattern
    const keys = await redisClient.keys(`${pattern}*`);
    
    if (keys.length > 0) {
      // Delete matching keys
      const result = await redisClient.del(keys);
      logger.info(`Cleared ${result} keys matching pattern: ${pattern}*`);
      return result;
    }
    
    return 0;
  } catch (error) {
    logger.error(`Error clearing cache: ${error.message}`);
    throw error;
  }
};

// Cached GET responses are keyed '<prefix><userId>:<path>...' (see
// cacheMiddleware). Only these per-user keys are response caches; other keys
// under the same prefixes (suggestion job results, input caches) are not.
const RESPONSE_CACHE_PREFIXES = [keyPrefixes.gifts, keyPrefixes.suggestions, keyPrefixes.analytics];
const CLEAR_TIMEOUT_MS = 1000;

/**
 * Drop every cached GET response of one user
 * @param {String|ObjectId} userId
 * @returns {Promise<void>}
 */
const clearUserResponseCache = async (userId) => {
  if (!userId) return;
  await Promise.all(RESPONSE_CACHE_PREFIXES.map((prefix) => clearCache(`${prefix}${userId}:`)));
};

/**
 * Drop every user's cached GET responses (after a full database restore)
 * @returns {Promise<number>} Users whose caches were cleared
 */
const clearAllResponseCaches = async () => {
  const User = require('../models/User');
  const users = await User.find().select('_id').lean();
  for (const { _id } of users) await clearUserResponseCache(_id);
  return users.length;
};

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * After any successful write, clear the writer's cached responses before
 * the response goes out, so the client's next read sees the change. Gift
 * lists embed recipient and event names, so every write counts, not just
 * gift routes. Mount once, ahead of the API routes.
 */
const clearUserCacheOnWrite = (req, res, next) => {
  if (READ_METHODS.has(req.method)) return next();

  const originalEnd = res.end;
  res.end = function (...args) {
    res.end = originalEnd;
    const userId = req.user?._id;
    if (!userId || res.statusCode < 200 || res.statusCode >= 300) {
      return originalEnd.apply(this, args);
    }
    // The response is already ending: a second end (e.g. a timeout firing
    // while the cache clears) must not write after it
    res.end = function () { return this; };
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(resolve, CLEAR_TIMEOUT_MS); });
    Promise.race([clearUserResponseCache(userId), timeout])
      .catch((err) => logger.error(`Error clearing response cache: ${err.message}`))
      .finally(() => {
        clearTimeout(timer);
        res.end = originalEnd;
        originalEnd.apply(this, args);
      });
    return this;
  };
  next();
};

module.exports = {
  cacheMiddleware,
  clearCache,
  clearUserResponseCache,
  clearAllResponseCaches,
  clearUserCacheOnWrite,
  keyPrefixes,
  ttl
};
