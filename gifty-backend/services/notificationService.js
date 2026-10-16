const Notification = require('../models/Notification');
const Event = require('../models/Event');
const User = require('../models/User');
const Recipient = require('../models/Recipient');
const emailService = require('./emailService');
const logger = require('../utils/logger');

// Map reminder methods to notification types
const getNotificationTypeForMethod = (method) => {
    switch (method) {
        case 'Email':
        case 'Push Notification':
        case 'SMS':
            return 'info'; // Default to info type for all reminder methods
        default:
            return 'info';
    }
};

// Process reminders and create notifications
const DUE_WINDOW_MS = 15 * 60000;

const processReminders = async () => {
    try {
        const now = new Date();
        logger.info(`Starting reminder processing at ${now.toISOString()}`);
        
        // Reminders that came due since the last runs (the job runs every
        // minute). Older ones were missed while the server was down: the
        // startup catch-up shows those in the app, without a burst of email.
        const events = await Event.find({
            'reminder.isSet': true,
            'reminder.time': { $gt: new Date(now.getTime() - DUE_WINDOW_MS), $lte: now }
        }).populate('user');

        logger.info(`Found ${events.length} events with reminders due`);
        
        for (const event of events) {
            logger.debug(`Processing event: ${event.name} (ID: ${event._id})`);
            
            // Check if notification already exists for this event and time
            // (the startup catch-up records the reminder time as scheduledTime)
            const existingNotification = await Notification.findOne({
                event: event._id,
                $or: [{ notificationDate: event.reminder.time }, { scheduledTime: event.reminder.time }]
            });

            if (!existingNotification) {
                logger.info(`Creating new notification for event: ${event.name}`);
                
                // Create new notification with mapped notification type
                const newNotification = await Notification.create({
                    user: event.user._id,
                    event: event._id,
                    notificationType: getNotificationTypeForMethod(event.reminder.method),
                    notificationDate: event.reminder.time
                });
                
                logger.debug(`Created notification with ID: ${newNotification._id}`);

                // Here you would integrate with your preferred notification service
                // Example: Email service, Push notification service, or SMS service
                switch (event.reminder.method) {
                    case 'Email':
                        logger.info(`Sending email reminder for event: ${event.name}`);
                        await sendEmailReminder(event);
                        break;
                    case 'Push Notification':
                        logger.info(`Sending push notification for event: ${event.name}`);
                        // Integrate with push notification service
                        break;
                    case 'SMS':
                        logger.info(`Sending SMS reminder for event: ${event.name}`);
                        // Integrate with SMS service (e.g., Twilio)
                        break;
                    default:
                        logger.warn(`Unknown reminder method: ${event.reminder.method}`);
                }
            }
        }
    } catch (error) {
        logger.error('Error processing reminders:', {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    }
};

// Schedule reminder checks
const startReminderProcessor = () => {
    // Check for reminders every minute
    const interval = setInterval(processReminders, 60000);
    // Don't let the processor keep the process alive on its own
    interval.unref();
    logger.info('Reminder processor started');
    return interval;
};

// Standardize date handling with improved timezone awareness
const standardizeDate = (date) => {
    // Create a date object from the input date
    const d = new Date(date);
    
    // Store the original ISO string for logging
    const originalIsoString = d.toISOString();
    
    // Return the ISO string directly, preserving timezone information
    // This ensures dates are stored consistently in UTC but displayed correctly
    // in the client's local timezone
    logger.info(`Standardized date from ${date} (original type: ${typeof date}) to ${d.toISOString()}`);
    
    // Important: Return the ISO string without any timezone adjustment
    // This preserves the exact time the user set for the reminder
    return d.toISOString();
};

// Format date for display with timezone consideration
const formatDateForDisplay = (isoString, timezone = 'UTC') => {
    try {
        const date = new Date(isoString);
        
        // Format date consistent with frontend components (Events.js and Notifications.js)
        const formattedDate = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
        
        // Format time consistent with frontend
        const formattedTime = date.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true
        });
        
        return `${formattedDate} ${formattedTime}`;
    } catch (error) {
        logger.error(`Error formatting date: ${error.message}`);
        return isoString; // Fallback to the ISO string if there's an error
    }
};

// Send email reminder for an event
const sendEmailReminder = async (event) => {
    try {
        // Fully populate the event with user and recipient details
        const populatedEvent = await Event.findById(event._id)
            .populate('user')
            .populate('recipient');
            
        if (!populatedEvent) {
            logger.error(`Event not found for email reminder: ${event._id}`);
            return;
        }
        
        const user = populatedEvent.user;
        const recipient = populatedEvent.recipient;
        
        // Check if email notifications are enabled for the user
        if (!user?.preferences?.notificationSettings?.email?.enabled) {
            logger.info(`Email notifications disabled for user: ${user?._id}`);
            return;
        }

        // Get the email address to send to (from user preferences or user email)
        const emailAddress = user.preferences.notificationSettings.email.address || user.email;
        
        // Format the email content
        const { text, html } = emailService.formatEventReminderEmail(user, populatedEvent, recipient);
        
        // Send the email
        const result = await emailService.sendEmail(
            user._id,
            emailAddress,
            `Reminder: ${populatedEvent.name}`,
            text,
            html
        );
        
        if (result.success) {
            logger.info(`Email reminder sent successfully for event: ${populatedEvent.name}`);
        } else {
            logger.error(`Failed to send email reminder: ${result.message}`);
        }
        
        return result;
    } catch (error) {
        logger.error('Error sending email reminder:', {
            error: error.message,
            stack: error.stack,
            eventId: event._id
        });
    }
};

module.exports = {
    processReminders,
    startReminderProcessor,
    standardizeDate,
    formatDateForDisplay,
    sendEmailReminder,
    DUE_WINDOW_MS
};
