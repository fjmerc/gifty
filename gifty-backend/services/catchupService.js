const Notification = require('../models/Notification');
const Event = require('../models/Event');
const { standardizeDate, DUE_WINDOW_MS } = require('./notificationService');
const logger = require('../utils/logger');

/**
 * Process missed notifications when the server starts up
 * This checks for notifications that were scheduled to be sent
 * during the time the server was offline
 */
const processMissedNotifications = async () => {
    try {
        const now = new Date();
        logger.info(`Starting to process missed notifications at ${now.toISOString()}`);

        // Get all events with reminders set in the past (up to 7 days ago by default)
        // but not too far in the past to avoid processing very old reminders
        const lookbackPeriod = process.env.NOTIFICATION_LOOKBACK_DAYS || 7; // Default 7 days
        const lookbackDate = new Date(now);
        lookbackDate.setDate(lookbackDate.getDate() - lookbackPeriod);

        // Find events with reminders that should have triggered while the
        // server was down. Reminders due in the last DUE_WINDOW_MS are the
        // minute job's, which also emails them.
        const events = await Event.find({
            'reminder.isSet': true,
            'reminder.time': {
                $gte: lookbackDate,
                $lte: new Date(now.getTime() - DUE_WINDOW_MS)
            }
        }).populate('user');

        logger.info(`Found ${events.length} events with potentially missed reminders`);

        let missedNotificationsCount = 0;

        for (const event of events) {
            // Check if notification already exists for this event and time
            const existingNotification = await Notification.findOne({
                event: event._id,
                $or: [
                    { notificationDate: event.reminder.time },
                    { scheduledTime: event.reminder.time }
                ]
            });

            if (!existingNotification) {
                // event.user is already populated above; no extra query needed
                const user = event.user;
                const allowRetroactive = user.preferences?.allowRetroactiveNotifications !== false; // Default to true if not set

                if (allowRetroactive) {
                    // Map reminder method to valid notification type
                    let notificationType = 'info'; // Default
                    if (event.reminder.method) {
                        const method = event.reminder.method.toLowerCase();
                        if (method === 'email') {
                            notificationType = 'email';
                        } else if (method === 'push notification') {
                            notificationType = 'info'; // Map push notification to info
                        } else {
                            notificationType = 'info'; // Default for any other values
                        }
                    }

                    // Create new notification marked as retroactive
                    await Notification.create({
                        user: event.user._id,
                        event: event._id,
                        notificationType: notificationType,
                        notificationDate: now, // Current time
                        scheduledTime: event.reminder.time, // Original scheduled time
                        isRetroactive: true,
                        status: 'retroactive'
                    });

                    missedNotificationsCount++;
                    logger.info(`Created retroactive notification for event: ${event.name}, user: ${event.user._id}`);
                } else {
                    logger.info(`Skipped retroactive notification for event: ${event.name}, user: ${event.user._id} (preferences)`);
                }
            }
        }

        logger.info(`Processed ${missedNotificationsCount} missed notifications`);
        return missedNotificationsCount;
    } catch (error) {
        logger.error('Error processing missed notifications:', error);
        throw error;
    }
};

module.exports = {
    processMissedNotifications
};
