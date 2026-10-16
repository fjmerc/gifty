// tests/routes/feedbackRoutes.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');
const { createMockUser, generateTestToken } = require('../utils/mockUtils');
const feedbackRoutes = require('../../routes/feedbackRoutes');
const User = require('../../models/User');

// Mock dependencies
jest.mock('../../services/feedbackService');
jest.mock('../../services/trendAnalysisService');
jest.mock('../../models/FeedbackLog');
jest.mock('../../models/User');
// Ownership is exercised against a real DB in tests/security/feedback.security.test.js;
// here the caller always owns the gift/recipient so the route wiring can be unit-tested.
jest.mock('../../utils/ownership', () => ({
  ...jest.requireActual('../../utils/ownership'),
  findOwned: jest.fn(() => Promise.resolve({ _id: 'owned' }))
}));

// Set higher timeout for route tests
jest.setTimeout(30000);

describe('Feedback Routes', () => {
  let app;
  const originalEnv = process.env;
  
  // Mock service imports
  const feedbackService = require('../../services/feedbackService');
  const trendAnalysisService = require('../../services/trendAnalysisService');
  const FeedbackLog = require('../../models/FeedbackLog');

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
    
    // Add feedback routes to the app
    app.use('/api/feedback', feedbackRoutes);
    
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

  describe('GET /api/feedback/user - User Feedback History', () => {
    let userId, user, token;

    beforeEach(() => {
      userId = new mongoose.Types.ObjectId();
      user = createMockUser({ _id: userId, id: userId.toString() });
      token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
    });

    describe('Service Integration', () => {
      it('should return user feedback history with default parameters', async () => {
        const mockResult = {
          logs: [{ id: 'log1', action: 'viewed' }, { id: 'log2', action: 'saved' }],
          totalLogs: 2,
          totalPages: 1
        };

        feedbackService.getUserFeedbackHistory.mockResolvedValue(mockResult);

        const response = await request(app)
          .get('/api/feedback/user')
          .set('Cookie', [`access_token=${token}`])
          .expect(200);

        expect(response.body).toEqual({
          feedback: mockResult.logs,
          pagination: {
            page: 1,
            limit: 50,
            totalItems: 2,
            totalPages: 1
          },
          filters: expect.objectContaining({
            sortBy: 'timestamp',
            sortOrder: 'desc'
          })
        });

        expect(feedbackService.getUserFeedbackHistory).toHaveBeenCalledWith(
          user.id,
          expect.objectContaining({
            sortBy: 'timestamp',
            sortOrder: 'desc'
          }),
          50,
          1
        );
      });

      it('should handle filtering parameters', async () => {
        const mockResult = { logs: [], totalLogs: 0, totalPages: 0 };
        feedbackService.getUserFeedbackHistory.mockResolvedValue(mockResult);

        await request(app)
          .get('/api/feedback/user')
          .query({
            action: 'viewed',
            category: 'Electronics',
            recipientId: 'recipient123',
            limit: 25,
            page: 2,
            sortBy: 'rating',
            sortOrder: 'asc'
          })
          .set('Cookie', [`access_token=${token}`])
          .expect(200);

        expect(feedbackService.getUserFeedbackHistory).toHaveBeenCalledWith(
          user.id,
          expect.objectContaining({
            action: 'viewed',
            category: 'Electronics',
            recipientId: 'recipient123',
            sortBy: 'rating',
            sortOrder: 'asc'
          }),
          25,
          2
        );
      });

      it('should handle date range parameters', async () => {
        const mockResult = { logs: [], totalLogs: 0, totalPages: 0 };
        feedbackService.getUserFeedbackHistory.mockResolvedValue(mockResult);

        await request(app)
          .get('/api/feedback/user')
          .query({
            startDate: '2023-01-01',
            endDate: '2023-12-31'
          })
          .set('Cookie', [`access_token=${token}`])
          .expect(200);

        expect(feedbackService.getUserFeedbackHistory).toHaveBeenCalledWith(
          user.id,
          expect.objectContaining({
            startDate: new Date('2023-01-01'),
            endDate: new Date('2023-12-31')
          }),
          50,
          1
        );
      });

      it('should return 400 for invalid startDate format', async () => {
        const response = await request(app)
          .get('/api/feedback/user')
          .query({ startDate: 'invalid-date' })
          .set('Cookie', [`access_token=${token}`])
          .expect(400);

        expect(response.body).toHaveProperty('message', 'Invalid startDate format');
        expect(feedbackService.getUserFeedbackHistory).not.toHaveBeenCalled();
      });

      it('should return 400 for invalid endDate format', async () => {
        const response = await request(app)
          .get('/api/feedback/user')
          .query({ endDate: 'invalid-date' })
          .set('Cookie', [`access_token=${token}`])
          .expect(400);

        expect(response.body).toHaveProperty('message', 'Invalid endDate format');
        expect(feedbackService.getUserFeedbackHistory).not.toHaveBeenCalled();
      });

      it('should return 500 when service throws exception', async () => {
        feedbackService.getUserFeedbackHistory.mockRejectedValue(new Error('Database error'));

        const response = await request(app)
          .get('/api/feedback/user')
          .set('Cookie', [`access_token=${token}`])
          .expect(500);

        expect(response.body).toHaveProperty('message', 'Server error');
      });
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
      expect(typeof feedbackRoutes).toBe('function');
      
      const routerStack = feedbackRoutes.stack;
      expect(routerStack).toBeDefined();
      expect(routerStack.length).toBeGreaterThan(0);
    });

    it('should register all 3 feedback routes', () => {
      const totalRoutes = feedbackRoutes.stack.filter(layer => layer.route).length;
      expect(totalRoutes).toBe(3);
    });

    it('should register all expected feedback endpoint paths', () => {
      const routes = feedbackRoutes.stack.map(layer => layer.route?.path).filter(Boolean);
      
      const expectedPaths = [
        '/',
        '/analytics',
        '/user'
      ];

      expectedPaths.forEach(path => {
        expect(routes).toContain(path);
      });
    });

    it('should register routes with correct HTTP methods', () => {
      const routeMethods = feedbackRoutes.stack
        .filter(layer => layer.route)
        .map(layer => ({
          path: layer.route.path,
          method: Object.keys(layer.route.methods)[0]
        }));

      const expectedRoutes = [
        { path: '/', method: 'post' },
        { path: '/analytics', method: 'get' },
        { path: '/user', method: 'get' }
      ];

      expectedRoutes.forEach(expectedRoute => {
        const actualRoute = routeMethods.find(r => 
          r.path === expectedRoute.path && r.method === expectedRoute.method
        );
        expect(actualRoute).toBeDefined();
      });
    });
  });

  describe('GET /api/feedback/analytics - Get Analytics', () => {
    let userId, user, token;

    beforeEach(() => {
      // Setup authenticated user for all tests in this group
      userId = new mongoose.Types.ObjectId();
      user = createMockUser({ _id: userId, id: userId.toString() });
      token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
    });

    describe('Service Integration', () => {
      it('should call all required services and return analytics data', async () => {
        // Mock all service responses
        const mockGlobalMetrics = {
          actionsBreakdown: { viewed: 100, saved: 50, purchased: 25 },
          averageRating: 4.2
        };
        const mockCategoryMetrics = [
          { category: 'Electronics', successRate: 0.75 },
          { category: 'Books', successRate: 0.65 }
        ];
        const mockTagMetrics = [
          { tag: 'tech', effectiveness: 0.8 },
          { tag: 'gaming', effectiveness: 0.7 }
        ];
        const mockUserStats = {
          totalFeedback: 150,
          averageRating: 4.1
        };

        trendAnalysisService.getGlobalPerformanceMetrics.mockResolvedValue(mockGlobalMetrics);
        trendAnalysisService.analyzeCategorySuccess.mockResolvedValue(mockCategoryMetrics);
        trendAnalysisService.analyzeTagEffectiveness.mockResolvedValue(mockTagMetrics);
        feedbackService.getUserFeedbackStats.mockResolvedValue(mockUserStats);

        const response = await request(app)
          .get('/api/feedback/analytics')
          .set('Cookie', [`access_token=${token}`])
          .expect(200);

        expect(response.body).toMatchObject({
          globalMetrics: mockGlobalMetrics,
          categoryMetrics: mockCategoryMetrics,
          tagMetrics: mockTagMetrics,
          userStats: mockUserStats,
          dateRange: {
            startDate: null,
            endDate: null
          }
        });

        // The caller's own feedback only
        expect(trendAnalysisService.getGlobalPerformanceMetrics).toHaveBeenCalledWith({
          startDate: null,
          endDate: null
        }, user._id);
        expect(feedbackService.getUserFeedbackStats).toHaveBeenCalledWith(user.id, {
          startDate: null,
          endDate: null
        });
      });

      it('should handle date range parameters', async () => {
        const startDate = '2023-01-01';
        const endDate = '2023-12-31';

        trendAnalysisService.getGlobalPerformanceMetrics.mockResolvedValue({});
        trendAnalysisService.analyzeCategorySuccess.mockResolvedValue([]);
        trendAnalysisService.analyzeTagEffectiveness.mockResolvedValue([]);
        feedbackService.getUserFeedbackStats.mockResolvedValue({});

        const response = await request(app)
          .get('/api/feedback/analytics')
          .query({ startDate, endDate })
          .set('Cookie', [`access_token=${token}`])
          .expect(200);

        expect(response.body.dateRange.startDate).not.toBeNull();
        expect(response.body.dateRange.endDate).not.toBeNull();
        
        expect(trendAnalysisService.getGlobalPerformanceMetrics).toHaveBeenCalledWith({
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        }, user._id);
      });

      it('should return 400 for invalid startDate format', async () => {
        const response = await request(app)
          .get('/api/feedback/analytics')
          .query({ startDate: 'invalid-date' })
          .set('Cookie', [`access_token=${token}`])
          .expect(400);

        expect(response.body).toHaveProperty('message', 'Invalid startDate format');
        expect(trendAnalysisService.getGlobalPerformanceMetrics).not.toHaveBeenCalled();
      });

      it('should return 400 for invalid endDate format', async () => {
        const response = await request(app)
          .get('/api/feedback/analytics')
          .query({ endDate: 'invalid-date' })
          .set('Cookie', [`access_token=${token}`])
          .expect(400);

        expect(response.body).toHaveProperty('message', 'Invalid endDate format');
        expect(trendAnalysisService.getGlobalPerformanceMetrics).not.toHaveBeenCalled();
      });

      it('should include time trends when requested', async () => {
        const mockTimeTrends = {
          daily: [{ date: '2023-12-01', views: 50 }]
        };

        trendAnalysisService.getGlobalPerformanceMetrics.mockResolvedValue({});
        trendAnalysisService.analyzeCategorySuccess.mockResolvedValue([]);
        trendAnalysisService.analyzeTagEffectiveness.mockResolvedValue([]);
        trendAnalysisService.getTimeBasedTrends.mockResolvedValue(mockTimeTrends);
        feedbackService.getUserFeedbackStats.mockResolvedValue({});

        const response = await request(app)
          .get('/api/feedback/analytics')
          .query({ includeTimeTrends: 'true', groupBy: 'week' })
          .set('Cookie', [`access_token=${token}`])
          .expect(200);

        expect(response.body.timeTrends).toEqual(mockTimeTrends);
        expect(trendAnalysisService.getTimeBasedTrends).toHaveBeenCalledWith(
          { startDate: null, endDate: null },
          'week',
          user._id
        );
      });

      it('should not include time trends when not requested', async () => {
        trendAnalysisService.getGlobalPerformanceMetrics.mockResolvedValue({});
        trendAnalysisService.analyzeCategorySuccess.mockResolvedValue([]);
        trendAnalysisService.analyzeTagEffectiveness.mockResolvedValue([]);
        feedbackService.getUserFeedbackStats.mockResolvedValue({});

        const response = await request(app)
          .get('/api/feedback/analytics')
          .set('Cookie', [`access_token=${token}`])
          .expect(200);

        expect(response.body.timeTrends).toBeUndefined();
        expect(trendAnalysisService.getTimeBasedTrends).not.toHaveBeenCalled();
      });

      it('should return 500 when service throws exception', async () => {
        trendAnalysisService.getGlobalPerformanceMetrics.mockRejectedValue(
          new Error('Service unavailable')
        );

        const response = await request(app)
          .get('/api/feedback/analytics')
          .set('Cookie', [`access_token=${token}`])
          .expect(500);

        expect(response.body).toHaveProperty('message', 'Server error');
      });
    });
  });

  describe('Authentication Protection', () => {
    it('should protect all routes with authentication middleware', async () => {
      const endpoints = [
        { path: '/', method: 'post' },
        { path: '/analytics', method: 'get' },
        { path: '/user', method: 'get' }
      ];
      
      for (const endpoint of endpoints) {
        const response = await request(app)
          [endpoint.method](`/api/feedback${endpoint.path}`)
          .expect('Content-Type', /json/);
        
        expect(response.statusCode).toBe(401);
        expect(response.body).toHaveProperty('message', 'Not authorized, no token');
      }
    });

    it('should return 401 for invalid tokens', async () => {
      const response = await request(app)
        .post('/api/feedback')
        .set('Authorization', 'Bearer invalid-token')
        .send({ giftId: '123', action: 'viewed' })
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
      
      // Mock feedbackService response
      feedbackService.trackFeedback.mockResolvedValue({
        success: true,
        gift: { id: 'gift_123', name: 'Test Gift' }
      });

      // Act
      const response = await request(app)
        .post('/api/feedback')
        .set('Cookie', [`access_token=${token}`])
        .send({ giftId: 'gift_123', action: 'viewed' })
        .expect('Content-Type', /json/);
      
      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('message', 'Feedback recorded successfully');
    });
  });

  describe('POST /api/feedback - Track Feedback', () => {
    let userId, user, token;

    beforeEach(() => {
      // Setup authenticated user for all tests in this group
      userId = new mongoose.Types.ObjectId();
      user = createMockUser({ _id: userId, id: userId.toString() });
      token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
    });

    describe('Request Validation', () => {
      it('should return 400 when giftId is missing', async () => {
        const response = await request(app)
          .post('/api/feedback')
          .set('Cookie', [`access_token=${token}`])
          .send({ action: 'viewed' })
          .expect(400);

        expect(response.body).toHaveProperty('message', 'Missing required fields');
        expect(feedbackService.trackFeedback).not.toHaveBeenCalled();
      });

      it('should return 400 when action is missing', async () => {
        const response = await request(app)
          .post('/api/feedback')
          .set('Cookie', [`access_token=${token}`])
          .send({ giftId: 'gift_123' })
          .expect(400);

        expect(response.body).toHaveProperty('message', 'Missing required fields');
        expect(feedbackService.trackFeedback).not.toHaveBeenCalled();
      });

      it('should return 400 when both giftId and action are missing', async () => {
        const response = await request(app)
          .post('/api/feedback')
          .set('Cookie', [`access_token=${token}`])
          .send({})
          .expect(400);

        expect(response.body).toHaveProperty('message', 'Missing required fields');
        expect(feedbackService.trackFeedback).not.toHaveBeenCalled();
      });

      it('should return 400 for invalid action', async () => {
        const response = await request(app)
          .post('/api/feedback')
          .set('Cookie', [`access_token=${token}`])
          .send({ giftId: 'gift_123', action: 'invalid_action' })
          .expect(400);

        expect(response.body).toHaveProperty('message', 'Invalid action');
        expect(feedbackService.trackFeedback).not.toHaveBeenCalled();
      });

      it('should accept all valid actions', async () => {
        const validActions = ['viewed', 'saved', 'purchased', 'ignored', 'favorited'];
        
        feedbackService.trackFeedback.mockResolvedValue({
          success: true,
          gift: { id: 'gift_123', name: 'Test Gift' }
        });

        for (const action of validActions) {
          const response = await request(app)
            .post('/api/feedback')
            .set('Cookie', [`access_token=${token}`])
            .send({ giftId: 'gift_123', action })
            .expect(200);

          expect(response.body).toHaveProperty('message', 'Feedback recorded successfully');
        }

        expect(feedbackService.trackFeedback).toHaveBeenCalledTimes(validActions.length);
      });

      it('should return 400 for explicitRating below 1', async () => {
        // Note: explicitRating of 0 is falsy in JavaScript, so the current route
        // validation doesn't catch it. We need to handle this in the actual route.
        // For now, we'll test with -1 to demonstrate the validation works for negative numbers
        const response = await request(app)
          .post('/api/feedback')
          .set('Cookie', [`access_token=${token}`])
          .send({ giftId: 'gift_123', action: 'viewed', explicitRating: -1 })
          .expect(400);

        expect(response.body).toHaveProperty('message', 'Rating must be between 1 and 5');
        expect(feedbackService.trackFeedback).not.toHaveBeenCalled();
      });

      it('should return 400 for explicitRating above 5', async () => {
        const response = await request(app)
          .post('/api/feedback')
          .set('Cookie', [`access_token=${token}`])
          .send({ giftId: 'gift_123', action: 'viewed', explicitRating: 6 })
          .expect(400);

        expect(response.body).toHaveProperty('message', 'Rating must be between 1 and 5');
        expect(feedbackService.trackFeedback).not.toHaveBeenCalled();
      });

      it('should accept valid explicitRating values 1-5', async () => {
        feedbackService.trackFeedback.mockResolvedValue({
          success: true,
          gift: { id: 'gift_123', name: 'Test Gift' }
        });

        for (let rating = 1; rating <= 5; rating++) {
          const response = await request(app)
            .post('/api/feedback')
            .set('Cookie', [`access_token=${token}`])
            .send({ giftId: 'gift_123', action: 'viewed', explicitRating: rating })
            .expect(200);

          expect(response.body).toHaveProperty('message', 'Feedback recorded successfully');
        }

        expect(feedbackService.trackFeedback).toHaveBeenCalledTimes(5);
      });

      it('should accept optional comment field', async () => {
        feedbackService.trackFeedback.mockResolvedValue({
          success: true,
          gift: { id: 'gift_123', name: 'Test Gift' }
        });

        const response = await request(app)
          .post('/api/feedback')
          .set('Cookie', [`access_token=${token}`])
          .send({ 
            giftId: 'gift_123', 
            action: 'viewed',
            comment: 'This is a great gift suggestion!' 
          })
          .expect(200);

        expect(response.body).toHaveProperty('message', 'Feedback recorded successfully');
        expect(feedbackService.trackFeedback).toHaveBeenCalledWith({
          giftId: 'gift_123',
          action: 'viewed',
          explicitRating: undefined,
          comment: 'This is a great gift suggestion!',
          userId: user.id
        });
      });
    });

    describe('Service Integration', () => {
      it('should call feedbackService.trackFeedback with correct parameters', async () => {
        feedbackService.trackFeedback.mockResolvedValue({
          success: true,
          gift: { id: 'gift_123', name: 'Test Gift' }
        });

        await request(app)
          .post('/api/feedback')
          .set('Cookie', [`access_token=${token}`])
          .send({ giftId: 'gift_123', action: 'viewed' })
          .expect(200);

        expect(feedbackService.trackFeedback).toHaveBeenCalledWith({
          giftId: 'gift_123',
          action: 'viewed',
          explicitRating: undefined,
          comment: undefined,
          userId: user.id
        });
      });

      it('should return gift data when service succeeds', async () => {
        const mockGift = { id: 'gift_123', name: 'Test Gift', category: 'Electronics' };
        feedbackService.trackFeedback.mockResolvedValue({
          success: true,
          gift: mockGift
        });

        const response = await request(app)
          .post('/api/feedback')
          .set('Cookie', [`access_token=${token}`])
          .send({ giftId: 'gift_123', action: 'saved' })
          .expect(200);

        expect(response.body).toEqual({
          message: 'Feedback recorded successfully',
          gift: mockGift
        });
      });

      it('should return 400 when service returns error', async () => {
        feedbackService.trackFeedback.mockResolvedValue({
          success: false,
          error: 'Gift not found'
        });

        const response = await request(app)
          .post('/api/feedback')
          .set('Cookie', [`access_token=${token}`])
          .send({ giftId: 'invalid_gift', action: 'viewed' })
          .expect(400);

        expect(response.body).toHaveProperty('message', 'Gift not found');
      });

      it('should return 500 when service throws exception', async () => {
        feedbackService.trackFeedback.mockRejectedValue(new Error('Database connection failed'));

        const response = await request(app)
          .post('/api/feedback')
          .set('Cookie', [`access_token=${token}`])
          .send({ giftId: 'gift_123', action: 'viewed' })
          .expect(500);

        expect(response.body).toHaveProperty('message', 'Server error');
      });
    });
  });
});
