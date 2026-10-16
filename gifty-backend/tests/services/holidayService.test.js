// tests/services/holidayService.test.js
const holidayService = require('../../services/holidayService');
const Holiday = require('../../models/Holiday');
const Event = require('../../models/Event');
const User = require('../../models/User');
const Recipient = require('../../models/Recipient');
const logger = require('../../utils/logger');
const { standardizeDate } = require('../../services/notificationService');
const mongoose = require('mongoose');

// Mock all dependencies BEFORE imports
jest.mock('../../models/Holiday', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findById: jest.fn()
}));
jest.mock('../../models/Event', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  deleteMany: jest.fn(),
  findById: jest.fn()
}));
jest.mock('../../models/User', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn()
}));
jest.mock('../../models/Recipient', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findById: jest.fn()
}));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));
jest.mock('../../services/notificationService', () => ({
  standardizeDate: jest.fn()
}));
jest.mock('mongoose', () => ({
  model: jest.fn()
}));

// Mock data factory functions
const createMockUser = (overrides = {}) => {
  return {
    _id: 'mock-user-id',
    firstName: 'John',
    lastName: 'Doe',
    preferences: {
      holidaySettings: {
        enabled: true,
        countryCode: 'US',
        categories: ['national', 'cultural'],
        defaultRemindDaysBefore: 7
      },
      notificationSettings: {
        email: {
          enabled: true
        }
      }
    },
    ...overrides
  };
};

const createMockHoliday = (overrides = {}) => {
  return {
    _id: 'mock-holiday-id',
    name: 'Christmas',
    month: 12,
    day: 25,
    countryCode: 'US',
    category: 'national',
    isActive: true,
    eventType: {
      _id: 'mock-event-type-id',
      name: 'Holiday'
    },
    ...overrides
  };
};

const createMockRecipient = (overrides = {}) => {
  return {
    _id: 'mock-recipient-id',
    user: 'mock-user-id',
    firstName: 'Gifty',
    lastName: 'Holidays',
    isSelf: false,
    isSystemAccount: true,
    relationship: 'service',
    relation: 'System Calendar',
    birthdate: new Date('2023-01-01'),
    minimumPriceBudget: 0,
    maximumPriceBudget: 0,
    ...overrides
  };
};

const createMockEvent = (overrides = {}) => {
  return {
    _id: 'mock-event-id',
    user: 'mock-user-id',
    recipient: 'mock-recipient-id',
    name: 'Christmas',
    date: new Date('2024-12-25'),
    type: 'mock-event-type-id',
    isSystemGenerated: true,
    reminder: {
      isSet: true,
      time: new Date('2024-12-18T09:00:00.000Z'),
      method: 'Email'
    },
    ...overrides
  };
};

const createMockEventType = (overrides = {}) => {
  return {
    _id: 'mock-event-type-id',
    name: 'Holiday',
    ...overrides
  };
};

describe('Holiday Service', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Reset date to a consistent value for testing
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Section 1: Service Structure Tests
  describe('Service Structure', () => {
    it('should export all required holiday service methods', () => {
      // Assert
      expect(typeof holidayService.generateHolidayEvents).toBe('function');
      expect(typeof holidayService.regenerateAllHolidayEvents).toBe('function');
      expect(typeof holidayService.updateUserHolidayEvents).toBe('function');
    });

    it('should have generateHolidayEvents method with correct signature', () => {
      // Assert
      expect(holidayService.generateHolidayEvents).toBeDefined();
      expect(holidayService.generateHolidayEvents.length).toBe(1); // Takes userId parameter
    });

    it('should have regenerateAllHolidayEvents method with correct signature', () => {
      // Assert
      expect(holidayService.regenerateAllHolidayEvents).toBeDefined();
      expect(holidayService.regenerateAllHolidayEvents.length).toBe(0); // No parameters
    });

    it('should have updateUserHolidayEvents method with correct signature', () => {
      // Assert
      expect(holidayService.updateUserHolidayEvents).toBeDefined();
      expect(holidayService.updateUserHolidayEvents.length).toBe(1); // Takes userId parameter
    });

  });

  // Section 2: Generate Holiday Events Tests - Core Function
  describe('generateHolidayEvents', () => {
    it('should generate holiday events successfully for user with enabled features', async () => {
      // Arrange
      const userId = 'mock-user-id';
      const mockUser = createMockUser();
      const mockHolidays = [createMockHoliday()];
      const mockSystemRecipient = createMockRecipient();
      
      User.findById.mockResolvedValue(mockUser);
      Holiday.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockHolidays)
      });
      Recipient.findOne.mockResolvedValue(mockSystemRecipient);
      Event.findOne.mockResolvedValue(null); // No existing event
      Event.create.mockResolvedValue(createMockEvent());
      standardizeDate.mockReturnValue('2024-12-18T09:00:00.000Z');
      
      // Act
      const result = await holidayService.generateHolidayEvents(userId);
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.created).toBe(1);
      expect(result.skipped).toBe(0);
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(Holiday.find).toHaveBeenCalledWith({
        countryCode: 'US',
        category: { $in: ['national', 'cultural'] },
        isActive: true
      });
      expect(Event.create).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(`Generating holiday events for user: ${userId}`);
    });

    it('should return error when user not found', async () => {
      // Arrange
      const userId = 'nonexistent-user-id';
      User.findById.mockResolvedValue(null);
      
      // Act
      const result = await holidayService.generateHolidayEvents(userId);
      
      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toBe('User not found');
      expect(logger.error).toHaveBeenCalledWith(`User not found with ID: ${userId}`);
    });

    it('should return success message when holiday features disabled', async () => {
      // Arrange
      const userId = 'mock-user-id';
      const mockUser = createMockUser({
        preferences: {
          holidaySettings: {
            enabled: false
          }
        }
      });
      User.findById.mockResolvedValue(mockUser);
      
      // Act
      const result = await holidayService.generateHolidayEvents(userId);
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toBe('Holiday features disabled for user');
      expect(result.created).toBe(0);
      expect(result.skipped).toBe(0);
      expect(logger.info).toHaveBeenCalledWith(`Holiday features disabled for user: ${userId}`);
    });

    it('should use default preferences when user preferences are missing', async () => {
      // Arrange
      const userId = 'mock-user-id';
      const mockUser = createMockUser({
        preferences: {
          holidaySettings: {
            enabled: true,
            // Missing countryCode, categories, and defaultRemindDaysBefore
          },
          notificationSettings: {
            email: { enabled: true }
          }
        }
      });
      const mockHolidays = [createMockHoliday()];
      const mockSystemRecipient = createMockRecipient();
      
      User.findById.mockResolvedValue(mockUser);
      Holiday.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockHolidays)
      });
      Recipient.findOne.mockResolvedValue(mockSystemRecipient);
      Event.findOne.mockResolvedValue(null);
      Event.create.mockResolvedValue(createMockEvent());
      standardizeDate.mockReturnValue('2024-12-18T09:00:00.000Z');
      
      // Act
      const result = await holidayService.generateHolidayEvents(userId);
      
      // Assert
      expect(Holiday.find).toHaveBeenCalledWith({
        countryCode: 'US', // Default value
        category: { $in: ['national', 'cultural'] }, // Default value
        isActive: true
      });
      expect(result.success).toBe(true);
    });

    it('should create system recipient when none exists', async () => {
      // Arrange
      const userId = 'mock-user-id';
      const mockUser = createMockUser();
      const mockHolidays = [createMockHoliday()];
      const mockSystemRecipient = createMockRecipient();
      
      User.findById.mockResolvedValue(mockUser);
      Holiday.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockHolidays)
      });
      Recipient.findOne.mockResolvedValue(null); // No existing system recipient
      Recipient.create.mockResolvedValue(mockSystemRecipient);
      Event.findOne.mockResolvedValue(null);
      Event.create.mockResolvedValue(createMockEvent());
      standardizeDate.mockReturnValue('2024-12-18T09:00:00.000Z');
      
      // Act
      const result = await holidayService.generateHolidayEvents(userId);
      
      // Assert
      expect(Recipient.create).toHaveBeenCalledWith({
        user: userId,
        firstName: 'Gifty',
        lastName: 'Holidays',
        isSelf: false,
        isSystemAccount: true,
        relationship: 'service',
        relation: 'System Calendar',
        birthdate: new Date('2023-01-01'),
        minimumPriceBudget: 0,
        maximumPriceBudget: 0
      });
      expect(logger.info).toHaveBeenCalledWith(`Created system recipient for user ${userId}`);
      expect(result.success).toBe(true);
    });

    it('should skip creating events that already exist', async () => {
      // Arrange
      const userId = 'mock-user-id';
      const mockUser = createMockUser();
      const mockHolidays = [createMockHoliday()];
      const mockSystemRecipient = createMockRecipient();
      const existingEvent = createMockEvent();
      
      User.findById.mockResolvedValue(mockUser);
      Holiday.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockHolidays)
      });
      Recipient.findOne.mockResolvedValue(mockSystemRecipient);
      Event.findOne.mockResolvedValue(existingEvent); // Event already exists
      
      // Act
      const result = await holidayService.generateHolidayEvents(userId);
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
      expect(Event.create).not.toHaveBeenCalled();
    });

    it('should set push notification when email is disabled', async () => {
      // Arrange
      const userId = 'mock-user-id';
      const mockUser = createMockUser({
        preferences: {
          holidaySettings: {
            enabled: true,
            countryCode: 'US',
            categories: ['national'],
            defaultRemindDaysBefore: 7
          },
          notificationSettings: {
            email: { enabled: false }
          }
        }
      });
      const mockHolidays = [createMockHoliday()];
      const mockSystemRecipient = createMockRecipient();
      
      User.findById.mockResolvedValue(mockUser);
      Holiday.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockHolidays)
      });
      Recipient.findOne.mockResolvedValue(mockSystemRecipient);
      Event.findOne.mockResolvedValue(null);
      Event.create.mockResolvedValue(createMockEvent());
      standardizeDate.mockReturnValue('2024-12-18T09:00:00.000Z');
      
      // Act
      const result = await holidayService.generateHolidayEvents(userId);
      
      // Assert
      expect(Event.create).toHaveBeenCalledWith(expect.objectContaining({
        reminder: expect.objectContaining({
          method: 'Push Notification'
        })
      }));
      expect(result.success).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      const userId = 'mock-user-id';
      const errorMessage = 'Database connection failed';
      User.findById.mockRejectedValue(new Error(errorMessage));
      
      // Act
      const result = await holidayService.generateHolidayEvents(userId);
      
      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
      expect(logger.error).toHaveBeenCalledWith(
        `Error generating holiday events for user ${userId}:`,
        expect.any(Error)
      );
    });
  });

  // Section 3: Remove Holiday Events Tests
  describe('regenerateAllHolidayEvents', () => {
    it('should regenerate holiday events for all enabled users successfully', async () => {
      // Arrange
      const mockUsers = [
        createMockUser({ _id: 'user1' }),
        createMockUser({ _id: 'user2' })
      ];
      
      User.find.mockResolvedValue(mockUsers);
      
      // Mock the dependencies for generateHolidayEvents calls
      User.findById.mockResolvedValue(createMockUser());
      Holiday.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue([createMockHoliday()])
      });
      Recipient.findOne.mockResolvedValue(createMockRecipient());
      // No event this year; last year's is there and was not carried on yet
      Event.findOne.mockImplementation((query) => Promise.resolve(query.rolledForward ? createMockEvent() : null));
      Event.updateOne = jest.fn().mockResolvedValue({});
      Event.create.mockResolvedValue(createMockEvent());
      standardizeDate.mockReturnValue('2024-12-18T09:00:00.000Z');
      
      // Act
      const result = await holidayService.regenerateAllHolidayEvents();
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.usersProcessed).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.totalCreated).toBe(2); // 1 event per user
      expect(result.totalSkipped).toBe(0);
      expect(User.find).toHaveBeenCalledWith({
        'preferences.holidaySettings.enabled': { $ne: false }
      });
      // Last year's event is marked, so it is carried on only once
      expect(Event.updateOne).toHaveBeenCalledWith(expect.any(Object), { $set: { rolledForward: true } });
    });

    it('should handle mixed success and failure scenarios', async () => {
      // Arrange
      const mockUsers = [
        createMockUser({ _id: 'user1' }),
        createMockUser({ _id: 'user2' }),
        createMockUser({ _id: 'user3' })
      ];
      
      User.find.mockResolvedValue(mockUsers);
      
      // Mock first call to succeed
      User.findById
        .mockResolvedValueOnce(createMockUser()) // user1 - success
        .mockResolvedValueOnce(null) // user2 - user not found (failure)
        .mockResolvedValueOnce(createMockUser()); // user3 - success
      
      Holiday.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue([createMockHoliday()])
      });
      Recipient.findOne.mockResolvedValue(createMockRecipient());
      // No event this year; last year's is there and was not carried on yet
      Event.findOne.mockImplementation((query) => Promise.resolve(query.rolledForward ? createMockEvent() : null));
      Event.updateOne = jest.fn().mockResolvedValue({});
      Event.create.mockResolvedValue(createMockEvent());
      standardizeDate.mockReturnValue('2024-12-18T09:00:00.000Z');
      
      // Act
      const result = await holidayService.regenerateAllHolidayEvents();
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.usersProcessed).toBe(3);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
      expect(result.totalCreated).toBe(2); // Only successful users
      expect(result.totalSkipped).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to generate holidays for user user2: User not found'
      );
    });

    it('should handle empty user list', async () => {
      // Arrange
      User.find.mockResolvedValue([]);
      
      // Act
      const result = await holidayService.regenerateAllHolidayEvents();
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.usersProcessed).toBe(0);
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
      expect(result.totalCreated).toBe(0);
      expect(result.totalSkipped).toBe(0);
      expect(logger.info).toHaveBeenCalledWith('Found 0 users with holiday features enabled');
    });

    it('should handle database errors in regenerateAllHolidayEvents', async () => {
      // Arrange
      const errorMessage = 'User query failed';
      User.find.mockRejectedValue(new Error(errorMessage));
      
      // Act
      const result = await holidayService.regenerateAllHolidayEvents();
      
      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
      expect(logger.error).toHaveBeenCalledWith('Error in regenerateAllHolidayEvents:', expect.any(Error));
    });
  });

  // Section 5: Update User Holiday Events Tests
  // Changing settings is covered against a real database in
  // tests/integration/holiday-settings.test.js
  describe('updateUserHolidayEvents', () => {
    it('should handle multiple holidays with some already existing', async () => {
      // Arrange
      const userId = 'mock-user-id';
      const mockUser = createMockUser();
      const mockHolidays = [
        createMockHoliday({ name: 'Christmas', month: 12, day: 25 }),
        createMockHoliday({ name: 'New Year', month: 1, day: 1 })
      ];
      const mockSystemRecipient = createMockRecipient();
      
      User.findById.mockResolvedValue(mockUser);
      Holiday.find.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockHolidays)
      });
      Recipient.findOne.mockResolvedValue(mockSystemRecipient);
      
      // First holiday exists, second doesn't
      Event.findOne
        .mockResolvedValueOnce(createMockEvent()) // Christmas exists
        .mockResolvedValueOnce(null); // New Year doesn't exist
      
      Event.create.mockResolvedValue(createMockEvent());
      standardizeDate.mockReturnValue('2024-12-18T09:00:00.000Z');
      
      // Act
      const result = await holidayService.generateHolidayEvents(userId);
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.created).toBe(1); // Only New Year created
      expect(result.skipped).toBe(1); // Christmas skipped
      expect(Event.create).toHaveBeenCalledTimes(1); // Only called once for New Year
    });
  });
});
