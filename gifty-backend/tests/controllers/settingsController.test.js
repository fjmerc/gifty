// tests/controllers/settingsController.test.js
const mongoose = require('mongoose');
const settingsController = require('../../controllers/settingsController');
const User = require('../../models/User');
const Gift = require('../../models/Gift');
const Event = require('../../models/Event');
const { Budget } = require('../../models/Budget');
const Recipient = require('../../models/Recipient');
const hybridSuggestionService = require('../../services/hybridSuggestionService');
const { createMockReqRes, mockNext } = require('../utils/mockUtils');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Mock dependencies
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

// Set higher timeout for controller tests
jest.setTimeout(30000);

describe('Settings Controller', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  // exportData runs against MongoDB in tests/integration/data-export.test.js

  describe('getUserPreferences', () => {
    it('should return user preferences when they exist', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        user: { _id: userId }
      });

      const mockUser = {
        _id: userId,
        preferences: {
          useHybridSuggestions: true,
          useEnhancedSuggestions: true,
          useWebSearch: false,
          theme: 'dark',
          notifications: false
        }
      };

      const mockSystemHealth = {
        isHealthy: true,
        totalGifts: 150
      };

      // Mock User.findById with select chaining
      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      // Mock hybrid suggestion service
      hybridSuggestionService.isHybridSystemHealthy = jest.fn().mockResolvedValue(mockSystemHealth);

      // Act
      await settingsController.getUserPreferences(req, res, mockNext);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(hybridSuggestionService.isHybridSystemHealthy).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        useHybridSuggestions: true,
        useEnhancedSuggestions: true,
        useWebSearch: false,
        theme: 'dark',
        notifications: false,
        activeProvider: 'test-provider',
        activeModel: 'test-model',
        systemHealth: {
          isHealthy: true,
          giftCount: 150
        }
      });
    });

    it('should create default preferences when user has no preferences', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        user: { _id: userId }
      });

      const mockUser = {
        _id: userId,
        preferences: null,
        save: jest.fn().mockResolvedValue()
      };

      const mockSystemHealth = {
        isHealthy: false,
        totalGifts: 0
      };

      // Mock User.findById with select chaining
      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      // Mock hybrid suggestion service
      hybridSuggestionService.isHybridSystemHealthy = jest.fn().mockResolvedValue(mockSystemHealth);

      // Act
      await settingsController.getUserPreferences(req, res, mockNext);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockUser.preferences).toEqual({
        theme: 'light',
        notifications: true
      });
      expect(res.json).toHaveBeenCalledWith({
        theme: 'light',
        notifications: true,
        activeProvider: 'test-provider',
        activeModel: 'test-model',
        systemHealth: {
          isHealthy: false,
          giftCount: 0
        }
      });
    });

    it('should handle system health check errors gracefully', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        user: { _id: userId }
      });

      const mockUser = {
        preferences: {
          useHybridSuggestions: false,
          theme: 'light',
          notifications: true
        }
      };

      // Mock User.findById with select chaining
      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      // Mock hybrid suggestion service to throw error
      hybridSuggestionService.isHybridSystemHealthy = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Act & Assert - should handle error and call mockNext with error
      await settingsController.getUserPreferences(req, res, mockNext);
      
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Failed to fetch user preferences');
    });
  });

  describe('updateUserPreferences', () => {
    it('should update user preferences successfully', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const updatedPreferences = {
        suggestionMode: 'hybrid',
        theme: 'dark',
        notifications: false
      };

      const { req, res } = createMockReqRes({
        user: { _id: userId },
        body: updatedPreferences
      });

      const mockUser = {
        _id: userId,
        preferences: {
          useHybridSuggestions: false,
          useEnhancedSuggestions: false,
          theme: 'light',
          notifications: true
        },
        save: jest.fn().mockResolvedValue()
      };

      // Mock User.findById
      User.findById = jest.fn().mockResolvedValue(mockUser);

      // Act
      await settingsController.updateUserPreferences(req, res, mockNext);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockUser.preferences.suggestionMode).toBe('hybrid');
      expect(mockUser.preferences.theme).toBe('dark');
      expect(mockUser.preferences.notifications).toBe(false);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Preferences updated successfully',
        preferences: mockUser.preferences,
        activeProvider: expect.anything(),
        activeModel: expect.anything()
      });
    });

    it('should create preferences object if user has no preferences', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const updatedPreferences = {
        suggestionMode: 'web',
        theme: 'dark'
      };

      const { req, res } = createMockReqRes({
        user: { _id: userId },
        body: updatedPreferences
      });

      const mockUser = {
        _id: userId,
        preferences: null,
        save: jest.fn().mockResolvedValue()
      };

      // Mock User.findById
      User.findById = jest.fn().mockResolvedValue(mockUser);

      // Act
      await settingsController.updateUserPreferences(req, res, mockNext);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockUser.preferences).toEqual({
        suggestionMode: 'web',
        theme: 'dark'
      });
      expect(res.json).toHaveBeenCalledWith({
        message: 'Preferences updated successfully',
        preferences: mockUser.preferences,
        activeProvider: expect.anything(),
        activeModel: expect.anything()
      });
    });

    it('should handle partial preference updates', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const partialUpdate = {
        theme: 'dark'
      };

      const { req, res } = createMockReqRes({
        user: { _id: userId },
        body: partialUpdate
      });

      const mockUser = {
        _id: userId,
        preferences: {
          suggestionMode: 'hybrid',
          theme: 'light',
          notifications: true
        },
        save: jest.fn().mockResolvedValue()
      };

      // Mock User.findById
      User.findById = jest.fn().mockResolvedValue(mockUser);

      // Act
      await settingsController.updateUserPreferences(req, res, mockNext);

      // Assert
      expect(mockUser.preferences.theme).toBe('dark');
      expect(mockUser.preferences.suggestionMode).toBe('hybrid'); // unchanged
      expect(mockUser.preferences.notifications).toBe(true); // unchanged
      expect(res.json).toHaveBeenCalledWith({
        message: 'Preferences updated successfully',
        preferences: mockUser.preferences,
        activeProvider: expect.anything(),
        activeModel: expect.anything()
      });
    });

    it('should handle database save errors', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        user: { _id: userId },
        body: { theme: 'dark' }
      });

      const mockUser = {
        preferences: {},
        save: jest.fn().mockRejectedValue(new Error('Database error'))
      };

      User.findById = jest.fn().mockResolvedValue(mockUser);

      // Act
      await settingsController.updateUserPreferences(req, res, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Failed to update user preferences');
    });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await clearDatabase();
  });

  afterAll(async () => {
    await teardownTestDB();
  });
});
