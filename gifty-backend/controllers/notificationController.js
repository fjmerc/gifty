const asyncHandler = require('express-async-handler');
const { findOwned } = require('../utils/ownership');
const Notification = require('../models/Notification');
const Event = require('../models/Event');
const User = require('../models/User');
const { standardizeDate, formatDateForDisplay } = require('../services/notificationService');
const logger = require('../utils/logger');

// @desc Get all notifications for a user with pagination
// @route GET /api/notifications?page=1&limit=10&includeRetroactive=true
// @access Private
exports.getNotifications = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1; // Current page
    const limit = parseInt(req.query.limit) || 10; // Number of notifications per page
    const skip = (page - 1) * limit; // Calculate skip value
    const includeRetroactive = req.query.includeRetroactive !== 'false'; // Default to true
    
    // Get user preferences for timezone
    const user = await User.findById(req.user._id);
    const userTimezone = user.preferences?.timezone || 'UTC';
    
    // Build query
    const query = { user: req.user._id };
    
    // Filter out retroactive notifications if requested
    if (!includeRetroactive) {
        query.isRetroactive = false;
    }

    logger.debug(`Fetching notifications for user ${req.user._id}`, {
        page,
        limit,
        includeRetroactive
    });

    const notifications = await Notification.find(query)
        .populate({
            path: 'event',
            select: 'name date reminder',
            populate: {
                path: 'recipient',
                select: 'firstName lastName'
            }
        })
        .sort({ notificationDate: -1 })
        .skip(skip)
        .limit(limit);

    // Get current time to determine snoozed status
    const now = new Date();

    // Add formatted dates based on user's timezone
    const formattedNotifications = notifications.map(notification => {
        const notificationObj = notification.toObject();
        
        // Check if the notification is snoozed
        const isSnoozed = notification.snoozedUntil && 
                          new Date(notification.snoozedUntil) > now;
        notificationObj.isSnoozed = isSnoozed;
        
        // Format dates for display
        notificationObj.formattedNotificationDate = formatDateForDisplay(
            notification.notificationDate, 
            userTimezone
        );
        
        // Add formatted snoozed until date if applicable
        if (isSnoozed) {
            notificationObj.formattedSnoozedUntil = formatDateForDisplay(
                notification.snoozedUntil,
                userTimezone
            );
        }
        
        // Add original scheduled time for retroactive notifications
        if (notification.isRetroactive && notification.scheduledTime) {
            notificationObj.formattedScheduledTime = formatDateForDisplay(
                notification.scheduledTime,
                userTimezone
            );
        }
        
        return notificationObj;
    });

    const totalNotifications = await Notification.countDocuments(query);

    res.json({
        notifications: formattedNotifications,
        totalPages: Math.ceil(totalNotifications / limit),
        currentPage: page,
        userTimezone
    });
});

// @desc Update notification status (e.g., mark as read)
// @route PUT /api/notifications/:notificationId
// @access Private
exports.updateNotification = asyncHandler(async (req, res) => {
    // Missing and other users' records are the same 404 (a 401 would log the UI out)
    const notification = await findOwned(Notification, req.params.notificationId, req.user._id, { label: 'Notification' });

    // Prepare update data
    const updateData = {};
    
    // Only include read status if it's provided
    if (typeof req.body.read === 'boolean') {
        updateData.read = req.body.read;
    }

    // Handle unsnoozed notifications
    if (req.body.snoozedUntil === null) {
        updateData.snoozedUntil = null;
        logger.debug(`Unsnoozed notification ${req.params.notificationId}`);
    }

    // Only include and standardize notificationDate if it's provided
    if (req.body.notificationDate) {
        updateData.notificationDate = standardizeDate(req.body.notificationDate);
    }
    
    // Allow updating retroactive preferences
    if (typeof req.body.allowRetroactive === 'boolean') {
        // Update the user's preferences for retroactive notifications
        await User.findByIdAndUpdate(req.user._id, {
            $set: { 'preferences.allowRetroactiveNotifications': req.body.allowRetroactive }
        });
        
        logger.info(`User ${req.user._id} updated retroactive notification preference to ${req.body.allowRetroactive}`);
    }

    logger.debug(`Updating notification ${req.params.notificationId}`, updateData);

    const updatedNotification = await Notification.findByIdAndUpdate(
        req.params.notificationId,
        updateData,
        { new: true }
    ).populate({
        path: 'event',
        select: 'name date reminder',
        populate: {
            path: 'recipient',
            select: 'firstName lastName'
        }
    });
    
    // Get user preferences for timezone
    const user = await User.findById(req.user._id);
    const userTimezone = user.preferences?.timezone || 'UTC';
    
    // Format dates for response
    const notificationObj = updatedNotification.toObject();
    notificationObj.formattedNotificationDate = formatDateForDisplay(
        updatedNotification.notificationDate, 
        userTimezone
    );
    
    if (updatedNotification.isRetroactive && updatedNotification.scheduledTime) {
        notificationObj.formattedScheduledTime = formatDateForDisplay(
            updatedNotification.scheduledTime,
            userTimezone
        );
    }

    res.json(notificationObj);
});

// @desc Snooze a notification
// @route PUT /api/notifications/:notificationId/snooze
// @access Private
exports.snoozeNotification = asyncHandler(async (req, res) => {
    const { snoozeDuration } = req.body; // Duration in minutes

    if (!snoozeDuration || typeof snoozeDuration !== 'number') {
        res.status(400);
        throw new Error('Please provide a valid snooze duration in minutes');
    }

    // Missing and other users' records are the same 404 (a 401 would log the UI out)
    const notification = await findOwned(Notification, req.params.notificationId, req.user._id, { label: 'Notification' });

    // Calculate new notification date
    const newNotificationDate = new Date();
    newNotificationDate.setMinutes(newNotificationDate.getMinutes() + snoozeDuration);
    const standardizedDate = standardizeDate(newNotificationDate);

    // notificationDate stays: it is the reminder time the reminder job
    // matches on to send once (and is immutable)
    notification.snoozedUntil = standardizedDate;
    notification.read = false; // Reset read status

    logger.debug(`Snoozing notification ${req.params.notificationId} for ${snoozeDuration} minutes`, {
        newDate: standardizedDate
    });
    
    const savedNotification = await notification.save();
    
    // Fully populate the notification before returning
    const populatedNotification = await Notification.findById(savedNotification._id)
        .populate({
            path: 'event',
            select: 'name date reminder',
            populate: {
                path: 'recipient',
                select: 'firstName lastName'
            }
        });
    
    // Get user preferences for timezone
    const user = await User.findById(req.user._id);
    const userTimezone = user.preferences?.timezone || 'UTC';
    
    // Get current time to determine snoozed status
    const now = new Date();
    
    // Format dates for response
    const notificationObj = populatedNotification.toObject();
    
    // Check if the notification is snoozed
    const isSnoozed = populatedNotification.snoozedUntil && 
                      new Date(populatedNotification.snoozedUntil) > now;
    notificationObj.isSnoozed = isSnoozed;
    
    notificationObj.formattedNotificationDate = formatDateForDisplay(
        populatedNotification.notificationDate, 
        userTimezone
    );
    
    // Add formatted snoozed until date
    if (populatedNotification.snoozedUntil) {
        notificationObj.formattedSnoozedUntil = formatDateForDisplay(
            populatedNotification.snoozedUntil,
            userTimezone
        );
    }
    
    if (populatedNotification.isRetroactive && populatedNotification.scheduledTime) {
        notificationObj.formattedScheduledTime = formatDateForDisplay(
            populatedNotification.scheduledTime,
            userTimezone
        );
    }
    
    logger.debug(`Notification snoozed successfully`, {
        newNotificationDate: populatedNotification.notificationDate,
        snoozedUntil: populatedNotification.snoozedUntil
    });

    res.json(notificationObj);
});

// @desc Delete a notification
// @route DELETE /api/notifications/:notificationId
// @access Private
exports.deleteNotification = asyncHandler(async (req, res) => {
    // Missing and other users' records are the same 404 (a 401 would log the UI out)
    const notification = await findOwned(Notification, req.params.notificationId, req.user._id, { label: 'Notification' });

    logger.debug(`Deleting notification ${req.params.notificationId}`);
    await notification.deleteOne();
    logger.debug(`Notification deleted successfully`);
    res.status(204).json();
});

// @desc Get notification statistics including unread count
// @route GET /api/notifications/stats
// @access Private
exports.getNotificationStats = asyncHandler(async (req, res) => {
    // Add request ID for tracking this specific request in logs
    const requestId = Math.random().toString(36).substring(2, 10);
    logger.info(`[${requestId}] Starting notification stats fetch for user ${req.user._id}`);
    
    // Create a fresh Date object for now
    const now = new Date();
    logger.debug(`[${requestId}] Current time: ${now.toISOString()}`);
    
    try {
        // Get unread count
        logger.debug(`[${requestId}] Fetching unread count`);
        // A snoozed notice counts again once its snooze ends
        const unreadCount = await Notification.countDocuments({
            user: req.user._id,
            read: false,
            notificationDate: { $lte: now },
            $or: [{ snoozedUntil: null }, { snoozedUntil: { $lte: now } }]
        });
        logger.debug(`[${requestId}] Unread count: ${unreadCount}`);

        // Get today's notifications count - create fresh Date objects
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        
        logger.debug(`[${requestId}] Fetching today's count from ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);
        const todayCount = await Notification.countDocuments({
            user: req.user._id,
            notificationDate: { 
                $gte: startOfDay,
                $lte: endOfDay
            }
        });
        logger.debug(`[${requestId}] Today's count: ${todayCount}`);
        
        // Get retroactive notification count
        logger.debug(`[${requestId}] Fetching retroactive count`);
        const retroactiveCount = await Notification.countDocuments({
            user: req.user._id,
            isRetroactive: true
        });
        logger.debug(`[${requestId}] Retroactive count: ${retroactiveCount}`);
        
        // Get snoozed notification count
        logger.debug(`[${requestId}] Fetching snoozed count`);
        const snoozedCount = await Notification.countDocuments({
            user: req.user._id,
            snoozedUntil: { $gt: now }
        });
        logger.debug(`[${requestId}] Snoozed count: ${snoozedCount}`);

        // Get counts by type
        logger.debug(`[${requestId}] Fetching type stats`);
        const typeStats = await Notification.aggregate([
            {
                $match: {
                    user: req.user._id,
                    notificationDate: { $lte: now }
                }
            },
            {
                $group: {
                    _id: '$notificationType',
                    count: { $sum: 1 }
                }
            }
        ]);
        
        // Get counts by status (including retroactive)
        logger.debug(`[${requestId}] Fetching status stats`);
        const statusStats = await Notification.aggregate([
            {
                $match: {
                    user: req.user._id
                }
            },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);
        
        // Get user preferences
        logger.debug(`[${requestId}] Fetching user preferences`);
        const user = await User.findById(req.user._id);
        const allowRetroactiveNotifications = user.preferences?.allowRetroactiveNotifications !== false;

        const response = {
            unreadCount,
            todayCount,
            retroactiveCount,
            snoozedCount,
            typeStats,
            statusStats,
            preferences: {
                allowRetroactiveNotifications
            },
            lastUpdated: now
        };
        
        logger.info(`[${requestId}] Successfully completed notification stats fetch for user ${req.user._id}`);
        res.json(response);
    } catch (error) {
        logger.error(`[${requestId}] Error fetching notification stats:`, {
            message: error.message,
            stack: error.stack
        });
        throw error;
    }
});
