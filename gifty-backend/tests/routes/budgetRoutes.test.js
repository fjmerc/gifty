// tests/routes/budgetRoutes.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');
const { createMockUser, generateTestToken } = require('../utils/mockUtils');
const budgetRoutes = require('../../routes/budgetRoutes');
const budgetController = require('../../controllers/budgetController');
const User = require('../../models/User');

// Mock dependencies
jest.mock('../../controllers/budgetController');
jest.mock('../../models/User');
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Set higher timeout for route tests
jest.setTimeout(30000);

describe('Budget Routes', () => {
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
    
    // Add budget routes to the app
    app.use('/api/budgets', budgetRoutes);
    
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
      expect(typeof budgetRoutes).toBe('function');
      
      // Test that the routes are available by checking the router stack
      const routerStack = budgetRoutes.stack;
      expect(routerStack).toBeDefined();
      expect(routerStack.length).toBeGreaterThan(0);
    });

    it('should register all 9 budget routes', () => {
      // Count total route handlers (some paths have multiple methods)
      const totalRoutes = budgetRoutes.stack.filter(layer => layer.route).length;

      // 2 for overall/:year, 1 for overall, 2 for recipient/:recipientId/:year,
      // 1 for recipient, 1 for analytics/:year, 1 for all/:year, 1 for available-years
      expect(totalRoutes).toBe(9);
    });

    it('should register all expected budget endpoint paths', () => {
      // Get the route paths from the router stack
      const routes = budgetRoutes.stack.map(layer => layer.route?.path).filter(Boolean);

      // Expected budget route paths
      const expectedPaths = [
        '/overall/:year',         // GET, PUT
        '/overall',               // POST
        '/recipient/:recipientId/:year', // GET, PUT
        '/recipient',             // POST
        '/analytics/:year',       // GET
        '/all/:year',            // GET
        '/available-years'       // GET
      ];

      expectedPaths.forEach(path => {
        expect(routes).toContain(path);
      });
    });

    it('should register routes with correct HTTP methods', () => {
      // Get routes with their methods (each layer represents one method)
      const routeMethods = budgetRoutes.stack
        .filter(layer => layer.route)
        .map(layer => ({
          path: layer.route.path,
          method: Object.keys(layer.route.methods)[0] // Each route layer has one method
        }));

      // Verify specific method-path combinations exist
      const expectedRoutes = [
        { path: '/overall/:year', method: 'get' },
        { path: '/overall/:year', method: 'put' },
        { path: '/overall', method: 'post' },
        { path: '/recipient/:recipientId/:year', method: 'get' },
        { path: '/recipient/:recipientId/:year', method: 'put' },
        { path: '/recipient', method: 'post' },
        { path: '/analytics/:year', method: 'get' },
        { path: '/all/:year', method: 'get' },
        { path: '/available-years', method: 'get' }
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
      // Test all budget endpoints without authentication
      const endpoints = [
        { path: '/overall/2024', method: 'get' },
        { path: '/overall', method: 'post' },
        { path: '/overall/2024', method: 'put' },
        { path: '/recipient/123/2024', method: 'get' },
        { path: '/recipient', method: 'post' },
        { path: '/recipient/123/2024', method: 'put' },
        { path: '/analytics/2024', method: 'get' },
        { path: '/all/2024', method: 'get' },
        { path: '/available-years', method: 'get' }
      ];
      
      for (const endpoint of endpoints) {
        const response = await request(app)
          [endpoint.method](`/api/budgets${endpoint.path}`)
          .expect('Content-Type', /json/);
        
        expect(response.statusCode).toBe(401);
        expect(response.body).toHaveProperty('message', 'Not authorized, no token');
      }
    });

    it('should return 401 for unauthenticated requests', async () => {
      const response = await request(app)
        .get('/api/budgets/available-years')
        .expect('Content-Type', /json/);
      
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should return 401 for invalid tokens', async () => {
      const response = await request(app)
        .get('/api/budgets/available-years')
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
      budgetController.getAvailableYears.mockImplementation(async (req, res) => {
        res.status(200).json({ success: true, years: [2026] });
      });

      // Act
      const response = await request(app)
        .get('/api/budgets/available-years')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);
      
      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Overall Budget Routes', () => {
    beforeEach(() => {
      // Mock successful authentication for all tests in this group
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
    });

    it('should handle GET /api/budgets/overall/:year', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const year = '2024';
      
      budgetController.getOverallBudget.mockImplementation((req, res) => {
        expect(req.params.year).toBe(year);
        res.status(200).json({ success: true, year: req.params.year });
      });

      // Act
      const response = await request(app)
        .get(`/api/budgets/overall/${year}`)
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      // Assert
      expect(response.body.year).toBe(year);
      expect(budgetController.getOverallBudget).toHaveBeenCalled();
    });

    it('should handle POST /api/budgets/overall', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const budgetData = { year: 2024, totalBudget: 6000 };
      
      budgetController.setOverallBudget.mockImplementation((req, res) => {
        expect(req.body).toEqual(budgetData);
        res.status(201).json({ success: true, created: true });
      });

      // Act
      const response = await request(app)
        .post('/api/budgets/overall')
        .set('Cookie', [`access_token=${token}`])
        .send(budgetData)
        .expect(201);

      // Assert
      expect(response.body.success).toBe(true);
      expect(budgetController.setOverallBudget).toHaveBeenCalled();
    });

    it('should handle PUT /api/budgets/overall/:year', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const year = '2024';
      const updateData = { totalBudget: 7000 };
      
      budgetController.updateOverallBudget.mockImplementation((req, res) => {
        expect(req.params.year).toBe(year);
        expect(req.body).toEqual(updateData);
        res.status(200).json({ success: true, updated: true });
      });

      // Act
      const response = await request(app)
        .put(`/api/budgets/overall/${year}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(budgetController.updateOverallBudget).toHaveBeenCalled();
    });
  });

  describe('Recipient Budget Routes', () => {
    beforeEach(() => {
      // Mock successful authentication for all tests in this group
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
    });

    it('should handle GET /api/budgets/recipient/:recipientId/:year', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const recipientId = '507f191e810c19729de860ea';
      const year = '2024';
      
      budgetController.getRecipientBudget.mockImplementation((req, res) => {
        expect(req.params.recipientId).toBe(recipientId);
        expect(req.params.year).toBe(year);
        res.status(200).json({ success: true, recipientId, year });
      });

      // Act
      const response = await request(app)
        .get(`/api/budgets/recipient/${recipientId}/${year}`)
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      // Assert
      expect(response.body.recipientId).toBe(recipientId);
      expect(response.body.year).toBe(year);
      expect(budgetController.getRecipientBudget).toHaveBeenCalled();
    });

    it('should handle POST /api/budgets/recipient', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const budgetData = { recipientId: '507f191e810c19729de860ea', allocatedBudget: 800 };
      
      budgetController.setRecipientBudget.mockImplementation((req, res) => {
        expect(req.body).toEqual(budgetData);
        res.status(201).json({ success: true, created: true });
      });

      // Act
      const response = await request(app)
        .post('/api/budgets/recipient')
        .set('Cookie', [`access_token=${token}`])
        .send(budgetData)
        .expect(201);

      // Assert
      expect(response.body.success).toBe(true);
      expect(budgetController.setRecipientBudget).toHaveBeenCalled();
    });

    it('should handle PUT /api/budgets/recipient/:recipientId/:year', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const recipientId = '507f191e810c19729de860ea';
      const year = '2024';
      const updateData = { allocatedBudget: 1000 };
      
      budgetController.updateRecipientBudget.mockImplementation((req, res) => {
        expect(req.params.recipientId).toBe(recipientId);
        expect(req.params.year).toBe(year);
        expect(req.body).toEqual(updateData);
        res.status(200).json({ success: true, updated: true });
      });

      // Act
      const response = await request(app)
        .put(`/api/budgets/recipient/${recipientId}/${year}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(budgetController.updateRecipientBudget).toHaveBeenCalled();
    });
  });

  describe('Analytics and Utility Routes', () => {
    beforeEach(() => {
      // Mock successful authentication for all tests in this group
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
    });

    it('should handle GET /api/budgets/analytics/:year', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const year = '2024';
      
      budgetController.getBudgetAnalytics.mockImplementation((req, res) => {
        expect(req.params.year).toBe(year);
        res.status(200).json({ success: true, year });
      });

      // Act
      const response = await request(app)
        .get(`/api/budgets/analytics/${year}`)
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      // Assert
      expect(response.body.year).toBe(year);
      expect(budgetController.getBudgetAnalytics).toHaveBeenCalled();
    });

    it('should handle GET /api/budgets/all/:year', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const year = '2024';
      
      budgetController.getAllBudgets.mockImplementation((req, res) => {
        expect(req.params.year).toBe(year);
        res.status(200).json({ success: true, year });
      });

      // Act
      const response = await request(app)
        .get(`/api/budgets/all/${year}`)
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      // Assert
      expect(response.body.year).toBe(year);
      expect(budgetController.getAllBudgets).toHaveBeenCalled();
    });

    it('should handle GET /api/budgets/available-years', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      budgetController.getAvailableYears.mockImplementation((req, res) => {
        expect(Object.keys(req.params)).toHaveLength(0);
        res.status(200).json({ success: true, years: [2022, 2023, 2024] });
      });

      // Act
      const response = await request(app)
        .get('/api/budgets/available-years')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(budgetController.getAvailableYears).toHaveBeenCalled();
    });
  });
});
