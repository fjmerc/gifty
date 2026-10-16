// tests/middleware/authMiddleware.test.js
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { protect, admin } = require('../../middleware/authMiddleware');
const User = require('../../models/User');
const { createMockReqRes, mockNext } = require('../utils/mockUtils');

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('../../models/User');
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('Auth Middleware', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('protect', () => {
    it('should call next() if token is valid and user is found', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = 'valid_token';
      const decoded = { id: userId, type: 'access' };
      const user = {
        _id: userId,
        username: 'testuser',
        email: 'test@example.com'
      };

      const { req, res } = createMockReqRes({
        cookies: { access_token: token }
      });

      // Mock jwt.verify to return valid data
      jwt.verify.mockReturnValue(decoded);

      // Mock User.findById
      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(user)
      });

      // Act
      await protect(req, res, mockNext);

      // Assert
      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET);
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(req.user).toEqual(user);
      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should use Authorization header if no cookie is present', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = 'valid_token';
      const decoded = { id: userId, type: 'access' };
      const user = {
        _id: userId,
        username: 'testuser',
        email: 'test@example.com'
      };

      const { req, res } = createMockReqRes({
        headers: { authorization: `Bearer ${token}` }
      });

      // Mock jwt.verify to return valid data
      jwt.verify.mockReturnValue(decoded);

      // Mock User.findById
      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(user)
      });

      // Act
      await protect(req, res, mockNext);

      // Assert
      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET);
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(req.user).toEqual(user);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 401 if no token is provided', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        // No cookies or auth header
      });

      // Act
      await protect(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      // A code the client uses to try its refresh cookie (the browser drops
      // the access cookie when it expires)
      expect(res.json).toHaveBeenCalledWith({
        message: 'Not authorized, no token',
        code: 'NO_TOKEN'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if token has invalid type', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = 'valid_token';
      const decoded = { id: userId, type: 'refresh' }; // Not access token

      const { req, res } = createMockReqRes({
        cookies: { access_token: token }
      });

      // Mock jwt.verify to return token with invalid type
      jwt.verify.mockReturnValue(decoded);

      // Act
      await protect(req, res, mockNext);

      // Assert
      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Invalid token type' 
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if user is not found', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const token = 'valid_token';
      const decoded = { id: userId, type: 'access' };

      const { req, res } = createMockReqRes({
        cookies: { access_token: token }
      });

      // Mock jwt.verify to return valid data
      jwt.verify.mockReturnValue(decoded);

      // Mock User.findById to return null
      User.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      // Act
      await protect(req, res, mockNext);

      // Assert
      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET);
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'User not found' 
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if token is expired', async () => {
      // Arrange
      const token = 'expired_token';
      const { req, res } = createMockReqRes({
        cookies: { access_token: token }
      });

      // Mock jwt.verify to throw TokenExpiredError
      jwt.verify.mockImplementation(() => {
        const error = new Error('Token expired');
        error.name = 'TokenExpiredError';
        throw error;
      });

      // Act
      await protect(req, res, mockNext);

      // Assert
      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if token validation fails with generic error', async () => {
      // Arrange
      const token = 'invalid_token';
      const { req, res } = createMockReqRes({
        cookies: { access_token: token }
      });

      // Mock jwt.verify to throw generic error
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      // Act
      await protect(req, res, mockNext);

      // Assert
      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET);
      expect(res.status).toHaveBeenCalledWith(401);
      // The verifier's own message stays in the server log
      expect(res.json).toHaveBeenCalledWith({ message: 'Not authorized, token validation failed' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('admin', () => {
    it('should call next() if user is an admin', () => {
      // Arrange
      const { req, res } = createMockReqRes({
        user: { 
          _id: new mongoose.Types.ObjectId(),
          role: 'admin'
        }
      });

      // Act
      admin(req, res, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should return 403 if user is not an admin', () => {
      // Arrange
      const { req, res } = createMockReqRes({
        user: { 
          _id: new mongoose.Types.ObjectId(),
          role: 'user' // Not admin
        }
      });

      // Act
      admin(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Not authorized as an admin' 
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 403 if no user is attached to the request', () => {
      // Arrange
      const { req, res } = createMockReqRes({
        // No user property
      });

      // Act
      admin(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ 
        message: 'Not authorized as an admin' 
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
