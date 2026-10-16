// tests/routes/settingsRoutes.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');
const { createMockReqRes, mockNext, generateTestToken } = require('../utils/mockUtils');
const settingsRoutes = require('../../routes/settingsRoutes');
const settingsController = require('../../controllers/settingsController');

// Mock all dependencies
const User = require('../../models/User');
const Gift = require('../../models/Gift');
const Event = require('../../models/Event');
const { Budget } = require('../../models/Budget');
const Recipient = require('../../models/Recipient');
const hybridSuggestionService = require('../../services/hybridSuggestionService');
const AdmZip = require('adm-zip');

jest.mock('../../models/User');
jest.mock('../../models/Gift');
jest.mock('../../models/Event');
jest.mock('../../models/Budget');
jest.mock('../../models/Recipient');
// Resolved provider/model depend on which AI keys the host has; pin them
jest.mock('../../services/ai/modelRegistry', () => ({
  resolveProviderAndModel: jest.fn(() => ({ provider: 'test-provider', model: 'test-model' }))
}));
jest.mock('../../services/hybridSuggestionService');
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));
jest.mock('adm-zip');

// Mock middleware
jest.mock('../../middleware/authMiddleware', () => {
  return {
    protect: jest.fn((req, res, next) => {
      // Mock authentication - check for valid token
      const token = req.cookies.access_token;
      if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
      }
      try {
        // Simple mock verification - just parse the token format
        const mockJwt = require('jsonwebtoken');
        const decoded = mockJwt.verify(token, process.env.JWT_SECRET);
        req.user = { _id: decoded.id };
        next();
      } catch (error) {
        return res.status(401).json({ message: 'Not authorized, token validation failed' });
      }
    })
  };
});

jest.mock('../../middleware/uploadMiddleware', () => ({
  backupUpload: {
    single: jest.fn(() => (req, res, next) => {
      // Mock file upload middleware
      if (req.body.mockFile) {
        req.file = {
          fieldname: 'backup',
          originalname: req.body.mockFile.originalname,
          mimetype: req.body.mockFile.mimetype,
          size: req.body.mockFile.size,
          buffer: Buffer.from(req.body.mockFile.content)
        };
      }
      next();
    })
  }
}));

// Set higher timeout for route tests
jest.setTimeout(30000);

describe('Settings Routes', () => {
  let app;
  const originalEnv = process.env;
  const testUserId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    await setupTestDB();
    
    // Setup test environment
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'test_jwt_secret',
      APP_VERSION: '1.0.0'
    };
    
    // Set up Express app for testing
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    
    // Add settings routes to the app
    app.use('/api/settings', settingsRoutes);
    
    // Set up error handler - must be after routes
    app.use((err, req, res, next) => {
      const statusCode = err.statusCode || 500;
      res.status(statusCode);
      if (typeof res.setHeader === 'function') {
        res.setHeader('Content-Type', 'application/json');
      }
      res.json({ message: err.message });
    });
  });

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Setup default mocks with proper chaining
    User.findById = jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(null)
    });
    Gift.find = jest.fn();
    Event.find = jest.fn();
    Budget.find = jest.fn();
    Recipient.find = jest.fn();
    Gift.deleteMany = jest.fn();
    Event.deleteMany = jest.fn();
    Budget.deleteMany = jest.fn();
    Recipient.deleteMany = jest.fn();
    Gift.insertMany = jest.fn();
    Event.insertMany = jest.fn();
    Budget.insertMany = jest.fn();
    Recipient.insertMany = jest.fn();
    User.findByIdAndUpdate = jest.fn();
    hybridSuggestionService.isHybridSystemHealthy = jest.fn();
    
    // Setup model schemas for CSV export tests
    Gift.schema = {
      paths: {
        name: {},
        price: {},
        category: {},
        description: {},
        metadata: {},
        _id: {},
        __v: {},
        user: {}
      }
    };
    Event.schema = {
      paths: {
        name: {},
        date: {},
        _id: {},
        __v: {},
        user: {}
      }
    };
    Recipient.schema = {
      paths: {
        name: {},
        address: {},
        giftStatus: {},
        _id: {},
        __v: {},
        user: {}
      }
    };
    Budget.schema = {
      paths: {
        amount: {},
        category: {},
        _id: {},
        __v: {},
        user: {}
      }
    };
  });

  afterEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await teardownTestDB();
    process.env = originalEnv;
  });

  // Helper function to create authenticated request
  const createAuthenticatedRequest = (method, path) => {
    const token = generateTestToken(testUserId, 'access', process.env.JWT_SECRET);
    return request(app)[method](path).set('Cookie', [`access_token=${token}`]);
  };

  describe('Authentication Tests', () => {
    const protectedRoutes = [
      { method: 'get', path: '/api/settings/user-preferences' },
      { method: 'post', path: '/api/settings/user-preferences' },
      { method: 'get', path: '/api/settings/backup' },
      { method: 'post', path: '/api/settings/restore' },
      { method: 'post', path: '/api/settings/validate-backup' },
      { method: 'post', path: '/api/settings/export' },
      { method: 'post', path: '/api/settings/export-zip' }
    ];

    protectedRoutes.forEach(({ method, path }) => {
      it(`should return 401 for unauthenticated ${method.toUpperCase()} ${path}`, async () => {
        const response = await request(app)[method](path);
        expect(response.statusCode).toBe(401);
        expect(response.body).toHaveProperty('message', 'Not authorized, no token');
      });
    });
  });

  describe('GET /api/settings/user-preferences', () => {
    it('should return user preferences with system health', async () => {
      // Arrange
      const mockUser = {
        _id: testUserId,
        preferences: {
          useHybridSuggestions: true,
          useEnhancedSuggestions: false,
          useWebSearch: true,
          theme: 'dark',
          notifications: false
        }
      };
      
      const mockSystemHealth = {
        isHealthy: true,
        totalGifts: 150
      };

      // Setup the proper mock chain for User.findById().select()
      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });
      hybridSuggestionService.isHybridSystemHealthy.mockResolvedValue(mockSystemHealth);

      // Act
      const response = await createAuthenticatedRequest('get', '/api/settings/user-preferences');

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual({
        ...mockUser.preferences,
        activeProvider: 'test-provider',
        activeModel: 'test-model',
        systemHealth: {
          isHealthy: true,
          giftCount: 150
        }
      });
      expect(User.findById).toHaveBeenCalledWith(testUserId.toString());
      expect(hybridSuggestionService.isHybridSystemHealthy).toHaveBeenCalled();
    });

    it('should return default preferences if user has none', async () => {
      // Arrange
      const mockUser = {
        _id: testUserId,
        preferences: null,
        save: jest.fn().mockResolvedValue({})
      };
      
      const mockSystemHealth = {
        isHealthy: false,
        totalGifts: 50
      };

      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });
      hybridSuggestionService.isHybridSystemHealthy.mockResolvedValue(mockSystemHealth);

      // Act
      const response = await createAuthenticatedRequest('get', '/api/settings/user-preferences');

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual({
        theme: 'light',
        notifications: true,
        activeProvider: 'test-provider',
        activeModel: 'test-model',
        systemHealth: {
          isHealthy: false,
          giftCount: 50
        }
      });
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      User.findById.mockReturnValue({
        select: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      // Act
      const response = await createAuthenticatedRequest('get', '/api/settings/user-preferences');

      // Assert
      expect(response.statusCode).toBe(500);
      expect(response.body.message).toBe('Failed to fetch user preferences');
    });
  });

  describe('POST /api/settings/user-preferences', () => {
    it('should update user preferences successfully', async () => {
      // Arrange
      const mockUser = {
        _id: testUserId,
        preferences: {
          theme: 'light',
          notifications: true
        },
        save: jest.fn().mockResolvedValue({})
      };
      
      const updateData = {
        theme: 'dark',
        suggestionMode: 'hybrid'
      };

      User.findById = jest.fn().mockResolvedValue(mockUser);

      // Act
      const response = await createAuthenticatedRequest('post', '/api/settings/user-preferences')
        .send(updateData);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body.message).toBe('Preferences updated successfully');
      expect(response.body.preferences).toEqual({
        theme: 'dark',
        notifications: true,
        suggestionMode: 'hybrid'
      });
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should initialize preferences if user has none', async () => {
      // Arrange
      const mockUser = {
        _id: testUserId,
        preferences: null,
        save: jest.fn().mockResolvedValue({})
      };
      
      const updateData = { theme: 'dark' };

      User.findById.mockResolvedValue(mockUser);

      // Act
      const response = await createAuthenticatedRequest('post', '/api/settings/user-preferences')
        .send(updateData);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(mockUser.preferences).toEqual({ theme: 'dark' });
      expect(mockUser.save).toHaveBeenCalled();
    });
  });




  // Exports (CSV, JSON, ZIP) run against MongoDB in tests/integration/data-export.test.js

  describe('File Upload Edge Cases', () => {
    it('should handle missing file in restore endpoint', async () => {
      // Act (no mockFile in request)
      const response = await createAuthenticatedRequest('post', '/api/settings/restore');

      // Assert
      expect(response.statusCode).toBe(500);
      expect(response.body.message).toBe('No backup file provided');
    });

    it('should handle missing file in validate endpoint', async () => {
      // Act (no mockFile in request)
      const response = await createAuthenticatedRequest('post', '/api/settings/validate-backup');

      // Assert
      expect(response.statusCode).toBe(500);
      expect(response.body.message).toBe('No backup file provided');
    });

    it('should handle malformed JSON in file upload', async () => {
      // Act
      const response = await createAuthenticatedRequest('post', '/api/settings/validate-backup')
        .send({
          mockFile: {
            originalname: 'backup.json',
            mimetype: 'application/json',
            size: 50,
            content: '{"incomplete": json'
          }
        });

      // Assert
      expect(response.statusCode).toBe(400);
      expect(response.body.message).toContain('Invalid JSON file format');
    });
  });

  describe('Integration Tests', () => {

    it('should handle preferences update and retrieval workflow', async () => {
      // Step 1: Get initial preferences (should create defaults)
      const mockUser = {
        _id: testUserId,
        preferences: null,
        save: jest.fn().mockResolvedValue({})
      };
      
      const mockSystemHealth = {
        isHealthy: true,
        totalGifts: 100
      };

      hybridSuggestionService.isHybridSystemHealthy.mockResolvedValue(mockSystemHealth);

      // Setup the proper mock chain for User.findById().select() for GET request
      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      const getResponse1 = await createAuthenticatedRequest('get', '/api/settings/user-preferences');
      expect(getResponse1.statusCode).toBe(200);
      expect(getResponse1.body.theme).toBe('light'); // Default

      // Step 2: Update preferences
      const updateData = {
        theme: 'dark',
        suggestionMode: 'hybrid',
        notifications: false
      };

      // Setup mock for POST request (no .select() chain needed)
      User.findById = jest.fn().mockResolvedValue(mockUser);

      const updateResponse = await createAuthenticatedRequest('post', '/api/settings/user-preferences')
        .send(updateData);
      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.body.message).toBe('Preferences updated successfully');

      // Step 3: Verify preferences were updated
      mockUser.preferences = {
        theme: 'dark',
        suggestionMode: 'hybrid',
        notifications: false
      };

      // Setup mock for second GET request
      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      const getResponse2 = await createAuthenticatedRequest('get', '/api/settings/user-preferences');
      expect(getResponse2.statusCode).toBe(200);
      expect(getResponse2.body.theme).toBe('dark');
      expect(getResponse2.body.suggestionMode).toBe('hybrid');
      expect(getResponse2.body.notifications).toBe(false);
    });
  });

});
