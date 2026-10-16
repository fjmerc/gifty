// tests/middleware/cacheMiddleware.test.js
const mongoose = require('mongoose');
const { cacheMiddleware, clearCache, clearUserCacheOnWrite } = require('../../middleware/cacheMiddleware');
const { createMockReqRes, mockNext } = require('../utils/mockUtils');

// Mock Redis config
jest.mock('../../config/redis', () => ({
  redisClient: {
    get: jest.fn(),
    setex: jest.fn(),
    keys: jest.fn(),
    del: jest.fn()
  },
  keyPrefixes: {
    gifts: 'gifty:gifts:',
    recipients: 'gifty:recipients:',
    events: 'gifty:events:',
    suggestions: 'gifty:suggestions:',
    analytics: 'gifty:analytics:'
  },
  ttl: {
    short: 60,
    medium: 300,
    long: 3600
  }
}));

// Get the mocked redis client after import
const { redisClient } = require('../../config/redis');

// Mock logger
jest.mock('../../utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  error: jest.fn()
}));

const logger = require('../../utils/logger');

describe('Cache Middleware', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('cacheMiddleware', () => {
    it('should return cached data on cache hit and set X-Cache: HIT header', async () => {
      // Arrange
      const mockCachedData = {
        gifts: [
          { id: 1, name: 'iPhone', price: 999 },
          { id: 2, name: 'MacBook', price: 1999 }
        ],
        total: 2
      };

      const { req, res } = createMockReqRes({
        method: 'GET',
        path: '/api/gifts',
        query: { category: 'electronics', price: '100' },
        user: { _id: new mongoose.Types.ObjectId() }
      });

      // Add set method for headers
      res.set = jest.fn();

      // Mock Redis to return cached data
      redisClient.get.mockResolvedValue(JSON.stringify(mockCachedData));

      const middleware = cacheMiddleware();

      // Act
      await middleware(req, res, mockNext);

      // Assert
      expect(redisClient.get).toHaveBeenCalledWith(
        expect.stringContaining('gifty:gifts:')
      );
      expect(res.set).toHaveBeenCalledWith('X-Cache', 'HIT');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockCachedData);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Cache hit for key:')
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should set X-Cache: MISS header and override res.json on cache miss', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        method: 'GET',
        path: '/api/gifts',
        query: { category: 'electronics' },
        user: { _id: new mongoose.Types.ObjectId() }
      });

      // Add set method for headers and store original json
      res.set = jest.fn();
      const originalJson = res.json;

      // Mock Redis to return null (cache miss)
      redisClient.get.mockResolvedValue(null);
      redisClient.setex.mockResolvedValue('OK');

      const middleware = cacheMiddleware();

      // Act
      await middleware(req, res, mockNext);

      // Assert
      expect(redisClient.get).toHaveBeenCalled();
      expect(res.set).toHaveBeenCalledWith('X-Cache', 'MISS');
      expect(mockNext).toHaveBeenCalled();
      expect(res.json).not.toBe(originalJson); // Should be overridden
    });

    it('should skip caching for non-GET requests', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        method: 'POST',
        path: '/api/gifts',
        body: { name: 'New Gift' }
      });

      const middleware = cacheMiddleware();

      // Act
      await middleware(req, res, mockNext);

      // Assert
      expect(redisClient.get).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should cache successful response data on cache miss', async () => {
      // Arrange
      const responseData = {
        gifts: [{ id: 1, name: 'Test Gift' }],
        total: 1
      };

      const { req, res } = createMockReqRes({
        method: 'GET',
        path: '/api/gifts',
        user: { _id: new mongoose.Types.ObjectId() }
      });

      res.set = jest.fn();
      res.statusCode = 200; // Successful response

      // Mock Redis cache miss
      redisClient.get.mockResolvedValue(null);
      redisClient.setex.mockResolvedValue('OK');

      const middleware = cacheMiddleware();

      // Act
      await middleware(req, res, mockNext);

      // Simulate controller calling the overridden res.json
      res.json(responseData);

      // Assert
      expect(redisClient.setex).toHaveBeenCalledWith(
        expect.stringContaining('gifty:gifts:'),
        300, // default TTL
        JSON.stringify(responseData)
      );
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Cache miss, stored data with key:')
      );
    });

    it('should not cache error responses', async () => {
      // Arrange
      const errorData = {
        error: 'Something went wrong',
        message: 'Internal server error'
      };

      const { req, res } = createMockReqRes({
        method: 'GET',
        path: '/api/gifts',
        user: { _id: new mongoose.Types.ObjectId() }
      });

      res.set = jest.fn();
      res.statusCode = 200; // Even with 200 status, error in data should not be cached

      redisClient.get.mockResolvedValue(null);

      const middleware = cacheMiddleware();

      // Act
      await middleware(req, res, mockNext);
      res.json(errorData);

      // Assert
      expect(redisClient.setex).not.toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully and continue with next()', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        method: 'GET',
        path: '/api/gifts'
      });

      res.set = jest.fn();

      // Mock Redis to throw an error
      redisClient.get.mockRejectedValue(new Error('Redis connection failed'));

      const middleware = cacheMiddleware();

      // Act
      await middleware(req, res, mockNext);

      // Assert
      expect(logger.error).toHaveBeenCalledWith(
        'Cache middleware error: Redis connection failed'
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should not cache responses with status codes >= 300', async () => {
      // Arrange
      const errorResponse = { error: 'Not found', message: 'Gift not found' };

      const { req, res } = createMockReqRes({
        method: 'GET',
        path: '/api/gifts/999',
        user: { _id: new mongoose.Types.ObjectId() }
      });

      res.set = jest.fn();
      res.statusCode = 404; // Error status

      redisClient.get.mockResolvedValue(null);

      const middleware = cacheMiddleware();

      // Act
      await middleware(req, res, mockNext);
      res.json(errorResponse);

      // Assert
      expect(redisClient.setex).not.toHaveBeenCalled();
    });

    it('should handle Redis setex errors without breaking the response', async () => {
      // Arrange
      const responseData = { gifts: [{ id: 1, name: 'Test Gift' }] };

      const { req, res } = createMockReqRes({
        method: 'GET',
        path: '/api/gifts',
        user: { _id: new mongoose.Types.ObjectId() }
      });

      res.set = jest.fn();
      res.statusCode = 200;
      
      // Store original json method to verify it's called
      const originalJson = jest.fn();
      res.json = originalJson;

      redisClient.get.mockResolvedValue(null);
      redisClient.setex.mockRejectedValue(new Error('Redis write failed'));

      const middleware = cacheMiddleware();

      // Act
      await middleware(req, res, mockNext);
      
      // Wait for next tick to ensure async operations complete
      await new Promise(resolve => process.nextTick(resolve));
      
      // Now call the overridden res.json
      res.json(responseData);
      
      // Wait again for the async setex operation to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Assert
      expect(logger.error).toHaveBeenCalledWith(
        'Error setting cache: Redis write failed'
      );
      // Response should still work despite cache error
      expect(originalJson).toHaveBeenCalledWith(responseData);
    });

    it('should use custom options when provided', async () => {
      // Arrange
      const customOptions = {
        prefix: 'custom:test:',
        expire: 600,
        getKey: (req) => `${req.path}:custom`
      };

      const { req, res } = createMockReqRes({
        method: 'GET',
        path: '/api/test'
      });

      res.set = jest.fn();
      res.statusCode = 200;

      redisClient.get.mockResolvedValue(null);
      redisClient.setex.mockResolvedValue('OK');

      const middleware = cacheMiddleware(customOptions);

      // Act
      await middleware(req, res, mockNext);
      res.json({ test: 'data' });

      // Assert
      expect(redisClient.get).toHaveBeenCalledWith('/api/test:custom');
      expect(redisClient.setex).toHaveBeenCalledWith(
        '/api/test:custom',
        600, // custom TTL
        JSON.stringify({ test: 'data' })
      );
    });

    it('should generate default cache key with user ID and query params', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        method: 'GET',
        path: '/api/gifts',
        query: { category: 'electronics', sort: 'price' },
        user: { _id: userId }
      });

      res.set = jest.fn();

      redisClient.get.mockResolvedValue(null);

      const middleware = cacheMiddleware();

      // Act
      await middleware(req, res, mockNext);

      // Assert
      const expectedKey = `gifty:gifts:${userId.toString()}:/api/gifts:category=electronics&sort=price`;
      expect(redisClient.get).toHaveBeenCalledWith(expectedKey);
    });

    it('should generate cache key for anonymous users', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        method: 'GET',
        path: '/api/gifts',
        query: { category: 'books' }
        // No user property
      });

      res.set = jest.fn();

      redisClient.get.mockResolvedValue(null);

      const middleware = cacheMiddleware();

      // Act
      await middleware(req, res, mockNext);

      // Assert
      const expectedKey = 'gifty:gifts:anon:/api/gifts:category=books';
      expect(redisClient.get).toHaveBeenCalledWith(expectedKey);
    });
  });

  describe('clearCache', () => {
    it('should clear cache keys and return count of deleted keys', async () => {
      // Arrange
      const pattern = 'gifty:gifts:';
      const mockKeys = ['gifty:gifts:user1:path1', 'gifty:gifts:user2:path2'];

      redisClient.keys.mockResolvedValue(mockKeys);
      redisClient.del.mockResolvedValue(2);

      // Act
      const result = await clearCache(pattern);

      // Assert
      expect(redisClient.keys).toHaveBeenCalledWith('gifty:gifts:*');
      expect(redisClient.del).toHaveBeenCalledWith(mockKeys);
      expect(result).toBe(2);
      expect(logger.info).toHaveBeenCalledWith(
        'Cleared 2 keys matching pattern: gifty:gifts:*'
      );
    });

    it('should return 0 when no keys match the pattern', async () => {
      // Arrange
      const pattern = 'nonexistent:pattern:';

      redisClient.keys.mockResolvedValue([]);

      // Act
      const result = await clearCache(pattern);

      // Assert
      expect(redisClient.keys).toHaveBeenCalledWith('nonexistent:pattern:*');
      expect(redisClient.del).not.toHaveBeenCalled();
      expect(result).toBe(0);
    });

    it('should handle Redis errors and rethrow them', async () => {
      // Arrange
      const pattern = 'error:pattern:';
      const redisError = new Error('Redis keys operation failed');

      redisClient.keys.mockRejectedValue(redisError);

      // Act & Assert
      await expect(clearCache(pattern)).rejects.toThrow('Redis keys operation failed');
      expect(logger.error).toHaveBeenCalledWith(
        'Error clearing cache: Redis keys operation failed'
      );
    });
  });

  // Behaviour against real Redis and routes: tests/integration/response-cache.test.js
  describe('clearUserCacheOnWrite', () => {
    const run = (method, statusCode, user = { _id: 'u1' }) => {
      const req = { method, user };
      const end = jest.fn();
      const res = { statusCode, end };
      const next = jest.fn();
      clearUserCacheOnWrite(req, res, next);
      return { req, res, end, next };
    };
    const flush = () => new Promise((resolve) => setImmediate(resolve));

    it("clears only that user's response caches before the response ends", async () => {
      redisClient.keys.mockResolvedValue([]);
      const { res, end, next } = run('PATCH', 200);
      expect(next).toHaveBeenCalled();

      res.end('body');
      expect(end).not.toHaveBeenCalled();
      await flush();

      expect(redisClient.keys.mock.calls.map(([p]) => p).sort()).toEqual([
        'gifty:analytics:u1:*', 'gifty:gifts:u1:*', 'gifty:suggestions:u1:*'
      ]);
      expect(end).toHaveBeenCalledWith('body');
    });

    it('does nothing for reads, failed writes or anonymous requests', async () => {
      for (const [method, status, user] of [['GET', 200, { _id: 'u1' }], ['POST', 404, { _id: 'u1' }], ['POST', 201, null]]) {
        const { res, end } = run(method, status, user);
        res.end();
        expect(end).toHaveBeenCalled();
      }
      expect(redisClient.keys).not.toHaveBeenCalled();
    });

    it('ends the response once even if something ends it again while the cache clears', async () => {
      redisClient.keys.mockResolvedValue([]);
      const { res, end } = run('POST', 201);
      res.end('first');
      res.end('second');
      await flush();
      expect(end).toHaveBeenCalledTimes(1);
      expect(end).toHaveBeenCalledWith('first');
    });

    it('still sends the response when Redis fails', async () => {
      redisClient.keys.mockRejectedValue(new Error('down'));
      const { res, end } = run('DELETE', 204);
      res.end();
      await flush();
      await flush();
      expect(end).toHaveBeenCalled();
    });
  });
});
