// tests/controllers/emailConfigController.test.js
const mongoose = require('mongoose');
const emailConfigController = require('../../controllers/emailConfigController');
const EmailConfig = require('../../models/EmailConfig');
const emailService = require('../../services/emailService');
const { createMockReqRes, mockNext } = require('../utils/mockUtils');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Mock dependencies
jest.mock('../../models/EmailConfig');
jest.mock('../../services/emailService');
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

// Set higher timeout for controller tests
jest.setTimeout(30000);

describe('Email Config Controller', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  afterEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  describe('createUpdateEmailConfig', () => {
    it('should create new email configuration successfully', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const configId = new mongoose.Types.ObjectId();
      
      const mockEmailConfigData = {
        service: 'gmail',
        username: 'test@gmail.com',
        password: 'testpassword',
        fromName: 'Test Sender',
        enabled: true
      };

      const mockCreatedConfig = {
        _id: configId,
        user: userId,
        service: 'gmail',
        username: 'test@gmail.com',
        fromName: 'Test Sender',
        enabled: true,
        secure: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const { req, res } = createMockReqRes({
        body: mockEmailConfigData,
        user: { _id: userId }
      });

      // Mock EmailConfig methods
      EmailConfig.findOne = jest.fn().mockResolvedValue(null); // No existing config
      EmailConfig.create = jest.fn().mockResolvedValue({ _id: configId });
      EmailConfig.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockCreatedConfig)
      });

      // Act
      await emailConfigController.createUpdateEmailConfig(req, res, mockNext);

      // Assert
      expect(EmailConfig.findOne).toHaveBeenCalledWith({ user: userId });
      expect(EmailConfig.create).toHaveBeenCalledWith({
        user: userId,
        service: 'gmail',
        host: undefined,
        port: undefined,
        secure: true,
        username: 'test@gmail.com',
        // Stored encrypted only; the password never comes back
        rawPassword: expect.stringMatching(/^enc:v1:/),
        requireTLS: false, // not a custom server on 587
        fromName: 'Test Sender',
        enabled: true
      });
      expect(JSON.stringify(EmailConfig.create.mock.calls[0][0])).not.toContain('testpassword');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ ...mockCreatedConfig, passwordNeedsReentry: true });
    });

    it('should update existing email configuration successfully', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const configId = new mongoose.Types.ObjectId();
      
      const mockEmailConfigData = {
        service: 'outlook',
        username: 'test@outlook.com',
        password: 'newpassword',
        fromName: 'Updated Sender',
        enabled: false
      };

      const mockExistingConfig = {
        _id: configId,
        user: userId,
        service: 'gmail',
        username: 'old@gmail.com',
        save: jest.fn().mockResolvedValue(true)
      };

      const mockUpdatedConfig = {
        _id: configId,
        user: userId,
        service: 'outlook',
        username: 'test@outlook.com',
        fromName: 'Updated Sender',
        enabled: false
      };

      const { req, res } = createMockReqRes({
        body: mockEmailConfigData,
        user: { _id: userId }
      });

      // Mock EmailConfig methods
      EmailConfig.findOne = jest.fn().mockResolvedValue(mockExistingConfig);
      EmailConfig.findById = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUpdatedConfig)
      });

      // Act
      await emailConfigController.createUpdateEmailConfig(req, res, mockNext);

      // Assert
      expect(EmailConfig.findOne).toHaveBeenCalledWith({ user: userId });
      expect(mockExistingConfig.save).toHaveBeenCalled();
      expect(mockExistingConfig.service).toBe('outlook');
      expect(mockExistingConfig.username).toBe('test@outlook.com');
      expect(mockExistingConfig.fromName).toBe('Updated Sender');
      expect(mockExistingConfig.enabled).toBe(false);
      expect(mockExistingConfig.rawPassword).toMatch(/^enc:v1:/);
      expect(res.json).toHaveBeenCalledWith({ ...mockUpdatedConfig, passwordNeedsReentry: true });
    });

    it('should return 400 error when required fields are missing', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        body: {
          service: 'gmail'
          // Missing username and password
        },
        user: { _id: userId }
      });

      // Act
      await emailConfigController.createUpdateEmailConfig(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Please provide all required fields'
      }));
    });

    it('should return 400 error when custom service is missing host and port', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        body: {
          service: 'custom',
          username: 'test@example.com',
          password: 'testpassword'
          // Missing host and port for custom service
        },
        user: { _id: userId }
      });

      // Act
      await emailConfigController.createUpdateEmailConfig(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Host and port are required for custom SMTP'
      }));
    });

    it('should handle database errors during creation', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      
      const mockEmailConfigData = {
        service: 'gmail',
        username: 'test@gmail.com',
        password: 'testpassword'
      };

      const { req, res } = createMockReqRes({
        body: mockEmailConfigData,
        user: { _id: userId }
      });

      const dbError = new Error('Database connection failed');
      EmailConfig.findOne = jest.fn().mockResolvedValue(null);
      EmailConfig.create = jest.fn().mockRejectedValue(dbError);

      // Act
      await emailConfigController.createUpdateEmailConfig(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Failed to create/update email configuration')
      }));
    });
  });

  describe('getUserEmailConfig', () => {
    it('should get email configuration successfully', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const configId = new mongoose.Types.ObjectId();
      
      const mockEmailConfig = {
        _id: configId,
        user: userId,
        service: 'gmail',
        username: 'test@gmail.com',
        fromName: 'Test Sender',
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const { req, res } = createMockReqRes({
        user: { _id: userId }
      });

      // Mock EmailConfig.findOne
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockEmailConfig)
      });

      const { encryptSecret } = require('../../utils/secretBox');
      const stored = { ...mockEmailConfig, rawPassword: encryptSecret('smtp-secret') };
      EmailConfig.findOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(stored) });

      // Act
      await emailConfigController.getUserEmailConfig(req, res, mockNext);

      // Assert
      expect(EmailConfig.findOne).toHaveBeenCalledWith({ user: userId });
      // Never the password, encrypted or not
      expect(res.json).toHaveBeenCalledWith({ ...mockEmailConfig, passwordNeedsReentry: false });
    });

    it('should return 404 error when email configuration not found', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        user: { _id: userId }
      });

      // Mock EmailConfig.findOne to return null
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      // Act
      await emailConfigController.getUserEmailConfig(req, res, mockNext);

      // Assert
      expect(EmailConfig.findOne).toHaveBeenCalledWith({ user: userId });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Email configuration not found'
      }));
    });
  });

  describe('testEmailConfig', () => {
    it('should test email configuration successfully', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        user: { _id: userId }
      });

      const mockTestResult = {
        success: true,
        message: 'Test email sent successfully'
      };

      // Mock emailService.sendTestEmail
      emailService.sendTestEmail = jest.fn().mockResolvedValue(mockTestResult);

      // Act
      await emailConfigController.testEmailConfig(req, res, mockNext);

      // Assert
      expect(emailService.sendTestEmail).toHaveBeenCalledWith(userId);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Test email sent successfully'
      });
    });

    it('should return 400 error when test email fails', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        user: { _id: userId }
      });

      const mockTestResult = {
        success: false,
        message: 'SMTP connection failed'
      };

      // Mock emailService.sendTestEmail
      emailService.sendTestEmail = jest.fn().mockResolvedValue(mockTestResult);

      // Act
      await emailConfigController.testEmailConfig(req, res, mockNext);

      // Assert
      expect(emailService.sendTestEmail).toHaveBeenCalledWith(userId);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'SMTP connection failed'
      });
    });

    it('should handle service errors during email testing', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        user: { _id: userId }
      });

      const serviceError = new Error('Email service unavailable');
      emailService.sendTestEmail = jest.fn().mockRejectedValue(serviceError);

      // Act
      await emailConfigController.testEmailConfig(req, res, mockNext);

      // Assert
      expect(emailService.sendTestEmail).toHaveBeenCalledWith(userId);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Failed to test email configuration')
      }));
    });
  });

  describe('deleteEmailConfig', () => {
    it('should delete email configuration successfully', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const configId = new mongoose.Types.ObjectId();
      
      const mockEmailConfig = {
        _id: configId,
        user: userId,
        service: 'gmail',
        deleteOne: jest.fn().mockResolvedValue(true)
      };

      const { req, res } = createMockReqRes({
        user: { _id: userId }
      });

      // Mock EmailConfig.findOne
      EmailConfig.findOne = jest.fn().mockResolvedValue(mockEmailConfig);

      // Act
      await emailConfigController.deleteEmailConfig(req, res, mockNext);

      // Assert
      expect(EmailConfig.findOne).toHaveBeenCalledWith({ user: userId });
      expect(mockEmailConfig.deleteOne).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Email configuration removed' });
    });

    it('should return 404 error when email configuration not found for deletion', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        user: { _id: userId }
      });

      // Mock EmailConfig.findOne to return null
      EmailConfig.findOne = jest.fn().mockResolvedValue(null);

      // Act
      await emailConfigController.deleteEmailConfig(req, res, mockNext);

      // Assert
      expect(EmailConfig.findOne).toHaveBeenCalledWith({ user: userId });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Email configuration not found'
      }));
    });
  });
});
