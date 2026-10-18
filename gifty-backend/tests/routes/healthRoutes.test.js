// tests/routes/healthRoutes.test.js
const request = require('supertest');
const express = require('express');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Mock all dependencies BEFORE any imports
// Who may read /detailed is tested with real auth in tests/security/health.security.test.js
jest.mock('../../middleware/authMiddleware', () => ({ protect: (req, res, next) => next() }));
jest.mock('../../middleware/roleMiddleware', () => ({ requireAdmin: (req, res, next) => next(), requireOwner: (req, res, next) => next() }));
jest.mock('mongoose', () => ({
  connection: {
    readyState: 1,
    name: 'test-db',
    dropDatabase: jest.fn(),
    close: jest.fn() // Add the close function to the mock
  },
  disconnect: jest.fn(),
  connect: jest.fn()
}));

jest.mock('../../config/redis', () => ({
  redisClient: {
    ping: jest.fn(),
    info: jest.fn()
  }
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../queues', () => ({
  cleanupQueue: {
    getActiveCount: jest.fn(),
    getWaitingCount: jest.fn(),
    getCompletedCount: jest.fn(),
    getFailedCount: jest.fn(),
    getDelayedCount: jest.fn()
  }
}));

jest.mock('os', () => ({
  uptime: jest.fn(() => 3600),
  loadavg: jest.fn(() => [0.5, 0.3, 0.2]),
  totalmem: jest.fn(() => 8589934592), // 8GB
  freemem: jest.fn(() => 4294967296),  // 4GB
  cpus: jest.fn(() => [1, 2, 3, 4]), // 4 CPUs
  platform: jest.fn(() => 'linux'),
  arch: jest.fn(() => 'x64'),
  release: jest.fn(() => '5.4.0'),
  hostname: jest.fn(() => 'test-host'),
  type: jest.fn(() => 'Linux'),
  endianness: jest.fn(() => 'LE'),
  tmpdir: jest.fn(() => '/tmp')
}));

// Import healthRoutes AFTER all mocks are set up
const healthRoutes = require('../../routes/healthRoutes');

// Set higher timeout for route tests
jest.setTimeout(30000);

describe('Health Routes', () => {
  let app;
  const originalEnv = process.env;
  
  // Mock service imports
  const mongoose = require('mongoose');
  const { redisClient } = require('../../config/redis');
  const logger = require('../../utils/logger');
  const { cleanupQueue } = require('../../queues');
  const os = require('os');

  beforeAll(async () => {
    await setupTestDB();
    
    // Setup test environment
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      INSTANCE_ID: 'test-instance-123'
    };
    
    // Set up Express app for testing - NO AUTHENTICATION for health routes
    app = express();
    app.use(express.json());
    
    // Add health routes to the app
    app.use('/api/health', healthRoutes);
    
    // Set up error handler - must be after routes
    app.use((err, req, res, next) => {
      const statusCode = err.statusCode || 500;
      res.status(statusCode);
      res.json({ message: err.message });
    });
  });

  describe('parseRedisInfo Helper Function', () => {
    // Since parseRedisInfo is not exported, we'll test it indirectly through the detailed endpoint
    // But we can also test it directly by requiring the module and accessing it
    
    it('should parse Redis INFO output correctly', async () => {
      redisClient.ping.mockResolvedValue('PONG');
      redisClient.info.mockResolvedValue(
        '# Server\r\n' +
        'redis_version:7.0.0\r\n' +
        'uptime_in_seconds:86400\r\n' +
        '# Clients\r\n' +
        'connected_clients:12\r\n' +
        'client_recent_max_input_buffer:8\r\n' +
        '# Memory\r\n' +
        'used_memory:2048000\r\n' +
        'used_memory_human:2M\r\n' +
        'used_memory_peak_human:4M\r\n' +
        '# Stats\r\n' +
        'total_connections_received:500\r\n' +
        'total_commands_processed:5000\r\n'
      );
      
      cleanupQueue.getActiveCount.mockResolvedValue(1);
      cleanupQueue.getWaitingCount.mockResolvedValue(1);
      cleanupQueue.getCompletedCount.mockResolvedValue(1);
      cleanupQueue.getFailedCount.mockResolvedValue(1);
      cleanupQueue.getDelayedCount.mockResolvedValue(1);

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      expect(response.body.components.redis.info).toEqual({
        uptime_seconds: 86400,
        connected_clients: 12,
        used_memory_human: '2M',
        used_memory_peak_human: '4M',
        total_connections_received: 500,
        total_commands_processed: 5000
      });
    });

    it('should handle Redis INFO with missing sections gracefully', async () => {
      redisClient.ping.mockResolvedValue('PONG');
      redisClient.info.mockResolvedValue(
        '# Server\r\n' +
        'redis_version:6.2.0\r\n' +
        '# Memory\r\n' +
        'used_memory_human:1M\r\n'
      );
      
      cleanupQueue.getActiveCount.mockResolvedValue(0);
      cleanupQueue.getWaitingCount.mockResolvedValue(0);
      cleanupQueue.getCompletedCount.mockResolvedValue(0);
      cleanupQueue.getFailedCount.mockResolvedValue(0);
      cleanupQueue.getDelayedCount.mockResolvedValue(0);

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      // Should provide defaults for missing values
      expect(response.body.components.redis.info).toEqual({
        uptime_seconds: 0,
        connected_clients: 0,
        used_memory_human: '1M',
        used_memory_peak_human: '0B',
        total_connections_received: 0,
        total_commands_processed: 0
      });
    });

    it('should handle empty Redis INFO output', async () => {
      redisClient.ping.mockResolvedValue('PONG');
      redisClient.info.mockResolvedValue('');
      
      cleanupQueue.getActiveCount.mockResolvedValue(0);
      cleanupQueue.getWaitingCount.mockResolvedValue(0);
      cleanupQueue.getCompletedCount.mockResolvedValue(0);
      cleanupQueue.getFailedCount.mockResolvedValue(0);
      cleanupQueue.getDelayedCount.mockResolvedValue(0);

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      // Should provide all defaults for empty info
      expect(response.body.components.redis.info).toEqual({
        uptime_seconds: 0,
        connected_clients: 0,
        used_memory_human: '0B',
        used_memory_peak_human: '0B',
        total_connections_received: 0,
        total_commands_processed: 0
      });
    });

    it('should handle malformed Redis INFO lines', async () => {
      redisClient.ping.mockResolvedValue('PONG');
      redisClient.info.mockResolvedValue(
        '# Server\r\n' +
        'redis_version:6.2.0\r\n' +
        'malformed_line_without_colon\r\n' +
        'another:valid:line:with:multiple:colons\r\n' +
        '# Stats\r\n' +
        'total_commands_processed:1000\r\n'
      );
      
      cleanupQueue.getActiveCount.mockResolvedValue(0);
      cleanupQueue.getWaitingCount.mockResolvedValue(0);
      cleanupQueue.getCompletedCount.mockResolvedValue(0);
      cleanupQueue.getFailedCount.mockResolvedValue(0);
      cleanupQueue.getDelayedCount.mockResolvedValue(0);

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      // Should parse valid lines and ignore malformed ones
      expect(response.body.components.redis.info).toEqual({
        uptime_seconds: 0,
        connected_clients: 0,
        used_memory_human: '0B',
        used_memory_peak_human: '0B',
        total_connections_received: 0,
        total_commands_processed: 1000
      });
    });

    it('should convert numeric strings to numbers', async () => {
      redisClient.ping.mockResolvedValue('PONG');
      redisClient.info.mockResolvedValue(
        '# Stats\r\n' +
        'total_connections_received:999\r\n' +
        'total_commands_processed:12345\r\n' +
        'string_value:not_a_number\r\n' +
        'empty_value:\r\n'
      );
      
      cleanupQueue.getActiveCount.mockResolvedValue(0);
      cleanupQueue.getWaitingCount.mockResolvedValue(0);
      cleanupQueue.getCompletedCount.mockResolvedValue(0);
      cleanupQueue.getFailedCount.mockResolvedValue(0);
      cleanupQueue.getDelayedCount.mockResolvedValue(0);

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      expect(response.body.components.redis.info).toEqual({
        uptime_seconds: 0,
        connected_clients: 0,
        used_memory_human: '0B',
        used_memory_peak_human: '0B',
        total_connections_received: 999,  // Should be converted to number
        total_commands_processed: 12345   // Should be converted to number
      });
    });
  });

  describe('GET /api/health/detailed - Detailed Health Check', () => {
    beforeEach(() => {
      // Reset all mocks before each test
      redisClient.ping.mockClear();
      redisClient.info.mockClear();
      logger.error.mockClear();
      
      // Reset queue mocks
      cleanupQueue.getActiveCount.mockClear();
      cleanupQueue.getWaitingCount.mockClear();
      cleanupQueue.getCompletedCount.mockClear();
      cleanupQueue.getFailedCount.mockClear();
      cleanupQueue.getDelayedCount.mockClear();
    });

    it('should return comprehensive health data when all services are UP', async () => {
      // Mock all services as healthy
      redisClient.ping.mockResolvedValue('PONG');
      redisClient.info.mockResolvedValue('# Server\r\nuptime_in_seconds:3600\r\n# Clients\r\nconnected_clients:5\r\n# Memory\r\nused_memory_human:1M\r\nused_memory_peak_human:2M\r\n# Stats\r\ntotal_connections_received:100\r\ntotal_commands_processed:1000\r\n');
      
      cleanupQueue.getActiveCount.mockResolvedValue(2);
      cleanupQueue.getWaitingCount.mockResolvedValue(5);
      cleanupQueue.getCompletedCount.mockResolvedValue(98);
      cleanupQueue.getFailedCount.mockResolvedValue(1);
      cleanupQueue.getDelayedCount.mockResolvedValue(0);

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'UP',
        timestamp: expect.any(String),
        components: {
          database: {
            status: 'UP',
            connected: true,
            name: 'test-db'
          },
          redis: {
            status: 'UP',
            info: {
              uptime_seconds: 3600,
              connected_clients: 5,
              used_memory_human: '1M',
              used_memory_peak_human: '2M',
              total_connections_received: 100,
              total_commands_processed: 1000
            }
          },
          queues: {
            status: 'UP',
            stats: {
              active: 2,
              waiting: 5,
              completed: 98,
              failed: 1,
              delayed: 0
            }
          }
        },
        system: {
          uptime: 3600,
          loadAvg: [0.5, 0.3, 0.2],
          memory: {
            total: 8589934592,
            free: 4294967296,
            percentUsed: 50
          },
          cpu: 4,
          nodeEnv: 'test',
          processId: expect.any(Number),
          instanceId: 'test-instance-123'
        },
        memory: {
          rss: expect.any(Number),
          heapTotal: expect.any(Number),
          heapUsed: expect.any(Number),
          external: expect.any(Number),
          heapSizeLimit: expect.any(Number),
          percentHeapUsed: expect.any(Number)
        }
      });

      // Verify all service calls were made
      expect(redisClient.ping).toHaveBeenCalledTimes(1);
      expect(redisClient.info).toHaveBeenCalledTimes(1);
      expect(cleanupQueue.getActiveCount).toHaveBeenCalledTimes(1);
      expect(cleanupQueue.getWaitingCount).toHaveBeenCalledTimes(1);
      expect(cleanupQueue.getCompletedCount).toHaveBeenCalledTimes(1);
      expect(cleanupQueue.getFailedCount).toHaveBeenCalledTimes(1);
      expect(cleanupQueue.getDelayedCount).toHaveBeenCalledTimes(1);
    });

    it('should return DEGRADED status when some services are DOWN', async () => {
      // Mock MongoDB as DOWN, others as UP
      mongoose.connection.readyState = 0;
      redisClient.ping.mockResolvedValue('PONG');
      redisClient.info.mockResolvedValue('# Server\r\nuptime_in_seconds:3600\r\n');
      
      cleanupQueue.getActiveCount.mockResolvedValue(0);
      cleanupQueue.getWaitingCount.mockResolvedValue(0);
      cleanupQueue.getCompletedCount.mockResolvedValue(50);
      cleanupQueue.getFailedCount.mockResolvedValue(0);
      cleanupQueue.getDelayedCount.mockResolvedValue(0);

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(503);

      expect(response.body).toMatchObject({
        status: 'DEGRADED',
        components: {
          database: {
            status: 'DOWN',
            connected: false
          },
          redis: {
            status: 'UP'
          },
          queues: {
            status: 'UP'
          }
        }
      });

      // Reset for other tests
      mongoose.connection.readyState = 1;
    });

    it('should handle Redis failures gracefully', async () => {
      // Mock Redis as failing
      redisClient.ping.mockRejectedValue(new Error('Redis connection failed'));
      
      cleanupQueue.getActiveCount.mockResolvedValue(1);
      cleanupQueue.getWaitingCount.mockResolvedValue(2);
      cleanupQueue.getCompletedCount.mockResolvedValue(10);
      cleanupQueue.getFailedCount.mockResolvedValue(0);
      cleanupQueue.getDelayedCount.mockResolvedValue(0);

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(503);

      expect(response.body).toMatchObject({
        status: 'DEGRADED',
        components: {
          database: {
            status: 'UP'
          },
          redis: {
            status: 'DOWN',
            info: null
          },
          queues: {
            status: 'UP'
          }
        }
      });

      expect(logger.error).toHaveBeenCalledWith('Redis health check failed:', expect.any(Error));
      expect(redisClient.info).not.toHaveBeenCalled();
    });

    it('should handle queue failures gracefully', async () => {
      // Mock Redis as UP, queue as failing
      redisClient.ping.mockResolvedValue('PONG');
      redisClient.info.mockResolvedValue('# Server\r\nuptime_in_seconds:1800\r\n');
      
      cleanupQueue.getActiveCount.mockRejectedValue(new Error('Queue connection failed'));

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(503);

      expect(response.body).toMatchObject({
        status: 'DEGRADED',
        components: {
          database: {
            status: 'UP'
          },
          redis: {
            status: 'UP'
          },
          queues: {
            status: 'DOWN',
            stats: null
          }
        }
      });

      expect(logger.error).toHaveBeenCalledWith('Queue health check failed:', expect.any(Error));
    });

    it('should handle unexpected errors in detailed check', async () => {
      // Mock an error that breaks the entire detailed check
      const originalConnection = mongoose.connection;
      mongoose.connection = {
        get readyState() {
          throw new Error('Database connection error');
        }
      };

      const response = await request(app)
        .get('/api/health/detailed')
        .expect(503);

      expect(response.body).toMatchObject({
        status: 'ERROR',
        timestamp: expect.any(String),
        error: expect.any(String)
      });

      expect(logger.error).toHaveBeenCalledWith('Detailed health check failed:', expect.any(Error));

      // Restore for other tests
      mongoose.connection = originalConnection;
    });

    it('should not call Redis info when Redis ping fails', async () => {
      redisClient.ping.mockRejectedValue(new Error('Redis ping failed'));
      
      cleanupQueue.getActiveCount.mockResolvedValue(0);
      cleanupQueue.getWaitingCount.mockResolvedValue(0);
      cleanupQueue.getCompletedCount.mockResolvedValue(0);
      cleanupQueue.getFailedCount.mockResolvedValue(0);
      cleanupQueue.getDelayedCount.mockResolvedValue(0);

      await request(app)
        .get('/api/health/detailed')
        .expect(503);

      expect(redisClient.ping).toHaveBeenCalledTimes(1);
      expect(redisClient.info).not.toHaveBeenCalled();
    });
  });

  // The heap grows on demand: measure against V8's limit, not the current heap
  describe('heap use on /api/health/detailed', () => {
    it('is reported against the heap size limit', async () => {
      const v8 = require('v8');
      const stats = jest.spyOn(v8, 'getHeapStatistics').mockReturnValue({ heap_size_limit: 1000 * 1024 * 1024 });
      const usage = jest.spyOn(process, 'memoryUsage').mockReturnValue({
        rss: 200 * 1024 * 1024, heapTotal: 50 * 1024 * 1024, heapUsed: 45 * 1024 * 1024, external: 1024, arrayBuffers: 0
      });
      redisClient.ping.mockResolvedValue('PONG');
      redisClient.info.mockResolvedValue('');

      const response = await request(app).get('/api/health/detailed');

      usage.mockRestore();
      stats.mockRestore();
      expect(response.body.memory.percentHeapUsed).toBeCloseTo(4.5, 5); // not 90
      expect(response.body.memory.heapSizeLimit).toBe(1000 * 1024 * 1024);
    });
  });

  describe('GET /api/health/liveness - Basic Liveness Probe', () => {
    it('should return UP status with timestamp', async () => {
      const response = await request(app)
        .get('/api/health/liveness')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'UP',
        timestamp: expect.any(String)
      });
      
      // Verify timestamp is in ISO format
      expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
    });

    it('should always return 200 status regardless of system state', async () => {
      // Test multiple requests to ensure consistency
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .get('/api/health/liveness')
          .expect(200);

        expect(response.body.status).toBe('UP');
      }
    });

    it('should return different timestamps on subsequent calls', async () => {
      const response1 = await request(app)
        .get('/api/health/liveness')
        .expect(200);

      // Wait a small amount to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const response2 = await request(app)
        .get('/api/health/liveness')
        .expect(200);

      expect(response1.body.timestamp).not.toBe(response2.body.timestamp);
    });
  });

  describe('GET /api/health/readiness - Readiness Probe', () => {
    beforeEach(() => {
      // Reset mock implementations before each test
      redisClient.ping.mockClear();
      logger.error.mockClear();
    });

    it('should return UP when both MongoDB and Redis are healthy', async () => {
      // Mock Redis as healthy
      redisClient.ping.mockResolvedValue('PONG');

      const response = await request(app)
        .get('/api/health/readiness')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'UP',
        timestamp: expect.any(String),
        components: {
          database: {
            status: 'UP'
          },
          redis: {
            status: 'UP'
          }
        }
      });

      expect(redisClient.ping).toHaveBeenCalledTimes(1);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should return DOWN when MongoDB is disconnected', async () => {
      // Mock MongoDB as disconnected
      mongoose.connection.readyState = 0;
      redisClient.ping.mockResolvedValue('PONG');

      const response = await request(app)
        .get('/api/health/readiness')
        .expect(503);

      expect(response.body).toMatchObject({
        status: 'DOWN',
        timestamp: expect.any(String),
        components: {
          database: {
            status: 'DOWN'
          },
          redis: {
            status: 'UP'
          }
        }
      });

      // Reset for other tests
      mongoose.connection.readyState = 1;
    });

    it('should return DOWN when Redis is unhealthy', async () => {
      // Mock Redis as unhealthy
      redisClient.ping.mockRejectedValue(new Error('Redis connection failed'));

      const response = await request(app)
        .get('/api/health/readiness')
        .expect(503);

      expect(response.body).toMatchObject({
        status: 'DOWN',
        timestamp: expect.any(String),
        components: {
          database: {
            status: 'UP'
          },
          redis: {
            status: 'DOWN'
          }
        }
      });

      expect(logger.error).toHaveBeenCalledWith('Redis health check failed:', expect.any(Error));
    });

    it('should return DOWN when both services are unhealthy', async () => {
      // Mock both services as unhealthy
      mongoose.connection.readyState = 0;
      redisClient.ping.mockRejectedValue(new Error('Redis connection failed'));

      const response = await request(app)
        .get('/api/health/readiness')
        .expect(503);

      expect(response.body).toMatchObject({
        status: 'DOWN',
        timestamp: expect.any(String),
        components: {
          database: {
            status: 'DOWN'
          },
          redis: {
            status: 'DOWN'
          }
        }
      });

      // Reset for other tests
      mongoose.connection.readyState = 1;
    });

    it('should handle Redis ping returning non-PONG response', async () => {
      // Mock Redis ping returning unexpected response
      redisClient.ping.mockResolvedValue('UNEXPECTED');

      const response = await request(app)
        .get('/api/health/readiness')
        .expect(503);

      expect(response.body).toMatchObject({
        status: 'DOWN',
        components: {
          redis: {
            status: 'DOWN'
          }
        }
      });
    });

    it('should handle unexpected errors gracefully', async () => {
      // Mock an unexpected error by making mongoose.connection.readyState throw
      const originalConnection = mongoose.connection;
      mongoose.connection = {
        get readyState() {
          throw new Error('Database connection error');
        }
      };

      const response = await request(app)
        .get('/api/health/readiness')
        .expect(503);

      expect(response.body).toMatchObject({
        status: 'DOWN',
        timestamp: expect.any(String),
        error: expect.any(String)
      });

      expect(logger.error).toHaveBeenCalledWith('Readiness check failed:', expect.any(Error));

      // Restore for other tests
      mongoose.connection = originalConnection;
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await teardownTestDB();
    process.env = originalEnv;
  });

  describe('Router Registration', () => {
    it('should export a valid Express router', () => {
      expect(typeof healthRoutes).toBe('function');
      
      const routerStack = healthRoutes.stack;
      expect(routerStack).toBeDefined();
      expect(routerStack.length).toBeGreaterThan(0);
    });

    it('should register all 4 health routes', () => {
      const totalRoutes = healthRoutes.stack.filter(layer => layer.route).length;
      expect(totalRoutes).toBe(4);
    });

    it('should register all expected health endpoint paths', () => {
      const routes = healthRoutes.stack.map(layer => layer.route?.path).filter(Boolean);
      
      const expectedPaths = [
        '/liveness',
        '/readiness', 
        '/detailed'
      ];

      expectedPaths.forEach(path => {
        expect(routes).toContain(path);
      });
    });

    it('should register routes with correct HTTP methods (all GET)', () => {
      const routeMethods = healthRoutes.stack
        .filter(layer => layer.route)
        .map(layer => ({
          path: layer.route.path,
          method: Object.keys(layer.route.methods)[0]
        }));

      const expectedRoutes = [
        { path: '/liveness', method: 'get' },
        { path: '/readiness', method: 'get' },
        { path: '/detailed', method: 'get' }
      ];

      expectedRoutes.forEach(expectedRoute => {
        const actualRoute = routeMethods.find(r => 
          r.path === expectedRoute.path && r.method === expectedRoute.method
        );
        expect(actualRoute).toBeDefined();
      });
    });
  });
});
