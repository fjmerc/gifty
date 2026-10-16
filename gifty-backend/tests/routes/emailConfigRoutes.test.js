// tests/routes/emailConfigRoutes.test.js
const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const emailConfigRoutes = require('../../routes/emailConfigRoutes');
const emailConfigController = require('../../controllers/emailConfigController');
const { protect } = require('../../middleware/authMiddleware');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');
const { createMockUser, generateTestToken } = require('../utils/mockUtils');

// Mock dependencies BEFORE imports to prevent external connections
jest.mock('../../controllers/emailConfigController', () => ({
  getUserEmailConfig: jest.fn(),
  createUpdateEmailConfig: jest.fn(),
  testEmailConfig: jest.fn(),
  deleteEmailConfig: jest.fn()
}));

jest.mock('../../middleware/authMiddleware', () => ({
  protect: jest.fn()
}));

jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Set higher timeout for route tests
jest.setTimeout(30000);

describe('Email Config Routes', () => {
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
    
    // Add email config routes to the app
    app.use('/api/email-config', emailConfigRoutes);
    
    // Set up error handler - must be after routes
    app.use((err, req, res, next) => {
      const statusCode = err.statusCode || 500;
      res.status(statusCode);
      res.json({ message: err.message });
    });
  });

  afterEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await teardownTestDB();
    process.env = originalEnv;
  });

  describe('Router Registration', () => {
    it('should export a valid Express router', () => {
      expect(typeof emailConfigRoutes).toBe('function');
      expect(emailConfigRoutes.stack).toBeDefined();
    });

    it('should register all email config routes', () => {
      const routeCount = emailConfigRoutes.stack.length;
      expect(routeCount).toBe(3); // router.use(protect) + router.route('/') + router.post('/test')
    });

    it('should register routes with correct HTTP methods', () => {
      // Find the route layer that contains actual routes (skip middleware layers)
      const routeLayers = emailConfigRoutes.stack.filter(layer => layer.route);
      
      const routes = routeLayers.map(layer => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods)
      }));

      // Verify specific routes and methods exist
      expect(routes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: '/', methods: expect.arrayContaining(['get', 'post', 'delete']) }),
          expect.objectContaining({ path: '/test', methods: ['post'] })
        ])
      );
    });

    it('should have authentication protection configured', () => {
      // Check that protect middleware is used at router level
      const middlewareLayers = emailConfigRoutes.stack.filter(layer => !layer.route);
      expect(middlewareLayers.length).toBeGreaterThan(0);
    });
  });

  describe('Authentication Protection', () => {
    beforeEach(() => {
      // Mock protect middleware to simulate unauthenticated request
      protect.mockImplementation((req, res, next) => {
        res.status(401).json({ message: 'Not authorized, no token' });
      });
    });

    it('should protect GET / route with authentication middleware', async () => {
      const response = await request(app)
        .get('/api/email-config/')
        .expect(401);
      
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should protect POST / route with authentication middleware', async () => {
      const response = await request(app)
        .post('/api/email-config/')
        .send({
          service: 'gmail',
          username: 'test@gmail.com',
          password: 'testpass'
        })
        .expect(401);
      
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should protect DELETE / route with authentication middleware', async () => {
      const response = await request(app)
        .delete('/api/email-config/')
        .expect(401);
      
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should protect POST /test route with authentication middleware', async () => {
      const response = await request(app)
        .post('/api/email-config/test')
        .expect(401);
      
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should test all protected endpoints in bulk', async () => {
      const endpoints = [
        { method: 'get', path: '/' },
        { method: 'post', path: '/' },
        { method: 'delete', path: '/' },
        { method: 'post', path: '/test' }
      ];
      
      for (const endpoint of endpoints) {
        const response = await request(app)
          [endpoint.method](`/api/email-config${endpoint.path}`)
          .expect(401);
        
        expect(response.body).toHaveProperty('message', 'Not authorized, no token');
      }
    });
  });

  describe('Endpoint Functionality with Authentication', () => {
    let mockUser, authToken;

    beforeEach(() => {
      // Create a mock authenticated user
      mockUser = createMockUser({ _id: new mongoose.Types.ObjectId() });
      authToken = generateTestToken(mockUser._id);

      // Mock protect middleware to simulate successful authentication
      protect.mockImplementation((req, res, next) => {
        req.user = mockUser;
        next();
      });

      // Reset all controller mocks
      jest.clearAllMocks();
    });

    describe('GET / (getUserEmailConfig)', () => {
      it('should get user email configuration successfully', async () => {
        const mockEmailConfig = {
          _id: new mongoose.Types.ObjectId(),
          user: mockUser._id,
          service: 'gmail',
          username: 'test@gmail.com',
          fromName: 'Test User',
          enabled: true
        };

        emailConfigController.getUserEmailConfig.mockImplementation((req, res) => {
          res.json(mockEmailConfig);
        });

        const response = await request(app)
          .get('/api/email-config/')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toMatchObject({
          user: mockUser._id.toString(),
          service: 'gmail',
          username: 'test@gmail.com',
          fromName: 'Test User',
          enabled: true
        });
        expect(emailConfigController.getUserEmailConfig).toHaveBeenCalled();
      });

      it('should return 404 when email configuration not found', async () => {
        emailConfigController.getUserEmailConfig.mockImplementation((req, res) => {
          res.status(404);
          res.json({ message: 'Email configuration not found' });
        });

        const response = await request(app)
          .get('/api/email-config/')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);

        expect(response.body).toEqual({ message: 'Email configuration not found' });
        expect(emailConfigController.getUserEmailConfig).toHaveBeenCalled();
      });

      it('should handle server errors in getUserEmailConfig', async () => {
        emailConfigController.getUserEmailConfig.mockImplementation((req, res) => {
          res.status(500);
          res.json({ message: 'Server Error' });
        });

        const response = await request(app)
          .get('/api/email-config/')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(500);

        expect(response.body).toEqual({ message: 'Server Error' });
        expect(emailConfigController.getUserEmailConfig).toHaveBeenCalled();
      });
    });

    describe('POST / (createUpdateEmailConfig)', () => {
      it('should create new email configuration successfully', async () => {
        const newConfigData = {
          service: 'gmail',
          username: 'test@gmail.com',
          password: 'password123',
          fromName: 'Test User',
          enabled: true
        };

        const mockCreatedConfig = {
          _id: new mongoose.Types.ObjectId(),
          user: mockUser._id,
          ...newConfigData
        };
        delete mockCreatedConfig.password; // Password should not be returned

        emailConfigController.createUpdateEmailConfig.mockImplementation((req, res) => {
          res.status(201).json(mockCreatedConfig);
        });

        const response = await request(app)
          .post('/api/email-config/')
          .set('Authorization', `Bearer ${authToken}`)
          .send(newConfigData)
          .expect(201);

        expect(response.body).toMatchObject({
          user: mockUser._id.toString(),
          service: 'gmail',
          username: 'test@gmail.com',
          fromName: 'Test User',
          enabled: true
        });
        expect(emailConfigController.createUpdateEmailConfig).toHaveBeenCalled();
      });

      it('should update existing email configuration successfully', async () => {
        const updateConfigData = {
          service: 'outlook',
          username: 'updated@outlook.com',
          password: 'newpassword123',
          fromName: 'Updated User',
          enabled: false
        };

        const mockUpdatedConfig = {
          _id: new mongoose.Types.ObjectId(),
          user: mockUser._id,
          ...updateConfigData
        };
        delete mockUpdatedConfig.password; // Password should not be returned

        emailConfigController.createUpdateEmailConfig.mockImplementation((req, res) => {
          res.json(mockUpdatedConfig);
        });

        const response = await request(app)
          .post('/api/email-config/')
          .set('Authorization', `Bearer ${authToken}`)
          .send(updateConfigData)
          .expect(200);

        expect(response.body).toMatchObject({
          user: mockUser._id.toString(),
          service: 'outlook',
          username: 'updated@outlook.com',
          fromName: 'Updated User',
          enabled: false
        });
        expect(emailConfigController.createUpdateEmailConfig).toHaveBeenCalled();
      });

      it('should return 400 when required fields are missing', async () => {
        const incompleteData = {
          service: 'gmail'
          // Missing username and password
        };

        emailConfigController.createUpdateEmailConfig.mockImplementation((req, res) => {
          res.status(400);
          res.json({ message: 'Please provide all required fields' });
        });

        const response = await request(app)
          .post('/api/email-config/')
          .set('Authorization', `Bearer ${authToken}`)
          .send(incompleteData)
          .expect(400);

        expect(response.body).toEqual({ message: 'Please provide all required fields' });
        expect(emailConfigController.createUpdateEmailConfig).toHaveBeenCalled();
      });

      it('should return 400 when custom SMTP is missing host and port', async () => {
        const customSmtpData = {
          service: 'custom',
          username: 'test@custom.com',
          password: 'password123'
          // Missing host and port for custom SMTP
        };

        emailConfigController.createUpdateEmailConfig.mockImplementation((req, res) => {
          res.status(400);
          res.json({ message: 'Host and port are required for custom SMTP' });
        });

        const response = await request(app)
          .post('/api/email-config/')
          .set('Authorization', `Bearer ${authToken}`)
          .send(customSmtpData)
          .expect(400);

        expect(response.body).toEqual({ message: 'Host and port are required for custom SMTP' });
        expect(emailConfigController.createUpdateEmailConfig).toHaveBeenCalled();
      });

      it('should handle server errors in createUpdateEmailConfig', async () => {
        const validConfigData = {
          service: 'gmail',
          username: 'test@gmail.com',
          password: 'password123'
        };

        emailConfigController.createUpdateEmailConfig.mockImplementation((req, res) => {
          res.status(500);
          res.json({ message: 'Failed to create/update email configuration: Database error' });
        });

        const response = await request(app)
          .post('/api/email-config/')
          .set('Authorization', `Bearer ${authToken}`)
          .send(validConfigData)
          .expect(500);

        expect(response.body).toEqual({ message: 'Failed to create/update email configuration: Database error' });
        expect(emailConfigController.createUpdateEmailConfig).toHaveBeenCalled();
      });
    });

    describe('DELETE / (deleteEmailConfig)', () => {
      it('should delete email configuration successfully', async () => {
        emailConfigController.deleteEmailConfig.mockImplementation((req, res) => {
          res.json({ message: 'Email configuration removed' });
        });

        const response = await request(app)
          .delete('/api/email-config/')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toEqual({ message: 'Email configuration removed' });
        expect(emailConfigController.deleteEmailConfig).toHaveBeenCalled();
      });

      it('should return 404 when email configuration to delete not found', async () => {
        emailConfigController.deleteEmailConfig.mockImplementation((req, res) => {
          res.status(404);
          res.json({ message: 'Email configuration not found' });
        });

        const response = await request(app)
          .delete('/api/email-config/')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);

        expect(response.body).toEqual({ message: 'Email configuration not found' });
        expect(emailConfigController.deleteEmailConfig).toHaveBeenCalled();
      });

      it('should handle server errors in deleteEmailConfig', async () => {
        emailConfigController.deleteEmailConfig.mockImplementation((req, res) => {
          res.status(500);
          res.json({ message: 'Server Error' });
        });

        const response = await request(app)
          .delete('/api/email-config/')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(500);

        expect(response.body).toEqual({ message: 'Server Error' });
        expect(emailConfigController.deleteEmailConfig).toHaveBeenCalled();
      });
    });

    describe('POST /test (testEmailConfig)', () => {
      it('should test email configuration successfully', async () => {
        emailConfigController.testEmailConfig.mockImplementation((req, res) => {
          res.json({
            success: true,
            message: 'Test email sent successfully'
          });
        });

        const response = await request(app)
          .post('/api/email-config/test')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          message: 'Test email sent successfully'
        });
        expect(emailConfigController.testEmailConfig).toHaveBeenCalled();
      });

      it('should return 400 when test email fails due to configuration issues', async () => {
        emailConfigController.testEmailConfig.mockImplementation((req, res) => {
          res.status(400).json({
            success: false,
            message: 'Invalid email configuration'
          });
        });

        const response = await request(app)
          .post('/api/email-config/test')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);

        expect(response.body).toEqual({
          success: false,
          message: 'Invalid email configuration'
        });
        expect(emailConfigController.testEmailConfig).toHaveBeenCalled();
      });

      it('should handle authentication errors during email testing', async () => {
        emailConfigController.testEmailConfig.mockImplementation((req, res) => {
          res.status(400).json({
            success: false,
            message: 'Authentication failed with email provider'
          });
        });

        const response = await request(app)
          .post('/api/email-config/test')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);

        expect(response.body).toEqual({
          success: false,
          message: 'Authentication failed with email provider'
        });
        expect(emailConfigController.testEmailConfig).toHaveBeenCalled();
      });

      it('should handle server errors in testEmailConfig', async () => {
        emailConfigController.testEmailConfig.mockImplementation((req, res) => {
          res.status(500);
          res.json({ message: 'Failed to test email configuration: Email service error' });
        });

        const response = await request(app)
          .post('/api/email-config/test')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(500);

        expect(response.body).toEqual({ message: 'Failed to test email configuration: Email service error' });
        expect(emailConfigController.testEmailConfig).toHaveBeenCalled();
      });
    });

    describe('Edge Cases and Additional Coverage', () => {
      it('should handle POST / with valid custom SMTP configuration', async () => {
        const customSmtpData = {
          service: 'custom',
          host: 'smtp.custom.com',
          port: 587,
          secure: false,
          username: 'test@custom.com',
          password: 'password123',
          fromName: 'Custom User'
        };

        const mockCustomConfig = {
          _id: new mongoose.Types.ObjectId(),
          user: mockUser._id,
          ...customSmtpData
        };
        delete mockCustomConfig.password;

        emailConfigController.createUpdateEmailConfig.mockImplementation((req, res) => {
          res.status(201).json(mockCustomConfig);
        });

        const response = await request(app)
          .post('/api/email-config/')
          .set('Authorization', `Bearer ${authToken}`)
          .send(customSmtpData)
          .expect(201);

        expect(response.body).toMatchObject({
          user: mockUser._id.toString(),
          service: 'custom',
          host: 'smtp.custom.com',
          port: 587,
          secure: false,
          username: 'test@custom.com',
          fromName: 'Custom User'
        });
        expect(emailConfigController.createUpdateEmailConfig).toHaveBeenCalled();
      });

      it('should handle partial updates (omit optional fields)', async () => {
        const minimalUpdateData = {
          service: 'yahoo',
          username: 'test@yahoo.com',
          password: 'newpass'
        };

        const mockUpdatedConfig = {
          _id: new mongoose.Types.ObjectId(),
          user: mockUser._id,
          service: 'yahoo',
          username: 'test@yahoo.com',
          fromName: 'Default Name',
          enabled: true
        };

        emailConfigController.createUpdateEmailConfig.mockImplementation((req, res) => {
          res.json(mockUpdatedConfig);
        });

        const response = await request(app)
          .post('/api/email-config/')
          .set('Authorization', `Bearer ${authToken}`)
          .send(minimalUpdateData)
          .expect(200);

        expect(response.body).toMatchObject({
          user: mockUser._id.toString(),
          service: 'yahoo',
          username: 'test@yahoo.com',
          fromName: 'Default Name',
          enabled: true
        });
        expect(emailConfigController.createUpdateEmailConfig).toHaveBeenCalled();
      });

      it('should handle empty request body gracefully', async () => {
        emailConfigController.createUpdateEmailConfig.mockImplementation((req, res) => {
          res.status(400);
          res.json({ message: 'Please provide all required fields' });
        });

        const response = await request(app)
          .post('/api/email-config/')
          .set('Authorization', `Bearer ${authToken}`)
          .send({})
          .expect(400);

        expect(response.body).toEqual({ message: 'Please provide all required fields' });
        expect(emailConfigController.createUpdateEmailConfig).toHaveBeenCalled();
      });

      it('should test email with no existing configuration', async () => {
        emailConfigController.testEmailConfig.mockImplementation((req, res) => {
          res.status(400).json({
            success: false,
            message: 'No email configuration found for user'
          });
        });

        const response = await request(app)
          .post('/api/email-config/test')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);

        expect(response.body).toEqual({
          success: false,
          message: 'No email configuration found for user'
        });
        expect(emailConfigController.testEmailConfig).toHaveBeenCalled();
      });

      it('should handle network timeout during email test', async () => {
        emailConfigController.testEmailConfig.mockImplementation((req, res) => {
          res.status(500);
          res.json({ message: 'Failed to test email configuration: Connection timeout' });
        });

        const response = await request(app)
          .post('/api/email-config/test')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(500);

        expect(response.body).toEqual({ message: 'Failed to test email configuration: Connection timeout' });
        expect(emailConfigController.testEmailConfig).toHaveBeenCalled();
      });
    });
  });

  describe('Request Validation and Data Handling', () => {
    let mockUser, authToken;

    beforeEach(() => {
      mockUser = createMockUser({ _id: new mongoose.Types.ObjectId() });
      authToken = generateTestToken(mockUser._id);

      protect.mockImplementation((req, res, next) => {
        req.user = mockUser;
        next();
      });

      jest.clearAllMocks();
    });

    it('should pass request data correctly to controller methods', async () => {
      const testConfigData = {
        service: 'gmail',
        username: 'validation@test.com',
        password: 'testpass123',
        fromName: 'Validation Test',
        enabled: true
      };

      let capturedReqBody;
      emailConfigController.createUpdateEmailConfig.mockImplementation((req, res) => {
        capturedReqBody = req.body;
        res.status(201).json({ success: true });
      });

      await request(app)
        .post('/api/email-config/')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testConfigData)
        .expect(201);

      expect(capturedReqBody).toEqual(testConfigData);
    });

    it('should ensure user context is available in all controller calls', async () => {
      let capturedUser;
      emailConfigController.getUserEmailConfig.mockImplementation((req, res) => {
        capturedUser = req.user;
        res.json({ message: 'success' });
      });

      await request(app)
        .get('/api/email-config/')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(capturedUser).toEqual(mockUser);
    });

    it('should handle malformed JSON in request body', async () => {
      const response = await request(app)
        .post('/api/email-config/')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      // Express's built-in JSON parser should handle this
      expect(response.body.message).toContain('JSON');
    });

    it('should preserve user ID across different endpoints', async () => {
      const endpoints = [
        { method: 'get', path: '/', controller: 'getUserEmailConfig' },
        { method: 'post', path: '/', controller: 'createUpdateEmailConfig' },
        { method: 'delete', path: '/', controller: 'deleteEmailConfig' },
        { method: 'post', path: '/test', controller: 'testEmailConfig' }
      ];

      for (const endpoint of endpoints) {
        let capturedUserId;
        emailConfigController[endpoint.controller].mockImplementation((req, res) => {
          capturedUserId = req.user._id;
          res.json({ success: true });
        });

        await request(app)
          [endpoint.method](`/api/email-config${endpoint.path}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(endpoint.method === 'post' && endpoint.path === '/' ? {
            service: 'gmail', username: 'test@test.com', password: 'pass'
          } : {})
          .expect(200);

        expect(capturedUserId).toEqual(mockUser._id);
        jest.clearAllMocks();
      }
    });
  });

  describe('HTTP Method and Route Validation', () => {
    beforeEach(() => {
      protect.mockImplementation((req, res, next) => {
        req.user = createMockUser();
        next();
      });
    });

    it('should only accept GET, POST, DELETE on root route', async () => {
      // Test unsupported methods return 404 or 405
      const unsupportedMethods = ['put', 'patch'];
      
      for (const method of unsupportedMethods) {
        const response = await request(app)
          [method]('/api/email-config/')
          .set('Authorization', 'Bearer token');
        
        // Should be 404 (not found) or 405 (method not allowed)
        expect([404, 405]).toContain(response.status);
      }
    });

    it('should only accept POST on /test route', async () => {
      const unsupportedMethods = ['get', 'put', 'delete', 'patch'];
      
      for (const method of unsupportedMethods) {
        const response = await request(app)
          [method]('/api/email-config/test')
          .set('Authorization', 'Bearer token');
        
        expect([404, 405]).toContain(response.status);
      }
    });

    it('should handle non-existent routes under /api/email-config', async () => {
      const response = await request(app)
        .get('/api/email-config/nonexistent')
        .set('Authorization', 'Bearer token')
        .expect(404);
    });
  });
});
