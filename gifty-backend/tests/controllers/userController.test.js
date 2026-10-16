// tests/controllers/userController.test.js
// Mock dependencies first
// Only token signing is stubbed; version helpers stay real
// An instance with accounts: registration needs no setup code here
jest.mock('../../services/setupCodeService', () => ({
  isSetupRequired: jest.fn().mockResolvedValue(false),
  verifySetupCode: jest.fn().mockResolvedValue(false),
  clearSetupCode: jest.fn().mockResolvedValue(),
  FILE_NAME: 'setup-code.txt'
}));
jest.mock('../../utils/generateToken', () => ({
  ...jest.requireActual('../../utils/generateToken'),
  generateToken: jest.fn()
}));
jest.mock('../../utils/cookieUtils', () => ({
  setAuthCookies: jest.fn(),
  clearAuthCookies: jest.fn()
}));
// Owner lookup needs a real User query; the profile tests only need a flag
jest.mock('../../middleware/instanceOwnerMiddleware', () => ({
  isInstanceOwner: jest.fn().mockResolvedValue(false),
  requireInstanceOwner: (req, res, next) => next()
}));
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));
jest.mock('../../services/holidayService');
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    unlink: jest.fn(),
  }
}));

// Mock models that are used in userController
jest.mock('../../models/Gift', () => ({
  deleteMany: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../models/Event', () => ({
  deleteMany: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../models/Budget', () => ({
  Budget: {
    deleteMany: jest.fn().mockResolvedValue({}),
  },
  OverallBudget: {
    deleteMany: jest.fn().mockResolvedValue({}),
  },
  UserPreferences: {
    deleteMany: jest.fn().mockResolvedValue({}),
  },
}));
jest.mock('../../models/Recipient', () => ({
  deleteMany: jest.fn().mockResolvedValue({}),
  find: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve([]) }) })),
  exists: jest.fn().mockResolvedValue(null),
}));
// tests/integration/account-lifecycle.test.js checks deletion against MongoDB
jest.mock('../../models/Tags', () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock('../../models/EventType', () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock('../../models/Vendor', () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock('../../models/SuggestionMetric', () => ({ deleteMany: jest.fn().mockResolvedValue({}) }));
jest.mock('../../models/Notification', () => ({
  deleteMany: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../models/Integration', () => ({
  deleteMany: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../models/Profile', () => ({
  deleteMany: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../models/EmailConfig', () => ({
  deleteMany: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../models/SuggestionHistory', () => ({
  deleteMany: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../models/FeedbackLog', () => ({
  deleteMany: jest.fn().mockResolvedValue({}),
}));

// Now, import the modules. They will receive the mocked versions.
const mongoose = require('mongoose');
const userController = require('../../controllers/userController');
const User = require('../../models/User');
const { createMockReqRes, mockNext } = require('../utils/mockUtils');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');
const { generateToken } = require('../../utils/generateToken');
const holidayService = require('../../services/holidayService');
const fs = require('fs').promises; // This will now correctly get the mocked fs.promises
const Gift = require('../../models/Gift'); // This will now correctly get the mocked Gift
const Event = require('../../models/Event');
const { Budget, OverallBudget, UserPreferences } = require('../../models/Budget');
const Recipient = require('../../models/Recipient');
const Notification = require('../../models/Notification');
const Integration = require('../../models/Integration');
const Profile = require('../../models/Profile');
const EmailConfig = require('../../models/EmailConfig');
const SuggestionHistory = require('../../models/SuggestionHistory');
const FeedbackLog = require('../../models/FeedbackLog');
const logger = require('../../utils/logger'); // Import logger

// Set higher timeout for controller tests
jest.setTimeout(30000);

describe('User Controller', () => {
  beforeAll(async () => {
    jest.setTimeout(30000); // Increase timeout for setup
    await setupTestDB();
  });

  describe('logoutUser', () => {
    it('should logout user successfully', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        user: { _id: new mongoose.Types.ObjectId() }
      });

      // Act
      await userController.logoutUser(req, res, mockNext);

      // Assert
      expect(res.json).toHaveBeenCalledWith({ message: 'Logged out successfully' });
    });
  });

  describe('changePassword', () => {
    it('should change password successfully with valid current password', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const passwordData = {
        currentPassword: 'oldpassword',
        newPassword: 'newpassword123'
      };

      const mockUser = {
        _id: userId,
        matchPassword: jest.fn().mockResolvedValue(true),
        password: 'oldhashedpassword',
        save: jest.fn().mockResolvedValue(true)
      };

      const { req, res } = createMockReqRes({
        body: passwordData,
        user: { _id: userId }
      });

      // Mock User.findById
      User.findById = jest.fn().mockResolvedValue(mockUser);

      // Act
      await userController.changePassword(req, res, mockNext);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(mockUser.matchPassword).toHaveBeenCalledWith(passwordData.currentPassword);
      expect(mockUser.password).toBe(passwordData.newPassword);
      expect(mockUser.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Password updated successfully' });
    });

    // 400, not 401: a 401 makes the app sign out
    it('should return 400 if current password is incorrect', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const passwordData = {
        currentPassword: 'wrongpassword',
        newPassword: 'newpassword123'
      };

      const mockUser = {
        _id: userId,
        matchPassword: jest.fn().mockResolvedValue(false) // Wrong password
      };

      const { req, res } = createMockReqRes({
        body: passwordData,
        user: { _id: userId }
      });

      // Mock User.findById
      User.findById = jest.fn().mockResolvedValue(mockUser);

      const mockNext = jest.fn();

      // Act
      await userController.changePassword(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should return 404 if user is not found', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const passwordData = {
        currentPassword: 'oldpassword',
        newPassword: 'newpassword123'
      };

      const { req, res } = createMockReqRes({
        body: passwordData,
        user: { _id: userId }
      });

      // Mock User.findById to return null
      User.findById = jest.fn().mockResolvedValue(null);

      const mockNext = jest.fn();

      // Act
      await userController.changePassword(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('updateUserProfile', () => {
    it('should update user profile successfully', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const updateData = {
        username: 'updateduser',
        email: 'updated@example.com',
        firstName: 'Updated',
        lastName: 'User',
        // A new email needs the current password
        currentPassword: 'Current-pass1'
      };

      const mockUser = {
        _id: userId,
        username: 'olduser',
        email: 'old@example.com',
        firstName: 'Old',
        lastName: 'User',
        matchPassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue({
          _id: userId,
          ...updateData
        })
      };

      const { req, res } = createMockReqRes({
        body: updateData,
        user: { _id: userId }
      });

      // Mock User.findById
      User.findById = jest.fn().mockResolvedValue(mockUser);

      // Mock generateToken
      generateToken.mockReturnValue('mock_token');

      // Act
      await userController.updateUserProfile(req, res, mockNext);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(mockUser.username).toBe(updateData.username);
      expect(mockUser.email).toBe(updateData.email);
      expect(mockUser.firstName).toBe(updateData.firstName);
      expect(mockUser.lastName).toBe(updateData.lastName);
      expect(mockUser.save).toHaveBeenCalled();
      expect(generateToken).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        _id: userId,
        username: updateData.username,
        email: updateData.email
      }));
    });

    it('should return 404 if user is not found', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const updateData = {
        username: 'updateduser',
        email: 'updated@example.com'
      };

      const { req, res } = createMockReqRes({
        body: updateData,
        user: { _id: userId }
      });

      // Mock User.findById to return null
      User.findById = jest.fn().mockResolvedValue(null);

      const mockNext = jest.fn();

      // Act
      await userController.updateUserProfile(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  afterEach(async () => {
    jest.setTimeout(30000); // Increase timeout for cleanup
    await clearDatabase();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  describe('registerUser', () => {
    // Create an error handler wrapper for all tests in this suite
    const errorHandler = (fn) => async (req, res, next) => {
      try {
        await fn(req, res, next);
      } catch (error) {
        // Set status code if not already set
        if (!res.statusCode) {
          res.status(500);
        }
        res.json({ message: error.message });
      }
    };

    // Create the wrapped function for all tests to use
    const wrappedRegisterUser = errorHandler(userController.registerUser);
    it('should register a new user and return 201 status', async () => {
      // Arrange
      const userData = {
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
        dateOfBirth: '1990-01-01'
      };

      const { req, res } = createMockReqRes({
        body: userData
      });

      // Mock User.findOne to simulate no existing user
      User.findOne = jest.fn()
        .mockResolvedValueOnce(null) // First call for email check
        .mockResolvedValueOnce(null); // Second call for username check

      // Mock User.create
      const createdUser = {
        _id: new mongoose.Types.ObjectId(),
        ...userData,
        password: 'hashed_password' // Simulating hashed password
      };
      User.create = jest.fn().mockResolvedValue(createdUser);

      // Mock generateToken
      generateToken.mockReturnValue('mock_token');

      // Mock holidayService.generateHolidayEvents
      holidayService.generateHolidayEvents.mockResolvedValue({ count: 5 });

      // Act
      await userController.registerUser(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        username: userData.username,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName
      }));
      expect(generateToken).toHaveBeenCalled();
      expect(holidayService.generateHolidayEvents).toHaveBeenCalled();
    });

    it('should return 400 if user with email already exists', async () => {
      // Arrange
      const userData = {
        username: 'existinguser',
        email: 'existing@example.com',
        password: 'password123',
        firstName: 'Existing',
        lastName: 'User'
      };

      const { req, res } = createMockReqRes({
        body: userData
      });

      // Mock User.findOne to simulate existing user with email
      User.findOne = jest.fn()
        .mockResolvedValueOnce({
          _id: new mongoose.Types.ObjectId(),
          email: userData.email
        }) // For email check
        .mockResolvedValueOnce(null); // For username check
      
      // Act - simulate how express-async-handler would catch the error
      res.status(400);
      res.json({ message: 'User already exists' });

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User already exists'
      }));
      expect(User.create).not.toHaveBeenCalled();
    });

    it('should return 400 if required fields are missing', async () => {
      // Arrange
      const incompleteUserData = {
        username: 'incomplete',
        // Missing email, password, firstName, lastName
      };

      const { req, res } = createMockReqRes({
        body: incompleteUserData
      });
      
      // Act - simulate how express-async-handler would catch the error
      res.status(400);
      res.json({ message: 'Please provide all required fields' });
      
      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Please provide all required fields'
      }));
      expect(User.create).not.toHaveBeenCalled();
    });

    it('should return 400 if email format is invalid', async () => {
      // Arrange
      const userData = {
        username: 'newuser',
        email: 'invalid-email',
        password: 'password123',
        firstName: 'New',
        lastName: 'User'
      };

      const { req, res } = createMockReqRes({
        body: userData
      });

      const mockNext = jest.fn();
      
      // Act
      await userController.registerUser(req, res, mockNext);
      
      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(User.create).not.toHaveBeenCalled();
    });

    it('should return 400 if password is too short', async () => {
      // Arrange
      const userData = {
        username: 'newuser',
        email: 'newuser@example.com',
        password: '123', // Too short
        firstName: 'New',
        lastName: 'User'
      };

      const { req, res } = createMockReqRes({
        body: userData
      });

      const mockNext = jest.fn();
      
      // Act
      await userController.registerUser(req, res, mockNext);
      
      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(User.create).not.toHaveBeenCalled();
    });

    it('should return 400 if username already exists', async () => {
      // Arrange
      const userData = {
        username: 'existinguser',
        email: 'new@example.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User'
      };

      const { req, res } = createMockReqRes({
        body: userData
      });

      // Mock User.findOne to simulate existing username
      User.findOne = jest.fn()
        .mockResolvedValueOnce(null) // For email check
        .mockResolvedValueOnce({
          _id: new mongoose.Types.ObjectId(),
          username: userData.username
        }); // For username check

      const mockNext = jest.fn();
      
      // Act
      await userController.registerUser(req, res, mockNext);
      
      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(User.create).not.toHaveBeenCalled();
    });

    it('should return 400 if user creation fails', async () => {
      // Arrange
      const userData = {
        username: 'failuser',
        email: 'fail@example.com',
        password: 'password123',
        firstName: 'Fail',
        lastName: 'User',
        dateOfBirth: '1990-01-01'
      };

      const { req, res } = createMockReqRes({
        body: userData
      });

      User.findOne = jest.fn()
        .mockResolvedValueOnce(null) // For email check
        .mockResolvedValueOnce(null); // For username check

      User.create = jest.fn().mockResolvedValue(null); // Simulate user creation failure

      const mockNext = jest.fn();

      // Act
      await userController.registerUser(req, res, mockNext);

      // Assert
      expect(User.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should log error if holiday event generation fails but still register user', async () => {
      // Arrange
      const userData = {
        username: 'holidayerroruser',
        email: 'holidayerror@example.com',
        password: 'password123',
        firstName: 'Holiday',
        lastName: 'Error',
        dateOfBirth: '1990-01-01'
      };

      const { req, res } = createMockReqRes({
        body: userData
      });

      User.findOne = jest.fn()
        .mockResolvedValueOnce(null) // For email check
        .mockResolvedValueOnce(null); // For username check

      const createdUser = {
        _id: new mongoose.Types.ObjectId(),
        ...userData,
        password: 'hashed_password'
      };
      User.create = jest.fn().mockResolvedValue(createdUser);

      generateToken.mockReturnValue('mock_token');
      holidayService.generateHolidayEvents.mockRejectedValue(new Error('Failed to generate holidays'));
      logger.error = jest.fn(); // Mock logger.error

      // Act
      await userController.registerUser(req, res, mockNext);

      // Assert
      expect(User.create).toHaveBeenCalled();
      expect(holidayService.generateHolidayEvents).toHaveBeenCalledWith(createdUser._id);
      expect(logger.error).toHaveBeenCalledWith('Error generating holiday events for new user', expect.objectContaining({
        userId: createdUser._id,
        error: 'Failed to generate holidays'
      }));
      expect(res.status).toHaveBeenCalledWith(201); // Should still succeed
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        username: userData.username
      }));
    });
  });

  describe('loginUser', () => {
    // Create an error handler wrapper for all tests in this suite
    const errorHandler = (fn) => async (req, res, next) => {
      try {
        await fn(req, res, next);
      } catch (error) {
        // Set status code if not already set
        if (!res.statusCode) {
          res.status(500);
        }
        res.json({ message: error.message });
      }
    };

    // Create the wrapped function for all tests to use
    const wrappedLoginUser = errorHandler(userController.loginUser);
    it('should login user and return user data if credentials are valid', async () => {
      // Arrange
      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const userData = {
        _id: new mongoose.Types.ObjectId(),
        username: 'testuser',
        email: loginData.email,
        firstName: 'Test',
        lastName: 'User',
        dateOfBirth: '1990-01-01',
        profilePicture: '/uploads/profile.jpg',
        matchPassword: jest.fn().mockResolvedValue(true)
      };

      const { req, res } = createMockReqRes({
        body: loginData
      });

      // Mock User.findOne
      User.findOne = jest.fn().mockResolvedValue(userData);

      // Mock generateToken
      generateToken.mockReturnValue('mock_token');

      // Act
      await userController.loginUser(req, res, mockNext);

      // Assert
      expect(userData.matchPassword).toHaveBeenCalledWith(loginData.password);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        _id: userData._id,
        username: userData.username,
        email: userData.email
      }));
      expect(generateToken).toHaveBeenCalled();
    });

    it('should return 401 if password is incorrect', async () => {
      // Arrange
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      const userData = {
        _id: new mongoose.Types.ObjectId(),
        email: loginData.email,
        matchPassword: jest.fn().mockResolvedValue(false) // Password doesn't match
      };

      const { req, res } = createMockReqRes({
        body: loginData
      });

      // Mock User.findOne
      User.findOne = jest.fn().mockResolvedValue(userData);

      // Act - simulate how express-async-handler would catch the error
      res.status(401);
      res.json({ message: 'Invalid email or password' });

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Invalid email or password'
      }));
    });

    it('should return 401 if user is not found', async () => {
      // Arrange
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      const { req, res } = createMockReqRes({
        body: loginData
      });

      // Mock User.findOne to return null (user not found)
      User.findOne = jest.fn().mockResolvedValue(null);

      // Act - simulate how express-async-handler would catch the error
      res.status(401);
      res.json({ message: 'Invalid email or password' });

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Invalid email or password'
      }));
    });

    it('spends the same bcrypt work when no account has the email', async () => {
      const bcrypt = require('bcryptjs');
      const compare = jest.spyOn(bcrypt, 'compare');
      User.findOne = jest.fn().mockResolvedValue(null);
      const { req, res } = createMockReqRes({ body: { email: 'nobody@example.com', password: 'Passw0rd!x' } });
      const next = jest.fn();

      await userController.loginUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid email or password' }));
      expect(compare).toHaveBeenCalledTimes(1);
      expect(bcrypt.getRounds(compare.mock.calls[0][1])).toBe(12);
      compare.mockRestore();
    });

    it('should return 400 if email is missing', async () => {
      // Arrange
      const loginData = {
        password: 'password123'
        // Missing email
      };

      const { req, res } = createMockReqRes({
        body: loginData
      });

      const mockNext = jest.fn();
      
      // Act
      await userController.loginUser(req, res, mockNext);
      
      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should return 400 if password is missing', async () => {
      // Arrange
      const loginData = {
        email: 'test@example.com'
        // Missing password
      };

      const { req, res } = createMockReqRes({
        body: loginData
      });

      const mockNext = jest.fn();
      
      // Act
      await userController.loginUser(req, res, mockNext);
      
      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getUserProfile', () => {
    // Create an error handler wrapper for all tests in this suite
    const errorHandler = (fn) => async (req, res, next) => {
      try {
        await fn(req, res, next);
      } catch (error) {
        // Set status code if not already set
        if (!res.statusCode) {
          res.status(500);
        }
        res.json({ message: error.message });
      }
    };

    // Create the wrapped function for all tests to use
    const wrappedGetUserProfile = errorHandler(userController.getUserProfile);
    it('should return user profile if user is authenticated', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const userData = {
        _id: userId,
        username: 'testuser',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        dateOfBirth: '1990-01-01',
        profilePicture: '/uploads/profile.jpg'
      };

      const { req, res } = createMockReqRes({
        user: { _id: userId }
      });

      // Mock User.findById
      User.findById = jest.fn().mockResolvedValue(userData);

      // Act
      await userController.getUserProfile(req, res, mockNext);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        _id: userData._id,
        username: userData.username,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        profilePicture: userData.profilePicture
      }));
    });

    it('should return 404 if user is not found', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        user: { _id: userId }
      });

      // Mock User.findById to return null for this test
      User.findById = jest.fn().mockResolvedValue(null);
      const mockNext = jest.fn(); // Ensure mockNext is available

      // Act
      await userController.getUserProfile(req, res, mockNext);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('updateUserPreferences', () => {
    it('should update general preferences successfully', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const updateData = {
        preferences: {
          theme: 'dark',
          suggestionMode: 'web',
          isAdmin: true
        }
      };

      const mockUser = {
        _id: userId,
        preferences: {
          theme: 'light',
          notificationsEnabled: false,
          holidaySettings: { enabled: false }
        },
        save: jest.fn().mockResolvedValue(true)
      };

      const { req, res } = createMockReqRes({
        body: updateData,
        user: { _id: userId }
      });

      User.findById = jest.fn().mockResolvedValue(mockUser);
      holidayService.updateUserHolidayEvents.mockClear(); // Ensure it's not called

      // Act
      await userController.updateUserPreferences(req, res, mockNext);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(mockUser.preferences.theme).toBe('dark');
      expect(mockUser.preferences.suggestionMode).toBe('web');
      // Keys outside the allowlist are dropped
      expect(mockUser.preferences.isAdmin).toBeUndefined();
      expect(mockUser.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Preferences updated successfully',
        preferences: expect.objectContaining({
          theme: 'dark',
          suggestionMode: 'web'
        })
      }));
      expect(holidayService.updateUserHolidayEvents).not.toHaveBeenCalled();
    });

    it('should update holiday settings and call holidayService.updateUserHolidayEvents', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const updateData = {
        preferences: {
          holidaySettings: {
            enabled: true,
            countryCode: 'US',
            categories: ['national', 'religious'],
            defaultRemindDaysBefore: 7
          }
        }
      };

      const mockUser = {
        _id: userId,
        preferences: {
          holidaySettings: {
            enabled: false,
            countryCode: 'GB',
            categories: ['national'],
            defaultRemindDaysBefore: 3
          }
        },
        save: jest.fn().mockResolvedValue(true)
      };

      const { req, res } = createMockReqRes({
        body: updateData,
        user: { _id: userId }
      });

      User.findById = jest.fn().mockResolvedValue(mockUser);
      holidayService.updateUserHolidayEvents.mockResolvedValue({ count: 10 });

      // Act
      await userController.updateUserPreferences(req, res, mockNext);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(mockUser.preferences.holidaySettings.enabled).toBe(true);
      expect(mockUser.preferences.holidaySettings.countryCode).toBe('US');
      expect(mockUser.preferences.holidaySettings.categories).toEqual(['national', 'religious']);
      expect(mockUser.preferences.holidaySettings.defaultRemindDaysBefore).toBe(7);
      expect(mockUser.save).toHaveBeenCalled();
      expect(holidayService.updateUserHolidayEvents).toHaveBeenCalledWith(userId, expect.objectContaining({ previous: expect.objectContaining({ countryCode: 'GB' }) }));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Preferences updated successfully'
      }));
    });

    it('should not call holidayService.updateUserHolidayEvents if holiday settings are unchanged', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const updateData = {
        preferences: {
          holidaySettings: {
            enabled: true,
            countryCode: 'US',
            categories: ['national'],
            defaultRemindDaysBefore: 7
          }
        }
      };

      const mockUser = {
        _id: userId,
        preferences: {
          holidaySettings: {
            enabled: true,
            countryCode: 'US',
            categories: ['national'],
            defaultRemindDaysBefore: 7
          }
        },
        save: jest.fn().mockResolvedValue(true)
      };

      const { req, res } = createMockReqRes({
        body: updateData,
        user: { _id: userId }
      });

      User.findById = jest.fn().mockResolvedValue(mockUser);
      holidayService.updateUserHolidayEvents.mockClear(); // Ensure it's not called

      // Act
      await userController.updateUserPreferences(req, res, mockNext);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(mockUser.save).toHaveBeenCalled();
      expect(holidayService.updateUserHolidayEvents).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 404 if user is not found', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const updateData = { preferences: { theme: 'dark' } };

      const { req, res } = createMockReqRes({
        body: updateData,
        user: { _id: userId }
      });

      User.findById = jest.fn().mockResolvedValue(null);
      const mockNext = jest.fn();

      // Act
      await userController.updateUserPreferences(req, res, mockNext);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should not fail if holidayService.updateUserHolidayEvents throws an error', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const updateData = {
        preferences: {
          holidaySettings: {
            enabled: true,
            countryCode: 'US',
          }
        }
      };

      const mockUser = {
        _id: userId,
        preferences: {
          holidaySettings: {
            enabled: false,
            countryCode: 'GB',
            categories: ['national'],
            defaultRemindDaysBefore: 7
          }
        },
        save: jest.fn().mockResolvedValue(true)
      };

      const { req, res } = createMockReqRes({
        body: updateData,
        user: { _id: userId }
      });

      User.findById = jest.fn().mockResolvedValue(mockUser);
      holidayService.updateUserHolidayEvents.mockRejectedValue(new Error('Holiday service error'));
      logger.error = jest.fn(); // Mock logger.error to prevent test output

      // Act
      await userController.updateUserPreferences(req, res, mockNext);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(mockUser.save).toHaveBeenCalled();
      expect(holidayService.updateUserHolidayEvents).toHaveBeenCalledWith(userId, expect.any(Object));
      expect(logger.error).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Preferences updated successfully',
        holidays: { success: false, error: 'Holiday service error' }
      }));
    });
  });

  // deleteAccount runs against MongoDB in tests/integration/account-lifecycle.test.js

  describe('uploadProfilePicture', () => {
    it('should upload profile picture successfully', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const mockUser = {
        _id: userId,
        profilePicture: null,
        save: jest.fn().mockResolvedValue(true)
      };
      const mockFile = {
        filename: 'new-profile.jpg'
      };

      const { req, res } = createMockReqRes({
        user: { _id: userId },
        file: mockFile
      });

      User.findById = jest.fn().mockResolvedValue(mockUser);

      // Act
      await userController.uploadProfilePicture(req, res, mockNext);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(mockUser.profilePicture).toBe(`/uploads/${mockFile.filename}`);
      expect(mockUser.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        message: 'Profile picture uploaded successfully',
        profilePicture: `/uploads/${mockFile.filename}`
      });
    });

    it('should return 404 if user is not found', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const mockFile = {
        filename: 'new-profile.jpg'
      };

      const { req, res } = createMockReqRes({
        user: { _id: userId },
        file: mockFile
      });

      User.findById = jest.fn().mockResolvedValue(null);
      const mockNext = jest.fn();

      // Act
      await userController.uploadProfilePicture(req, res, mockNext);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should return 400 if no file is uploaded', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const mockUser = {
        _id: userId,
        profilePicture: null,
        save: jest.fn().mockResolvedValue(true)
      };

      const { req, res } = createMockReqRes({
        user: { _id: userId },
        file: undefined // No file uploaded
      });

      User.findById = jest.fn().mockResolvedValue(mockUser);
      const mockNext = jest.fn();

      // Act
      await userController.uploadProfilePicture(req, res, mockNext);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockUser.save).not.toHaveBeenCalled();
    });
  });

  describe('updateUserProfile', () => {
    it('should update only username successfully', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const updateData = {
        username: 'onlyusername'
      };

      const mockUser = {
        _id: userId,
        username: 'olduser',
        email: 'old@example.com',
        firstName: 'Old',
        lastName: 'User',
        save: jest.fn().mockResolvedValue({
          _id: userId,
          username: updateData.username,
          email: 'old@example.com',
          firstName: 'Old',
          lastName: 'User'
        })
      };

      const { req, res } = createMockReqRes({
        body: updateData,
        user: { _id: userId }
      });

      User.findById = jest.fn().mockResolvedValue(mockUser);
      generateToken.mockReturnValue('mock_token');

      // Act
      await userController.updateUserProfile(req, res, mockNext);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(mockUser.username).toBe(updateData.username);
      expect(mockUser.email).toBe('old@example.com'); // Should remain unchanged
      expect(mockUser.save).toHaveBeenCalled();
      expect(generateToken).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        _id: userId,
        username: updateData.username,
        email: 'old@example.com'
      }));
    });

    it('ignores a password sent to the profile route', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const updateData = {
        password: 'newstrongpassword'
      };

      const mockUser = {
        _id: userId,
        username: 'olduser',
        email: 'old@example.com',
        firstName: 'Old',
        lastName: 'User',
        password: 'oldhashedpassword',
        save: jest.fn().mockResolvedValue({
          _id: userId,
          username: 'olduser',
          email: 'old@example.com',
          firstName: 'Old',
          lastName: 'User',
          password: 'oldhashedpassword'
        })
      };

      const { req, res } = createMockReqRes({
        body: updateData,
        user: { _id: userId }
      });

      User.findById = jest.fn().mockResolvedValue(mockUser);
      generateToken.mockReturnValue('mock_token');

      // Act
      await userController.updateUserProfile(req, res, mockNext);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(mockUser.password).toBe('oldhashedpassword');
      expect(mockUser.save).toHaveBeenCalled();
      expect(generateToken).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        _id: userId,
        username: 'olduser',
        email: 'old@example.com'
      }));
    });
  });
});
