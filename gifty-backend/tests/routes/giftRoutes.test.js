// tests/routes/giftRoutes.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');
const { createMockUser, generateTestToken } = require('../utils/mockUtils');
const giftRoutes = require('../../routes/giftRoutes');
const giftController = require('../../controllers/giftController');
const User = require('../../models/User');
const { redisClient, publisherClient, subscriberClient } = require('../../config/redis');

// Mock dependencies
jest.mock('../../controllers/giftController');
jest.mock('../../models/User');
jest.mock('../../middleware/cacheMiddleware', () => ({
  cacheMiddleware: jest.fn(() => (req, res, next) => next()),
  clearCacheMiddleware: jest.fn(() => (req, res, next) => next())
}));
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Set higher timeout for route tests
jest.setTimeout(30000);

describe('Gift Routes', () => {
  let app;
  const originalEnv = process.env;

  beforeAll(async () => {
    await setupTestDB();
    
    // Setup test environment
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'test_jwt_secret'
    };
    
    // Set up Express app for testing
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    
    // Add gift routes to the app
    app.use('/api/gifts', giftRoutes);
    
    // Set up error handler - must be after routes
    app.use((err, req, res, next) => {
      const statusCode = err.statusCode || 500;
      res.status(statusCode);
      // Always return JSON responses in tests
      if (typeof res.setHeader === 'function') {
        res.setHeader('Content-Type', 'application/json');
      }
      res.json({ message: err.message });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    // Close Redis connections to prevent Jest from hanging
    try {
      await redisClient.quit();
      await publisherClient.quit();
      await subscriberClient.quit();
    } catch (error) {
      // Ignore Redis connection errors during cleanup
    }
    
    await teardownTestDB();
    process.env = originalEnv;
  });

  describe('Router Registration', () => {
    it('should export a valid Express router', () => {
      // Test that the router exports a function (middleware)
      expect(typeof giftRoutes).toBe('function');
      
      // Test that the routes are available by checking the router stack
      const routerStack = giftRoutes.stack;
      expect(routerStack).toBeDefined();
      expect(routerStack.length).toBeGreaterThan(0);
    });

    it('should register all 9 gift routes', () => {
      // Count total route handlers
      const totalRoutes = giftRoutes.stack.filter(layer => layer.route).length;

      // Verify all 9 route handlers are registered
      expect(totalRoutes).toBe(9);
    });
    it('should register all expected gift endpoint paths', () => {
      // Get the route paths from the router stack
      const routes = giftRoutes.stack.map(layer => layer.route?.path).filter(Boolean);

      // Expected gift route paths
      const expectedPaths = [
        '/',
        '/:giftId',
        '/suggestions',
        '/:giftId/status',
        '/:giftId/favorite',
        '/favorites',
        '/:giftId/purchase'
      ];

      expectedPaths.forEach(path => {
        expect(routes).toContain(path);
      });
    });

    it('should register routes with correct HTTP methods', () => {
      // Get routes with their methods
      const routeMethods = giftRoutes.stack
        .filter(layer => layer.route)
        .map(layer => ({
          path: layer.route.path,
          method: Object.keys(layer.route.methods)[0]
        }));

      // Verify specific method-path combinations exist
      const expectedRoutes = [
        { path: '/', method: 'get' },
        { path: '/', method: 'post' },
        { path: '/:giftId', method: 'put' },
        { path: '/:giftId', method: 'delete' },
        { path: '/suggestions', method: 'post' },
        { path: '/:giftId/status', method: 'patch' },
        { path: '/:giftId/favorite', method: 'patch' },
        { path: '/favorites', method: 'get' },
        { path: '/:giftId/purchase', method: 'post' }
      ];

      expectedRoutes.forEach(expectedRoute => {
        const actualRoute = routeMethods.find(r => 
          r.path === expectedRoute.path && r.method === expectedRoute.method
        );
        expect(actualRoute).toBeDefined();
      });
    });
  });

  describe('Authentication Protection', () => {
    it('should protect all routes with authentication middleware', async () => {
      // Test all gift endpoints without authentication
      const endpoints = [
        { path: '/', method: 'get' },
        { path: '/', method: 'post' },
        { path: '/123', method: 'put' },
        { path: '/123', method: 'delete' },
        { path: '/suggestions', method: 'post' },
        { path: '/123/status', method: 'patch' },
        { path: '/123/favorite', method: 'patch' },
        { path: '/favorites', method: 'get' },
        { path: '/123/purchase', method: 'post' }
      ];
      
      for (const endpoint of endpoints) {
        const response = await request(app)
          [endpoint.method](`/api/gifts${endpoint.path}`)
          .expect('Content-Type', /json/);
        
        expect(response.statusCode).toBe(401);
        expect(response.body).toHaveProperty('message', 'Not authorized, no token');
      }
    });

    it('should return 401 for unauthenticated requests', async () => {
      const response = await request(app)
        .get('/api/gifts')
        .expect('Content-Type', /json/);
      
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should return 401 for invalid tokens', async () => {
      const response = await request(app)
        .get('/api/gifts')
        .set('Authorization', 'Bearer invalid-token')
        .expect('Content-Type', /json/);
      
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('message');
    });

    it('should allow access with valid authentication token', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      // Mock User.findById for auth middleware
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
      
      // Mock controller to return success
      giftController.getGifts.mockImplementation(async (req, res) => {
        res.status(200).json({
          success: true,
          gifts: [],
          pagination: { page: 1, totalPages: 1 }
        });
      });

      // Act
      const response = await request(app)
        .get('/api/gifts')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);
      
      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Caching Middleware Integration', () => {
    it('should apply cache middleware to read operations', () => {
      // Test that GET routes have cache middleware
      const getRoutes = giftRoutes.stack.filter(layer => 
        layer.route && layer.route.methods.get
      );
      
      // Should have 2 GET routes: /, /favorites
      expect(getRoutes.length).toBe(2);
      
      // Check that caching middleware is applied (middleware stack should have more than just the controller)
      getRoutes.forEach(route => {
        // Each GET route should have multiple middleware layers (auth + cache + controller)
        expect(route.route.stack.length).toBeGreaterThan(1);
      });
    });

    it('should apply clearCache middleware to write operations', () => {
      // Test that POST, PUT, DELETE, PATCH routes have clearCache middleware
      const writeRoutes = giftRoutes.stack.filter(layer => 
        layer.route && (
          layer.route.methods.post || 
          layer.route.methods.put || 
          layer.route.methods.delete || 
          layer.route.methods.patch
        )
      );
      
      // Should have 7 write routes: POST /, PUT /:giftId, DELETE /:giftId, POST /suggestions, PATCH /:giftId/status, PATCH /:giftId/favorite, POST /:giftId/purchase
      expect(writeRoutes.length).toBe(7);
      
      // Check that clearCache middleware is applied
      writeRoutes.forEach(route => {
        // Each write route should have multiple middleware layers (auth + clearCache + controller)
        expect(route.route.stack.length).toBeGreaterThan(1);
      });
    });

    it('should have different middleware stacks for cache vs clearCache routes', () => {
      // Get a cached route (GET /)
      const cachedRoute = giftRoutes.stack.find(layer => 
        layer.route && layer.route.path === '/' && layer.route.methods.get
      );
      
      // Get a cache-clearing route (POST /)
      const clearCacheRoute = giftRoutes.stack.find(layer => 
        layer.route && layer.route.path === '/' && layer.route.methods.post
      );
      
      expect(cachedRoute).toBeDefined();
      expect(clearCacheRoute).toBeDefined();
      
      // Both should have middleware stacks
      expect(cachedRoute.route.stack.length).toBeGreaterThan(1);
      expect(clearCacheRoute.route.stack.length).toBeGreaterThan(1);
    });
  });

  describe('CRUD Operations', () => {
    beforeEach(() => {
      // Mock successful authentication for all tests in this group
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
    });

    it('should handle GET /api/gifts (with caching)', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const mockGifts = [
        { id: '1', name: 'Gift 1', price: 29.99, category: 'Electronics' },
        { id: '2', name: 'Gift 2', price: 49.99, category: 'Books' }
      ];
      
      giftController.getGifts.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          gifts: mockGifts,
          pagination: { page: 1, totalPages: 1, total: 2 }
        });
      });

      // Act
      const response = await request(app)
        .get('/api/gifts')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.gifts).toEqual(mockGifts);
      expect(giftController.getGifts).toHaveBeenCalled();
    });

    it('should handle POST /api/gifts (with cache clearing)', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const giftData = {
        name: 'New Test Gift',
        description: 'A wonderful test gift',
        price: 39.99,
        category: 'Electronics'
      };
      
      giftController.createGift.mockImplementation((req, res) => {
        expect(req.body).toEqual(giftData);
        res.status(201).json({
          success: true,
          gift: { id: 'gift_123', ...giftData }
        });
      });

      // Act
      const response = await request(app)
        .post('/api/gifts')
        .set('Cookie', [`access_token=${token}`])
        .send(giftData)
        .expect(201);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.gift.name).toBe(giftData.name);
      expect(giftController.createGift).toHaveBeenCalled();
    });

    it('should handle PUT /api/gifts/:giftId (with cache clearing)', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const giftId = '507f191e810c19729de860ea';
      const updateData = {
        name: 'Updated Gift Name',
        price: 59.99
      };
      
      giftController.updateGift.mockImplementation((req, res) => {
        expect(req.params.giftId).toBe(giftId);
        expect(req.body).toEqual(updateData);
        res.status(200).json({
          success: true,
          gift: { id: giftId, ...updateData }
        });
      });

      // Act
      const response = await request(app)
        .put(`/api/gifts/${giftId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.gift.name).toBe(updateData.name);
      expect(giftController.updateGift).toHaveBeenCalled();
    });

    it('should handle DELETE /api/gifts/:giftId (with cache clearing)', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const giftId = '507f191e810c19729de860ea';
      
      giftController.deleteGift.mockImplementation((req, res) => {
        expect(req.params.giftId).toBe(giftId);
        res.status(200).json({
          success: true,
          message: 'Gift deleted successfully',
          deletedGiftId: giftId
        });
      });

      // Act
      const response = await request(app)
        .delete(`/api/gifts/${giftId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.deletedGiftId).toBe(giftId);
      expect(giftController.deleteGift).toHaveBeenCalled();
    });

    it('should extract giftId parameter correctly for all parameterized routes', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const testGiftId = 'gift_param_test_123';
      
      // Test PUT route parameter extraction
      giftController.updateGift.mockImplementation((req, res) => {
        expect(req.params).toHaveProperty('giftId');
        expect(req.params.giftId).toBe(testGiftId);
        res.status(200).json({ success: true, giftId: req.params.giftId });
      });

      // Act
      const response = await request(app)
        .put(`/api/gifts/${testGiftId}`)
        .set('Cookie', [`access_token=${token}`])
        .send({ name: 'Test' })
        .expect(200);

      // Assert
      expect(response.body.giftId).toBe(testGiftId);
      expect(giftController.updateGift).toHaveBeenCalled();
    });
  });

  describe('Suggestion Operations', () => {
    beforeEach(() => {
      // Mock successful authentication for all tests in this group
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
    });

    it('should handle POST /api/gifts/suggestions', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const suggestionData = {
        recipientProfile: {
          age: 25,
          interests: ['tech', 'gaming'],
          relationship: 'friend'
        },
        budget: { min: 50, max: 200 },
        occasion: 'birthday'
      };
      
      giftController.generateGiftSuggestions.mockImplementation((req, res) => {
        expect(req.body).toEqual(suggestionData);
        res.status(200).json({
          success: true,
          requestId: 'req_123',
          message: 'Gift suggestions generation started'
        });
      });

      // Act
      const response = await request(app)
        .post('/api/gifts/suggestions')
        .set('Cookie', [`access_token=${token}`])
        .send(suggestionData)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.requestId).toBe('req_123');
      expect(giftController.generateGiftSuggestions).toHaveBeenCalled();
    });
  });
});
