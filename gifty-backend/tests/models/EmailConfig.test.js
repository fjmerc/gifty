// tests/models/EmailConfig.test.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const EmailConfig = require('../../models/EmailConfig');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Mock bcrypt for password hashing tests
jest.mock('bcryptjs', () => ({
  genSalt: jest.fn(),
  hash: jest.fn()
}));

// Set higher timeout for database tests
jest.setTimeout(30000);

// What the controller stores (utils/secretBox format)
const STORED_SECRET = 'enc:v1:aXY=:dGFn:Y3Q=';

describe('EmailConfig Model', () => {
  let mockUserId;

  // Connect to test database before all tests
  beforeAll(async () => {
    jest.setTimeout(30000);
    await setupTestDB();
    mockUserId = new mongoose.Types.ObjectId();
  });

  // Clear all test data after each test
  afterEach(async () => {
    jest.setTimeout(30000);
    await clearDatabase();
    jest.clearAllMocks();
  });

  // Disconnect and stop MongoDB server after all tests
  afterAll(async () => {
    await teardownTestDB();
  });

  describe('Schema Validation - Required Fields', () => {
    it('should require user field', async () => {
      // Arrange
      const configData = {
        service: 'gmail',
        username: 'test@gmail.com',
        rawPassword: STORED_SECRET
      };

      // Act
      const config = new EmailConfig(configData);
      const validationError = config.validateSync();

      // Assert
      expect(validationError.errors.user).toBeDefined();
      expect(validationError.errors.user.message).toContain('required');
    });

    it('should require service field', async () => {
      // Arrange
      const configData = {
        user: mockUserId,
        username: 'test@gmail.com',
        rawPassword: STORED_SECRET
      };

      // Act
      const config = new EmailConfig(configData);
      const validationError = config.validateSync();

      // Assert
      expect(validationError.errors.service).toBeDefined();
      expect(validationError.errors.service.message).toContain('required');
    });

    it('should require username field', async () => {
      // Arrange
      const configData = {
        user: mockUserId,
        service: 'gmail',
        rawPassword: STORED_SECRET
      };

      // Act
      const config = new EmailConfig(configData);
      const validationError = config.validateSync();

      // Assert
      expect(validationError.errors.username).toBeDefined();
      expect(validationError.errors.username.message).toContain('required');
    });

    it('should require password field', async () => {
      // Arrange
      const configData = {
        user: mockUserId,
        service: 'gmail',
        username: 'test@gmail.com'
      };

      // Act
      const config = new EmailConfig(configData);
      const validationError = config.validateSync();

      // Assert
      expect(validationError.errors.rawPassword).toBeDefined();
      expect(validationError.errors.rawPassword.message).toContain('required');
    });
  });

  describe('Schema Validation - Enum and Service Types', () => {
    it('should accept valid service types', async () => {
      // Arrange
      const validServices = ['gmail', 'outlook', 'yahoo', 'custom'];
      
      // Act & Assert
      for (const service of validServices) {
        const configData = {
          user: mockUserId,
          service: service,
          username: 'test@example.com',
          rawPassword: STORED_SECRET
        };
        
        const config = new EmailConfig(configData);
        const validationError = config.validateSync();
        
        expect(validationError?.errors?.service).toBeUndefined();
      }
    });

    it('should reject invalid service types', async () => {
      // Arrange
      const configData = {
        user: mockUserId,
        service: 'invalid-service',
        username: 'test@example.com',
        rawPassword: STORED_SECRET
      };

      // Act
      const config = new EmailConfig(configData);
      const validationError = config.validateSync();

      // Assert
      expect(validationError.errors.service).toBeDefined();
      expect(validationError.errors.service.message).toContain('enum');
    });
  });

  describe('Schema Validation - Conditional Requirements', () => {
    it('should require host when service is custom', async () => {
      // Arrange
      const configData = {
        user: mockUserId,
        service: 'custom',
        port: 587,
        username: 'test@example.com',
        rawPassword: STORED_SECRET
      };

      // Act
      const config = new EmailConfig(configData);
      const validationError = config.validateSync();

      // Assert
      expect(validationError.errors.host).toBeDefined();
      expect(validationError.errors.host.message).toContain('required');
    });

    it('should require port when service is custom', async () => {
      // Arrange
      const configData = {
        user: mockUserId,
        service: 'custom',
        host: 'mail.example.com',
        username: 'test@example.com',
        rawPassword: STORED_SECRET
      };

      // Act
      const config = new EmailConfig(configData);
      const validationError = config.validateSync();

      // Assert
      expect(validationError.errors.port).toBeDefined();
      expect(validationError.errors.port.message).toContain('required');
    });

    it('should not require host/port when service is not custom', async () => {
      // Arrange
      const configData = {
        user: mockUserId,
        service: 'gmail',
        username: 'test@gmail.com',
        rawPassword: STORED_SECRET
      };

      // Act
      const config = new EmailConfig(configData);
      const validationError = config.validateSync();

      // Assert
      expect(validationError?.errors?.host).toBeUndefined();
      expect(validationError?.errors?.port).toBeUndefined();
    });

    it('should validate port range (1-65535)', async () => {
      // Arrange - Test invalid low port
      const configDataLow = {
        user: mockUserId,
        service: 'custom',
        host: 'mail.example.com',
        port: 0,
        username: 'test@example.com',
        rawPassword: STORED_SECRET
      };

      // Act
      const configLow = new EmailConfig(configDataLow);
      const validationErrorLow = configLow.validateSync();

      // Assert
      expect(validationErrorLow.errors.port).toBeDefined();
      expect(validationErrorLow.errors.port.message).toContain('Port must be between 1 and 65535');

      // Arrange - Test invalid high port
      const configDataHigh = {
        user: mockUserId,
        service: 'custom',
        host: 'mail.example.com',
        port: 65536,
        username: 'test@example.com',
        rawPassword: STORED_SECRET
      };

      // Act
      const configHigh = new EmailConfig(configDataHigh);
      const validationErrorHigh = configHigh.validateSync();

      // Assert
      expect(validationErrorHigh.errors.port).toBeDefined();
      expect(validationErrorHigh.errors.port.message).toContain('Port must be between 1 and 65535');
    });

    it('should accept valid port range', async () => {
      // Arrange
      const configData = {
        user: mockUserId,
        service: 'custom',
        host: 'mail.example.com',
        port: 587,
        username: 'test@example.com',
        rawPassword: STORED_SECRET
      };

      // Act
      const config = new EmailConfig(configData);
      const validationError = config.validateSync();

      // Assert
      expect(validationError?.errors?.port).toBeUndefined();
    });
  });

  describe('Default Values', () => {
    it('should set default values correctly', async () => {
      // Arrange
      const configData = {
        user: mockUserId,
        service: 'gmail',
        username: 'test@gmail.com',
        rawPassword: STORED_SECRET
      };

      // Act
      const config = new EmailConfig(configData);

      // Assert
      expect(config.secure).toBe(true);
      expect(config.enabled).toBe(true);
      expect(config.fromName).toBe('Gifty Notifications');
      expect(config.lastTested).toBe(null);
      expect(config.lastTestResult.success).toBe(null);
      expect(config.lastTestResult.message).toBe(null);
    });
  });

  describe('Stored password', () => {
    it('keeps only the encrypted password: no bcrypt copy, no hashing on save', async () => {
      const config = await EmailConfig.create({ user: mockUserId, service: 'gmail', username: 'test@gmail.com', rawPassword: STORED_SECRET });

      const doc = await EmailConfig.collection.findOne({ _id: config._id });
      expect(doc.rawPassword).toBe(STORED_SECRET);
      expect(doc.password).toBeUndefined();
      expect(EmailConfig.schema.path('password')).toBeUndefined();
      expect(bcrypt.hash).not.toHaveBeenCalled();
    });
  });

  describe('Complete Valid Configuration', () => {
    it('should create a valid email configuration with all fields', async () => {
      // Arrange
      const configData = {
        user: mockUserId,
        service: 'custom',
        host: 'mail.example.com',
        port: 587,
        secure: false,
        username: 'test@example.com',
        rawPassword: STORED_SECRET,
        fromName: 'Custom Sender',
        enabled: false
      };

      // Act
      const config = await EmailConfig.create(configData);

      // Assert
      expect(config.user).toEqual(mockUserId);
      expect(config.service).toBe('custom');
      expect(config.host).toBe('mail.example.com');
      expect(config.port).toBe(587);
      expect(config.secure).toBe(false);
      expect(config.username).toBe('test@example.com');
      expect(config.fromName).toBe('Custom Sender');
      expect(config.enabled).toBe(false);
      expect(config.rawPassword).toBeDefined();
      expect(config.createdAt).toBeDefined();
      expect(config.updatedAt).toBeDefined();
    });
  });
});
