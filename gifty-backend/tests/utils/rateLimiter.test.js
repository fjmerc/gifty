const RateLimiter = require('../../utils/rateLimiter');

describe('RateLimiter Utility', () => {
  let originalDateNow;
  let mockTime;

  beforeEach(() => {
    // Mock Date.now() for predictable timing
    mockTime = 1640995200000; // 2022-01-01 00:00:00 UTC
    originalDateNow = Date.now;
    Date.now = jest.fn(() => mockTime);
  });

  afterEach(() => {
    // Restore original Date.now
    Date.now = originalDateNow;
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create a RateLimiter instance with correct properties', () => {
      // Arrange & Act
      const rateLimiter = new RateLimiter(5, 1000);

      // Assert
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
      expect(rateLimiter.maxRequests).toBe(5);
      expect(rateLimiter.timeWindow).toBe(1000);
      expect(rateLimiter.requests).toEqual([]);
    });

    it('should handle zero maxRequests', () => {
      // Arrange & Act
      const rateLimiter = new RateLimiter(0, 1000);

      // Assert
      expect(rateLimiter.maxRequests).toBe(0);
      expect(rateLimiter.timeWindow).toBe(1000);
      expect(rateLimiter.requests).toEqual([]);
    });

    it('should handle zero timeWindow', () => {
      // Arrange & Act
      const rateLimiter = new RateLimiter(5, 0);

      // Assert
      expect(rateLimiter.maxRequests).toBe(5);
      expect(rateLimiter.timeWindow).toBe(0);
      expect(rateLimiter.requests).toEqual([]);
    });

    it('should handle large numbers', () => {
      // Arrange & Act
      const rateLimiter = new RateLimiter(1000000, 3600000); // 1M requests per hour

      // Assert
      expect(rateLimiter.maxRequests).toBe(1000000);
      expect(rateLimiter.timeWindow).toBe(3600000);
      expect(rateLimiter.requests).toEqual([]);
    });
  });

  describe('wait() method - Basic functionality', () => {
    it('should allow first request without waiting', async () => {
      // Arrange
      const rateLimiter = new RateLimiter(5, 1000);

      // Act
      const startTime = Date.now();
      await rateLimiter.wait();
      const endTime = Date.now();

      // Assert
      expect(rateLimiter.requests).toHaveLength(1);
      expect(rateLimiter.requests[0]).toBe(mockTime);
      expect(endTime - startTime).toBe(0); // No waiting should occur
    });

    it('should allow multiple requests within limit', async () => {
      // Arrange
      const rateLimiter = new RateLimiter(5, 1000);

      // Act - Make 3 requests
      for (let i = 0; i < 3; i++) {
        mockTime += 10; // Advance time slightly
        await rateLimiter.wait();
      }

      // Assert
      expect(rateLimiter.requests).toHaveLength(3);
      expect(rateLimiter.requests[0]).toBe(1640995200010);
      expect(rateLimiter.requests[1]).toBe(1640995200020);
      expect(rateLimiter.requests[2]).toBe(1640995200030);
    });
  });

  describe('wait() method - Rate limiting behavior', () => {
    it('should enforce rate limit when maxRequests is reached', async () => {
      // Arrange
      const rateLimiter = new RateLimiter(2, 1000);
      
      // Fill up to the limit
      await rateLimiter.wait();
      mockTime += 10;
      await rateLimiter.wait();

      // Mock setTimeout to track if waiting occurs
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback, delay) => {
        expect(delay).toBe(980); // Should wait 980ms (1000 - 20)
        // Execute callback immediately for test
        callback();
        return 1; // Return a timer ID
      });

      // Act - Third request should cause waiting
      mockTime += 10; // Now at 1640995200020
      await rateLimiter.wait();

      // Assert
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 980);
      
      // Restore setTimeout
      setTimeoutSpy.mockRestore();
    });

    it('should handle zero maxRequests by always waiting after first request', async () => {
      // Arrange
      const rateLimiter = new RateLimiter(0, 1000);
      
      // First request should not wait (requests array is empty)
      await rateLimiter.wait();
      expect(rateLimiter.requests).toHaveLength(1);
      
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
        callback();
        return 1;
      });

      // Act - Second request should wait because 1 >= 0
      mockTime += 10;
      await rateLimiter.wait();

      // Assert - Should wait for second request
      expect(setTimeoutSpy).toHaveBeenCalled();
      
      setTimeoutSpy.mockRestore();
    });
  });

  describe('wait() method - Time window management', () => {
    it('should remove requests outside time window', async () => {
      // Arrange
      const rateLimiter = new RateLimiter(5, 1000);
      
      // Add old requests
      await rateLimiter.wait();
      mockTime += 500;
      await rateLimiter.wait();
      
      // Act - Move time forward beyond window for first request
      mockTime += 600; // Total 1100ms from first request
      await rateLimiter.wait();

      // Assert - First request should be filtered out
      expect(rateLimiter.requests).toHaveLength(2);
      expect(rateLimiter.requests[0]).toBe(1640995200500);
      expect(rateLimiter.requests[1]).toBe(1640995201100);
    });

    it('should clean up requests after waiting', async () => {
      // Arrange
      const rateLimiter = new RateLimiter(2, 1000);
      
      // Fill up to limit
      await rateLimiter.wait();
      mockTime += 10;
      await rateLimiter.wait();

      // Mock setTimeout and advance time during wait
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback, delay) => {
        mockTime += delay + 10; // Simulate time passing during wait + a bit more
        callback();
        return 1;
      });

      // Act
      mockTime += 10;
      await rateLimiter.wait();

      // Assert - Old requests should be cleaned up
      expect(rateLimiter.requests).toHaveLength(1);
      
      setTimeoutSpy.mockRestore();
    });

    it('should handle zero time window correctly', async () => {
      // Arrange
      const rateLimiter = new RateLimiter(5, 0);
      
      // Act - Multiple requests with zero time window
      await rateLimiter.wait();
      await rateLimiter.wait();
      await rateLimiter.wait();

      // Assert - All requests should be filtered out immediately
      expect(rateLimiter.requests).toHaveLength(1); // Only the last one remains
    });
  });

  describe('wait() method - Edge cases and error scenarios', () => {
    it('should handle negative wait time calculation', async () => {
      // Arrange
      const rateLimiter = new RateLimiter(2, 1000);
      
      // Fill requests
      await rateLimiter.wait();
      mockTime += 10;
      await rateLimiter.wait();
      
      // Move time forward significantly
      mockTime += 2000; // Well beyond time window
      
      // Act
      await rateLimiter.wait();

      // Assert - Should not wait as old requests are outside window
      expect(rateLimiter.requests).toHaveLength(1);
      expect(rateLimiter.requests[0]).toBe(1640995202010);
    });

    it('should handle concurrent modifications of requests array', async () => {
      // Arrange
      const rateLimiter = new RateLimiter(3, 1000);
      
      // Manually add some old requests to simulate concurrent access
      rateLimiter.requests.push(mockTime - 2000); // Very old
      rateLimiter.requests.push(mockTime - 500);  // Within window
      rateLimiter.requests.push(mockTime - 100);  // Recent

      // Act
      await rateLimiter.wait();

      // Assert - Should filter out old request and add new one
      expect(rateLimiter.requests).toHaveLength(3);
      expect(rateLimiter.requests[0]).toBe(mockTime - 500);
      expect(rateLimiter.requests[1]).toBe(mockTime - 100);
      expect(rateLimiter.requests[2]).toBe(mockTime);
    });
  });

  describe('wait() method - Integration scenarios', () => {
    it('should handle rapid successive calls', async () => {
      // Arrange
      const rateLimiter = new RateLimiter(5, 1000); // Allow 5 requests
      
      // Mock setTimeout to avoid actual waiting
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
        callback();
        return 1;
      });

      // Act - Make multiple rapid calls
      for (let i = 0; i < 5; i++) {
        mockTime += 1; // Very small time increments
        await rateLimiter.wait();
      }

      // Assert - All requests should be recorded
      expect(rateLimiter.requests).toHaveLength(5);
      
      setTimeoutSpy.mockRestore();
    });

    it('should maintain correct state across multiple rate limit cycles', async () => {
      // Arrange
      const rateLimiter = new RateLimiter(2, 500);

      // Cycle 1: Fill up the limit
      await rateLimiter.wait();
      mockTime += 10;
      await rateLimiter.wait();
      expect(rateLimiter.requests).toHaveLength(2);

      // Move time forward to start new window
      mockTime += 500;
      
      // Cycle 2: Should allow new requests
      await rateLimiter.wait();
      mockTime += 10;
      await rateLimiter.wait();

      // Assert
      expect(rateLimiter.requests).toHaveLength(2);
      expect(rateLimiter.requests[0]).toBe(1640995200510); // First request of cycle 2
      expect(rateLimiter.requests[1]).toBe(1640995200520); // Second request of cycle 2
    });

    it('should work with very small time windows', async () => {
      // Arrange
      const rateLimiter = new RateLimiter(2, 10); // 10ms window

      // Act
      await rateLimiter.wait();
      mockTime += 5;
      await rateLimiter.wait();
      mockTime += 10; // Move beyond window
      await rateLimiter.wait();

      // Assert
      expect(rateLimiter.requests).toHaveLength(1);
      expect(rateLimiter.requests[0]).toBe(1640995200015);
    });

    it('should work with very large time windows', async () => {
      // Arrange
      const rateLimiter = new RateLimiter(5, 86400000); // 24 hours, 5 requests

      // Act
      await rateLimiter.wait();
      mockTime += 3600000; // 1 hour later
      await rateLimiter.wait();
      mockTime += 3600000; // 2 hours total
      await rateLimiter.wait();

      // Assert - All requests should still be within window
      expect(rateLimiter.requests).toHaveLength(3);
    });
  });
});
