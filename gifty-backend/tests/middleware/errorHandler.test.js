// tests/middleware/errorHandler.test.js

// Mock logger utility
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  addRequestContext: jest.fn()
}));

// Mock console.error for fallback testing
const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

// Import after mocking
const errorHandler = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');
const { createMockReqRes, mockNext } = require('../utils/mockUtils');

describe('Error Handler Middleware', () => {
  // Store original environment
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    consoleSpy.mockClear();
    
    // Reset logger methods to their mocked functions
    logger.error = jest.fn();
    logger.warn = jest.fn();
    logger.addRequestContext = jest.fn();
  });

  afterEach(() => {
    // Restore original environment
    process.env.NODE_ENV = originalEnv;
  });

  describe('Basic Error Handling', () => {
    it('should handle error with default 500 status code', () => {
      // Arrange
      const mockError = new Error('Test error message');
      const { req, res } = createMockReqRes({
        id: 'test-request-id'
      });
      
      // Set initial response status to 200 (default)
      res.statusCode = 200;
      
      // Mock logger.addRequestContext to return context
      logger.addRequestContext.mockReturnValue({
        requestId: 'test-request-id',
        method: 'GET',
        url: '/test'
      });

      // Act
      errorHandler(mockError, req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Test error message',
        requestId: 'test-request-id',
        stack: mockError.stack
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Error processing request: Test error message',
        expect.objectContaining({
          statusCode: 500,
          error: 'Test error message',
          requestId: 'test-request-id',
          method: 'GET',
          url: '/test'
        })
      );
    });

    it('should handle error with custom status code from error object', () => {
      // Arrange
      const mockError = new Error('Validation failed');
      mockError.statusCode = 400;
      const { req, res } = createMockReqRes({
        id: 'test-request-id'
      });
      
      // Set initial response status to 200 (default)
      res.statusCode = 200;
      
      logger.addRequestContext.mockReturnValue({ requestId: 'test-request-id' });

      // Act
      errorHandler(mockError, req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Validation failed',
        requestId: 'test-request-id',
        stack: mockError.stack
      });
      expect(logger.warn).toHaveBeenCalledWith(
        'Error processing request: Validation failed',
        expect.objectContaining({
          statusCode: 400,
          error: 'Validation failed'
        })
      );
    });

    it('should handle error using response status code when error has no statusCode', () => {
      // Arrange
      const mockError = new Error('Not found');
      const { req, res } = createMockReqRes({
        id: 'test-request-id'
      });
      
      // Set response status code to non-200
      res.statusCode = 404;
      logger.addRequestContext.mockReturnValue({ requestId: 'test-request-id' });

      // Act
      errorHandler(mockError, req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Not found',
        requestId: 'test-request-id',
        stack: mockError.stack
      });
      expect(logger.warn).toHaveBeenCalledWith(
        'Error processing request: Not found',
        expect.objectContaining({
          statusCode: 404,
          error: 'Not found'
        })
      );
    });

    it('should include request ID in response when available', () => {
      // Arrange
      const mockError = new Error('Test error');
      const { req, res } = createMockReqRes({
        id: 'custom-request-id'
      });
      
      logger.addRequestContext.mockReturnValue({});

      // Act
      errorHandler(mockError, req, res, mockNext);

      // Assert
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Test error',
        requestId: 'custom-request-id',
        stack: mockError.stack
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle error with no message', () => {
      // Arrange
      const mockError = new Error();
      mockError.message = '';
      const { req, res } = createMockReqRes({
        id: 'test-request-id'
      });
      
      res.statusCode = 200;
      logger.addRequestContext.mockReturnValue({});

      // Act
      errorHandler(mockError, req, res, mockNext);

      // Assert
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'An error occurred',
        requestId: 'test-request-id',
        stack: mockError.stack
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Error processing request: Unknown error',
        expect.objectContaining({
          statusCode: 500,
          error: ''
        })
      );
    });

    it('should handle error with complete error properties', () => {
      // Arrange
      const mockError = new Error('Database connection failed');
      mockError.statusCode = 503;
      mockError.name = 'DatabaseError';
      mockError.code = 'CONN_FAILED';
      mockError.details = { host: 'localhost', port: 5432 };
      
      const { req, res } = createMockReqRes({
        id: 'test-request-id'
      });
      
      res.statusCode = 200;
      logger.addRequestContext.mockReturnValue({ requestId: 'test-request-id' });

      // Act
      errorHandler(mockError, req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Database connection failed',
        requestId: 'test-request-id',
        stack: mockError.stack,
        details: { host: 'localhost', port: 5432 }
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Error processing request: Database connection failed',
        expect.objectContaining({
          statusCode: 503,
          error: 'Database connection failed',
          name: 'DatabaseError',
          code: 'CONN_FAILED',
          stack: mockError.stack
        })
      );
    });

    it('should handle error without request ID', () => {
      // Arrange
      const mockError = new Error('Test error');
      const { req, res } = createMockReqRes({
        // No id property
      });
      
      res.statusCode = 200;
      logger.addRequestContext.mockReturnValue({});

      // Act
      errorHandler(mockError, req, res, mockNext);

      // Assert
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Test error',
        requestId: undefined,
        stack: mockError.stack
      });
    });
  });

  describe('Logger Integration', () => {
    it('should use console.error fallback when logger methods are unavailable', () => {
      // Arrange
      const mockError = new Error('Test error');
      const { req, res } = createMockReqRes({
        id: 'test-request-id'
      });
      
      res.statusCode = 200;
      
      // Mock logger to not have error/warn methods
      logger.error = undefined;
      logger.warn = undefined;
      logger.addRequestContext.mockReturnValue({ requestId: 'test-request-id' });

      // Act
      errorHandler(mockError, req, res, mockNext);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error processing request: Test error',
        {
          statusCode: 500,
          error: 'Test error',
          stack: mockError.stack
        }
      );
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should handle missing logger.addRequestContext gracefully', () => {
      // Arrange
      const mockError = new Error('Test error');
      const { req, res } = createMockReqRes({
        id: 'test-request-id'
      });
      
      res.statusCode = 200;
      
      // Mock logger without addRequestContext
      logger.addRequestContext = undefined;

      // Act
      errorHandler(mockError, req, res, mockNext);

      // Assert
      expect(logger.error).toHaveBeenCalledWith(
        'Error processing request: Test error',
        expect.objectContaining({
          statusCode: 500,
          error: 'Test error'
        })
      );
    });
  });

  describe('Environment-Aware Behavior', () => {
    it('should sanitize 500 error messages in production', () => {
      // Arrange
      process.env.NODE_ENV = 'production';
      const mockError = new Error('Sensitive internal error details');
      const { req, res } = createMockReqRes({
        id: 'test-request-id'
      });
      
      res.statusCode = 200;
      logger.addRequestContext.mockReturnValue({});

      // Act
      errorHandler(mockError, req, res, mockNext);

      // Assert
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Internal server error',
        requestId: 'test-request-id'
      });
      // Should not include stack trace in production
      expect(res.json).not.toHaveBeenCalledWith(
        expect.objectContaining({ stack: expect.anything() })
      );
    });

    it('should preserve non-500 error messages in production', () => {
      // Arrange
      process.env.NODE_ENV = 'production';
      const mockError = new Error('Validation failed');
      mockError.statusCode = 400;
      const { req, res } = createMockReqRes({
        id: 'test-request-id'
      });
      
      res.statusCode = 200;
      logger.addRequestContext.mockReturnValue({});

      // Act
      errorHandler(mockError, req, res, mockNext);

      // Assert
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Validation failed',
        requestId: 'test-request-id'
      });
    });

    it('should include error details in development', () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      const mockError = new Error('Validation failed');
      mockError.details = { field: 'email', reason: 'invalid format' };
      const { req, res } = createMockReqRes({
        id: 'test-request-id'
      });
      
      res.statusCode = 200;
      logger.addRequestContext.mockReturnValue({});

      // Act
      errorHandler(mockError, req, res, mockNext);

      // Assert
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Validation failed',
        requestId: 'test-request-id',
        stack: mockError.stack,
        details: { field: 'email', reason: 'invalid format' }
      });
    });
  });
});

describe('errorHandler maps client errors to 4xx', () => {
  const mongoose = require('mongoose');
  const express = require('express');
  const request = require('supertest');
  const handler = require('../../middleware/errorHandler');

  const appThrowing = (err) => {
    const app = express();
    app.get('/', (req, res, next) => next(err));
    app.use(handler);
    return app;
  };

  it('CastError (malformed id or number) → 400', async () => {
    const err = new mongoose.Error.CastError('ObjectId', 'nope', '_id');
    const res = await request(appThrowing(err)).get('/');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid _id/);
  });

  it('ValidationError → 400 listing the failing fields', async () => {
    const err = new mongoose.Error.ValidationError();
    err.addError('price', new mongoose.Error.ValidatorError({ message: 'Price must be at least 0', path: 'price' }));
    const res = await request(appThrowing(err)).get('/');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Price must be at least 0/);
  });

  it('HttpError keeps its own status', async () => {
    const { HttpError } = require('../../utils/ownership');
    const res = await request(appThrowing(new HttpError(404, 'Gift not found'))).get('/');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Gift not found');
  });
});
