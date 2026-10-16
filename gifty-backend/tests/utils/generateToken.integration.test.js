const jwt = require('jsonwebtoken');
const { generateToken } = require('../../utils/generateToken');

// Integration tests without mocking - uses real JWT library
describe('generateToken Integration Tests (Real JWT)', () => {
  // Store original environment for restoration
  const originalEnv = process.env.JWT_SECRET;

  beforeEach(() => {
    // Set a secure test secret for real JWT testing
    process.env.JWT_SECRET = 'test-real-jwt-secret-key-for-validation-12345';
  });

  afterEach(() => {
    // Restore original environment
    process.env.JWT_SECRET = originalEnv;
  });

  describe('Real JWT Token Generation and Validation', () => {
    it('should generate valid JWT tokens that can be decoded with real JWT library', () => {
      // Arrange
      const userId = 'real-token-user';
      const tokenType = 'access';

      // Act
      const token = generateToken(userId, tokenType);

      // Assert
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
      
      // Decode and verify with real JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      expect(decoded.id).toBe(userId);
      expect(decoded.type).toBe(tokenType);
      expect(decoded.iat).toBeDefined(); // Issued at time
      expect(decoded.exp).toBeDefined(); // Expiration time
    });

    it('should generate tokens with correct expiration times for access tokens', () => {
      // Arrange
      const userId = 'real-access-user';
      const beforeTime = Math.floor(Date.now() / 1000);

      // Act
      const token = generateToken(userId, 'access');

      // Assert
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const expectedExp = beforeTime + (60 * 60); // 1 hour from now
      expect(decoded.exp).toBeGreaterThanOrEqual(expectedExp - 2); // Allow 2 second variance
      expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 2);
    });

    it('should generate tokens with correct expiration times for refresh tokens', () => {
      // Arrange
      const userId = 'real-refresh-user';
      const beforeTime = Math.floor(Date.now() / 1000);

      // Act
      const token = generateToken(userId, 'refresh');

      // Assert
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const expectedExp = beforeTime + (7 * 24 * 60 * 60); // 7 days from now
      expect(decoded.exp).toBeGreaterThanOrEqual(expectedExp - 2); // Allow 2 second variance
      expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 2);
    });

    it('should generate unique tokens for different users', () => {
      // Arrange
      const user1 = 'user-unique-1';
      const user2 = 'user-unique-2';

      // Act
      const token1 = generateToken(user1, 'access');
      const token2 = generateToken(user2, 'access');

      // Assert
      expect(token1).not.toBe(token2);
      
      const decoded1 = jwt.verify(token1, process.env.JWT_SECRET);
      const decoded2 = jwt.verify(token2, process.env.JWT_SECRET);
      expect(decoded1.id).toBe(user1);
      expect(decoded2.id).toBe(user2);
    });

    it('should generate tokens that fail verification with wrong secret', () => {
      // Arrange
      const userId = 'wrong-secret-user';
      const token = generateToken(userId, 'access');
      const wrongSecret = 'wrong-secret-key';

      // Act & Assert
      expect(() => {
        jwt.verify(token, wrongSecret);
      }).toThrow();
    });

    it('should generate tokens with correct algorithm and structure', () => {
      // Arrange
      const userId = 'algorithm-test-user';

      // Act
      const token = generateToken(userId, 'access');

      // Assert
      const decoded = jwt.decode(token, { complete: true });
      expect(decoded.header.alg).toBe('HS256'); // Default JWT algorithm
      expect(decoded.header.typ).toBe('JWT');
      expect(decoded.payload.id).toBe(userId);
      expect(decoded.payload.type).toBe('access');
    });

    it('should handle real JWT errors appropriately', () => {
      // Arrange
      const userId = 'real-error-user';
      const originalSecret = process.env.JWT_SECRET;
      
      // Act & Assert - Test with undefined secret
      delete process.env.JWT_SECRET;
      expect(() => {
        generateToken(userId, 'access');
      }).toThrow(); // Real JWT will throw with undefined secret
      
      // Restore secret
      process.env.JWT_SECRET = originalSecret;
    });

    it('should generate tokens that expire correctly over time', () => {
      // Arrange
      const userId = 'expiry-test-user';
      
      // Act
      const token = generateToken(userId, 'access');
      
      // Assert - Token should be valid immediately
      expect(() => {
        jwt.verify(token, process.env.JWT_SECRET);
      }).not.toThrow();
      
      // Verify expiration time is set correctly
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const currentTime = Math.floor(Date.now() / 1000);
      expect(decoded.exp).toBeGreaterThan(currentTime);
    });

    it('should generate tokens with consistent payload structure', () => {
      // Arrange
      const userId = 'payload-structure-test';
      const tokenType = 'refresh';

      // Act
      const token = generateToken(userId, tokenType);

      // Assert
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      expect(decoded).toHaveProperty('id', userId);
      expect(decoded).toHaveProperty('type', tokenType);
      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');
      
      // Ensure no extra properties
      const expectedKeys = ['id', 'type', 'tv', 'iat', 'exp'];
      expect(Object.keys(decoded).sort()).toEqual(expectedKeys.sort());
    });

    it('should generate tokens that can be used for authentication workflows', () => {
      // Arrange
      const userId = 'auth-workflow-user';
      
      // Act - Generate both access and refresh tokens
      const accessToken = generateToken(userId, 'access');
      const refreshToken = generateToken(userId, 'refresh');

      // Assert - Both tokens should be valid and different
      expect(accessToken).not.toBe(refreshToken);
      
      const accessDecoded = jwt.verify(accessToken, process.env.JWT_SECRET);
      const refreshDecoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
      
      expect(accessDecoded.id).toBe(userId);
      expect(refreshDecoded.id).toBe(userId);
      expect(accessDecoded.type).toBe('access');
      expect(refreshDecoded.type).toBe('refresh');
      
      // Refresh token should expire later than access token
      expect(refreshDecoded.exp).toBeGreaterThan(accessDecoded.exp);
    });

    it('should handle various user ID formats in real tokens', () => {
      // Arrange
      const userIds = [
        'string-user-id',
        123456,
        '507f1f77bcf86cd799439011', // ObjectId format
        'user@example.com'
      ];

      // Act & Assert
      userIds.forEach(userId => {
        const token = generateToken(userId, 'access');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        expect(decoded.id).toBe(userId);
      });
    });
  });

  describe('Token Security Validation', () => {
    it('should generate tokens that cannot be tampered with', () => {
      // Arrange
      const userId = 'tamper-test-user';
      const originalToken = generateToken(userId, 'access');
      
      // Act - Try to tamper with the token
      const parts = originalToken.split('.');
      const tamperedPayload = Buffer.from(JSON.stringify({
        id: 'hacker-user',
        type: 'access'
      })).toString('base64url');
      const tamperedToken = parts[0] + '.' + tamperedPayload + '.' + parts[2];

      // Assert - Tampered token should fail verification
      expect(() => {
        jwt.verify(tamperedToken, process.env.JWT_SECRET);
      }).toThrow();
    });

    it('should generate tokens with secure signatures', () => {
      // Arrange
      const userId = 'signature-test-user';
      
      // Act
      const token = generateToken(userId, 'access');
      
      // Assert - Token should have a valid signature
      expect(() => {
        jwt.verify(token, process.env.JWT_SECRET);
      }).not.toThrow();
      
      // Token parts should be properly base64url encoded
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
      parts.forEach(part => {
        expect(part).toMatch(/^[A-Za-z0-9_-]+$/); // Base64url format
      });
    });

    it('should use different secrets for different environments', () => {
      // Arrange
      const userId = 'env-secret-test';
      const secret1 = 'environment-secret-1';
      const secret2 = 'environment-secret-2';
      
      // Act
      process.env.JWT_SECRET = secret1;
      const token1 = generateToken(userId, 'access');
      
      process.env.JWT_SECRET = secret2;
      const token2 = generateToken(userId, 'access');
      
      // Assert - Tokens should be different with different secrets
      expect(token1).not.toBe(token2);
      
      // Each token should only verify with its own secret
      expect(() => jwt.verify(token1, secret1)).not.toThrow();
      expect(() => jwt.verify(token2, secret2)).not.toThrow();
      expect(() => jwt.verify(token1, secret2)).toThrow();
      expect(() => jwt.verify(token2, secret1)).toThrow();
    });
  });
});
