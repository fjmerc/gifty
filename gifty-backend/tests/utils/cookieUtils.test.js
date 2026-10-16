const cookieUtils = require('../../utils/cookieUtils');

describe('Cookie Utils Utility', () => {
  afterEach(() => { delete process.env.GIFTY_URL; });
  // Store original environment for restoration
  const originalEnv = process.env.NODE_ENV;
  let mockRes;

  // Helper function to create mock Express response object
  const createMockRes = () => ({
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis()
  });

  beforeEach(() => {
    // Create fresh mock response object for each test
    mockRes = createMockRes();
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    process.env.NODE_ENV = originalEnv;
  });

  describe('Utility Structure', () => {
    it('should export all required cookie utility functions', () => {
      // Arrange & Act & Assert
      expect(typeof cookieUtils.setAuthCookies).toBe('function');
      expect(typeof cookieUtils.clearAuthCookies).toBe('function');
    });

    it('should have setAuthCookies with correct signature', () => {
      // Arrange & Act & Assert
      expect(cookieUtils.setAuthCookies).toBeDefined();
      expect(cookieUtils.setAuthCookies.length).toBe(3); // res, accessToken, refreshToken
    });

    it('should have clearAuthCookies with correct signature', () => {
      // Arrange & Act & Assert
      expect(cookieUtils.clearAuthCookies).toBeDefined();
      expect(cookieUtils.clearAuthCookies.length).toBe(1); // res
    });

    it('should export an object with the expected structure', () => {
      // Arrange & Act & Assert
      expect(typeof cookieUtils).toBe('object');
      expect(Object.keys(cookieUtils)).toEqual(['setAuthCookies', 'clearAuthCookies']);
    });
  });

  describe('setAuthCookies - Access Token Cookie', () => {
    it('should set access token cookie with correct configuration in development', () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      const accessToken = 'test-access-token-123';
      const refreshToken = 'test-refresh-token-456';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', accessToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        maxAge: 60 * 60 * 1000, // 1 hour
        path: '/'
      });
    });

    it('should set access token cookie with correct name and value', () => {
      // Arrange
      const accessToken = 'jwt.access.token.here';
      const refreshToken = 'jwt.refresh.token.here';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'access_token', 
        accessToken, 
        expect.any(Object)
      );
    });

    it('should set access token cookie with 1 hour expiration', () => {
      // Arrange
      const accessToken = 'test-token';
      const refreshToken = 'test-refresh';
      const expectedMaxAge = 60 * 60 * 1000; // 1 hour in milliseconds

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'access_token',
        accessToken,
        expect.objectContaining({ maxAge: expectedMaxAge })
      );
    });

    it('should set access token cookie with root path', () => {
      // Arrange
      const accessToken = 'test-token';
      const refreshToken = 'test-refresh';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'access_token',
        accessToken,
        expect.objectContaining({ path: '/' })
      );
    });
  });

  describe('setAuthCookies - Refresh Token Cookie', () => {
    it('should set refresh token cookie with correct configuration in development', () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      const accessToken = 'test-access-token-123';
      const refreshToken = 'test-refresh-token-456';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/api/users/refresh-token'
      });
    });

    it('should set refresh token cookie with correct name and value', () => {
      // Arrange
      const accessToken = 'jwt.access.token.here';
      const refreshToken = 'jwt.refresh.token.here';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refresh_token', 
        refreshToken, 
        expect.any(Object)
      );
    });

    it('should set refresh token cookie with 7 day expiration', () => {
      // Arrange
      const accessToken = 'test-token';
      const refreshToken = 'test-refresh';
      const expectedMaxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refresh_token',
        refreshToken,
        expect.objectContaining({ maxAge: expectedMaxAge })
      );
    });

    it('should set refresh token cookie with specific refresh endpoint path', () => {
      // Arrange
      const accessToken = 'test-token';
      const refreshToken = 'test-refresh';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refresh_token',
        refreshToken,
        expect.objectContaining({ path: '/api/users/refresh-token' })
      );
    });
  });

  describe('setAuthCookies - Both Cookies Integration', () => {
    it('should set both access and refresh token cookies simultaneously', () => {
      // Arrange
      const accessToken = 'access-123';
      const refreshToken = 'refresh-456';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(mockRes.cookie).toHaveBeenNthCalledWith(1, 'access_token', accessToken, expect.any(Object));
      expect(mockRes.cookie).toHaveBeenNthCalledWith(2, 'refresh_token', refreshToken, expect.any(Object));
    });

    it('should call cookie method with proper method chaining support', () => {
      // Arrange
      const accessToken = 'access-token';
      const refreshToken = 'refresh-token';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert - Both cookie calls should return 'this' for chaining
      expect(mockRes.cookie).toHaveReturnedWith(mockRes);
    });

    it('should handle empty string tokens', () => {
      // Arrange
      const accessToken = '';
      const refreshToken = '';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', '', expect.any(Object));
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', '', expect.any(Object));
    });
  });

  describe('Environment-based Security', () => {
    it('should set secure flag to true in production environment', () => {
      // Arrange
      process.env.NODE_ENV = 'production'; process.env.GIFTY_URL = 'https://gifts.example.com';
      const accessToken = 'prod-access-token';
      const refreshToken = 'prod-refresh-token';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', accessToken, 
        expect.objectContaining({ secure: true })
      );
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', refreshToken, 
        expect.objectContaining({ secure: true })
      );
    });

    it('should set secure flag to false in development environment', () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      const accessToken = 'dev-access-token';
      const refreshToken = 'dev-refresh-token';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', accessToken, 
        expect.objectContaining({ secure: false })
      );
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', refreshToken, 
        expect.objectContaining({ secure: false })
      );
    });

    it('should set secure flag to false when NODE_ENV is undefined', () => {
      // Arrange
      delete process.env.NODE_ENV;
      const accessToken = 'undefined-access-token';
      const refreshToken = 'undefined-refresh-token';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', accessToken, 
        expect.objectContaining({ secure: false })
      );
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', refreshToken, 
        expect.objectContaining({ secure: false })
      );
    });

    it('should set secure flag to false when NODE_ENV is test', () => {
      // Arrange
      process.env.NODE_ENV = 'test';
      const accessToken = 'test-access-token';
      const refreshToken = 'test-refresh-token';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', accessToken, 
        expect.objectContaining({ secure: false })
      );
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', refreshToken, 
        expect.objectContaining({ secure: false })
      );
    });

    it('should set secure flag to false for any non-production environment', () => {
      // Arrange
      process.env.NODE_ENV = 'staging';
      const accessToken = 'staging-access-token';
      const refreshToken = 'staging-refresh-token';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', accessToken, 
        expect.objectContaining({ secure: false })
      );
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', refreshToken, 
        expect.objectContaining({ secure: false })
      );
    });
  });

  describe('clearAuthCookies', () => {
    it('should clear both authentication cookies with matching options in development', () => {
      // Arrange
      process.env.NODE_ENV = 'development';

      // Act
      cookieUtils.clearAuthCookies(mockRes);

      // Assert
      expect(mockRes.clearCookie).toHaveBeenCalledTimes(2);
      expect(mockRes.clearCookie).toHaveBeenCalledWith('access_token', {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        path: '/'
      });
      expect(mockRes.clearCookie).toHaveBeenCalledWith('refresh_token', {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        path: '/api/users/refresh-token'
      });
    });

    it('should clear both authentication cookies with matching options in production', () => {
      // Arrange
      process.env.NODE_ENV = 'production'; process.env.GIFTY_URL = 'https://gifts.example.com';

      // Act
      cookieUtils.clearAuthCookies(mockRes);

      // Assert
      expect(mockRes.clearCookie).toHaveBeenCalledTimes(2);
      expect(mockRes.clearCookie).toHaveBeenCalledWith('access_token', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/'
      });
      expect(mockRes.clearCookie).toHaveBeenCalledWith('refresh_token', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/api/users/refresh-token'
      });
    });

    it('should clear access token cookie with correct options', () => {
      // Arrange
      process.env.NODE_ENV = 'development';

      // Act
      cookieUtils.clearAuthCookies(mockRes);

      // Assert
      expect(mockRes.clearCookie).toHaveBeenCalledWith('access_token', {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        path: '/'
      });
    });

    it('should clear refresh token cookie with correct options', () => {
      // Arrange
      process.env.NODE_ENV = 'development';

      // Act
      cookieUtils.clearAuthCookies(mockRes);

      // Assert
      expect(mockRes.clearCookie).toHaveBeenCalledWith('refresh_token', {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        path: '/api/users/refresh-token'
      });
    });

    it('should support method chaining', () => {
      // Arrange & Act
      cookieUtils.clearAuthCookies(mockRes);

      // Assert - Both clearCookie calls should return 'this' for chaining
      expect(mockRes.clearCookie).toHaveReturnedWith(mockRes);
    });

    it('should clear cookies in the correct order', () => {
      // Arrange & Act
      cookieUtils.clearAuthCookies(mockRes);

      // Assert
      expect(mockRes.clearCookie).toHaveBeenNthCalledWith(1, 'access_token', expect.any(Object));
      expect(mockRes.clearCookie).toHaveBeenNthCalledWith(2, 'refresh_token', expect.any(Object));
    });
  });

  describe('Security Configuration Validation', () => {
    it('should always set httpOnly flag to true for all cookies', () => {
      // Arrange
      const accessToken = 'test-access';
      const refreshToken = 'test-refresh';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', accessToken, 
        expect.objectContaining({ httpOnly: true })
      );
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', refreshToken, 
        expect.objectContaining({ httpOnly: true })
      );
    });

    it('should always set sameSite to strict for CSRF protection', () => {
      // Arrange
      const accessToken = 'test-access';
      const refreshToken = 'test-refresh';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', accessToken, 
        expect.objectContaining({ sameSite: 'strict' })
      );
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', refreshToken, 
        expect.objectContaining({ sameSite: 'strict' })
      );
    });

    it('should set different paths for access vs refresh tokens', () => {
      // Arrange
      const accessToken = 'test-access';
      const refreshToken = 'test-refresh';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', accessToken, 
        expect.objectContaining({ path: '/' })
      );
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', refreshToken, 
        expect.objectContaining({ path: '/api/users/refresh-token' })
      );
    });

    it('should set correct maxAge values for different cookie types', () => {
      // Arrange
      const accessToken = 'test-access';
      const refreshToken = 'test-refresh';
      const accessTokenMaxAge = 60 * 60 * 1000; // 1 hour
      const refreshTokenMaxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', accessToken, 
        expect.objectContaining({ maxAge: accessTokenMaxAge })
      );
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', refreshToken, 
        expect.objectContaining({ maxAge: refreshTokenMaxAge })
      );
    });

    it('should use same security options for set and clear operations in production', () => {
      // Arrange
      process.env.NODE_ENV = 'production'; process.env.GIFTY_URL = 'https://gifts.example.com';
      const expectedAccessOptions = {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/'
      };
      const expectedRefreshOptions = {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/api/users/refresh-token'
      };

      // Act - Set cookies
      cookieUtils.setAuthCookies(mockRes, 'access', 'refresh');
      
      // Reset mocks to test clear operation
      jest.clearAllMocks();
      
      // Act - Clear cookies
      cookieUtils.clearAuthCookies(mockRes);

      // Assert - Clear should use same options (minus maxAge)
      expect(mockRes.clearCookie).toHaveBeenCalledWith('access_token', expectedAccessOptions);
      expect(mockRes.clearCookie).toHaveBeenCalledWith('refresh_token', expectedRefreshOptions);
    });

    it('should use same security options for set and clear operations in development', () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      const expectedAccessOptions = {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        path: '/'
      };
      const expectedRefreshOptions = {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        path: '/api/users/refresh-token'
      };

      // Act - Set cookies
      cookieUtils.setAuthCookies(mockRes, 'access', 'refresh');
      
      // Reset mocks to test clear operation
      jest.clearAllMocks();
      
      // Act - Clear cookies
      cookieUtils.clearAuthCookies(mockRes);

      // Assert - Clear should use same options (minus maxAge)
      expect(mockRes.clearCookie).toHaveBeenCalledWith('access_token', expectedAccessOptions);
      expect(mockRes.clearCookie).toHaveBeenCalledWith('refresh_token', expectedRefreshOptions);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle null access token', () => {
      // Arrange
      const accessToken = null;
      const refreshToken = 'valid-refresh-token';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', null, expect.any(Object));
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', refreshToken, expect.any(Object));
    });

    it('should handle null refresh token', () => {
      // Arrange
      const accessToken = 'valid-access-token';
      const refreshToken = null;

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', accessToken, expect.any(Object));
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', null, expect.any(Object));
    });

    it('should handle undefined access token', () => {
      // Arrange
      const accessToken = undefined;
      const refreshToken = 'valid-refresh-token';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', undefined, expect.any(Object));
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', refreshToken, expect.any(Object));
    });

    it('should handle undefined refresh token', () => {
      // Arrange
      const accessToken = 'valid-access-token';
      const refreshToken = undefined;

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', accessToken, expect.any(Object));
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', undefined, expect.any(Object));
    });

    it('should handle both tokens being null', () => {
      // Arrange
      const accessToken = null;
      const refreshToken = null;

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', null, expect.any(Object));
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', null, expect.any(Object));
    });

    it('should handle numeric token values', () => {
      // Arrange
      const accessToken = 123456;
      const refreshToken = 789012;

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', 123456, expect.any(Object));
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', 789012, expect.any(Object));
    });

    it('should handle object token values', () => {
      // Arrange
      const accessToken = { token: 'access' };
      const refreshToken = { token: 'refresh' };

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', { token: 'access' }, expect.any(Object));
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', { token: 'refresh' }, expect.any(Object));
    });

    it('should handle boolean token values', () => {
      // Arrange
      const accessToken = true;
      const refreshToken = false;

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', true, expect.any(Object));
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', false, expect.any(Object));
    });

    it('should handle very long token strings', () => {
      // Arrange
      const longToken = 'a'.repeat(1000);
      const accessToken = longToken;
      const refreshToken = longToken + 'refresh';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', longToken, expect.any(Object));
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', longToken + 'refresh', expect.any(Object));
    });

    it('should handle special characters in tokens', () => {
      // Arrange
      const accessToken = 'token.with-special_chars!@#$%^&*()[]{}|;:,.<>?';
      const refreshToken = 'refresh+token/with=special&chars';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', accessToken, expect.any(Object));
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', refreshToken, expect.any(Object));
    });
  });

  describe('Express Response Integration', () => {
    it('should call res.cookie method for setAuthCookies', () => {
      // Arrange
      const accessToken = 'test-access';
      const refreshToken = 'test-refresh';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert
      expect(mockRes.cookie).toHaveBeenCalled();
      expect(typeof mockRes.cookie).toBe('function');
    });

    it('should call res.clearCookie method for clearAuthCookies', () => {
      // Arrange & Act
      cookieUtils.clearAuthCookies(mockRes);

      // Assert
      expect(mockRes.clearCookie).toHaveBeenCalled();
      expect(typeof mockRes.clearCookie).toBe('function');
    });

    it('should pass correct number of parameters to res.cookie', () => {
      // Arrange
      const accessToken = 'test-access';
      const refreshToken = 'test-refresh';

      // Act
      cookieUtils.setAuthCookies(mockRes, accessToken, refreshToken);

      // Assert - Each call should have 3 parameters: name, value, options
      mockRes.cookie.mock.calls.forEach(call => {
        expect(call).toHaveLength(3);
        expect(typeof call[0]).toBe('string'); // cookie name
        expect(call[2]).toBeInstanceOf(Object); // options object
      });
    });

    it('should pass correct number of parameters to res.clearCookie', () => {
      // Arrange & Act
      cookieUtils.clearAuthCookies(mockRes);

      // Assert - Each call should have 2 parameters: name, options
      mockRes.clearCookie.mock.calls.forEach(call => {
        expect(call).toHaveLength(2);
        expect(typeof call[0]).toBe('string'); // cookie name
        expect(call[1]).toBeInstanceOf(Object); // options object
      });
    });

    it('should handle response object method chaining properly', () => {
      // Arrange
      const chainableMockRes = {
        cookie: jest.fn().mockReturnThis(),
        clearCookie: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };

      // Act - Simulate method chaining
      cookieUtils.setAuthCookies(chainableMockRes, 'access', 'refresh');
      cookieUtils.clearAuthCookies(chainableMockRes);

      // Assert - Methods should return the response object for chaining
      expect(chainableMockRes.cookie).toHaveReturnedWith(chainableMockRes);
      expect(chainableMockRes.clearCookie).toHaveReturnedWith(chainableMockRes);
    });
  });
});


describe('setAuthCookies secure flag', () => {
  const capture = (env) => {
    const saved = process.env;
    process.env = { ...saved, ...env };
    const calls = [];
    cookieUtils.setAuthCookies({ cookie: (name, value, opts) => calls.push({ name, opts }) }, 'a', 'r');
    process.env = saved;
    return calls;
  };

  it('is not Secure over plain http in production (browser would drop it)', () => {
    const calls = capture({ NODE_ENV: 'production', GIFTY_URL: 'http://192.168.1.10:3000' });
    expect(calls.every((c) => c.opts.secure === false)).toBe(true);
  });

  it('is Secure when GIFTY_URL is https', () => {
    const calls = capture({ NODE_ENV: 'production', GIFTY_URL: 'https://gifts.example.com' });
    expect(calls.every((c) => c.opts.secure === true)).toBe(true);
  });
});

describe('setAuthCookies on a TLS request without GIFTY_URL', () => {
  it('is Secure when the request itself arrived over https (e.g. via a trusted proxy)', () => {
    const saved = process.env;
    process.env = { ...saved, NODE_ENV: 'production' };
    delete process.env.GIFTY_URL;
    const calls = [];
    cookieUtils.setAuthCookies({ req: { secure: true }, cookie: (name, value, opts) => calls.push(opts) }, 'a', 'r');
    process.env = saved;
    expect(calls.every((o) => o.secure === true)).toBe(true);
  });
});

describe('setAuthCookies behind a TLS-terminating proxy (no app-wide trust proxy)', () => {
  const run = (headers) => {
    const saved = process.env;
    process.env = { ...saved, NODE_ENV: 'production' };
    delete process.env.GIFTY_URL;
    const calls = [];
    const req = { secure: false, get: (n) => headers[n.toLowerCase()] };
    cookieUtils.setAuthCookies({ req, cookie: (name, value, opts) => calls.push(opts) }, 'a', 'r');
    process.env = saved;
    return calls;
  };

  it('is Secure when X-Forwarded-Proto is https', () => {
    expect(run({ 'x-forwarded-proto': 'https' }).every((o) => o.secure === true)).toBe(true);
  });

  it('uses the first hop of a comma-separated X-Forwarded-Proto', () => {
    expect(run({ 'x-forwarded-proto': 'https, http' }).every((o) => o.secure === true)).toBe(true);
  });

  it('is not Secure for plain http with no forwarded proto', () => {
    expect(run({}).every((o) => o.secure === false)).toBe(true);
  });
});
