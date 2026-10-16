const Notification = require('../models/Notification');
const SuggestionHistory = require('../models/SuggestionHistory');
const Gift = require('../models/Gift');
const { redisClient, keyPrefixes } = require('../config/redis');
const logger = require('../utils/logger');
const { cleanupQueue } = require('../queues');

/**
 * Run all cleanup tasks
 */
const runAllCleanupTasks = async () => {
    try {
        logger.info('Starting comprehensive cleanup tasks');
        
        // Run all cleanup tasks
        await Promise.all([
            cleanupOldNotifications(),
            cleanupOldSuggestions(),
            cleanupUnusedGifts(),
            cleanupRedisCache(),
            cleanupJobQueues()
        ]);
        
        logger.info('All cleanup tasks completed successfully');
    } catch (error) {
        logger.error('Error running cleanup tasks:', error);
    }
};

/**
 * Clean up old notifications
 */
const cleanupOldNotifications = async () => {
    try {
        const now = new Date();
        const cutoffDate = new Date(now);
        cutoffDate.setMonth(now.getMonth() - 1); // Set cutoff to 1 month ago

        // Delete notifications older than the cutoff date
        const result = await Notification.deleteMany({
            notificationDate: { $lt: cutoffDate }
        });
        
        logger.info(`Deleted ${result.deletedCount} old notifications.`);
        return result.deletedCount;
    } catch (error) {
        logger.error('Error cleaning up old notifications:', error);
        throw error;
    }
};

/**
 * Clean up old suggestion history records
 */
const cleanupOldSuggestions = async () => {
    try {
        const now = new Date();
        const cutoffDate = new Date(now);
        cutoffDate.setMonth(now.getMonth() - 3); // Set cutoff to 3 months ago
        
        // Delete suggestion history older than the cutoff date
        const result = await SuggestionHistory.deleteMany({
            createdAt: { $lt: cutoffDate }
        });
        
        logger.info(`Deleted ${result.deletedCount} old suggestion history records.`);
        return result.deletedCount;
    } catch (error) {
        logger.error('Error cleaning up old suggestion history:', error);
        throw error;
    }
};

/**
 * Clean up unused gifts (suggestions that were ignored or never acted upon)
 */
const cleanupUnusedGifts = async () => {
    try {
        const now = new Date();
        const cutoffDate = new Date(now);
        cutoffDate.setMonth(now.getMonth() - 2); // Set cutoff to 2 months ago
        
        // Delete AI-suggested gifts that were ignored or never acted upon
        const result = await Gift.deleteMany({
            isAISuggested: true,
            status: 'suggestion',  // Only delete suggestions, not saved or purchased gifts
            createdAt: { $lt: cutoffDate }
        });
        
        logger.info(`Deleted ${result.deletedCount} unused AI suggestions.`);
        return result.deletedCount;
    } catch (error) {
        logger.error('Error cleaning up unused gifts:', error);
        throw error;
    }
};

/**
 * Clean up Redis cache
 */
const cleanupRedisCache = async () => {
    try {
        // Clean up old suggestion cache
        const suggestionKeys = await redisClient.keys(`${keyPrefixes.suggestions}*`);
        let deletedCount = 0;
        
        if (suggestionKeys.length > 0) {
            deletedCount = await redisClient.del(suggestionKeys);
        }
        
        // Get all cache keys and filter by timestamp (if they have one)
        // This will clean up any orphaned cache that wasn't invalidated properly
        const allKeys = await redisClient.keys('gifty:*');
        const keysToDelete = [];
        
        // Check each key for timestamp pattern
        for (const key of allKeys) {
            // Check if key matches a timestamp pattern (e.g., "gifty:gifts:123:2023-05-15")
            const timestampMatch = key.match(/.*:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
            
            if (timestampMatch) {
                const timestamp = new Date(timestampMatch[1]);
                const now = new Date();
                const daysDiff = (now - timestamp) / (1000 * 60 * 60 * 24);
                
                // Delete keys older than 7 days
                if (daysDiff > 7) {
                    keysToDelete.push(key);
                }
            }
        }
        
        // Delete old keys
        if (keysToDelete.length > 0) {
            const result = await redisClient.del(keysToDelete);
            deletedCount += result;
        }
        
        logger.info(`Deleted ${deletedCount} Redis cache keys.`);
        return deletedCount;
    } catch (error) {
        logger.error('Error cleaning up Redis cache:', error);
        throw error;
    }
};

/**
 * Clean up old job queue records
 */
const cleanupJobQueues = async () => {
    try {
        // Get completed jobs older than 7 days
        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        
        // Clean completed jobs
        const completedJobs = await cleanupQueue.getJobs(['completed']);
        const oldCompletedJobs = completedJobs.filter(job => job.timestamp < oneWeekAgo);
        
        // Clean failed jobs
        const failedJobs = await cleanupQueue.getJobs(['failed']);
        const oldFailedJobs = failedJobs.filter(job => job.timestamp < oneWeekAgo);
        
        // Remove old jobs
        await Promise.all([
            ...oldCompletedJobs.map(job => job.remove()),
            ...oldFailedJobs.map(job => job.remove())
        ]);
        
        logger.info(`Cleaned up ${oldCompletedJobs.length} completed and ${oldFailedJobs.length} failed jobs.`);
        return oldCompletedJobs.length + oldFailedJobs.length;
    } catch (error) {
        logger.error('Error cleaning up job queues:', error);
        throw error;
    }
};

/**
 * Schedule cleanup to run daily
 */
const startCleanupScheduler = () => {
    try {
        // Create cleanup job using Bull queue
        cleanupQueue.add(
            'full-cleanup',
            { timestamp: Date.now() },
            {
                repeat: {
                    cron: '0 2 * * *', // Run at 2:00 AM every day
                    tz: process.env.TZ || 'UTC',
                },
                removeOnComplete: true,
                removeOnFail: false
            }
        );
        
        // Process cleanup jobs
        cleanupQueue.process('full-cleanup', async (job) => {
            logger.info(`Processing scheduled cleanup job #${job.id}`);
            return runAllCleanupTasks();
        });
        
        logger.info('Cleanup scheduler started using Bull queue');
    } catch (error) {
        logger.error('Failed to start cleanup scheduler:', error);
    }
};

module.exports = {
    cleanupOldNotifications,
    cleanupOldSuggestions,
    cleanupUnusedGifts,
    cleanupRedisCache,
    cleanupJobQueues,
    runAllCleanupTasks,
    startCleanupScheduler
};
