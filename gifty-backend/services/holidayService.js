const Holiday = require('../models/Holiday');
const Event = require('../models/Event');
const User = require('../models/User');
const Recipient = require('../models/Recipient');
const logger = require('../utils/logger');
const { standardizeDate } = require('./notificationService');
const { resolveHolidayDate } = require('../utils/holidayDates');
const { todayAsDateOnly } = require('../utils/dates');

const DAY_MS = 24 * 60 * 60 * 1000;
// Event dates are calendar days stored as UTC midnight
const calendarDay = (date) => new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
const mongoose = require('mongoose');

const DEFAULT_REMIND_DAYS = 7;
const remindDaysOf = (settings) => settings?.defaultRemindDaysBefore ?? DEFAULT_REMIND_DAYS;

// The reminder for a holiday: 09:00 instance time, some days before the day
// (a UTC-midnight calendar day)
const reminderTime = (day, daysBefore) => new Date(
    day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() - daysBefore, 9, 0, 0, 0
);

// The next day (today or later) a holiday falls on, as a calendar day
const nextOccurrence = (holiday, now) => {
    const today = todayAsDateOnly(now);
    const year = today.getUTCFullYear();
    const thisYear = calendarDay(resolveHolidayDate(holiday, year));
    // Floating holidays move each year, so next year's day is resolved again
    return thisYear < today ? calendarDay(resolveHolidayDate(holiday, year + 1)) : thisYear;
};

// The holidays a user's settings ask for (none when switched off)
const chosenHolidays = (settings) => {
    if (!settings?.enabled) return Promise.resolve([]);
    return Holiday.find({
        countryCode: settings.countryCode || 'US',
        category: { $in: settings.categories || ['national', 'cultural'] },
        isActive: true
    }).populate('eventType');
};

// The system Holiday type; users may have a custom type with the same name
const systemHolidayType = () => mongoose.model('EventType').findOne({ name: 'Holiday', createdBy: null });

// The event of a holiday on a calendar day, if the generator made one
const holidayEventOn = (userId, name, day, extra = {}) => Event.findOne({
    user: userId,
    name,
    isSystemGenerated: true,
    date: { $gte: day, $lt: new Date(day.getTime() + DAY_MS) },
    ...extra
});

/**
 * Generate the next occurrence of each holiday a user chose, unless it exists.
 *
 * With rollForward, only holidays whose previous occurrence the user still
 * has (and that was not rolled forward before) get their next one: the
 * yearly job carries holidays on without bringing back ones the user
 * deleted or adding ones they never had.
 * @param {string} userId - User ID to generate holiday events for
 * @param {Object} [options]
 * @param {Date} [options.now] - The current time
 * @param {boolean} [options.rollForward] - Only continue holidays the user has
 * @returns {Promise<Object>} Result of holiday event generation
 */
const generateHolidayEvents = async (userId, { now = new Date(), rollForward = false, only = null } = {}) => {
    try {
        logger.info(`Generating holiday events for user: ${userId}`);
        
        const user = await User.findById(userId);
        if (!user) {
            logger.error(`User not found with ID: ${userId}`);
            return { success: false, message: 'User not found' };
        }
        
        const holidaySettings = user.preferences?.holidaySettings;
        if (!holidaySettings?.enabled) {
            logger.info(`Holiday features disabled for user: ${userId}`);
            return { success: true, message: 'Holiday features disabled for user', created: 0, skipped: 0 };
        }

        const remindDaysBefore = remindDaysOf(holidaySettings);
        // only: just these holiday names (a one-time upgrade adding them)
        const holidays = (await chosenHolidays(holidaySettings)).filter((h) => !only || only.includes(h.name));
        logger.info(`Found ${holidays.length} holidays matching preferences for user ${userId}`);
        
        // Find a suitable system account recipient, or create one if not found
        let systemRecipient = await Recipient.findOne({ 
            user: userId,
            isSystemAccount: true
        });
        
        if (!systemRecipient) {
            // Create a system recipient if none exists
            systemRecipient = await Recipient.create({
                user: userId,
                firstName: 'Gifty', 
                lastName: 'Holidays',
                isSelf: false,
                isSystemAccount: true,
                relationship: 'service', // Use a valid enum value from the Recipient schema
                relation: 'System Calendar', // More descriptive relation label
                birthdate: new Date('2023-01-01'), // Default birthdate for the system
                minimumPriceBudget: 0,
                maximumPriceBudget: 0
            });
            logger.info(`Created system recipient for user ${userId}`);
        }
        
        let created = 0;
        let skipped = 0;
        
        for (const holiday of holidays) {
            const day = nextOccurrence(holiday, now);
            
            const existingEvent = await holidayEventOn(userId, holiday.name, day);
            let previous = null;
            if (!existingEvent && rollForward) {
                const lastYear = calendarDay(resolveHolidayDate(holiday, day.getUTCFullYear() - 1));
                previous = await holidayEventOn(userId, holiday.name, lastYear, { rolledForward: { $ne: true } });
                if (!previous) {
                    skipped++;
                    continue;
                }
            }
            
            if (!existingEvent) {
                await Event.create({
                    user: userId,
                    recipient: systemRecipient._id,
                    name: holiday.name,
                    date: day,
                    type: holiday.eventType._id,
                    isSystemGenerated: true, // Mark as system-generated
                    reminder: {
                        isSet: true,
                        time: standardizeDate(reminderTime(day, remindDaysBefore)),
                        method: user.preferences?.notificationSettings?.email?.enabled ? 'Email' : 'Push Notification'
                    }
                });
                if (previous) await Event.updateOne({ _id: previous._id }, { $set: { rolledForward: true } });
                
                created++;
            } else {
                skipped++;
            }
        }
        
        logger.info(`Holiday event generation complete for user ${userId}. Created: ${created}, Skipped: ${skipped}`);
        return { 
            success: true, 
            created, 
            skipped,
            message: `Successfully generated ${created} holiday events. ${skipped} events already existed.`
        };
    } catch (error) {
        logger.error(`Error generating holiday events for user ${userId}:`, error);
        return { 
            success: false, 
            error: error.message 
        };
    }
};

/**
 * Carry every user's holidays on to their next occurrence once the last one
 * has passed (the monthly calendar job, also run at startup)
 * @param {Object} [options]
 * @param {Date} [options.now] - The current time
 * @returns {Promise<Object>} Results of regeneration process
 */
const regenerateAllHolidayEvents = async ({ now = new Date() } = {}) => {
    try {
        logger.info('Starting holiday events regeneration for all users');
        
        // Accounts that never saved holiday settings have them on by default
        const users = await User.find({
            'preferences.holidaySettings.enabled': { $ne: false }
        });
        
        logger.info(`Found ${users.length} users with holiday features enabled`);
        
        let successCount = 0;
        let failureCount = 0;
        let totalCreated = 0;
        let totalSkipped = 0;
        
        for (const user of users) {
            const result = await generateHolidayEvents(user._id, { now, rollForward: true });
            
            if (result.success) {
                successCount++;
                totalCreated += result.created;
                totalSkipped += result.skipped;
            } else {
                failureCount++;
                logger.error(`Failed to generate holidays for user ${user._id}: ${result.message || result.error}`);
            }
        }
        
        logger.info(`Holiday regeneration complete. Success: ${successCount}, Failures: ${failureCount}, Created: ${totalCreated}, Skipped: ${totalSkipped}`);
        
        return {
            success: true,
            usersProcessed: users.length,
            successCount,
            failureCount,
            totalCreated,
            totalSkipped
        };
    } catch (error) {
        logger.error('Error in regenerateAllHolidayEvents:', error);
        return { 
            success: false, 
            error: error.message 
        };
    }
};

/**
 * Bring a user's holiday events in line with their holiday settings (after
 * a settings change, or "Refresh Holidays").
 *
 * Only upcoming events the generator made are removed, and only when the
 * settings no longer ask for them and nothing hangs off them: past holidays,
 * events the user filed under the Holiday type and holidays with gifts stay.
 * When only the reminder days changed, upcoming reminders the user has not
 * set by hand move with them.
 * @param {string} userId - ID of the user whose preferences changed
 * @param {Object} [options]
 * @param {Object} [options.previous] - The holiday settings before the change
 * @param {Date} [options.now] - The current time
 * @returns {Promise<Object>} What changed: created, removed, keptWithGifts, remindersMoved
 */
const updateUserHolidayEvents = async (userId, { previous, now = new Date() } = {}) => {
    try {
        logger.info(`Updating holiday events for user ${userId} based on preference changes`);

        // Not lean: an account that never saved holiday settings gets the
        // schema defaults, as the generator below does
        const user = await User.findById(userId);
        if (!user) return { success: false, error: 'User not found' };
        const settings = user.preferences?.holidaySettings;
        const holidayType = await systemHolidayType();

        let removed = 0;
        let keptWithGifts = 0;
        let remindersMoved = 0;
        if (holidayType) {
            const wanted = new Map((await chosenHolidays(settings))
                .map((holiday) => [holiday.name, nextOccurrence(holiday, now).getTime()]));
            const upcoming = await Event.find({
                user: userId,
                type: holidayType._id,
                isSystemGenerated: true,
                date: { $gte: todayAsDateOnly(now) }
            });

            const oldDays = remindDaysOf(previous);
            const newDays = remindDaysOf(settings);
            for (const event of upcoming) {
                if (wanted.get(event.name) === event.date.getTime()) {
                    // A reminder still where the old setting put it follows the
                    // new one, unless it already went out or the new time has
                    // passed (it would never go out)
                    const reminder = event.reminder;
                    const moved = reminderTime(event.date, newDays);
                    if (oldDays !== newDays && reminder?.isSet && reminder.time > now && moved > now
                        && reminder.time.getTime() === reminderTime(event.date, oldDays).getTime()) {
                        await Event.updateOne({ _id: event._id }, { $set: { 'reminder.time': moved } });
                        remindersMoved++;
                    }
                } else if (await mongoose.model('Gift').exists({ user: userId, event: event._id })) {
                    keptWithGifts++;
                } else {
                    await mongoose.model('Notification').deleteMany({ event: event._id });
                    await Event.deleteOne({ _id: event._id });
                    removed++;
                }
            }
        } else {
            logger.warn('Holiday event type not found, no events to remove');
        }

        const generation = await generateHolidayEvents(userId, { now });
        if (!generation.success) {
            return { success: false, removed, keptWithGifts, remindersMoved, error: generation.error || generation.message };
        }

        logger.info(`Holiday events for user ${userId}: removed ${removed}, added ${generation.created}, kept ${keptWithGifts} with gifts`);
        return {
            success: true,
            created: generation.created,
            removed,
            keptWithGifts,
            remindersMoved,
            message: `Updated holiday events: removed ${removed}, added ${generation.created}`
        };
    } catch (error) {
        logger.error(`Error updating holiday events for user ${userId}:`, error);
        return { 
            success: false, 
            error: error.message 
        };
    }
};

module.exports = {
    generateHolidayEvents,
    regenerateAllHolidayEvents,
    updateUserHolidayEvents
};
