// tests/services/emailService.test.js
const nodemailer = require('nodemailer');
const emailService = require('../../services/emailService');
const EmailConfig = require('../../models/EmailConfig');
const User = require('../../models/User');
const logger = require('../../utils/logger');

// Mock all dependencies BEFORE imports
jest.mock('nodemailer');
jest.mock('../../config/redis', () => ({ redisClient: { incr: jest.fn().mockResolvedValue(1), expire: jest.fn().mockResolvedValue(1) } }));
jest.mock('../../models/EmailConfig');
jest.mock('../../models/User');
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

// Mock data factory functions
const createMockEmailConfig = (overrides = {}) => {
  return {
    _id: 'mock-config-id',
    user: 'mock-user-id',
    service: 'gmail',
    username: 'test@gmail.com',
    password: 'encryptedPassword',
    rawPassword: 'appPassword123',
    fromName: 'Test User',
    enabled: true,
    lastTested: new Date(),
    lastTestResult: {
      success: true,
      message: 'Test successful'
    },
    save: jest.fn().mockResolvedValue(true),
    ...overrides
  };
};

const createMockUser = (overrides = {}) => {
  return {
    _id: 'mock-user-id',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    preferences: {
      timezone: 'America/New_York'
    },
    ...overrides
  };
};

const createMockEvent = (overrides = {}) => {
  return {
    _id: 'mock-event-id',
    name: 'Birthday Party',
    date: new Date('2024-12-25'),
    ...overrides
  };
};

const createMockRecipient = (overrides = {}) => {
  return {
    _id: 'mock-recipient-id',
    firstName: 'Jane',
    lastName: 'Smith',
    ...overrides
  };
};

const createMockTransporter = () => {
  return {
    sendMail: jest.fn().mockResolvedValue({
      messageId: 'mock-message-id',
      response: 'Message sent successfully'
    }),
    verify: jest.fn().mockResolvedValue(true)
  };
};

describe('Email Service', () => {
  let mockTransporter;

  beforeEach(() => {
    mockTransporter = createMockTransporter();
    nodemailer.createTransport = jest.fn().mockReturnValue(mockTransporter);
    jest.clearAllMocks();
  });

  // Section 1: Service Structure Tests
  describe('Service Structure', () => {
    it('should export all required email service methods', () => {
      // Assert
      expect(typeof emailService.sendEmail).toBe('function');
      expect(typeof emailService.sendTestEmail).toBe('function');
      expect(typeof emailService.formatEventReminderEmail).toBe('function');
    });

    it('should have sendEmail method with correct signature', () => {
      // Assert
      expect(emailService.sendEmail).toBeDefined();
      expect(emailService.sendEmail.length).toBe(4); // userId, to, subject, text (html is optional)
    });

    it('should have sendTestEmail method with correct signature', () => {
      // Assert
      expect(emailService.sendTestEmail).toBeDefined();
      expect(emailService.sendTestEmail.length).toBe(1); // userId
    });

    it('should have formatEventReminderEmail method with correct signature', () => {
      // Assert
      expect(emailService.formatEventReminderEmail).toBeDefined();
      expect(emailService.formatEventReminderEmail.length).toBe(3); // user, event, recipient
    });
  });

  // Section 2: Email Configuration and Transport Creation Tests
  describe('Transport Creation', () => {
    it('should create Gmail transporter with correct configuration', async () => {
      // Arrange
      const gmailConfig = createMockEmailConfig({
        service: 'gmail',
        username: 'test@gmail.com',
        rawPassword: 'appPassword123'
      });
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(gmailConfig)
      });
      User.findById = jest.fn().mockResolvedValue(createMockUser());

      // Act
      const result = await emailService.sendEmail(
        'mock-user-id',
        'recipient@example.com',
        'Test Subject',
        'Test message'
      );

      // Assert
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test@gmail.com',
          pass: 'appPassword123'
        },
        requireTLS: true
      });
      expect(result.success).toBe(true);
    });

    it('should create Outlook transporter with correct configuration', async () => {
      // Arrange
      const outlookConfig = createMockEmailConfig({
        service: 'outlook',
        username: 'test@outlook.com',
        rawPassword: 'appPassword123'
      });
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(outlookConfig)
      });
      User.findById = jest.fn().mockResolvedValue(createMockUser());

      // Act
      const result = await emailService.sendEmail(
        'mock-user-id',
        'recipient@example.com',
        'Test Subject',
        'Test message'
      );

      // Assert
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.office365.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test@outlook.com',
          pass: 'appPassword123'
        },
        requireTLS: true,
        tls: {
          minVersion: 'TLSv1.2',
          ciphers: 'HIGH:MEDIUM:!aNULL:!MD5',
          rejectUnauthorized: false
        }
      });
      expect(result.success).toBe(true);
    });

    it('should create Yahoo transporter with correct configuration', async () => {
      // Arrange
      const yahooConfig = createMockEmailConfig({
        service: 'yahoo',
        username: 'test@yahoo.com',
        rawPassword: 'appPassword123'
      });
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(yahooConfig)
      });
      User.findById = jest.fn().mockResolvedValue(createMockUser());

      // Act
      const result = await emailService.sendEmail(
        'mock-user-id',
        'recipient@example.com',
        'Test Subject',
        'Test message'
      );

      // Assert
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.mail.yahoo.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test@yahoo.com',
          pass: 'appPassword123'
        },
        requireTLS: true
      });
      expect(result.success).toBe(true);
    });

    it('should create custom transporter with standard SMTP configuration', async () => {
      // Arrange
      const customConfig = createMockEmailConfig({
        service: 'custom',
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        username: 'test@example.com',
        rawPassword: 'password123'
      });
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(customConfig)
      });
      User.findById = jest.fn().mockResolvedValue(createMockUser());

      // Act
      const result = await emailService.sendEmail(
        'mock-user-id',
        'recipient@example.com',
        'Test Subject',
        'Test message'
      );

      // Assert
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        // Port 587: STARTTLS required by default
        requireTLS: true,
        auth: {
          user: 'test@example.com',
          pass: 'password123'
        }
      });
      expect(result.success).toBe(true);
    });

    it('should create custom Outlook transporter with special configuration', async () => {
      // Arrange
      const customOutlookConfig = createMockEmailConfig({
        service: 'custom',
        host: 'smtp.office365.com',
        port: 587,
        secure: false,
        username: 'test@company.com',
        rawPassword: 'appPassword123'
      });
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(customOutlookConfig)
      });
      User.findById = jest.fn().mockResolvedValue(createMockUser());

      // Act
      const result = await emailService.sendEmail(
        'mock-user-id',
        'recipient@example.com',
        'Test Subject',
        'Test message'
      );

      // Assert
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.office365.com',
        port: 587,
        secure: false,
        // Port 587: STARTTLS required by default
        requireTLS: true,
        auth: {
          user: 'test@company.com',
          pass: 'appPassword123'
        }
      });
      expect(result.success).toBe(true);
    });

    it('should use fallback service-based configuration for unknown services', async () => {
      // Arrange
      const unknownServiceConfig = createMockEmailConfig({
        service: 'unknown-service',
        username: 'test@unknown.com',
        rawPassword: 'password123'
      });
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(unknownServiceConfig)
      });
      User.findById = jest.fn().mockResolvedValue(createMockUser());

      // Act
      const result = await emailService.sendEmail(
        'mock-user-id',
        'recipient@example.com',
        'Test Subject',
        'Test message'
      );

      // Assert
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        service: 'unknown-service',
        auth: {
          user: 'test@unknown.com',
          pass: 'password123'
        }
      });
      expect(result.success).toBe(true);
    });

    it('should prefer rawPassword over encrypted password', async () => {
      // Arrange
      const configWithBothPasswords = createMockEmailConfig({
        service: 'gmail',
        username: 'test@gmail.com',
        password: 'encryptedPassword',
        rawPassword: 'plainPassword'
      });
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(configWithBothPasswords)
      });
      User.findById = jest.fn().mockResolvedValue(createMockUser());

      // Act
      await emailService.sendEmail(
        'mock-user-id',
        'recipient@example.com',
        'Test Subject',
        'Test message'
      );

      // Assert
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({
            pass: 'plainPassword'
          })
        })
      );
    });

    it('asks for the password again when only the old hashed copy is stored', async () => {
      // Arrange: rows from before encryption kept a useless bcrypt hash
      const configWithoutPassword = createMockEmailConfig({
        service: 'gmail',
        username: 'test@gmail.com',
        password: '$2a$10$hashhashhash',
        rawPassword: null
      });
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(configWithoutPassword)
      });
      User.findById = jest.fn().mockResolvedValue(createMockUser());

      // Act
      const result = await emailService.sendEmail('mock-user-id', 'recipient@example.com', 'Test Subject', 'Test message');

      // Assert: the hash is never used as a password
      expect(result).toEqual(expect.objectContaining({ success: false, message: expect.stringMatching(/re-enter your mail password/i) }));
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });
  });

  // Section 3: Email Sending Operations Tests
  describe('sendEmail', () => {
    it('should successfully send plain text email', async () => {
      // Arrange
      const mockConfig = createMockEmailConfig();
      const mockUser = createMockUser();
      
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockConfig)
      });
      User.findById = jest.fn().mockResolvedValue(mockUser);

      // Act
      const result = await emailService.sendEmail(
        'mock-user-id',
        'recipient@example.com',
        'Test Subject',
        'This is a test message'
      );

      // Assert
      expect(EmailConfig.findOne).toHaveBeenCalledWith({ user: 'mock-user-id', enabled: true });
      expect(User.findById).toHaveBeenCalledWith('mock-user-id');
      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: '"Test User" <test@gmail.com>',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'This is a test message'
      });
      expect(result).toEqual({
        success: true,
        messageId: 'mock-message-id',
        response: 'Message sent successfully'
      });
      expect(logger.info).toHaveBeenCalled();
    });

    it('should successfully send HTML email', async () => {
      // Arrange
      const mockConfig = createMockEmailConfig();
      const mockUser = createMockUser();
      
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockConfig)
      });
      User.findById = jest.fn().mockResolvedValue(mockUser);

      // Act
      const result = await emailService.sendEmail(
        'mock-user-id',
        'recipient@example.com',
        'HTML Test Subject',
        'This is a test message',
        '<h1>This is HTML content</h1>'
      );

      // Assert
      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: '"Test User" <test@gmail.com>',
        to: 'recipient@example.com',
        subject: 'HTML Test Subject',
        text: 'This is a test message',
        html: '<h1>This is HTML content</h1>'
      });
      expect(result.success).toBe(true);
    });

    it('should return error when email configuration not found', async () => {
      // Arrange
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      // Act
      const result = await emailService.sendEmail(
        'mock-user-id',
        'recipient@example.com',
        'Test Subject',
        'Test message'
      );

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'Email configuration not found or disabled'
      });
      expect(logger.warn).toHaveBeenCalledWith('No email configuration found for user mock-user-id');
    });

    it('should return error when user not found', async () => {
      // Arrange
      const mockConfig = createMockEmailConfig();
      
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockConfig)
      });
      User.findById = jest.fn().mockResolvedValue(null);

      // Act
      const result = await emailService.sendEmail(
        'mock-user-id',
        'recipient@example.com',
        'Test Subject',
        'Test message'
      );

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'User not found'
      });
      expect(logger.error).toHaveBeenCalledWith('User not found: mock-user-id');
    });

    it('should handle transport creation errors', async () => {
      // Arrange
      const mockConfig = createMockEmailConfig();
      const mockUser = createMockUser();
      
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockConfig)
      });
      User.findById = jest.fn().mockResolvedValue(mockUser);
      nodemailer.createTransport = jest.fn().mockImplementation(() => {
        throw new Error('Failed to create transport');
      });

      // Act
      const result = await emailService.sendEmail(
        'mock-user-id',
        'recipient@example.com',
        'Test Subject',
        'Test message'
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to create email transport');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle authentication errors with user-friendly message', async () => {
      // Arrange
      const mockConfig = createMockEmailConfig();
      const mockUser = createMockUser();
      
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockConfig)
      });
      User.findById = jest.fn().mockResolvedValue(mockUser);
      mockTransporter.sendMail = jest.fn().mockRejectedValue(new Error('Invalid login'));

      // Act
      const result = await emailService.sendEmail(
        'mock-user-id',
        'recipient@example.com',
        'Test Subject',
        'Test message'
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Authentication failed');
      expect(result.message).toContain('Microsoft accounts');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle connection errors with user-friendly message', async () => {
      // Arrange
      const mockConfig = createMockEmailConfig();
      const mockUser = createMockUser();
      
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockConfig)
      });
      User.findById = jest.fn().mockResolvedValue(mockUser);
      mockTransporter.sendMail = jest.fn().mockRejectedValue(new Error('Connection refused'));

      // Act
      const result = await emailService.sendEmail(
        'mock-user-id',
        'recipient@example.com',
        'Test Subject',
        'Test message'
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Could not connect to email server');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle certificate errors with user-friendly message', async () => {
      // Arrange
      const mockConfig = createMockEmailConfig();
      const mockUser = createMockUser();
      
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockConfig)
      });
      User.findById = jest.fn().mockResolvedValue(mockUser);
      mockTransporter.sendMail = jest.fn().mockRejectedValue(new Error('certificate verification failed'));

      // Act
      const result = await emailService.sendEmail(
        'mock-user-id',
        'recipient@example.com',
        'Test Subject',
        'Test message'
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('SSL certificate verification failed');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle recipient errors with user-friendly message', async () => {
      // Arrange
      const mockConfig = createMockEmailConfig();
      const mockUser = createMockUser();
      
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockConfig)
      });
      User.findById = jest.fn().mockResolvedValue(mockUser);
      mockTransporter.sendMail = jest.fn().mockRejectedValue(new Error('Recipients failed'));

      // Act
      const result = await emailService.sendEmail(
        'mock-user-id',
        'recipient@example.com',
        'Test Subject',
        'Test message'
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toContain('Email address rejected by server');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // Section 4: Test Email Functionality Tests
  describe('sendTestEmail', () => {
    it('should successfully send test email', async () => {
      // Arrange
      const mockConfig = createMockEmailConfig();
      const mockUser = createMockUser();
      
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockConfig)
      });
      User.findById = jest.fn().mockResolvedValue(mockUser);

      // Act
      const result = await emailService.sendTestEmail('mock-user-id');

      // Assert
      expect(EmailConfig.findOne).toHaveBeenCalledWith({ user: 'mock-user-id' });
      expect(User.findById).toHaveBeenCalledWith('mock-user-id');
      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: '"Test User" <test@gmail.com>',
        to: 'john.doe@example.com',
        subject: 'Gifty: Email Configuration Test',
        text: 'This is a test email to verify your SMTP configuration in Gifty.',
        html: expect.stringContaining('Gifty Email Configuration Test')
      });
      expect(result.success).toBe(true);
      expect(EmailConfig.updateOne).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Attempting to send test email')
      );
    });

    it('should return error when email configuration not found for test email', async () => {
      // Arrange
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      // Act
      const result = await emailService.sendTestEmail('mock-user-id');

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'Email configuration not found'
      });
    });

    it('should return error when user not found for test email', async () => {
      // Arrange
      const mockConfig = createMockEmailConfig();
      
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockConfig)
      });
      User.findById = jest.fn().mockResolvedValue(null);

      // Act
      const result = await emailService.sendTestEmail('mock-user-id');

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'User not found'
      });
    });

    it('should handle test email sending errors', async () => {
      // Arrange
      const mockConfig = createMockEmailConfig();
      const mockUser = createMockUser();
      
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockConfig)
      });
      User.findById = jest.fn().mockResolvedValue(mockUser);
      mockTransporter.sendMail = jest.fn().mockRejectedValue(new Error('SMTP Error'));

      // Act
      const result = await emailService.sendTestEmail('mock-user-id');

      // Assert: the test answers one message for any failure to reach the server
      expect(result.success).toBe(false);
      expect(result.message).toBe('Could not reach the mail server. Check the server address, port and security setting.');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle authentication errors for test email with helpful message', async () => {
      // Arrange
      const mockConfig = createMockEmailConfig();
      const mockUser = createMockUser();
      
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockConfig)
      });
      User.findById = jest.fn().mockResolvedValue(mockUser);
      // nodemailer marks a refused login with code EAUTH
      mockTransporter.sendMail = jest.fn().mockRejectedValue(Object.assign(new Error('Invalid login: 535 Authentication failed'), { code: 'EAUTH' }));

      // Act
      const result = await emailService.sendTestEmail('mock-user-id');

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/^Authentication failed/);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should update email configuration with test result', async () => {
      // Arrange
      const mockConfig = createMockEmailConfig();
      const mockUser = createMockUser();
      
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockConfig)
      });
      User.findById = jest.fn().mockResolvedValue(mockUser);

      // Act
      await emailService.sendTestEmail('mock-user-id');

      // Assert: written directly, not by saving the whole row
      expect(EmailConfig.updateOne).toHaveBeenCalledWith({ _id: mockConfig._id }, {
        $set: {
          lastTested: expect.any(Date),
          lastTestResult: { success: true, message: 'Test email sent successfully' }
        }
      });
      expect(mockConfig.save).not.toHaveBeenCalled();
    });

    it('should log debug information for test email configuration', async () => {
      // Arrange
      const mockConfig = createMockEmailConfig({
        service: 'outlook',
        username: 'test@outlook.com',
        rawPassword: 'testPassword'
      });
      const mockUser = createMockUser();
      
      EmailConfig.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockConfig)
      });
      User.findById = jest.fn().mockResolvedValue(mockUser);

      // Act
      await emailService.sendTestEmail('mock-user-id');

      // Assert
      expect(logger.debug).toHaveBeenCalledWith(
        'Test email configuration retrieved:',
        expect.objectContaining({
          service: 'outlook',
          username: 'test@outlook.com',
          hasRawPassword: true,
          configFound: true
        })
      );
    });
  });

  // Section 5: Email Template Formatting Tests
  describe('formatEventReminderEmail', () => {
    it('should format event reminder email with plain text and HTML versions', () => {
      // Arrange
      const mockUser = createMockUser({
        firstName: 'Alice',
        preferences: {
          timezone: 'America/Los_Angeles'
        }
      });
      const mockEvent = createMockEvent({
        _id: 'event-123',
        name: 'Wedding Anniversary',
        date: new Date('2024-06-15T19:00:00Z')
      });
      const mockRecipient = createMockRecipient({
        firstName: 'Bob',
        lastName: 'Johnson'
      });

      // Act
      const result = emailService.formatEventReminderEmail(mockUser, mockEvent, mockRecipient);

      // Assert
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('html');
      
      // Check text content
      expect(result.text).toContain('Hello Alice');
      expect(result.text).toContain('Wedding Anniversary');
      expect(result.text).toContain('Bob Johnson');
      expect(result.text).toContain('http://localhost:3000/events');
      
      // Check HTML content
      expect(result.html).toContain('<h2 style="color: #4a6ee0; margin-top: 0;">Gifty Event Reminder</h2>');
      expect(result.html).toContain('Hello Alice');
      expect(result.html).toContain('<strong>Event:</strong> Wedding Anniversary');
      expect(result.html).toContain('<strong>Recipient:</strong> Bob Johnson');
      expect(result.html).toContain('href="http://localhost:3000/events"');
    });

    it('HTML-escapes names in the HTML version only', () => {
      const result = emailService.formatEventReminderEmail(
        createMockUser({ firstName: `Ann<b>`, preferences: {} }),
        createMockEvent({ name: `Tom & Jerry's "party"` }),
        createMockRecipient({ firstName: `O'Brien`, lastName: '<script>x</script>' })
      );

      expect(result.html).toContain('Hello Ann&lt;b&gt;,');
      expect(result.html).toContain('<strong>Event:</strong> Tom &amp; Jerry&#39;s &quot;party&quot;');
      expect(result.html).toContain('<strong>Recipient:</strong> O&#39;Brien &lt;script&gt;x&lt;/script&gt;');
      expect(result.html).not.toContain('<script>');
      expect(result.text).toContain(`Event: Tom & Jerry's "party"`);
      expect(result.text).toContain(`Recipient: O'Brien <script>x</script>`);
    });

    it('should format date according to user timezone', () => {
      // Arrange
      const mockUser = createMockUser({
        firstName: 'Charlie',
        preferences: {
          timezone: 'Europe/London'
        }
      });
      const mockEvent = createMockEvent({
        name: 'Birthday Party',
        date: new Date('2024-12-25T12:00:00Z')
      });
      const mockRecipient = createMockRecipient();

      // Act
      const result = emailService.formatEventReminderEmail(mockUser, mockEvent, mockRecipient);

      // Assert
      // The date should be formatted according to Europe/London timezone
      expect(result.text).toContain('Date:');
      expect(result.html).toContain('<strong>Date:</strong>');
      // Date formatting will vary based on locale, but should contain the event details
      expect(result.text).toContain('Birthday Party');
      expect(result.html).toContain('Birthday Party');
    });

    it('should use UTC timezone when user preferences not available', () => {
      // Arrange
      const mockUser = createMockUser({
        firstName: 'David',
        preferences: {} // No timezone specified
      });
      const mockEvent = createMockEvent({
        name: 'Graduation',
        date: new Date('2024-05-20T15:00:00Z')
      });
      const mockRecipient = createMockRecipient({
        firstName: 'Emma',
        lastName: 'Smith'
      });

      // Act
      const result = emailService.formatEventReminderEmail(mockUser, mockEvent, mockRecipient);

      // Assert
      expect(result.text).toContain('Hello David');
      expect(result.text).toContain('Graduation');
      expect(result.text).toContain('Emma Smith');
      expect(result.html).toContain('Hello David');
      expect(result.html).toContain('Graduation');
      expect(result.html).toContain('Emma Smith');
    });

    it('should include proper styling and structure in HTML version', () => {
      // Arrange
      const mockUser = createMockUser();
      const mockEvent = createMockEvent({
        _id: 'event-456',
        name: 'Conference'
      });
      const mockRecipient = createMockRecipient();

      // Act
      const result = emailService.formatEventReminderEmail(mockUser, mockEvent, mockRecipient);

      // Assert
      expect(result.html).toContain('font-family: Arial, sans-serif');
      expect(result.html).toContain('max-width: 600px');
      expect(result.html).toContain('background-color: #f9f9f9');
      expect(result.html).toContain('background-color: #4a6ee0');
      expect(result.html).toContain('View Event Details');
      expect(result.html).toContain('This is an automated message from Gifty');
    });

    it('links to the Events page (default instance address) in both versions', () => {
      // Arrange
      const mockUser = createMockUser();
      const mockEvent = createMockEvent({
        _id: 'unique-event-id-789'
      });
      const mockRecipient = createMockRecipient();

      // Act
      const result = emailService.formatEventReminderEmail(mockUser, mockEvent, mockRecipient);

      // Assert
      const expectedUrl = 'http://localhost:3000/events';
      expect(result.text).toContain(expectedUrl);
      expect(result.html).toContain(`href="${expectedUrl}"`);
    });

    it('links to the instance address from GIFTY_URL', () => {
      const saved = process.env.GIFTY_URL;
      process.env.GIFTY_URL = 'https://gifts.example.net/';
      try {
        const result = emailService.formatEventReminderEmail(createMockUser(), createMockEvent(), createMockRecipient());
        expect(result.text).toContain('https://gifts.example.net/events');
        expect(result.html).toContain('href="https://gifts.example.net/events"');
      } finally {
        if (saved === undefined) delete process.env.GIFTY_URL; else process.env.GIFTY_URL = saved;
      }
    });
  });
});

describe('instance SMTP fallback', () => {
  const nodemailer = require('nodemailer');
  const EmailConfig = require('../../models/EmailConfig');
  const User = require('../../models/User');
  const { sendEmail } = require('../../services/emailService');

  it('uses SMTP_* when the user has no email configuration', async () => {
    const saved = process.env;
    process.env = { ...saved, SMTP_HOST: 'smtp.example.com', SMTP_PORT: '2525', SMTP_FROM: 'gifty@example.com' };
    EmailConfig.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    User.findById.mockResolvedValue({ _id: 'u1', email: 'to@example.com' });
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'm1', response: 'ok' });
    nodemailer.createTransport.mockReturnValue({ sendMail });

    const result = await sendEmail('u1', 'to@example.com', 'Hi', 'Body');
    process.env = saved;

    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.example.com', port: 2525 }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'gifty@example.com', to: 'to@example.com' }));
    expect(result.success).toBe(true);
  });
});

describe('instance SMTP fallback is not an open relay', () => {
  const nodemailer = require('nodemailer');
  const EmailConfig = require('../../models/EmailConfig');
  const User = require('../../models/User');
  const { sendEmail } = require('../../services/emailService');

  it("refuses to send to any address other than the account's own email", async () => {
    const saved = process.env;
    process.env = { ...saved, SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'gifty@example.com' };
    EmailConfig.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    User.findById.mockResolvedValue({ _id: 'u1', email: 'owner@example.com' });
    const sendMail = jest.fn();
    nodemailer.createTransport.mockReturnValue({ sendMail });

    const result = await sendEmail('u1', 'victim@example.org', 'Reminder', 'spam');
    process.env = saved;

    expect(sendMail).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });
});

describe('instance SMTP fallback daily cap', () => {
  const nodemailer = require('nodemailer');
  const EmailConfig = require('../../models/EmailConfig');
  const User = require('../../models/User');
  const { redisClient } = require('../../config/redis');
  const { sendEmail } = require('../../services/emailService');

  it('stops sending once a user exceeds INSTANCE_SMTP_DAILY_LIMIT', async () => {
    const saved = process.env;
    process.env = { ...saved, SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'gifty@example.com', INSTANCE_SMTP_DAILY_LIMIT: '3' };
    EmailConfig.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    User.findById.mockResolvedValue({ _id: 'u1', email: 'owner@example.com' });
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'm' });
    nodemailer.createTransport.mockReturnValue({ sendMail });
    redisClient.incr.mockResolvedValueOnce(4);

    const result = await sendEmail('u1', 'owner@example.com', 'Reminder', 'x');
    process.env = saved;

    expect(sendMail).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(redisClient.incr).toHaveBeenCalledWith(expect.stringMatching(/^gifty:smtp:u1:\d{4}-\d{2}-\d{2}$/));
  });
});

describe('mail logs carry no addresses or SMTP usernames above debug', () => {
  const nodemailer = require('nodemailer');
  const EmailConfig = require('../../models/EmailConfig');
  const User = require('../../models/User');
  const logger = require('../../utils/logger');
  const { sendEmail, sendTestEmail } = require('../../services/emailService');

  const PRIVATE = ['smtp-login@example.org', 'john.doe@example.com', 'recipient@example.com', 'to@example.com'];
  const loggedAboveDebug = () => JSON.stringify(['info', 'warn', 'error'].map((level) => logger[level].mock.calls));
  const config = () => ({
    service: 'gmail', username: 'smtp-login@example.org', rawPassword: 'secret', fromName: 'Me', enabled: true,
    save: jest.fn().mockResolvedValue(true)
  });

  beforeEach(() => {
    jest.clearAllMocks();
    User.findById = jest.fn().mockResolvedValue({ _id: 'u1', firstName: 'John', email: 'john.doe@example.com' });
  });

  it('a sent message and a test email', async () => {
    EmailConfig.findOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(config()) });
    nodemailer.createTransport.mockReturnValue({ sendMail: jest.fn().mockResolvedValue({ messageId: 'm1', response: 'ok' }) });

    await sendEmail('u1', 'recipient@example.com', 'Hi', 'Body');
    await sendTestEmail('u1');

    PRIVATE.forEach((value) => expect(loggedAboveDebug()).not.toContain(value));
  });

  it('a failed send', async () => {
    EmailConfig.findOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(config()) });
    nodemailer.createTransport.mockReturnValue({ sendMail: jest.fn().mockRejectedValue(new Error('boom')) });

    await sendEmail('u1', 'recipient@example.com', 'Hi', 'Body');

    expect(logger.error).toHaveBeenCalled();
    PRIVATE.forEach((value) => expect(loggedAboveDebug()).not.toContain(value));
  });

  it('a message through the instance mail server', async () => {
    const saved = process.env;
    process.env = { ...saved, SMTP_HOST: 'smtp.example.com', SMTP_FROM: 'gifty@example.com' };
    EmailConfig.findOne = jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    User.findById = jest.fn().mockResolvedValue({ _id: 'u1', email: 'to@example.com' });
    nodemailer.createTransport.mockReturnValue({ sendMail: jest.fn().mockResolvedValue({ messageId: 'm1', response: 'ok' }) });

    await sendEmail('u1', 'to@example.com', 'Hi', 'Body');
    process.env = saved;

    expect(logger.info).toHaveBeenCalled();
    PRIVATE.forEach((value) => expect(loggedAboveDebug()).not.toContain(value));
  });
});
