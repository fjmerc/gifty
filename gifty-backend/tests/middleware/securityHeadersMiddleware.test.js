// tests/middleware/securityHeadersMiddleware.test.js
const configureSecurityHeaders = require('../../middleware/securityHeadersMiddleware');
const { createMockReqRes, mockNext } = require('../utils/mockUtils');

// Mock helmet package
jest.mock('helmet', () => {
  return jest.fn(() => jest.fn());
});

const helmet = require('helmet');

describe('Security Headers Middleware', () => {
  let mockApp;
  let originalEnv;
  let originalApiUrl;

  beforeEach(() => {
    // Create mock Express app
    mockApp = {
      use: jest.fn()
    };

    // Store original environment variables
    originalEnv = process.env.NODE_ENV;
    originalApiUrl = process.env.API_URL;

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment variables
    process.env.NODE_ENV = originalEnv;
    process.env.API_URL = originalApiUrl;
    delete process.env.GIFTY_URL;
  });

  describe('Custom Middleware', () => {
    let customMiddleware;

    beforeEach(() => {
      // Configure security headers to capture the custom middleware
      process.env.NODE_ENV = 'development';
      configureSecurityHeaders(mockApp);
      
      // Get the custom middleware from the second app.use call
      customMiddleware = mockApp.use.mock.calls[1][0];
    });

    it('should set Permissions-Policy header', () => {
      // Arrange
      const { req, res } = createMockReqRes();
      res.setHeader = jest.fn();

      // Act
      customMiddleware(req, res, mockNext);

      // Assert
      expect(res.setHeader).toHaveBeenCalledWith(
        'Permissions-Policy',
        'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()'
      );
    });

    it('should set Cache-Control header', () => {
      // Arrange
      const { req, res } = createMockReqRes();
      res.setHeader = jest.fn();

      // Act
      customMiddleware(req, res, mockNext);

      // Assert
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
      );
    });

    it('should set X-Content-Type-Options header', () => {
      // Arrange
      const { req, res } = createMockReqRes();
      res.setHeader = jest.fn();

      // Act
      customMiddleware(req, res, mockNext);

      // Assert
      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Content-Type-Options',
        'nosniff'
      );
    });

    it('should set X-Frame-Options header', () => {
      // Arrange
      const { req, res } = createMockReqRes();
      res.setHeader = jest.fn();

      // Act
      customMiddleware(req, res, mockNext);

      // Assert
      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Frame-Options',
        'DENY'
      );
    });

    it('should set all custom headers and call next()', () => {
      // Arrange
      const { req, res } = createMockReqRes();
      res.setHeader = jest.fn();

      // Act
      customMiddleware(req, res, mockNext);

      // Assert
      expect(res.setHeader).toHaveBeenCalledTimes(4);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe('configureSecurityHeaders', () => {
    it('should call app.use() twice to configure helmet and custom middleware', () => {
      // Arrange
      process.env.NODE_ENV = 'development';

      // Act
      configureSecurityHeaders(mockApp);

      // Assert
      expect(mockApp.use).toHaveBeenCalledTimes(2);
    });

    it('should call helmet with security configuration', () => {
      // Arrange
      process.env.NODE_ENV = 'development';

      // Act
      configureSecurityHeaders(mockApp);

      // Assert
      expect(helmet).toHaveBeenCalledTimes(1);
      expect(helmet).toHaveBeenCalledWith(expect.objectContaining({
        contentSecurityPolicy: expect.any(Object),
        crossOriginResourcePolicy: expect.any(Object),
        crossOriginOpenerPolicy: expect.any(Object),
        xssFilter: true,
        noSniff: true,
        hidePoweredBy: true,
        hsts: false, // no https GIFTY_URL
        referrerPolicy: expect.any(Object)
      }));
    });

    it('should configure Content Security Policy with correct directives', () => {
      // Arrange
      process.env.NODE_ENV = 'development';

      // Act
      configureSecurityHeaders(mockApp);

      // Assert
      const helmetConfig = helmet.mock.calls[0][0];
      expect(helmetConfig.contentSecurityPolicy.directives).toEqual({
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        mediaSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "*"],
        upgradeInsecureRequests: null
      });
    });

    it('should configure CSP connectSrc for production environment with API_URL', () => {
      // Arrange
      process.env.NODE_ENV = 'production';
      process.env.API_URL = 'https://api.example.com';

      // Act
      configureSecurityHeaders(mockApp);

      // Assert
      const helmetConfig = helmet.mock.calls[0][0];
      // Same-origin only: the combined image serves UI and API together
      expect(helmetConfig.contentSecurityPolicy.directives.connectSrc).toEqual(["'self'"]);
    });

    it('should configure CSP connectSrc for production environment without API_URL', () => {
      // Arrange
      process.env.NODE_ENV = 'production';
      delete process.env.API_URL;

      // Act
      configureSecurityHeaders(mockApp);

      // Assert
      const helmetConfig = helmet.mock.calls[0][0];
      expect(helmetConfig.contentSecurityPolicy.directives.connectSrc).toEqual(["'self'"]);
    });

    it('should configure all helmet security settings correctly', () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      process.env.GIFTY_URL = 'https://gifts.example.com';

      // Act
      configureSecurityHeaders(mockApp);

      // Assert
      const helmetConfig = helmet.mock.calls[0][0];
      
      // Test Cross-Origin Resource Policy
      expect(helmetConfig.crossOriginResourcePolicy.policy).toBe('same-site');
      
      // Test Cross-Origin Opener Policy
      expect(helmetConfig.crossOriginOpenerPolicy.policy).toBe('same-origin');
      
      // Test XSS Filter
      expect(helmetConfig.xssFilter).toBe(true);
      
      // Test noSniff
      expect(helmetConfig.noSniff).toBe(true);
      
      // Test hidePoweredBy
      expect(helmetConfig.hidePoweredBy).toBe(true);
      
      // Test HSTS configuration
      expect(helmetConfig.hsts).toEqual({
        maxAge: 15552000,
        includeSubDomains: true,
        preload: true
      });
      
      // Test Referrer Policy
      expect(helmetConfig.referrerPolicy.policy).toBe('strict-origin-when-cross-origin');
    });

    it('should handle app parameter correctly', () => {
      // Arrange
      const customApp = {
        use: jest.fn()
      };
      process.env.NODE_ENV = 'development';

      // Act
      configureSecurityHeaders(customApp);

      // Assert
      expect(customApp.use).toHaveBeenCalledTimes(2);
      expect(mockApp.use).not.toHaveBeenCalled();
    });
  });
});
