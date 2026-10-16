// tests/utils/mockUtils.js
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

module.exports = {
  /**
   * Create a mock user for testing authentication
   * @param {Object} overrides - Values to override default user properties
   * @returns {Object} Mock user object with specified or default properties
   */
  createMockUser: (overrides = {}) => {
    return {
      _id: new mongoose.Types.ObjectId(),
      username: 'testuser',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'user',
      ...overrides
    };
  },

  /**
   * Generate a valid JWT token for testing authenticated routes
   * @param {string} userId - User ID to encode in the token
   * @param {string} type - Token type (access or refresh)
   * @param {string} secret - Secret key to sign the token (defaults to 'test_jwt_secret')
   * @returns {string} Valid JWT token
   */
  generateTestToken: (userId, type = 'access', secret = 'test_jwt_secret') => {
    return jwt.sign(
      { id: userId, type },
      secret,
      { expiresIn: '1h' }
    );
  },

  /**
   * Create mock request and response objects for controller testing
   * @param {Object} reqOverrides - Values to override default request properties
   * @param {Object} resOverrides - Values to override default response properties
   * @returns {Object} Object containing mock req and res objects
   */
  createMockReqRes: (reqOverrides = {}, resOverrides = {}) => {
    // Event handlers storage for triggering events in tests
    const eventHandlers = {};

    // Mock response object
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      get: jest.fn().mockReturnValue(null),
      on: jest.fn((event, handler) => {
        if (!eventHandlers[event]) eventHandlers[event] = [];
        eventHandlers[event].push(handler);
      }),
      emit: (event, ...args) => {
        if (eventHandlers[event]) {
          eventHandlers[event].forEach(handler => handler(...args));
        }
      },
      end: jest.fn(),
      statusCode: 200,
      headersSent: false,
      _eventHandlers: eventHandlers, // Expose for testing
      ...resOverrides
    };

    // Mock request object
    const req = {
      body: {},
      query: {},
      params: {},
      cookies: {},
      headers: {
        'content-type': 'application/json'
      },
      ...reqOverrides
    };

    return { req, res };
  },

  /**
   * Create a mock next function for middleware testing
   * @returns {Function} Mock next function
   */
  mockNext: jest.fn()
};
