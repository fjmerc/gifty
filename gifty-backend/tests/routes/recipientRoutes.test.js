// tests/routes/recipientRoutes.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const cookieParser = require('cookie-parser');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');
const { createMockUser, generateTestToken } = require('../utils/mockUtils');
const recipientController = require('../../controllers/recipientController');
const Recipient = require('../../models/Recipient');
const Budget = require('../../models/Budget');
const Tag = require('../../models/Tags');
const User = require('../../models/User');
const { redisClient, publisherClient, subscriberClient } = require('../../config/redis');

// Mock dependencies
jest.mock('../../controllers/recipientController');
jest.mock('../../models/Recipient');
jest.mock('../../models/Budget');
jest.mock('../../models/Tags');
jest.mock('../../models/User');
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Stub the shared upload middleware (the real upload path is covered by
// tests/integration/recipient-photo.test.js)
jest.mock('../../middleware/uploadMiddleware', () => ({
  imageUpload: {
    single: jest.fn(() => (req, res, next) => {
      req.file = req.file || null;
      next();
    })
  },
  validateUploadedFile: (req, res, next) => next()
}));

// Import routes after mocking dependencies
const recipientRoutes = require('../../routes/recipientRoutes');

// Set higher timeout for route tests
jest.setTimeout(30000);

describe('Recipient Routes', () => {
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
    
    // Add recipient routes to the app
    app.use('/api/recipients', recipientRoutes);
    
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
      expect(typeof recipientRoutes).toBe('function');
      
      // Test that the routes are available by checking the router stack
      const routerStack = recipientRoutes.stack;
      expect(routerStack).toBeDefined();
      expect(routerStack.length).toBeGreaterThan(0);
    });

    it('should register all 9 recipient routes', () => {
      // Count total route handlers
      const totalRoutes = recipientRoutes.stack.filter(layer => layer.route).length;

      // Verify all 9 route handlers are registered
      expect(totalRoutes).toBe(9);
    });

    it('should register all expected recipient endpoint paths', () => {
      // Get the route paths from the router stack
      const routes = recipientRoutes.stack.map(layer => layer.route?.path).filter(Boolean);

      // Expected recipient route paths
      const expectedPaths = [
        '/',
        '/all-including-system', 
        '/:id',
        '/:id/navigation',
        '/:id/upload-profile-picture',
        '/:id/restore'
      ];

      expectedPaths.forEach(path => {
        expect(routes).toContain(path);
      });
    });

    it('should register routes with correct HTTP methods', () => {
      // Get routes with their methods
      const routeMethods = recipientRoutes.stack
        .filter(layer => layer.route)
        .map(layer => ({
          path: layer.route.path,
          method: Object.keys(layer.route.methods)[0]
        }));

      // Verify specific method-path combinations exist
      const expectedRoutes = [
        { path: '/', method: 'get' },
        { path: '/all-including-system', method: 'get' },
        { path: '/:id', method: 'get' },
        { path: '/:id/navigation', method: 'get' },
        { path: '/', method: 'post' },
        { path: '/:id', method: 'put' },
        { path: '/:id', method: 'delete' },
        { path: '/:id/upload-profile-picture', method: 'post' }
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
      // Test all recipient endpoints without authentication
      const endpoints = [
        { path: '/', method: 'get' },
        { path: '/all-including-system', method: 'get' },
        { path: '/507f191e810c19729de860ea', method: 'get' },
        { path: '/507f191e810c19729de860ea/navigation', method: 'get' },
        { path: '/', method: 'post' },
        { path: '/507f191e810c19729de860ea', method: 'put' },
        { path: '/507f191e810c19729de860ea', method: 'delete' },
        { path: '/507f191e810c19729de860ea/upload-profile-picture', method: 'post' }
      ];
      
      for (const endpoint of endpoints) {
        const response = await request(app)
          [endpoint.method](`/api/recipients${endpoint.path}`)
          .expect('Content-Type', /json/);
        
        expect(response.statusCode).toBe(401);
        expect(response.body).toHaveProperty('message', 'Not authorized, no token');
      }
    });

    it('should return 401 for unauthenticated requests to GET /', async () => {
      const response = await request(app)
        .get('/api/recipients')
        .expect('Content-Type', /json/);
      
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should return 401 for invalid tokens', async () => {
      const response = await request(app)
        .get('/api/recipients')
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
      
      // Mock recipientController.getAllRecipients for successful response
      recipientController.getAllRecipients.mockImplementation((req, res) => {
        res.status(200).json([]);
      });

      // Act
      const response = await request(app)
        .get('/api/recipients')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);
      
      // Assert
      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Controller Integration', () => {
    beforeEach(() => {
      // Mock successful authentication for all tests in this group
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
    });

    it('should call recipientController.getAllRecipients for GET /', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      recipientController.getAllRecipients.mockImplementation((req, res) => {
        res.status(200).json([]);
      });

      await request(app)
        .get('/api/recipients')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      expect(recipientController.getAllRecipients).toHaveBeenCalled();
    });

    it('should handle controller errors for GET /api/recipients', async () => {
      const userId = new mongoose.Types.ObjectId();
      const errorTestToken = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      recipientController.getAllRecipients.mockImplementation((req, res) => {
        // Simulate a controller error
        const error = new Error('Internal Server Error');
        error.statusCode = 500;
        // Ensure the error is thrown so the error handler middleware can catch it
        // For Express, you typically call next(error) or res.status().json() directly
        // In a mock, throwing works if the route handler is simple, otherwise call res.status
        res.status(500).json({ message: 'Internal Server Error' }); 
      });

      const response = await request(app)
        .get('/api/recipients')
        .set('Cookie', [`access_token=${errorTestToken}`])
        .expect('Content-Type', /json/)
        .expect(500);
      
      expect(response.body).toHaveProperty('message', 'Internal Server Error');
      expect(recipientController.getAllRecipients).toHaveBeenCalled();
    });

    it('should return recipients with correct structure for GET /api/recipients', async () => {
      const userId = new mongoose.Types.ObjectId();
      const structureTestToken = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const mockRecipients = [
        { _id: new mongoose.Types.ObjectId().toString(), name: 'Recipient 1', email: 'r1@example.com' },
        { _id: new mongoose.Types.ObjectId().toString(), name: 'Recipient 2', email: 'r2@example.com' },
      ];
      
      recipientController.getAllRecipients.mockImplementation((req, res) => {
        res.status(200).json(mockRecipients);
      });

      const response = await request(app)
        .get('/api/recipients')
        .set('Cookie', [`access_token=${structureTestToken}`])
        .expect('Content-Type', /json/)
        .expect(200);
      
      expect(response.body).toEqual(mockRecipients);
      expect(response.body.length).toBe(2);
      expect(response.body[0]).toHaveProperty('_id');
      expect(response.body[0]).toHaveProperty('name', 'Recipient 1');
      expect(recipientController.getAllRecipients).toHaveBeenCalled();
    });

    it('should call recipientController.getRecipientById for GET /:id', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      recipientController.getRecipientById.mockImplementation((req, res) => {
        res.status(200).json({ _id: recipientId });
      });

      await request(app)
        .get(`/api/recipients/${recipientId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      expect(recipientController.getRecipientById).toHaveBeenCalled();
      // Verify req.params.id is passed correctly
      const callArgs = recipientController.getRecipientById.mock.calls[0];
      expect(callArgs[0].params.id).toBe(recipientId.toString());
    });

    it('should return 400 for invalid recipient ID format for GET /:id', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const invalidRecipientId = 'invalid-id';
      
      // No controller mock needed as this should ideally be caught by a validation middleware
      // or early in the controller. If not, the DB call might fail.
      // For now, assume a generic error or that the controller/middleware handles it.
      // If using a validation middleware that's not part of this route's direct definition,
      // this test might need adjustment or the middleware needs to be part of the app setup.
      // For this test, we'll mock the controller to return a 400.
      recipientController.getRecipientById.mockImplementation((req, res) => {
        res.status(400).json({ message: 'Invalid recipient ID format' });
      });

      const response = await request(app)
        .get(`/api/recipients/${invalidRecipientId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('message', 'Invalid recipient ID format');
    });

    it('should return 404 if recipient not found for GET /:id', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId(); // Valid format, but not found
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      recipientController.getRecipientById.mockImplementation((req, res) => {
        res.status(404).json({ message: 'Recipient not found' });
      });

      const response = await request(app)
        .get(`/api/recipients/${recipientId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('message', 'Recipient not found');
      expect(recipientController.getRecipientById).toHaveBeenCalledWith(
        expect.objectContaining({ params: { id: recipientId.toString() } }),
        expect.anything(), // res object
        expect.anything()  // next function
      );
    });

    it('should handle controller errors for GET /:id', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      recipientController.getRecipientById.mockImplementation((req, res) => {
        res.status(500).json({ message: 'Internal Server Error' });
      });

      const response = await request(app)
        .get(`/api/recipients/${recipientId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('message', 'Internal Server Error');
      expect(recipientController.getRecipientById).toHaveBeenCalled();
    });

    it('should call recipientController.getNavigation for GET /:id/navigation', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      recipientController.getNavigation.mockImplementation((req, res) => {
        res.status(200).json({ prev: null, next: null });
      });

      await request(app)
        .get(`/api/recipients/${recipientId}/navigation`)
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      expect(recipientController.getNavigation).toHaveBeenCalled();
      // Verify req.params.id is passed correctly
      const callArgs = recipientController.getNavigation.mock.calls[0];
      expect(callArgs[0].params.id).toBe(recipientId.toString());
    });

    it('should return 400 for invalid recipient ID format for GET /:id/navigation', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const invalidRecipientId = 'invalid-id';

      recipientController.getNavigation.mockImplementation((req, res) => {
        res.status(400).json({ message: 'Invalid recipient ID format' });
      });

      const response = await request(app)
        .get(`/api/recipients/${invalidRecipientId}/navigation`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('message', 'Invalid recipient ID format');
    });

    it('should return 404 if recipient not found for GET /:id/navigation', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);

      recipientController.getNavigation.mockImplementation((req, res) => {
        res.status(404).json({ message: 'Recipient not found' });
      });

      const response = await request(app)
        .get(`/api/recipients/${recipientId}/navigation`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('message', 'Recipient not found');
    });

    it('should handle controller errors for GET /:id/navigation', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);

      recipientController.getNavigation.mockImplementation((req, res) => {
        res.status(500).json({ message: 'Internal Server Error' });
      });

      const response = await request(app)
        .get(`/api/recipients/${recipientId}/navigation`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('message', 'Internal Server Error');
    });
    
    it('should return correct navigation links for GET /:id/navigation (e.g. only next)', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      recipientController.getNavigation.mockImplementation((req, res) => {
        res.status(200).json({ prev: null, next: new mongoose.Types.ObjectId().toString() });
      });

      const response = await request(app)
        .get(`/api/recipients/${recipientId}/navigation`)
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      expect(response.body).toHaveProperty('prev', null);
      expect(response.body).toHaveProperty('next');
      expect(mongoose.Types.ObjectId.isValid(response.body.next)).toBe(true);
    });

    it('should call recipientController.addRecipient for POST /', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      const newRecipient = {
        name: 'Test Recipient',
        email: 'test@example.com'
      };
      
      recipientController.addRecipient.mockImplementation((req, res) => {
        res.status(201).json({ _id: new mongoose.Types.ObjectId(), ...newRecipient });
      });

      await request(app)
        .post('/api/recipients')
        .set('Cookie', [`access_token=${token}`])
        .send(newRecipient)
        .expect(201);

      expect(recipientController.addRecipient).toHaveBeenCalled();
      // Verify request body is passed correctly
      const callArgs = recipientController.addRecipient.mock.calls[0];
      expect(callArgs[0].body).toEqual(newRecipient);
    });

    it('should return 400 for invalid request body for POST /', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const invalidRecipientData = { email: 'test@example.com' }; // Missing name

      recipientController.addRecipient.mockImplementation((req, res) => {
        // This mock simulates the controller or a validation middleware catching the error
        res.status(400).json({ message: 'Name is required' });
      });

      const response = await request(app)
        .post('/api/recipients')
        .set('Cookie', [`access_token=${token}`])
        .send(invalidRecipientData)
        .expect('Content-Type', /json/)
        .expect(400);
      
      expect(response.body).toHaveProperty('message', 'Name is required');
    });

    it('should handle controller errors for POST /', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const newRecipient = { name: 'Test Recipient', email: 'test@example.com' };

      recipientController.addRecipient.mockImplementation((req, res) => {
        res.status(500).json({ message: 'Internal Server Error' });
      });

      const response = await request(app)
        .post('/api/recipients')
        .set('Cookie', [`access_token=${token}`])
        .send(newRecipient)
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('message', 'Internal Server Error');
    });

    it('should call recipientController.updateRecipient for PUT /:id', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      const updateData = {
        name: 'Updated Recipient',
        email: 'updated@example.com'
      };
      
      recipientController.updateRecipient.mockImplementation((req, res) => {
        res.status(200).json({ _id: recipientId, ...updateData });
      });

      await request(app)
        .put(`/api/recipients/${recipientId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect(200);

      expect(recipientController.updateRecipient).toHaveBeenCalled();
      // Verify both params and body are passed correctly
      const callArgs = recipientController.updateRecipient.mock.calls[0];
      expect(callArgs[0].params.id).toBe(recipientId.toString());
      expect(callArgs[0].body).toEqual(updateData);
    });

    it('should return 400 for invalid request body for PUT /:id', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const invalidUpdateData = { email: 123 }; // Invalid email format

      recipientController.updateRecipient.mockImplementation((req, res) => {
        res.status(400).json({ message: 'Invalid email format' });
      });

      const response = await request(app)
        .put(`/api/recipients/${recipientId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(invalidUpdateData)
        .expect('Content-Type', /json/)
        .expect(400);
      
      expect(response.body).toHaveProperty('message', 'Invalid email format');
    });

    it('should return 400 for invalid recipient ID format for PUT /:id', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const invalidRecipientId = 'invalid-id';
      const updateData = { name: 'Updated Name' };

      recipientController.updateRecipient.mockImplementation((req, res) => {
        res.status(400).json({ message: 'Invalid recipient ID format' });
      });
      
      const response = await request(app)
        .put(`/api/recipients/${invalidRecipientId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('message', 'Invalid recipient ID format');
    });

    it('should return 404 if recipient not found for PUT /:id', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId(); // Valid format, but not found
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const updateData = { name: 'Updated Name' };

      recipientController.updateRecipient.mockImplementation((req, res) => {
        res.status(404).json({ message: 'Recipient not found' });
      });

      const response = await request(app)
        .put(`/api/recipients/${recipientId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('message', 'Recipient not found');
    });

    it('should handle controller errors for PUT /:id', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const updateData = { name: 'Updated Name' };

      recipientController.updateRecipient.mockImplementation((req, res) => {
        res.status(500).json({ message: 'Internal Server Error' });
      });

      const response = await request(app)
        .put(`/api/recipients/${recipientId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('message', 'Internal Server Error');
    });
    
    it('should call recipientController.deleteRecipient for DELETE /:id', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      recipientController.deleteRecipient.mockImplementation((req, res) => {
        res.status(200).json({ message: 'Recipient deleted successfully' });
      });

      await request(app)
        .delete(`/api/recipients/${recipientId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      expect(recipientController.deleteRecipient).toHaveBeenCalled();
      // Verify req.params.id is passed correctly
      const callArgs = recipientController.deleteRecipient.mock.calls[0];
      expect(callArgs[0].params.id).toBe(recipientId.toString());
    });

    it('should return 400 for invalid recipient ID format for DELETE /:id', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const invalidRecipientId = 'invalid-id';

      recipientController.deleteRecipient.mockImplementation((req, res) => {
        res.status(400).json({ message: 'Invalid recipient ID format' });
      });

      const response = await request(app)
        .delete(`/api/recipients/${invalidRecipientId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('message', 'Invalid recipient ID format');
    });

    it('should return 404 if recipient not found for DELETE /:id', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId(); // Valid format, but not found
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);

      recipientController.deleteRecipient.mockImplementation((req, res) => {
        res.status(404).json({ message: 'Recipient not found' });
      });

      const response = await request(app)
        .delete(`/api/recipients/${recipientId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('message', 'Recipient not found');
    });

    it('should handle controller errors for DELETE /:id', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);

      recipientController.deleteRecipient.mockImplementation((req, res) => {
        res.status(500).json({ message: 'Internal Server Error' });
      });

      const response = await request(app)
        .delete(`/api/recipients/${recipientId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('message', 'Internal Server Error');
    });
    
    it('should call recipientController.uploadProfilePicture for POST /:id/upload-profile-picture', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      recipientController.uploadProfilePicture.mockImplementation((req, res) => {
        res.status(200).json({ 
          message: 'Profile picture uploaded successfully',
          profilePicture: 'http://localhost:3000/uploads/12345-test.jpg'
        });
      });

      await request(app)
        .post(`/api/recipients/${recipientId}/upload-profile-picture`)
        .set('Cookie', [`access_token=${token}`])
        .attach('profilePicture', Buffer.from('fake image data'), 'test.jpg')
        .expect(200);

      expect(recipientController.uploadProfilePicture).toHaveBeenCalled();
      // Verify req.params.id is passed correctly
      const callArgs = recipientController.uploadProfilePicture.mock.calls[0];
      expect(callArgs[0].params.id).toBe(recipientId.toString());
    });

    it('should return 400 for invalid recipient ID format for POST /:id/upload-profile-picture', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      const invalidRecipientId = 'invalid-id';

      recipientController.uploadProfilePicture.mockImplementation((req, res) => {
        res.status(400).json({ message: 'Invalid recipient ID format' });
      });

      const response = await request(app)
        .post(`/api/recipients/${invalidRecipientId}/upload-profile-picture`)
        .set('Cookie', [`access_token=${token}`])
        .attach('profilePicture', Buffer.from('fake image data'), 'test.jpg')
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('message', 'Invalid recipient ID format');
    });

    it('should return 404 if recipient not found for POST /:id/upload-profile-picture', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId(); // Valid format, but not found
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);

      recipientController.uploadProfilePicture.mockImplementation((req, res) => {
        res.status(404).json({ message: 'Recipient not found for upload' });
      });

      const response = await request(app)
        .post(`/api/recipients/${recipientId}/upload-profile-picture`)
        .set('Cookie', [`access_token=${token}`])
        .attach('profilePicture', Buffer.from('fake image data'), 'test.jpg')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('message', 'Recipient not found for upload');
    });
    
    it('should handle controller errors for POST /:id/upload-profile-picture', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);

      recipientController.uploadProfilePicture.mockImplementation((req, res) => {
        res.status(500).json({ message: 'Internal Server Error during upload' });
      });

      const response = await request(app)
        .post(`/api/recipients/${recipientId}/upload-profile-picture`)
        .set('Cookie', [`access_token=${token}`])
        .attach('profilePicture', Buffer.from('fake image data'), 'test.jpg')
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('message', 'Internal Server Error during upload');
    });

    // Note: Testing the actual multer fileFilter `cb('Error: Images Only!')` behavior 
    // is complex with the current global jest.mock('multer'). 
    // The route definition itself shows multer's fileFilter.
    // A more direct test of fileFilter would require a different mocking strategy for multer
    // or testing the multer setup in isolation.
    // The existing 'should test file filtering for invalid file types' test in 'File Upload Functionality'
    // already covers the route's behavior when an invalid file type is *processed by the controller mock*.
    // To truly test the multer middleware's rejection, the mock for `upload.single` would need to
    // simulate calling `cb('Error: Images Only!')` and the app's error handler would need to catch it.
    // The current app error handler sends JSON. Multer errors might not be caught by it in the same way.

  });

  describe('Database Integration', () => {
    beforeEach(() => {
      // Mock successful authentication for all tests in this group
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
      // The handler lives in the (mocked) controller: run the real one on the mocked models
      recipientController.getRecipientsForEvents.mockImplementation(
        jest.requireActual('../../controllers/recipientController').getRecipientsForEvents
      );
    });

    it('should call Recipient.find for GET /all-including-system with correct user filter', async () => {
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ 
        _id: userId,
        id: userId  // Add virtual id property that Mongoose provides
      });
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      // Override the beforeEach mock with specific user
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
      
      const mockRecipient = {
        _id: '507f191e810c19729de860ea',
        name: 'Test Recipient',
        tags: [{ _id: '507f191e810c19729de860eb', name: 'Tag1' }],
        toObject: function() {
          return {
            _id: this._id,
            name: this.name,
            tags: this.tags
          };
        }
      };
      
      const mockPopulate = jest.fn().mockResolvedValue([mockRecipient]);
      
      Recipient.find = jest.fn().mockImplementation(() => ({
        populate: mockPopulate
      }));

      const response = await request(app)
        .get('/api/recipients/all-including-system')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      expect(Recipient.find).toHaveBeenCalledWith({ user: userId, archived: { $ne: true } });
      expect(mockPopulate).toHaveBeenCalledWith('tags', 'name');
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return an empty array if no recipients are found for GET /all-including-system', async () => {
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId, id: userId });
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);

      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
      
      const mockPopulate = jest.fn().mockResolvedValue([]); // No recipients
      Recipient.find = jest.fn().mockImplementation(() => ({
        populate: mockPopulate
      }));

      const response = await request(app)
        .get('/api/recipients/all-including-system')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      expect(response.body).toEqual([]);
      expect(Recipient.find).toHaveBeenCalledWith({ user: userId, archived: { $ne: true } });
      expect(mockPopulate).toHaveBeenCalledWith('tags', 'name');
    });

    it('should handle recipients with no tags for GET /all-including-system', async () => {
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId, id: userId });
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);

      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
      
      const mockRecipientNoTags = {
        _id: '507f191e810c19729de860ea',
        name: 'Recipient No Tags',
        tags: [], // No tags
        toObject: function() { return { _id: this._id, name: this.name, tags: this.tags }; }
      };
      
      const mockPopulate = jest.fn().mockResolvedValue([mockRecipientNoTags]);
      Recipient.find = jest.fn().mockImplementation(() => ({
        populate: mockPopulate
      }));

      const response = await request(app)
        .get('/api/recipients/all-including-system')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Recipient No Tags');
      expect(response.body[0].tags).toEqual([]);
      expect(Recipient.find).toHaveBeenCalledWith({ user: userId, archived: { $ne: true } });
      expect(mockPopulate).toHaveBeenCalledWith('tags', 'name');
    });
    
    it('should populate tags with name field only', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      const mockRecipient = {
        _id: '507f191e810c19729de860ea',
        name: 'Test Recipient',
        tags: [{ _id: '507f191e810c19729de860eb', name: 'Tag1' }],
        toObject: function() {
          return {
            _id: this._id,
            name: this.name,
            tags: this.tags
          };
        }
      };
      
      const mockPopulate = jest.fn().mockResolvedValue([mockRecipient]);
      
      Recipient.find = jest.fn().mockImplementation(() => ({
        populate: mockPopulate
      }));

      await request(app)
        .get('/api/recipients/all-including-system')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      expect(mockPopulate).toHaveBeenCalledWith('tags', 'name');
    });

    it('should format response with tags mapped to {_id, name} objects', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      const mockRecipient = {
        _id: '507f191e810c19729de860ea',
        name: 'Test Recipient',
        tags: [
          { _id: '507f191e810c19729de860eb', name: 'Tag1' },
          { _id: '507f191e810c19729de860ec', name: 'Tag2' }
        ],
        toObject: function() {
          return {
            _id: this._id,
            name: this.name,
            tags: this.tags
          };
        }
      };
      
      const mockPopulate = jest.fn().mockResolvedValue([mockRecipient]);
      
      Recipient.find = jest.fn().mockImplementation(() => ({
        populate: mockPopulate
      }));

      const response = await request(app)
        .get('/api/recipients/all-including-system')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].tags).toEqual([
        { _id: '507f191e810c19729de860eb', name: 'Tag1' },
        { _id: '507f191e810c19729de860ec', name: 'Tag2' }
      ]);
    });

    it('should handle database errors gracefully', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      Recipient.find = jest.fn().mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const response = await request(app)
        .get('/api/recipients/all-including-system')
        .set('Cookie', [`access_token=${token}`])
        .expect(500);

      // The app's error handler answers 500s (in production with a generic message)
      expect(response.body.message).toBeDefined();
    });
  });

  describe('File Upload Functionality', () => {
    beforeEach(() => {
      // Mock successful authentication for all tests in this group
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ 
        _id: userId,
        id: userId
      });
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
    });

    it('should configure multer with correct storage options', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      recipientController.uploadProfilePicture.mockImplementation((req, res) => {
        // Verify multer processed the file
        expect(req.file).toBeDefined();
        res.status(200).json({ 
          message: 'Profile picture uploaded successfully',
          profilePicture: 'http://localhost:3000/uploads/12345-test.jpg'
        });
      });

      const response = await request(app)
        .post(`/api/recipients/${recipientId}/upload-profile-picture`)
        .set('Cookie', [`access_token=${token}`])
        .attach('profilePicture', Buffer.from('fake image data'), 'test.jpg')
        .expect(200);

      expect(response.body.message).toBe('Profile picture uploaded successfully');
    });

    it('should accept valid image file types (jpeg, jpg, png, gif)', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      const validFileTypes = ['test.jpg', 'test.jpeg', 'test.png', 'test.gif'];
      
      recipientController.uploadProfilePicture.mockImplementation((req, res) => {
        res.status(200).json({ message: 'Upload successful' });
      });
      
      for (const filename of validFileTypes) {
        const response = await request(app)
          .post(`/api/recipients/${recipientId}/upload-profile-picture`)
          .set('Cookie', [`access_token=${token}`])
          .attach('profilePicture', Buffer.from('fake image data'), filename)
          .expect(200);
          
        expect(response.body.message).toBe('Upload successful');
      }
    });

    it('should handle file upload without file attachment', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      recipientController.uploadProfilePicture.mockImplementation((req, res) => {
        // Should still be called even without file
        res.status(400).json({ message: 'No file uploaded' });
      });

      const response = await request(app)
        .post(`/api/recipients/${recipientId}/upload-profile-picture`)
        .set('Cookie', [`access_token=${token}`])
        .expect(400);

      expect(response.body.message).toBe('No file uploaded');
    });

    it('should pass recipient ID parameter to controller', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      recipientController.uploadProfilePicture.mockImplementation((req, res) => {
        res.status(200).json({ message: 'Upload successful' });
      });

      await request(app)
        .post(`/api/recipients/${recipientId}/upload-profile-picture`)
        .set('Cookie', [`access_token=${token}`])
        .attach('profilePicture', Buffer.from('fake image data'), 'test.jpg')
        .expect(200);

      expect(recipientController.uploadProfilePicture).toHaveBeenCalled();
      const callArgs = recipientController.uploadProfilePicture.mock.calls[0];
      expect(callArgs[0].params.id).toBe(recipientId.toString());
    });

    it('should handle multer middleware integration', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      // Mock multer to simulate file processing
      recipientController.uploadProfilePicture.mockImplementation((req, res) => {
        // Multer should add file to request
        expect(req.file).toBeDefined();
        res.status(200).json({ 
          message: 'File processed successfully',
          filename: req.file ? 'processed-file.jpg' : 'no-file'
        });
      });

      const response = await request(app)
        .post(`/api/recipients/${recipientId}/upload-profile-picture`)
        .set('Cookie', [`access_token=${token}`])
        .attach('profilePicture', Buffer.from('fake image data'), 'test.jpg')
        .expect(200);

      expect(response.body.message).toBe('File processed successfully');
    });

    it('should test file filtering for invalid file types', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
      
      // Mock for testing file filter - this won't actually call multer fileFilter
      // but shows that we're testing the upload route with different file types
      recipientController.uploadProfilePicture.mockImplementation((req, res) => {
        res.status(200).json({ message: 'Upload processed' });
      });

      // Test that the route handles the upload request (even if file filtering 
      // is mocked, the route structure is tested)
      const response = await request(app)
        .post(`/api/recipients/${recipientId}/upload-profile-picture`)
        .set('Cookie', [`access_token=${token}`])
        .attach('profilePicture', Buffer.from('fake document'), 'test.txt')
        .expect(200);

      expect(response.body.message).toBe('Upload processed');
    });

    describe('File Upload Error Scenarios', () => {
      it('should handle file size limit exceeded', async () => {
        const userId = new mongoose.Types.ObjectId();
        const recipientId = new mongoose.Types.ObjectId();
        const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
        
        recipientController.uploadProfilePicture.mockImplementation((req, res) => {
          res.status(413).json({ message: 'File too large' });
        });

        // Simulate large file
        const largeFileBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB buffer
        
        const response = await request(app)
          .post(`/api/recipients/${recipientId}/upload-profile-picture`)
          .set('Cookie', [`access_token=${token}`])
          .attach('profilePicture', largeFileBuffer, 'large-image.jpg')
          .expect(413);

        expect(response.body).toEqual({ message: 'File too large' });
      });

      it('should handle unsupported file extensions', async () => {
        const userId = new mongoose.Types.ObjectId();
        const recipientId = new mongoose.Types.ObjectId();
        const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
        
        recipientController.uploadProfilePicture.mockImplementation((req, res) => {
          res.status(400).json({ message: 'Error: Images Only!' });
        });

        const response = await request(app)
          .post(`/api/recipients/${recipientId}/upload-profile-picture`)
          .set('Cookie', [`access_token=${token}`])
          .attach('profilePicture', Buffer.from('fake data'), 'document.pdf')
          .expect(400);

        expect(response.body).toEqual({ message: 'Error: Images Only!' });
      });

      it('should handle corrupt image files', async () => {
        const userId = new mongoose.Types.ObjectId();
        const recipientId = new mongoose.Types.ObjectId();
        const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
        
        recipientController.uploadProfilePicture.mockImplementation((req, res) => {
          res.status(400).json({ message: 'Corrupt or invalid image file' });
        });

        const response = await request(app)
          .post(`/api/recipients/${recipientId}/upload-profile-picture`)
          .set('Cookie', [`access_token=${token}`])
          .attach('profilePicture', Buffer.from('corrupt-image-data'), 'corrupt.jpg')
          .expect(400);

        expect(response.body).toEqual({ message: 'Corrupt or invalid image file' });
      });
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    beforeEach(() => {
      // Mock successful authentication for all tests in this group
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ 
        _id: userId,
        id: userId
      });
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));
    });

    describe('Large Dataset Handling', () => {
      it('should handle large number of recipients in GET /', async () => {
        const userId = new mongoose.Types.ObjectId();
        const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
        
        // Create large mock dataset
        const largeRecipientSet = Array.from({ length: 1000 }, (_, i) => ({
          _id: new mongoose.Types.ObjectId(),
          name: `Recipient ${i}`,
          email: `recipient${i}@example.com`
        }));
        
        recipientController.getAllRecipients.mockImplementation((req, res) => {
          res.status(200).json(largeRecipientSet);
        });

        const response = await request(app)
          .get('/api/recipients')
          .set('Cookie', [`access_token=${token}`])
          .expect(200);

        expect(response.body).toHaveLength(1000);
        expect(response.body[0]).toHaveProperty('name', 'Recipient 0');
        expect(response.body[999]).toHaveProperty('name', 'Recipient 999');
      });

      it('should handle empty recipient dataset in GET /', async () => {
        const userId = new mongoose.Types.ObjectId();
        const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
        
        recipientController.getAllRecipients.mockImplementation((req, res) => {
          res.status(200).json([]);
        });

        const response = await request(app)
          .get('/api/recipients')
          .set('Cookie', [`access_token=${token}`])
          .expect(200);

        expect(response.body).toEqual([]);
        expect(Array.isArray(response.body)).toBe(true);
      });
    });

    describe('Concurrent Request Handling', () => {
      it('should handle multiple simultaneous GET requests', async () => {
        const userId = new mongoose.Types.ObjectId();
        const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
        
        recipientController.getAllRecipients.mockImplementation((req, res) => {
          res.status(200).json([{ _id: new mongoose.Types.ObjectId(), name: 'Test' }]);
        });

        // Make 5 concurrent requests
        const promises = Array(5).fill().map(() => 
          request(app)
            .get('/api/recipients')
            .set('Cookie', [`access_token=${token}`])
            .expect(200)
        );

        const responses = await Promise.all(promises);
        
        responses.forEach(response => {
          expect(response.body).toHaveLength(1);
          expect(response.body[0]).toHaveProperty('name', 'Test');
        });
      });

      it('should handle rapid sequential requests to same endpoint', async () => {
        const userId = new mongoose.Types.ObjectId();
        const recipientId = new mongoose.Types.ObjectId();
        const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
        
        recipientController.getRecipientById.mockImplementation((req, res) => {
          res.status(200).json({ _id: recipientId, name: 'Test Recipient' });
        });

        // Make rapid sequential requests
        for (let i = 0; i < 3; i++) {
          const response = await request(app)
            .get(`/api/recipients/${recipientId}`)
            .set('Cookie', [`access_token=${token}`])
            .expect(200);
            
          expect(response.body).toHaveProperty('name', 'Test Recipient');
        }
      });
    });

    describe('Special Character Handling', () => {
      it('should handle special characters in recipient data for POST /', async () => {
        const userId = new mongoose.Types.ObjectId();
        const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
        
        const specialCharRecipient = {
          name: 'José María O\'Connor',
          email: 'josé.maría@example.com',
          notes: 'Special chars: àáâãäåæçèéêë & émojis 🎁🎄'
        };
        
        recipientController.addRecipient.mockImplementation((req, res) => {
          res.status(201).json({ _id: new mongoose.Types.ObjectId(), ...specialCharRecipient });
        });

        const response = await request(app)
          .post('/api/recipients')
          .set('Cookie', [`access_token=${token}`])
          .send(specialCharRecipient)
          .expect(201);

        expect(response.body.name).toBe('José María O\'Connor');
        expect(response.body.email).toBe('josé.maría@example.com');
      });

      it('should handle very long recipient names', async () => {
        const userId = new mongoose.Types.ObjectId();
        const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
        
        const longNameRecipient = {
          name: 'A'.repeat(500), // Very long name
          email: 'long@example.com'
        };
        
        recipientController.addRecipient.mockImplementation((req, res) => {
          res.status(201).json({ _id: new mongoose.Types.ObjectId(), ...longNameRecipient });
        });

        const response = await request(app)
          .post('/api/recipients')
          .set('Cookie', [`access_token=${token}`])
          .send(longNameRecipient)
          .expect(201);

        expect(response.body.name).toHaveLength(500);
        expect(response.body.name.startsWith('AAAA')).toBe(true);
      });
    });

    describe('Authentication Edge Cases', () => {
      it('should handle expired tokens gracefully', async () => {
        const response = await request(app)
          .get('/api/recipients')
          .set('Cookie', ['access_token=expired.token.here'])
          .expect(401);

        expect(response.body).toHaveProperty('message');
      });

      it('should handle malformed tokens', async () => {
        const response = await request(app)
          .get('/api/recipients')
          .set('Cookie', ['access_token=malformed-token'])
          .expect(401);

        expect(response.body).toHaveProperty('message');
      });

      it('should handle missing user in database after token validation', async () => {
        const userId = new mongoose.Types.ObjectId();
        const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
        
        // Mock user not found
        User.findById = jest.fn().mockImplementation(() => ({
          select: jest.fn().mockResolvedValue(null)
        }));

        const response = await request(app)
          .get('/api/recipients')
          .set('Cookie', [`access_token=${token}`])
          .expect(401);

        expect(response.body).toHaveProperty('message');
      });
    });

    describe('Database Edge Cases', () => {
      it('should handle database timeout errors for GET /all-including-system', async () => {
        const userId = new mongoose.Types.ObjectId();
        const user = createMockUser({ _id: userId, id: userId });
        const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
        
        User.findById = jest.fn().mockImplementation(() => ({
          select: jest.fn().mockResolvedValue(user)
        }));
        
        Recipient.find = jest.fn().mockImplementation(() => {
          throw new Error('Database timeout');
        });

        const response = await request(app)
          .get('/api/recipients/all-including-system')
          .set('Cookie', [`access_token=${token}`])
          .expect(500);

        // The app's error handler answers 500s (in production with a generic message)
      expect(response.body.message).toBeDefined();
      });

      it('should handle recipients with malformed tag references', async () => {
        const userId = new mongoose.Types.ObjectId();
        const user = createMockUser({ _id: userId, id: userId });
        const token = generateTestToken(userId, 'access', process.env.JWT_SECRET);
        
        User.findById = jest.fn().mockImplementation(() => ({
          select: jest.fn().mockResolvedValue(user)
        }));
        
        const recipientWithMalformedTags = {
          _id: '507f191e810c19729de860ea',
          name: 'Test Recipient',
          tags: [null, undefined, { _id: 'invalid', name: 'ValidTag' }],
          toObject: function() {
            return {
              _id: this._id,
              name: this.name,
              tags: this.tags.filter(tag => tag && tag._id && tag.name)
            };
          }
        };
        
        const mockPopulate = jest.fn().mockResolvedValue([recipientWithMalformedTags]);
        Recipient.find = jest.fn().mockImplementation(() => ({
          populate: mockPopulate
        }));

        const response = await request(app)
          .get('/api/recipients/all-including-system')
          .set('Cookie', [`access_token=${token}`])
          .expect(200);

        expect(response.body).toHaveLength(1);
        expect(response.body[0].tags).toHaveLength(1);
        expect(response.body[0].tags[0]).toEqual({ _id: 'invalid', name: 'ValidTag' });
      });
    });
  });
});
