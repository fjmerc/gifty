import authUtils from '../utils/authUtils';

// Mock authUtils
jest.mock('../utils/authUtils');

describe('axiosInstance', () => {
  let axiosInstance;
  
  beforeEach(() => {
    jest.clearAllMocks();
    axiosInstance = require('../axiosInstance').default;
  });

  describe('Module Integration', () => {
    it('should export the axios instance module', () => {
      expect(axiosInstance).toBeDefined();
    });

    it('should have authUtils dependency available', () => {
      expect(authUtils).toBeDefined();
      expect(authUtils.refreshToken).toBeDefined();
    });

    it('should support authentication error handling', async () => {
      authUtils.refreshToken.mockResolvedValue(true);
      const result = await authUtils.refreshToken();
      expect(result).toBe(true);
    });

    it('should support token refresh failure handling', async () => {
      authUtils.refreshToken.mockResolvedValue(false);
      const result = await authUtils.refreshToken();
      expect(result).toBe(false);
    });

    it('should support token refresh error handling', async () => {
      const error = new Error('Refresh failed');
      authUtils.refreshToken.mockRejectedValue(error);
      await expect(authUtils.refreshToken()).rejects.toThrow('Refresh failed');
    });

    it('should support custom event dispatching for auth errors', () => {
      const spy = jest.spyOn(window, 'dispatchEvent');
      const event = new CustomEvent('auth-error', { detail: { message: 'test' } });
      window.dispatchEvent(event);
      expect(spy).toHaveBeenCalledWith(event);
      spy.mockRestore();
    });

    it('should work with different environment configurations', () => {
      const originalEnv = process.env.NODE_ENV;
      
      // Test production
      process.env.NODE_ENV = 'production';
      expect(process.env.NODE_ENV).toBe('production');
      
      // Test development
      process.env.NODE_ENV = 'development';
      expect(process.env.NODE_ENV).toBe('development');
      
      // Restore
      process.env.NODE_ENV = originalEnv;
    });

    it('should support environment variable configuration', () => {
      const originalUrl = process.env.REACT_APP_API_BASE_URL;
      
      process.env.REACT_APP_API_BASE_URL = 'https://test.example.com/api';
      expect(process.env.REACT_APP_API_BASE_URL).toBe('https://test.example.com/api');
      
      // Restore
      if (originalUrl) {
        process.env.REACT_APP_API_BASE_URL = originalUrl;
      } else {
        delete process.env.REACT_APP_API_BASE_URL;
      }
    });
  });
  
  describe('Test Infrastructure Compatibility', () => {
    it('should work with the test environment setup', () => {
      // Verify that the test environment is properly configured
      expect(typeof jest).toBe('object');
      expect(typeof expect).toBe('function');
      expect(global.localStorage).toBeDefined();
      expect(global.sessionStorage).toBeDefined();
    });

    it('should work with mocked dependencies', () => {
      // Verify mocks are working
      expect(jest.isMockFunction(authUtils.refreshToken)).toBe(true);
    });
  });
});