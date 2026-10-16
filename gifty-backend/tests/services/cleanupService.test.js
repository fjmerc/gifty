// tests/services/cleanupService.test.js
const cleanupService = require('../../services/cleanupService');
const Notification = require('../../models/Notification');
const SuggestionHistory = require('../../models/SuggestionHistory');
const Gift = require('../../models/Gift');
const { redisClient, keyPrefixes } = require('../../config/redis');
const logger = require('../../utils/logger');
const { cleanupQueue } = require('../../queues');

// Mock all dependencies BEFORE imports
jest.mock('../../models/Notification');
jest.mock('../../models/SuggestionHistory');
jest.mock('../../models/Gift');
jest.mock('../../config/redis', () => ({
  redisClient: {
    keys: jest.fn(),
    del: jest.fn()
  },
  keyPrefixes: {
    suggestions: 'gifty:suggestions:'
  }
}));
jest.mock('../../queues', () => ({
  cleanupQueue: {
    add: jest.fn(),
    process: jest.fn(),
    getJobs: jest.fn()
  }
}));
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Mock data factory functions
const createMockDeletionResult = (deletedCount = 1) => ({ deletedCount });

const createMockRedisKeys = (patterns = []) => patterns;

const createMockJob = (timestamp, overrides = {}) => ({
  timestamp,
  remove: jest.fn().mockResolvedValue(),
  ...overrides
});

describe('Cleanup Service', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Use fake timers to control Date behavior
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-12-01T12:00:00.000Z'));
  });

  afterEach(() => {
    // Restore real timers
    jest.useRealTimers();
  });

  // Section 1: Service Structure Tests
  describe('Service Structure', () => {
    it('should export all required cleanup functions', () => {
      // Assert
      expect(typeof cleanupService.cleanupOldNotifications).toBe('function');
      expect(typeof cleanupService.cleanupOldSuggestions).toBe('function');
      expect(typeof cleanupService.cleanupUnusedGifts).toBe('function');
      expect(typeof cleanupService.cleanupRedisCache).toBe('function');
      expect(typeof cleanupService.cleanupJobQueues).toBe('function');
      expect(typeof cleanupService.runAllCleanupTasks).toBe('function');
      expect(typeof cleanupService.startCleanupScheduler).toBe('function');
    });

    it('should have correct function signatures', () => {
      // Assert - All cleanup functions should be async (no parameters)
      expect(cleanupService.cleanupOldNotifications.length).toBe(0);
      expect(cleanupService.cleanupOldSuggestions.length).toBe(0);
      expect(cleanupService.cleanupUnusedGifts.length).toBe(0);
      expect(cleanupService.cleanupRedisCache.length).toBe(0);
      expect(cleanupService.cleanupJobQueues.length).toBe(0);
      expect(cleanupService.runAllCleanupTasks.length).toBe(0);
      expect(cleanupService.startCleanupScheduler.length).toBe(0);
    });
  });

  // Section 2: Individual Function Happy Path Tests
  describe('cleanupOldNotifications - Happy Path', () => {
    it('should successfully cleanup old notifications with 1-month cutoff', async () => {
      // Arrange
      const mockResult = createMockDeletionResult(5);
      Notification.deleteMany = jest.fn().mockResolvedValue(mockResult);

      // Act
      const result = await cleanupService.cleanupOldNotifications();

      // Assert
      expect(result).toBe(5);
      
      // Verify correct date calculation (1 month ago from 2024-12-01)
      const expectedCutoffDate = new Date('2024-11-01T12:00:00.000Z');
      expect(Notification.deleteMany).toHaveBeenCalledWith({
        notificationDate: { $lt: expectedCutoffDate }
      });
      
      expect(logger.info).toHaveBeenCalledWith('Deleted 5 old notifications.');
    });

    it('should return zero when no old notifications exist', async () => {
      // Arrange
      const mockResult = createMockDeletionResult(0);
      Notification.deleteMany = jest.fn().mockResolvedValue(mockResult);

      // Act
      const result = await cleanupService.cleanupOldNotifications();

      // Assert
      expect(result).toBe(0);
      expect(logger.info).toHaveBeenCalledWith('Deleted 0 old notifications.');
    });
  });

  describe('cleanupOldSuggestions - Happy Path', () => {
    it('should successfully cleanup old suggestions with 3-month cutoff', async () => {
      // Arrange
      const mockResult = createMockDeletionResult(12);
      SuggestionHistory.deleteMany = jest.fn().mockResolvedValue(mockResult);

      // Act
      const result = await cleanupService.cleanupOldSuggestions();

      // Assert
      expect(result).toBe(12);
      
      // Verify correct date calculation (3 months ago from 2024-12-01)
      const callArgs = SuggestionHistory.deleteMany.mock.calls[0][0];
      expect(callArgs.createdAt.$lt.getMonth()).toBe(8); // September (0-indexed)
      expect(callArgs.createdAt.$lt.getFullYear()).toBe(2024);
      expect(callArgs.createdAt.$lt.getDate()).toBe(1);
      
      expect(logger.info).toHaveBeenCalledWith('Deleted 12 old suggestion history records.');
    });

    it('should return zero when no old suggestions exist', async () => {
      // Arrange
      const mockResult = createMockDeletionResult(0);
      SuggestionHistory.deleteMany = jest.fn().mockResolvedValue(mockResult);

      // Act
      const result = await cleanupService.cleanupOldSuggestions();

      // Assert
      expect(result).toBe(0);
      expect(logger.info).toHaveBeenCalledWith('Deleted 0 old suggestion history records.');
    });
  });

  describe('cleanupUnusedGifts - Happy Path', () => {
    it('should successfully cleanup unused AI suggestions with 2-month cutoff', async () => {
      // Arrange
      const mockResult = createMockDeletionResult(8);
      Gift.deleteMany = jest.fn().mockResolvedValue(mockResult);

      // Act
      const result = await cleanupService.cleanupUnusedGifts();

      // Assert
      expect(result).toBe(8);
      
      // Verify correct date calculation (2 months ago from 2024-12-01)
      const callArgs = Gift.deleteMany.mock.calls[0][0];
      expect(callArgs.isAISuggested).toBe(true);
      expect(callArgs.status).toBe('suggestion');
      expect(callArgs.createdAt.$lt.getMonth()).toBe(9); // October (0-indexed)
      expect(callArgs.createdAt.$lt.getFullYear()).toBe(2024);
      expect(callArgs.createdAt.$lt.getDate()).toBe(1);
      
      expect(logger.info).toHaveBeenCalledWith('Deleted 8 unused AI suggestions.');
    });

    it('should return zero when no unused gifts exist', async () => {
      // Arrange
      const mockResult = createMockDeletionResult(0);
      Gift.deleteMany = jest.fn().mockResolvedValue(mockResult);

      // Act
      const result = await cleanupService.cleanupUnusedGifts();

      // Assert
      expect(result).toBe(0);
      expect(logger.info).toHaveBeenCalledWith('Deleted 0 unused AI suggestions.');
    });
  });

  // Section 3: Error Handling Tests
  describe('Error Handling', () => {
    it('should handle cleanupOldNotifications database errors', async () => {
      // Arrange
      const dbError = new Error('Database connection failed');
      Notification.deleteMany = jest.fn().mockRejectedValue(dbError);

      // Act & Assert
      await expect(cleanupService.cleanupOldNotifications()).rejects.toThrow('Database connection failed');
      expect(logger.error).toHaveBeenCalledWith('Error cleaning up old notifications:', dbError);
    });

    it('should handle cleanupOldSuggestions database errors', async () => {
      // Arrange
      const dbError = new Error('Suggestion cleanup failed');
      SuggestionHistory.deleteMany = jest.fn().mockRejectedValue(dbError);

      // Act & Assert
      await expect(cleanupService.cleanupOldSuggestions()).rejects.toThrow('Suggestion cleanup failed');
      expect(logger.error).toHaveBeenCalledWith('Error cleaning up old suggestion history:', dbError);
    });

    it('should handle cleanupUnusedGifts database errors', async () => {
      // Arrange
      const dbError = new Error('Gift cleanup failed');
      Gift.deleteMany = jest.fn().mockRejectedValue(dbError);

      // Act & Assert
      await expect(cleanupService.cleanupUnusedGifts()).rejects.toThrow('Gift cleanup failed');
      expect(logger.error).toHaveBeenCalledWith('Error cleaning up unused gifts:', dbError);
    });

    it('should handle cleanupRedisCache Redis errors', async () => {
      // Arrange
      const redisError = new Error('Redis connection failed');
      redisClient.keys.mockRejectedValue(redisError);

      // Act & Assert
      await expect(cleanupService.cleanupRedisCache()).rejects.toThrow('Redis connection failed');
      expect(logger.error).toHaveBeenCalledWith('Error cleaning up Redis cache:', redisError);
    });

    it('should handle cleanupJobQueues queue errors', async () => {
      // Arrange
      const queueError = new Error('Queue operation failed');
      const { cleanupQueue } = require('../../queues');
      cleanupQueue.getJobs.mockRejectedValue(queueError);

      // Act & Assert
      await expect(cleanupService.cleanupJobQueues()).rejects.toThrow('Queue operation failed');
      expect(logger.error).toHaveBeenCalledWith('Error cleaning up job queues:', queueError);
    });
  });

  describe('cleanupRedisCache - Happy Path', () => {
    it('should successfully cleanup Redis cache with suggestion keys and timestamped keys', async () => {
      // Arrange
      const suggestionKeys = ['gifty:suggestions:user1', 'gifty:suggestions:user2'];
      const timestampedKeys = [
        'gifty:gifts:123:2024-11-15T10:00:00',
        'gifty:cache:456:2024-11-20T15:30:00',
        'gifty:recent:789'
      ];
      
      redisClient.keys
        .mockResolvedValueOnce(suggestionKeys) // First call for suggestion keys
        .mockResolvedValueOnce(timestampedKeys); // Second call for all keys
      
      redisClient.del
        .mockResolvedValueOnce(2) // Delete suggestion keys
        .mockResolvedValueOnce(2); // Delete old timestamped keys

      // Act
      const result = await cleanupService.cleanupRedisCache();

      // Assert
      expect(result).toBe(4); // 2 suggestion keys + 2 old timestamped keys
      
      // Verify suggestion keys cleanup
      expect(redisClient.keys).toHaveBeenCalledWith('gifty:suggestions:*');
      expect(redisClient.del).toHaveBeenCalledWith(suggestionKeys);
      
      // Verify timestamped keys cleanup
      expect(redisClient.keys).toHaveBeenCalledWith('gifty:*');
      
      expect(logger.info).toHaveBeenCalledWith('Deleted 4 Redis cache keys.');
    });

    it('should handle empty suggestion keys gracefully', async () => {
      // Arrange
      redisClient.keys
        .mockResolvedValueOnce([]) // No suggestion keys
        .mockResolvedValueOnce([]); // No other keys

      // Act
      const result = await cleanupService.cleanupRedisCache();

      // Assert
      expect(result).toBe(0);
      expect(redisClient.del).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Deleted 0 Redis cache keys.');
    });

    it('should filter timestamped keys correctly based on 7-day cutoff', async () => {
      // Arrange - Mix of old and recent keys
      const mixedKeys = [
        'gifty:gifts:123:2024-11-15T10:00:00', // 16 days old - should be deleted
        'gifty:cache:456:2024-11-28T15:30:00', // 3 days old - should be kept
        'gifty:recent:789', // No timestamp - should be kept
        'gifty:old:999:2024-10-20T12:00:00' // 42 days old - should be deleted
      ];
      
      redisClient.keys
        .mockResolvedValueOnce([]) // No suggestion keys
        .mockResolvedValueOnce(mixedKeys);
      
      redisClient.del.mockResolvedValueOnce(2); // Delete 2 old keys

      // Act
      const result = await cleanupService.cleanupRedisCache();

      // Assert
      expect(result).toBe(2);
      
      // Verify only old timestamped keys were deleted
      const deletedKeys = redisClient.del.mock.calls[0][0];
      expect(deletedKeys).toHaveLength(2);
      expect(deletedKeys).toContain('gifty:gifts:123:2024-11-15T10:00:00');
      expect(deletedKeys).toContain('gifty:old:999:2024-10-20T12:00:00');
      
      expect(logger.info).toHaveBeenCalledWith('Deleted 2 Redis cache keys.');
    });
  });

  describe('cleanupJobQueues - Happy Path', () => {
    it('should successfully cleanup old completed and failed jobs', async () => {
      // Arrange
      const { cleanupQueue } = require('../../queues');
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      
      const oldCompletedJobs = [
        createMockJob(oneWeekAgo - 1000), // 1 second older than cutoff
        createMockJob(oneWeekAgo - 86400000) // 1 day older than cutoff
      ];
      
      const recentCompletedJobs = [
        createMockJob(oneWeekAgo + 1000) // 1 second newer than cutoff
      ];
      
      const oldFailedJobs = [
        createMockJob(oneWeekAgo - 2000) // 2 seconds older than cutoff
      ];
      
      const recentFailedJobs = [
        createMockJob(oneWeekAgo + 2000) // 2 seconds newer than cutoff
      ];
      
      cleanupQueue.getJobs
        .mockResolvedValueOnce([...oldCompletedJobs, ...recentCompletedJobs]) // Completed jobs
        .mockResolvedValueOnce([...oldFailedJobs, ...recentFailedJobs]); // Failed jobs

      // Act
      const result = await cleanupService.cleanupJobQueues();

      // Assert
      expect(result).toBe(3); // 2 old completed + 1 old failed
      
      expect(cleanupQueue.getJobs).toHaveBeenCalledWith(['completed']);
      expect(cleanupQueue.getJobs).toHaveBeenCalledWith(['failed']);
      
      // Verify only old jobs were removed
      expect(oldCompletedJobs[0].remove).toHaveBeenCalled();
      expect(oldCompletedJobs[1].remove).toHaveBeenCalled();
      expect(oldFailedJobs[0].remove).toHaveBeenCalled();
      expect(recentCompletedJobs[0].remove).not.toHaveBeenCalled();
      expect(recentFailedJobs[0].remove).not.toHaveBeenCalled();
      
      expect(logger.info).toHaveBeenCalledWith('Cleaned up 2 completed and 1 failed jobs.');
    });

    it('should return zero when no old jobs exist', async () => {
      // Arrange
      const { cleanupQueue } = require('../../queues');
      
      cleanupQueue.getJobs
        .mockResolvedValueOnce([]) // No completed jobs
        .mockResolvedValueOnce([]); // No failed jobs

      // Act
      const result = await cleanupService.cleanupJobQueues();

      // Assert
      expect(result).toBe(0);
      expect(logger.info).toHaveBeenCalledWith('Cleaned up 0 completed and 0 failed jobs.');
    });
  });

  describe('runAllCleanupTasks - Orchestration', () => {
    it('should successfully run all cleanup tasks in parallel', async () => {
      // Arrange - Mock all individual cleanup functions before running tests
      Notification.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 5 });
      SuggestionHistory.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 3 });
      Gift.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 2 });
      
      redisClient.keys
        .mockResolvedValueOnce([]) // No suggestion keys
        .mockResolvedValueOnce([]); // No other keys
      
      const { cleanupQueue } = require('../../queues');
      cleanupQueue.getJobs
        .mockResolvedValueOnce([]) // No completed jobs
        .mockResolvedValueOnce([]); // No failed jobs

      // Act
      await cleanupService.runAllCleanupTasks();

      // Assert
      expect(Notification.deleteMany).toHaveBeenCalled();
      expect(SuggestionHistory.deleteMany).toHaveBeenCalled();
      expect(Gift.deleteMany).toHaveBeenCalled();
      expect(redisClient.keys).toHaveBeenCalled();
      expect(cleanupQueue.getJobs).toHaveBeenCalled();
      
      expect(logger.info).toHaveBeenCalledWith('Starting comprehensive cleanup tasks');
      expect(logger.info).toHaveBeenCalledWith('All cleanup tasks completed successfully');
    });

    it('should handle errors gracefully without re-throwing', async () => {
      // Arrange - Mock one function to throw an error
      const testError = new Error('Cleanup failed');
      Notification.deleteMany = jest.fn().mockRejectedValue(testError);
      
      // Mock other functions to succeed
      SuggestionHistory.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 3 });
      Gift.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 2 });
      redisClient.keys
        .mockResolvedValueOnce([]) // No suggestion keys
        .mockResolvedValueOnce([]); // No other keys
      
      const { cleanupQueue } = require('../../queues');
      cleanupQueue.getJobs
        .mockResolvedValueOnce([]) // No completed jobs
        .mockResolvedValueOnce([]); // No failed jobs

      // Act - Should not throw
      await expect(cleanupService.runAllCleanupTasks()).resolves.toBeUndefined();

      // Assert
      expect(logger.info).toHaveBeenCalledWith('Starting comprehensive cleanup tasks');
      expect(logger.error).toHaveBeenCalledWith('Error running cleanup tasks:', testError);
      expect(logger.info).not.toHaveBeenCalledWith('All cleanup tasks completed successfully');
    });
  });

  describe('startCleanupScheduler - Scheduler Setup', () => {
    it('should successfully setup cleanup scheduler with Bull queue', () => {
      // Act
      cleanupService.startCleanupScheduler();

      // Assert
      expect(cleanupQueue.add).toHaveBeenCalledWith(
        'full-cleanup',
        { timestamp: expect.any(Number) },
        {
          repeat: {
            cron: '0 2 * * *', // 2:00 AM daily
            tz: process.env.TZ || 'UTC'
          },
          removeOnComplete: true,
          removeOnFail: false
        }
      );
      
      expect(cleanupQueue.process).toHaveBeenCalledWith(
        'full-cleanup',
        expect.any(Function)
      );
      
      expect(logger.info).toHaveBeenCalledWith('Cleanup scheduler started using Bull queue');
    });

    it('should handle scheduler setup errors gracefully', () => {
      // Arrange
      const setupError = new Error('Queue setup failed');
      cleanupQueue.add.mockImplementationOnce(() => {
        throw setupError;
      });

      // Act - Should not throw
      expect(() => cleanupService.startCleanupScheduler()).not.toThrow();

      // Assert
      expect(logger.error).toHaveBeenCalledWith('Failed to start cleanup scheduler:', setupError);
      expect(logger.info).not.toHaveBeenCalledWith('Cleanup scheduler started using Bull queue');
    });

    it('should process cleanup jobs correctly', async () => {
      // Arrange
      const mockJob = { id: 'test-job-123' };
      
      // Mock the dependencies for runAllCleanupTasks
      Notification.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });
      SuggestionHistory.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });
      Gift.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });
      redisClient.keys
        .mockResolvedValueOnce([]) // No suggestion keys
        .mockResolvedValueOnce([]); // No other keys
      
      const { cleanupQueue } = require('../../queues');
      cleanupQueue.getJobs
        .mockResolvedValueOnce([]) // No completed jobs
        .mockResolvedValueOnce([]); // No failed jobs
      
      cleanupService.startCleanupScheduler();
      
      // Get the job processor function
      const processorCall = cleanupQueue.process.mock.calls.find(call => call[0] === 'full-cleanup');
      const jobProcessor = processorCall[1];

      // Act
      await jobProcessor(mockJob);

      // Assert
      expect(logger.info).toHaveBeenCalledWith('Processing scheduled cleanup job #test-job-123');
      expect(Notification.deleteMany).toHaveBeenCalled();
    });
  });
});
