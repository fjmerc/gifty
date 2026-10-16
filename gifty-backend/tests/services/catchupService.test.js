// tests/services/catchupService.test.js
const catchupService = require('../../services/catchupService');
const Notification = require('../../models/Notification');
const Event = require('../../models/Event');
const User = require('../../models/User');
const { standardizeDate } = require('../../services/notificationService');
const logger = require('../../utils/logger');

// Mock all dependencies BEFORE imports
jest.mock('../../models/Notification');
jest.mock('../../models/Event');
jest.mock('../../models/User');
jest.mock('../../services/notificationService', () => ({
  standardizeDate: jest.fn(),
  DUE_WINDOW_MS: 15 * 60000
}));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

// Mock data factory functions
const createMockEvent = (overrides = {}) => {
  return {
    _id: 'mock-event-id',
    name: 'Test Event',
    date: new Date('2024-12-25T15:00:00Z'),
    reminder: {
      isSet: true,
      time: new Date('2024-11-29T12:00:00.000Z'), // 2 days ago from mocked current time
      method: 'email'
    },
    user: {
      _id: 'mock-user-id'
    },
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
      allowRetroactiveNotifications: true
    },
    ...overrides
  };
};

const createMockNotification = (overrides = {}) => {
  return {
    _id: 'mock-notification-id',
    user: 'mock-user-id',
    event: 'mock-event-id',
    notificationType: 'email',
    notificationDate: new Date(),
    scheduledTime: new Date(),
    isRetroactive: true,
    status: 'retroactive',
    ...overrides
  };
};

describe('Catchup Service', () => {
  let originalEnv;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Store original env vars
    originalEnv = process.env.NOTIFICATION_LOOKBACK_DAYS;
    
    // Use fake timers to control Date behavior
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-12-01T12:00:00.000Z'));
  });

  afterEach(() => {
    // Restore original env vars
    if (originalEnv !== undefined) {
      process.env.NOTIFICATION_LOOKBACK_DAYS = originalEnv;
    } else {
      delete process.env.NOTIFICATION_LOOKBACK_DAYS;
    }
    
    // Restore real timers
    jest.useRealTimers();
  });

  // Section 1: Service Structure Tests
  describe('Service Structure', () => {
    it('should export processMissedNotifications function', () => {
      // Assert
      expect(typeof catchupService.processMissedNotifications).toBe('function');
      expect(catchupService.processMissedNotifications.length).toBe(0); // No parameters
    });
  });

  // Section 2: Core Happy Path Tests
  describe('processMissedNotifications - Happy Path', () => {
    it('should successfully process missed notifications with default settings', async () => {
      // Arrange
      const mockEvents = [createMockEvent()];
      const mockUser = createMockUser();
      
      Event.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockEvents)
      });
      Notification.findOne = jest.fn().mockResolvedValue(null); // No existing notification
      User.findById = jest.fn().mockResolvedValue(mockUser);
      Notification.create = jest.fn().mockResolvedValue(createMockNotification());

      // Act
      const result = await catchupService.processMissedNotifications();

      // Assert
      expect(result).toBe(1);
      expect(Event.find).toHaveBeenCalledWith({
        'reminder.isSet': true,
        'reminder.time': {
          $gte: expect.any(Date),
          $lte: expect.any(Date)
        }
      });
      expect(Notification.create).toHaveBeenCalledWith({
        user: 'mock-user-id',
        event: 'mock-event-id',
        notificationType: 'email',
        notificationDate: expect.any(Date),
        scheduledTime: mockEvents[0].reminder.time,
        isRetroactive: true,
        status: 'retroactive'
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting to process missed notifications')
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Processed 1 missed notifications')
      );
    });

    it('should handle different reminder methods correctly', async () => {
      // Arrange - Test push notification and other method mappings
      const pushEvent = createMockEvent({
        _id: 'push-event-id',
        name: 'Push Event',
        reminder: { isSet: true, time: new Date('2024-11-30T12:00:00.000Z'), method: 'push notification' }
      });
      const smsEvent = createMockEvent({
        _id: 'sms-event-id', 
        name: 'SMS Event',
        reminder: { isSet: true, time: new Date('2024-11-30T12:00:00.000Z'), method: 'sms' }
      });
      const mockUser = createMockUser();
      
      Event.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue([pushEvent, smsEvent])
      });
      Notification.findOne = jest.fn().mockResolvedValue(null);
      User.findById = jest.fn().mockResolvedValue(mockUser);
      Notification.create = jest.fn().mockResolvedValue(createMockNotification());

      // Act
      const result = await catchupService.processMissedNotifications();

      // Assert
      expect(result).toBe(2);
      expect(Notification.create).toHaveBeenCalledWith({
        user: 'mock-user-id',
        event: 'push-event-id',
        notificationType: 'info', // push notification maps to info
        notificationDate: expect.any(Date),
        scheduledTime: pushEvent.reminder.time,
        isRetroactive: true,
        status: 'retroactive'
      });
      expect(Notification.create).toHaveBeenCalledWith({
        user: 'mock-user-id',
        event: 'sms-event-id',
        notificationType: 'info', // other methods map to info
        notificationDate: expect.any(Date),
        scheduledTime: smsEvent.reminder.time,
        isRetroactive: true,
        status: 'retroactive'
      });
    });

    it('should skip notifications when user disallows retroactive notifications', async () => {
      // Arrange: preferences come from the populated event.user, not a separate lookup
      const mockEvents = [createMockEvent({
        user: { _id: 'mock-user-id', preferences: { allowRetroactiveNotifications: false } }
      })];

      Event.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockEvents)
      });
      Notification.findOne = jest.fn().mockResolvedValue(null);
      Notification.create = jest.fn();

      // Act
      const result = await catchupService.processMissedNotifications();

      // Assert
      expect(result).toBe(0);
      expect(Notification.create).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipped retroactive notification for event: Test Event, user: mock-user-id (preferences)')
      );
    });

    it('should skip notifications when notification already exists', async () => {
      // Arrange
      const mockEvents = [createMockEvent()];
      const existingNotification = createMockNotification();
      
      Event.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockEvents)
      });
      Notification.findOne = jest.fn().mockResolvedValue(existingNotification);
      User.findById = jest.fn();
      Notification.create = jest.fn();

      // Act
      const result = await catchupService.processMissedNotifications();

      // Assert
      expect(result).toBe(0);
      expect(User.findById).not.toHaveBeenCalled();
      expect(Notification.create).not.toHaveBeenCalled();
    });
  });

  // Section 3: Configuration and Environment Tests
  describe('processMissedNotifications - Configuration', () => {
    it('should use custom lookback period from environment variable', async () => {
      // Arrange
      process.env.NOTIFICATION_LOOKBACK_DAYS = '14';
      const mockEvents = [createMockEvent()];
      const mockUser = createMockUser();
      
      Event.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockEvents)
      });
      Notification.findOne = jest.fn().mockResolvedValue(null);
      User.findById = jest.fn().mockResolvedValue(mockUser);
      Notification.create = jest.fn().mockResolvedValue(createMockNotification());

      // Act
      await catchupService.processMissedNotifications();

      // Assert - Check that the date range reflects 14 days instead of default 7
      const expectedLookbackDate = new Date('2024-11-17T12:00:00.000Z'); // 14 days before 2024-12-01
      // The last 15 minutes are the minute job's (it also emails them)
      const expectedCurrentDate = new Date('2024-12-01T11:45:00.000Z');
      
      expect(Event.find).toHaveBeenCalledWith({
        'reminder.isSet': true,
        'reminder.time': {
          $gte: expectedLookbackDate,
          $lte: expectedCurrentDate
        }
      });
    });

    it('should handle no events found scenario', async () => {
      // Arrange
      Event.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue([])
      });

      // Act
      const result = await catchupService.processMissedNotifications();

      // Assert
      expect(result).toBe(0);
      expect(logger.info).toHaveBeenCalledWith('Found 0 events with potentially missed reminders');
      expect(logger.info).toHaveBeenCalledWith('Processed 0 missed notifications');
    });

    it('should handle user with no preferences set (default to allow)', async () => {
      // Arrange
      const mockEvents = [createMockEvent()];
      const mockUser = createMockUser({ preferences: {} }); // No allowRetroactiveNotifications set
      
      Event.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockEvents)
      });
      Notification.findOne = jest.fn().mockResolvedValue(null);
      User.findById = jest.fn().mockResolvedValue(mockUser);
      Notification.create = jest.fn().mockResolvedValue(createMockNotification());

      // Act
      const result = await catchupService.processMissedNotifications();

      // Assert
      expect(result).toBe(1);
      expect(Notification.create).toHaveBeenCalled();
    });
  });

  // Section 4: Error Handling Tests
  describe('processMissedNotifications - Error Handling', () => {
    it('should handle database errors and re-throw', async () => {
      // Arrange
      const dbError = new Error('Database connection failed');
      Event.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockRejectedValue(dbError)
      });

      // Act & Assert
      await expect(catchupService.processMissedNotifications()).rejects.toThrow('Database connection failed');
      expect(logger.error).toHaveBeenCalledWith('Error processing missed notifications:', dbError);
    });

    it('should handle Notification.create failures', async () => {
      // Arrange
      const mockEvents = [createMockEvent()];
      const mockUser = createMockUser();
      const createError = new Error('Failed to create notification');
      
      Event.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockEvents)
      });
      Notification.findOne = jest.fn().mockResolvedValue(null);
      User.findById = jest.fn().mockResolvedValue(mockUser);
      Notification.create = jest.fn().mockRejectedValue(createError);

      // Act & Assert
      await expect(catchupService.processMissedNotifications()).rejects.toThrow('Failed to create notification');
      expect(logger.error).toHaveBeenCalledWith('Error processing missed notifications:', createError);
    });
  });

  // Section 5: Edge Cases and Business Logic
  describe('processMissedNotifications - Edge Cases', () => {
    it('should handle events with no reminder method set', async () => {
      // Arrange
      const mockEvent = createMockEvent({
        reminder: { isSet: true, time: new Date('2024-11-30T12:00:00.000Z'), method: null }
      });
      const mockUser = createMockUser();
      
      Event.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue([mockEvent])
      });
      Notification.findOne = jest.fn().mockResolvedValue(null);
      User.findById = jest.fn().mockResolvedValue(mockUser);
      Notification.create = jest.fn().mockResolvedValue(createMockNotification());

      // Act
      const result = await catchupService.processMissedNotifications();

      // Assert
      expect(result).toBe(1);
      expect(Notification.create).toHaveBeenCalledWith({
        user: 'mock-user-id',
        event: 'mock-event-id',
        notificationType: 'info', // Default when no method
        notificationDate: expect.any(Date),
        scheduledTime: mockEvent.reminder.time,
        isRetroactive: true,
        status: 'retroactive'
      });
    });

    it('should handle multiple events with mixed scenarios', async () => {
      // Arrange
      const allowedEvent = createMockEvent({ _id: 'allowed-event' });
      const blockedEvent = createMockEvent({ _id: 'blocked-event' });
      const existingEvent = createMockEvent({ _id: 'existing-event' });
      
      // Preferences live on the populated event.user
      allowedEvent.user = { _id: 'allowed-user', preferences: { allowRetroactiveNotifications: true } };
      blockedEvent.user = { _id: 'blocked-user', preferences: { allowRetroactiveNotifications: false } };
      existingEvent.user = { _id: 'allowed-user', preferences: { allowRetroactiveNotifications: true } };

      Event.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue([allowedEvent, blockedEvent, existingEvent])
      });

      Notification.findOne = jest.fn()
        .mockResolvedValueOnce(null) // allowedEvent - no existing notification
        .mockResolvedValueOnce(null) // blockedEvent - no existing notification
        .mockResolvedValueOnce(createMockNotification()); // existingEvent - has existing notification

      Notification.create = jest.fn().mockResolvedValue(createMockNotification());

      // Act
      const result = await catchupService.processMissedNotifications();

      // Assert
      expect(result).toBe(1); // Only allowedEvent should create notification
      expect(Notification.create).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipped retroactive notification for event:')
      );
    });
  });
});
