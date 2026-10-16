// tests/controllers/authController.test.js
const mongoose = require('mongoose');
const authController = require('../../controllers/authController');
const User = require('../../models/User');
const jwt = require('jsonwebtoken');
const { createMockReqRes, mockNext } = require('../utils/mockUtils');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');
const { generateToken } = require('../../utils/generateToken');
const { setAuthCookies } = require('../../utils/cookieUtils');

// Mock dependencies
jest.mock('../../models/User');
jest.mock('jsonwebtoken');
// Only token signing is stubbed; the version check stays real
jest.mock('../../utils/generateToken', () => ({
  ...jest.requireActual('../../utils/generateToken'),
  generateToken: jest.fn()
}));
jest.mock('../../utils/cookieUtils', () => ({
  setAuthCookies: jest.fn()
}));

// Set higher timeout for controller tests
jest.setTimeout(30000);

describe('Auth Controller', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  afterEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  describe('refreshToken', () => {
    it('should refresh token successfully with valid refresh token', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const mockUser = {
        _id: userId,
        username: 'testuser',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User'
      };

      const { req, res } = createMockReqRes({
        cookies: {
          refresh_token: 'valid_refresh_token'
        }
      });

      // Mock JWT verification
      jwt.verify = jest.fn().mockReturnValue({
        id: userId,
        type: 'refresh'
      });

      // Mock User.findById
      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      // Mock token generation
      generateToken
        .mockReturnValueOnce('new_access_token')
        .mockReturnValueOnce('new_refresh_token');

      // Act
      await authController.refreshToken(req, res, mockNext);

      // Assert
      expect(jwt.verify).toHaveBeenCalledWith('valid_refresh_token', process.env.JWT_SECRET);
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(generateToken).toHaveBeenCalledWith(userId, 'access', 0);
      expect(generateToken).toHaveBeenCalledWith(userId, 'refresh', 0);
      expect(setAuthCookies).toHaveBeenCalledWith(res, 'new_access_token', 'new_refresh_token');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Token refreshed successfully'
      });
    });

    it('should return 401 error when refresh token is not provided', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        cookies: {} // No refresh token
      });

      const mockNext = jest.fn();

      // Act
      await authController.refreshToken(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should return 401 error when refresh token is invalid', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        cookies: {
          refresh_token: 'invalid_token'
        }
      });

      // Mock JWT verification to throw error
      jwt.verify = jest.fn().mockImplementation(() => {
        const error = new Error('Invalid token');
        error.name = 'JsonWebTokenError';
        throw error;
      });

      const mockNext = jest.fn();

      // Act
      await authController.refreshToken(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should return 401 error when refresh token is expired', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        cookies: {
          refresh_token: 'expired_token'
        }
      });

      // Mock JWT verification to throw TokenExpiredError
      jwt.verify = jest.fn().mockImplementation(() => {
        const error = new Error('Token expired');
        error.name = 'TokenExpiredError';
        throw error;
      });

      const mockNext = jest.fn();

      // Act
      await authController.refreshToken(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should return 401 error when token type is not refresh', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        cookies: {
          refresh_token: 'access_token_instead_of_refresh'
        }
      });

      // Mock JWT verification to return access token
      jwt.verify = jest.fn().mockReturnValue({
        id: userId,
        type: 'access' // Wrong type
      });

      const mockNext = jest.fn();

      // Act
      await authController.refreshToken(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should return 401 error when user is not found', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        cookies: {
          refresh_token: 'valid_refresh_token'
        }
      });

      // Mock JWT verification
      jwt.verify = jest.fn().mockReturnValue({
        id: userId,
        type: 'refresh'
      });

      // Mock User.findById to return null
      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      const mockNext = jest.fn();

      // Act
      await authController.refreshToken(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle generic JWT errors properly', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        cookies: {
          refresh_token: 'malformed_token'
        }
      });

      // Mock JWT verification to throw generic error
      const customError = new Error('Some other JWT error');
      customError.name = 'SomeOtherError';
      jwt.verify = jest.fn().mockImplementation(() => {
        throw customError;
      });

      const mockNext = jest.fn();

      // Act
      await authController.refreshToken(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockNext).toHaveBeenCalledWith(customError);
    });

    it('should handle database errors properly', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        cookies: {
          refresh_token: 'valid_refresh_token'
        }
      });

      // Mock JWT verification
      jwt.verify = jest.fn().mockReturnValue({
        id: userId,
        type: 'refresh'
      });

      // Mock User.findById to throw database error
      const dbError = new Error('Database connection failed');
      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockRejectedValue(dbError)
      });

      const mockNext = jest.fn();

      // Act
      await authController.refreshToken(req, res, mockNext);

      // Assert
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(mockNext).toHaveBeenCalledWith(dbError);
    });
  });
});
