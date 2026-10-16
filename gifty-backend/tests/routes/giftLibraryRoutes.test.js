// tests/routes/giftLibraryRoutes.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');
const { createMockUser, generateTestToken } = require('../utils/mockUtils');
const giftLibraryRoutes = require('../../routes/giftLibraryRoutes');
const giftLibraryController = require('../../controllers/giftLibraryController');
const User = require('../../models/User');

// Mock dependencies
// Owner-only gating is covered in ownerOnlyRoutes.test.js / instanceOwnerMiddleware.test.js
jest.mock('../../middleware/instanceOwnerMiddleware', () => ({ requireInstanceOwner: (req, res, next) => next() }));
jest.mock('../../controllers/giftLibraryController');
jest.mock('../../models/User');
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Set higher timeout for route tests
jest.setTimeout(30000);

describe('Gift Library Routes', () => {
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
    
    // Add gift library routes to the app
    app.use('/api/gift-library', giftLibraryRoutes);
    
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
    await teardownTestDB();
    process.env = originalEnv;
  });

  describe('Router Registration', () => {
    it('should export a valid Express router', () => {
      // Test that the router exports a function (middleware)
      expect(typeof giftLibraryRoutes).toBe('function');
      
      // Test that the routes are available by checking the router stack
      const routerStack = giftLibraryRoutes.stack;
      expect(routerStack).toBeDefined();
      expect(routerStack.length).toBeGreaterThan(0);
    });

    it('should register all 8 gift library routes', () => {
      // Count total route handlers
      const totalRoutes = giftLibraryRoutes.stack.filter(layer => layer.route).length;

      // Verify all 8 route handlers are registered
      expect(totalRoutes).toBe(8);
    });

    it('should register all expected gift library endpoint paths', () => {
      // Get the route paths from the router stack
      const routes = giftLibraryRoutes.stack.map(layer => layer.route?.path).filter(Boolean);

      // Expected gift library route paths
      const expectedPaths = [
        '/explore',
        '/categories',
        '/feedback',
        '/trending',
        '/discover/status',
        '/system-health',
        '/discover/trigger',
        '/gifts/:giftId'
      ];

      expectedPaths.forEach(path => {
        expect(routes).toContain(path);
      });
    });

    it('should register routes with correct HTTP methods', () => {
      // Get routes with their methods
      const routeMethods = giftLibraryRoutes.stack
        .filter(layer => layer.route)
        .map(layer => ({
          path: layer.route.path,
          method: Object.keys(layer.route.methods)[0]
        }));

      // Verify specific method-path combinations exist
      const expectedRoutes = [
        { path: '/explore', method: 'get' },
        { path: '/categories', method: 'get' },
        { path: '/feedback', method: 'post' },
        { path: '/trending', method: 'get' },
        { path: '/discover/status', method: 'get' },
        { path: '/system-health', method: 'get' },
        { path: '/discover/trigger', method: 'post' },
        { path: '/gifts/:giftId', method: 'delete' }
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
      // Test all gift library endpoints without authentication
      const endpoints = [
        { path: '/explore', method: 'get' },
        { path: '/categories', method: 'get' },
        { path: '/feedback', method: 'post' },
        { path: '/trending', method: 'get' },
        { path: '/discover/status', method: 'get' },
        { path: '/system-health', method: 'get' },
        { path: '/discover/trigger', method: 'post' },
        { path: '/gifts/123', method: 'delete' }
      ];
      
      for (const endpoint of endpoints) {
        const response = await request(app)
          [endpoint.method](`/api/gift-library${endpoint.path}`)
          .expect('Content-Type', /json/);
        
        expect(response.statusCode).toBe(401);
        expect(response.body).toHaveProperty('message', 'Not authorized, no token');
      }
    });

    it('should return 401 for unauthenticated requests', async () => {
      const response = await request(app)
        .get('/api/gift-library/explore')
        .expect('Content-Type', /json/);
      
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should return 401 for invalid tokens', async () => {
      const response = await request(app)
        .get('/api/gift-library/explore')
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
      giftLibraryController.exploreGifts.mockImplementation(async (req, res) => {
        res.status(200).json({
          success: true,
          gifts: [],
          pagination: { page: 1, totalPages: 1 }
        });
      });

      // Act
      const response = await request(app)
        .get('/api/gift-library/explore')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);
      
      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('GET Routes', () => {
    beforeEach(() => {
      // Mock successful authentication for all tests in this group
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
    });

    it('should handle GET /api/gift-library/explore', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const mockGifts = [
        { id: '1', name: 'Gift 1', category: 'Electronics' },
        { id: '2', name: 'Gift 2', category: 'Books' }
      ];
      
      giftLibraryController.exploreGifts.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          gifts: mockGifts,
          pagination: { page: 1, totalPages: 1, total: 2 }
        });
      });

      // Act
      const response = await request(app)
        .get('/api/gift-library/explore')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.gifts).toEqual(mockGifts);
      expect(giftLibraryController.exploreGifts).toHaveBeenCalled();
    });

    it('should handle GET /api/gift-library/categories', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const mockCategories = ['Electronics', 'Books', 'Fashion', 'Home & Garden'];
      
      giftLibraryController.getCategories.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          categories: mockCategories
        });
      });

      // Act
      const response = await request(app)
        .get('/api/gift-library/categories')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.categories).toEqual(mockCategories);
      expect(giftLibraryController.getCategories).toHaveBeenCalled();
    });

    it('should handle GET /api/gift-library/trending', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const mockTrending = [
        { id: '1', name: 'Trending Gift 1', trendScore: 95 },
        { id: '2', name: 'Trending Gift 2', trendScore: 87 }
      ];
      
      giftLibraryController.getTrendingGifts.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          trending: mockTrending
        });
      });

      // Act
      const response = await request(app)
        .get('/api/gift-library/trending')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.trending).toEqual(mockTrending);
      expect(giftLibraryController.getTrendingGifts).toHaveBeenCalled();
    });

    it('should handle GET /api/gift-library/discover/status', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const mockStatus = {
        isRunning: false,
        lastRun: '2024-01-15T10:00:00.000Z',
        totalDiscovered: 1250
      };
      
      giftLibraryController.getDiscoveryStatus.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          status: mockStatus
        });
      });

      // Act
      const response = await request(app)
        .get('/api/gift-library/discover/status')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.status).toEqual(mockStatus);
      expect(giftLibraryController.getDiscoveryStatus).toHaveBeenCalled();
    });

    it('should handle GET /api/gift-library/system-health', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const mockHealth = {
        discovery: { status: 'healthy', uptime: '24h' },
        ai: { status: 'healthy', responseTime: '250ms' },
        database: { status: 'healthy', connections: 15 }
      };
      
      giftLibraryController.getSystemHealth.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          health: mockHealth
        });
      });

      // Act
      const response = await request(app)
        .get('/api/gift-library/system-health')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.health).toEqual(mockHealth);
      expect(giftLibraryController.getSystemHealth).toHaveBeenCalled();
    });
  });

  describe('POST Routes', () => {
    beforeEach(() => {
      // Mock successful authentication for all tests in this group
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
    });

    it('should handle POST /api/gift-library/feedback', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const feedbackData = {
        giftId: '507f191e810c19729de860ea',
        feedback: 'liked',
        rating: 5,
        comments: 'Perfect gift suggestion!'
      };
      
      giftLibraryController.submitGiftFeedback.mockImplementation((req, res) => {
        expect(req.body).toEqual(feedbackData);
        res.status(200).json({
          success: true,
          message: 'Feedback submitted successfully',
          feedbackId: 'feedback_123'
        });
      });

      // Act
      const response = await request(app)
        .post('/api/gift-library/feedback')
        .set('Cookie', [`access_token=${token}`])
        .send(feedbackData)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Feedback submitted successfully');
      expect(giftLibraryController.submitGiftFeedback).toHaveBeenCalled();
    });

    it('should handle POST /api/gift-library/discover/trigger', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const triggerData = {
        categories: ['Electronics', 'Books'],
        forceRefresh: true
      };
      
      giftLibraryController.triggerDiscovery.mockImplementation((req, res) => {
        expect(req.body).toEqual(triggerData);
        res.status(200).json({
          success: true,
          message: 'Discovery process initiated',
          jobId: 'discovery_job_456'
        });
      });

      // Act
      const response = await request(app)
        .post('/api/gift-library/discover/trigger')
        .set('Cookie', [`access_token=${token}`])
        .send(triggerData)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Discovery process initiated');
      expect(giftLibraryController.triggerDiscovery).toHaveBeenCalled();
    });
  });

  describe('DELETE Routes', () => {
    beforeEach(() => {
      // Mock successful authentication for all tests in this group
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
    });

    it('should handle DELETE /api/gift-library/gifts/:giftId', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const giftId = '507f191e810c19729de860ea';
      
      giftLibraryController.deleteGiftFromLibrary.mockImplementation((req, res) => {
        expect(req.params.giftId).toBe(giftId);
        res.status(200).json({
          success: true,
          message: 'Gift deleted successfully',
          deletedGiftId: giftId
        });
      });

      // Act
      const response = await request(app)
        .delete(`/api/gift-library/gifts/${giftId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Gift deleted successfully');
      expect(response.body.deletedGiftId).toBe(giftId);
      expect(giftLibraryController.deleteGiftFromLibrary).toHaveBeenCalled();
    });

    it('should extract giftId parameter correctly', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const testGiftId = 'gift_abc123';
      
      giftLibraryController.deleteGiftFromLibrary.mockImplementation((req, res) => {
        // Verify the parameter extraction
        expect(req.params).toHaveProperty('giftId');
        expect(req.params.giftId).toBe(testGiftId);
        res.status(200).json({ success: true, giftId: req.params.giftId });
      });

      // Act
      const response = await request(app)
        .delete(`/api/gift-library/gifts/${testGiftId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      // Assert
      expect(response.body.giftId).toBe(testGiftId);
      expect(giftLibraryController.deleteGiftFromLibrary).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      // Mock successful authentication for all tests in this group
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
    });

    it('should handle controller errors gracefully', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const errorMessage = 'Database connection error';
      
      giftLibraryController.exploreGifts.mockImplementation((req, res, next) => {
        const error = new Error(errorMessage);
        error.statusCode = 500;
        next(error);
      });

      // Act
      const response = await request(app)
        .get('/api/gift-library/explore')
        .set('Cookie', [`access_token=${token}`])
        .expect(500);

      // Assert
      expect(response.body.message).toBe(errorMessage);
      expect(giftLibraryController.exploreGifts).toHaveBeenCalled();
    });
  });
});
