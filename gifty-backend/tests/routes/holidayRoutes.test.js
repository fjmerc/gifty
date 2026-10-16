// tests/routes/holidayRoutes.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const cookieParser = require('cookie-parser');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');
const { createMockUser, generateTestToken } = require('../utils/mockUtils');
const holidayRoutes = require('../../routes/holidayRoutes');
const Holiday = require('../../models/Holiday');
const holidayService = require('../../services/holidayService');
const User = require('../../models/User');
const { redisClient, publisherClient, subscriberClient } = require('../../config/redis');

// Mock dependencies
jest.mock('../../models/Holiday');
jest.mock('../../services/holidayService');
jest.mock('../../models/User');
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Set higher timeout for route tests
jest.setTimeout(30000);

describe('Holiday Routes', () => {
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
    
    // Add holiday routes to the app
    app.use('/api/holidays', holidayRoutes);
    
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
      expect(typeof holidayRoutes).toBe('function');
      
      // Test that the routes are available by checking the router stack
      const routerStack = holidayRoutes.stack;
      expect(routerStack).toBeDefined();
      expect(routerStack.length).toBeGreaterThan(0);
    });

    it('should register both holiday routes', () => {
      // Count total route handlers
      const totalRoutes = holidayRoutes.stack.filter(layer => layer.route).length;

      // Verify all 3 route handlers are registered
      expect(totalRoutes).toBe(2);
    });

    it('should register all expected holiday endpoint paths', () => {
      // Get the route paths from the router stack
      const routes = holidayRoutes.stack.map(layer => layer.route?.path).filter(Boolean);

      // Expected holiday route paths
      const expectedPaths = [
        '/',
        '/regenerate'
      ];

      expectedPaths.forEach(path => {
        expect(routes).toContain(path);
      });
    });

    it('should register routes with correct HTTP methods', () => {
      // Get routes with their methods
      const routeMethods = holidayRoutes.stack
        .filter(layer => layer.route)
        .map(layer => ({
          path: layer.route.path,
          method: Object.keys(layer.route.methods)[0]
        }));

      // Verify specific method-path combinations exist
      const expectedRoutes = [
        { path: '/', method: 'get' },
        { path: '/regenerate', method: 'post' }
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
      // Test all holiday endpoints without authentication
      const endpoints = [
        { path: '/', method: 'get' },
        { path: '/regenerate', method: 'post' }
      ];
      
      for (const endpoint of endpoints) {
        const response = await request(app)
          [endpoint.method](`/api/holidays${endpoint.path}`)
          .expect('Content-Type', /json/);
        
        expect(response.statusCode).toBe(401);
        expect(response.body).toHaveProperty('message', 'Not authorized, no token');
      }
    });

    it('should return 401 for unauthenticated requests', async () => {
      const response = await request(app)
        .get('/api/holidays')
        .expect('Content-Type', /json/);
      
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should return 401 for invalid tokens', async () => {
      const response = await request(app)
        .get('/api/holidays')
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
      
      // Mock Holiday.find for successful response
      Holiday.find = jest.fn().mockImplementation(() => ({
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([])
      }));

      // Act
      const response = await request(app)
        .get('/api/holidays')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);
      
      // Assert
      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Query Parameter Handling', () => {
    beforeEach(() => {
      // Mock successful authentication for all tests in this group
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
    });

    it('should handle GET /api/holidays with default countryCode', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      Holiday.find = jest.fn().mockImplementation(() => ({
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([])
      }));

      const response = await request(app)
        .get('/api/holidays')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      expect(Holiday.find).toHaveBeenCalledWith({ countryCode: 'US' });
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should handle custom countryCode parameter', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      Holiday.find = jest.fn().mockImplementation(() => ({
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([])
      }));

      await request(app)
        .get('/api/holidays?countryCode=DE')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      expect(Holiday.find).toHaveBeenCalledWith({ countryCode: 'DE' });
    });

    it('should handle categories parameter conversion', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      Holiday.find = jest.fn().mockImplementation(() => ({
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([])
      }));

      await request(app)
        .get('/api/holidays?categories=national,religious')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      expect(Holiday.find).toHaveBeenCalledWith({ 
        countryCode: 'US',
        category: { $in: ['national', 'religious'] }
      });
    });

    it('should handle both countryCode and categories parameters', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      Holiday.find = jest.fn().mockImplementation(() => ({
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([])
      }));

      await request(app)
        .get('/api/holidays?countryCode=DE&categories=public,bank')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      expect(Holiday.find).toHaveBeenCalledWith({ 
        countryCode: 'DE',
        category: { $in: ['public', 'bank'] }
      });
    });

    it('should handle single category parameter', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      Holiday.find = jest.fn().mockImplementation(() => ({
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([])
      }));

      await request(app)
        .get('/api/holidays?categories=national')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      expect(Holiday.find).toHaveBeenCalledWith({ 
        countryCode: 'US',
        category: { $in: ['national'] }
      });
    });
  });

  describe('Database Integration', () => {
    beforeEach(() => {
      // Mock successful authentication for all tests in this group
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
    });

    it('should call Holiday.find with correct query building and sorting', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      const mockSort = jest.fn().mockReturnThis();
      const mockPopulate = jest.fn().mockResolvedValue([]);
      
      Holiday.find = jest.fn().mockImplementation(() => ({
        sort: mockSort,
        populate: mockPopulate
      }));

      await request(app)
        .get('/api/holidays?countryCode=US&categories=national')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      expect(Holiday.find).toHaveBeenCalledWith({ 
        countryCode: 'US',
        category: { $in: ['national'] }
      });
      expect(mockSort).toHaveBeenCalledWith({ month: 1, day: 1 });
      expect(mockPopulate).toHaveBeenCalledWith('eventType');
    });

  });

  describe('Service Integration', () => {
    beforeEach(() => {
      // Mock successful authentication for all tests in this group
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
    });

    it('should call holidayService.updateUserHolidayEvents for POST /regenerate', async () => {
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      // Override the beforeEach mock with specific user
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
      
      const mockResult = {
        success: true,
        message: 'Holiday events updated successfully',
        updatedCount: 5
      };
      
      holidayService.updateUserHolidayEvents = jest.fn().mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/holidays/regenerate')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      expect(holidayService.updateUserHolidayEvents).toHaveBeenCalledWith(userId);
      expect(response.body).toEqual(mockResult);
    });

    it('should pass user ID correctly to service method', async () => {
      const userId = new mongoose.Types.ObjectId();
      const specificUser = createMockUser({ _id: userId });
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(specificUser)
      }));
      
      holidayService.updateUserHolidayEvents = jest.fn().mockResolvedValue({ success: true });

      await request(app)
        .post('/api/holidays/regenerate')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      expect(holidayService.updateUserHolidayEvents).toHaveBeenCalledWith(userId);
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

    it('should handle database errors in GET /api/holidays', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      // Mock Holiday.find to throw an error
      Holiday.find = jest.fn().mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const response = await request(app)
        .get('/api/holidays')
        .set('Cookie', [`access_token=${token}`])
        .expect(500);

      expect(response.body).toEqual({
        message: 'Server error',
        error: 'Database connection failed'
      });
    });

    it('should handle service errors in POST /api/holidays/regenerate', async () => {
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
      
      holidayService.updateUserHolidayEvents = jest.fn().mockRejectedValue(
        new Error('Service unavailable')
      );

      const response = await request(app)
        .post('/api/holidays/regenerate')
        .set('Cookie', [`access_token=${token}`])
        .expect(500);

      expect(response.body).toEqual({
        message: 'Server error',
        error: 'Service unavailable'
      });
    });
  });
});
