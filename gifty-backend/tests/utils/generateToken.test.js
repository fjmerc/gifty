const jwt = require('jsonwebtoken');
const { generateToken } = require('../../utils/generateToken');

// Mock JWT library for controlled testing
jest.mock('jsonwebtoken');

describe('generateToken Utility', () => {
  // Store original environment for restoration
  const originalEnv = process.env.JWT_SECRET;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    // Set default JWT_SECRET for tests
    process.env.JWT_SECRET = 'test-secret-key';
  });

  afterEach(() => {
    // Restore original environment
    process.env.JWT_SECRET = originalEnv;
  });

  describe('Function Structure', () => {
    it('should export generateToken function', () => {
      // Arrange & Act & Assert
      expect(typeof generateToken).toBe('function');
    });

    it('should have correct function signature', () => {
      // Arrange & Act & Assert
      expect(generateToken).toBeDefined();
      expect(generateToken.length).toBe(1); // Only required parameter (id), type is optional
    });

    it('should export an object with the expected structure', () => {
      // Arrange
      const moduleExports = require('../../utils/generateToken');
      
      // Act & Assert
      expect(typeof moduleExports).toBe('object');
      expect(Object.keys(moduleExports)).toEqual(['generateToken', 'tokenVersionOf', 'currentTokenVersion', 'isTokenCurrent']);
    });
  });

  describe('Token Generation - Access Token', () => {
    it('should generate access token with default type parameter', () => {
      // Arrange
      const userId = 'user123';
      const mockToken = 'mock.jwt.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      const result = generateToken(userId);

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: userId, type: 'access', tv: 0 },
        'test-secret-key',
        { expiresIn: '1h' }
      );
      expect(result).toBe(mockToken);
    });

    it('should generate access token with explicit type parameter', () => {
      // Arrange
      const userId = 'user456';
      const tokenType = 'access';
      const mockToken = 'mock.access.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      const result = generateToken(userId, tokenType);

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: userId, type: 'access', tv: 0 },
        'test-secret-key',
        { expiresIn: '1h' }
      );
      expect(result).toBe(mockToken);
    });

    it('should return string token for access type', () => {
      // Arrange
      const userId = 'user789';
      const mockToken = 'string.jwt.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      const result = generateToken(userId, 'access');

      // Assert
      expect(typeof result).toBe('string');
      expect(result).toBe(mockToken);
    });
  });

  describe('Token Generation - Refresh Token', () => {
    it('should generate refresh token with correct expiration', () => {
      // Arrange
      const userId = 'user123';
      const tokenType = 'refresh';
      const mockToken = 'mock.refresh.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      const result = generateToken(userId, tokenType);

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: userId, type: 'refresh', tv: 0 },
        'test-secret-key',
        { expiresIn: '7d' }
      );
      expect(result).toBe(mockToken);
    });

    it('should return string token for refresh type', () => {
      // Arrange
      const userId = 'user456';
      const mockToken = 'refresh.string.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      const result = generateToken(userId, 'refresh');

      // Assert
      expect(typeof result).toBe('string');
      expect(result).toBe(mockToken);
    });
  });

  describe('Expiration Logic Validation', () => {
    it('should use 1 hour expiration for access tokens', () => {
      // Arrange
      const userId = 'exp-test-user';
      const mockToken = 'exp.access.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      generateToken(userId, 'access');

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({ expiresIn: '1h' })
      );
    });

    it('should use 7 days expiration for refresh tokens', () => {
      // Arrange
      const userId = 'exp-test-user';
      const mockToken = 'exp.refresh.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      generateToken(userId, 'refresh');

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({ expiresIn: '7d' })
      );
    });

    it('should default to 1 hour expiration when type is not provided', () => {
      // Arrange
      const userId = 'default-exp-user';
      const mockToken = 'default.exp.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      generateToken(userId);

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(String),
        expect.objectContaining({ expiresIn: '1h' })
      );
    });

    it('should default to 1 hour expiration for unknown token types', () => {
      // Arrange
      const userId = 'unknown-type-user';
      const unknownType = 'unknown';
      const mockToken = 'unknown.type.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      generateToken(userId, unknownType);

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ id: userId, type: unknownType }),
        expect.any(String),
        expect.objectContaining({ expiresIn: '1h' })
      );
    });
  });

  describe('JWT Payload Structure', () => {
    it('should include user ID in token payload', () => {
      // Arrange
      const userId = 'payload-test-123';
      const mockToken = 'payload.test.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      generateToken(userId, 'access');

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ id: userId }),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should include token type in payload', () => {
      // Arrange
      const userId = 'type-test-456';
      const tokenType = 'refresh';
      const mockToken = 'type.test.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      generateToken(userId, tokenType);

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ type: tokenType }),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should include both id and type in payload structure', () => {
      // Arrange
      const userId = 'full-payload-789';
      const tokenType = 'access';
      const mockToken = 'full.payload.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      generateToken(userId, tokenType);

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: userId, type: tokenType, tv: 0 },
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should not include extra properties in payload', () => {
      // Arrange
      const userId = 'clean-payload-user';
      const tokenType = 'access';
      const mockToken = 'clean.payload.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      generateToken(userId, tokenType);

      // Assert
      const payloadCall = jwt.sign.mock.calls[0][0];
      expect(Object.keys(payloadCall)).toEqual(['id', 'type', 'tv']);
      expect(Object.keys(payloadCall)).toHaveLength(3);
    });
  });

  describe('Environment Variable Dependency', () => {
    it('should use JWT_SECRET from environment variables', () => {
      // Arrange
      const userId = 'env-test-user';
      const customSecret = 'custom-jwt-secret-key';
      process.env.JWT_SECRET = customSecret;
      const mockToken = 'env.test.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      generateToken(userId, 'access');

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.any(Object),
        customSecret,
        expect.any(Object)
      );
    });

    it('should handle missing JWT_SECRET environment variable', () => {
      // Arrange
      const userId = 'missing-secret-user';
      delete process.env.JWT_SECRET;
      const mockToken = 'missing.secret.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      generateToken(userId, 'access');

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
        expect.any(Object)
      );
    });

    it('should handle empty JWT_SECRET environment variable', () => {
      // Arrange
      const userId = 'empty-secret-user';
      process.env.JWT_SECRET = '';
      const mockToken = 'empty.secret.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      generateToken(userId, 'access');

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.any(Object),
        '',
        expect.any(Object)
      );
    });

    it('should handle different JWT_SECRET values correctly', () => {
      // Arrange
      const userId = 'different-secret-user';
      const secrets = ['secret1', 'very-long-secret-key-12345', 'short'];
      const mockToken = 'different.secret.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act & Assert
      secrets.forEach(secret => {
        process.env.JWT_SECRET = secret;
        generateToken(userId, 'access');
        expect(jwt.sign).toHaveBeenCalledWith(
          expect.any(Object),
          secret,
          expect.any(Object)
        );
        jest.clearAllMocks();
      });
    });
  });

  describe('Parameter Validation and Edge Cases', () => {
    it('should handle string user ID parameter', () => {
      // Arrange
      const userId = 'string-user-id-123';
      const mockToken = 'string.id.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      const result = generateToken(userId, 'access');

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ id: userId }),
        expect.any(String),
        expect.any(Object)
      );
      expect(result).toBe(mockToken);
    });

    it('should handle numeric user ID parameter', () => {
      // Arrange
      const userId = 12345;
      const mockToken = 'numeric.id.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      const result = generateToken(userId, 'access');

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ id: userId }),
        expect.any(String),
        expect.any(Object)
      );
      expect(result).toBe(mockToken);
    });

    it('should handle null user ID parameter', () => {
      // Arrange
      const userId = null;
      const mockToken = 'null.id.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      const result = generateToken(userId, 'access');

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ id: null }),
        expect.any(String),
        expect.any(Object)
      );
      expect(result).toBe(mockToken);
    });

    it('should handle undefined user ID parameter', () => {
      // Arrange
      const userId = undefined;
      const mockToken = 'undefined.id.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      const result = generateToken(userId, 'access');

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ id: undefined }),
        expect.any(String),
        expect.any(Object)
      );
      expect(result).toBe(mockToken);
    });

    it('should handle empty string user ID parameter', () => {
      // Arrange
      const userId = '';
      const mockToken = 'empty.id.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      const result = generateToken(userId, 'access');

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ id: '' }),
        expect.any(String),
        expect.any(Object)
      );
      expect(result).toBe(mockToken);
    });

    it('should handle case-sensitive token types', () => {
      // Arrange
      const userId = 'case-test-user';
      const mockToken = 'case.sensitive.token';
      jwt.sign.mockReturnValue(mockToken);
      const caseVariants = ['ACCESS', 'Access', 'REFRESH', 'Refresh'];

      // Act & Assert
      caseVariants.forEach(type => {
        generateToken(userId, type);
        expect(jwt.sign).toHaveBeenCalledWith(
          expect.objectContaining({ type: type }),
          expect.any(String),
          expect.objectContaining({ expiresIn: '1h' }) // All non-'refresh' default to 1h
        );
        jest.clearAllMocks();
      });
    });

    it('should handle null token type parameter', () => {
      // Arrange
      const userId = 'null-type-user';
      const tokenType = null;
      const mockToken = 'null.type.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      const result = generateToken(userId, tokenType);

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ type: null }),
        expect.any(String),
        expect.objectContaining({ expiresIn: '1h' }) // null !== 'refresh', so defaults to 1h
      );
      expect(result).toBe(mockToken);
    });

    it('should handle empty string token type parameter', () => {
      // Arrange
      const userId = 'empty-type-user';
      const tokenType = '';
      const mockToken = 'empty.type.token';
      jwt.sign.mockReturnValue(mockToken);

      // Act
      const result = generateToken(userId, tokenType);

      // Assert
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ type: '' }),
        expect.any(String),
        expect.objectContaining({ expiresIn: '1h' }) // '' !== 'refresh', so defaults to 1h
      );
      expect(result).toBe(mockToken);
    });
  });

  describe('Error Handling and Security', () => {
    it('should propagate jwt.sign errors', () => {
      // Arrange
      const userId = 'error-test-user';
      const jwtError = new Error('JWT signing failed');
      jwt.sign.mockImplementation(() => {
        throw jwtError;
      });

      // Act & Assert
      expect(() => generateToken(userId, 'access')).toThrow('JWT signing failed');
      expect(jwt.sign).toHaveBeenCalled();
    });

    it('should handle JWT library throwing different error types', () => {
      // Arrange
      const userId = 'error-types-user';
      const errors = [
        new Error('Standard error'),
        new TypeError('Type error')
      ];

      // Act & Assert
      errors.forEach(error => {
        jwt.sign.mockImplementation(() => {
          throw error;
        });
        
        expect(() => generateToken(userId, 'access')).toThrow();
        jest.clearAllMocks();
      });
    });

    it('should not catch or handle JWT signing errors', () => {
      // Arrange
      const userId = 'no-catch-user';
      const jwtError = new Error('Critical JWT error');
      jwt.sign.mockImplementation(() => {
        throw jwtError;
      });

      // Act & Assert
      expect(() => {
        generateToken(userId, 'access');
      }).toThrow(jwtError);
    });
  });

  describe('token version', () => {
    const { tokenVersionOf, isTokenCurrent } = require('../../utils/generateToken');

    it('puts the given version in the payload', () => {
      jwt.sign.mockReturnValue('t');
      generateToken('u1', 'refresh', 4);
      expect(jwt.sign.mock.calls[0][0]).toEqual({ id: 'u1', type: 'refresh', tv: 4 });
    });

    it('counts a token or account without a version as version 0', () => {
      expect(tokenVersionOf({ id: 'u1' })).toBe(0);
      expect(isTokenCurrent({ id: 'u1' }, {})).toBe(true);
      expect(isTokenCurrent({ id: 'u1' }, { tokenVersion: 1 })).toBe(false);
      expect(isTokenCurrent({ id: 'u1', tv: 2 }, { tokenVersion: 2 })).toBe(true);
    });
  });
});
