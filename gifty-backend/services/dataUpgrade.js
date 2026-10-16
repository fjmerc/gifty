// Bring stored data up to what this version expects. Boot runs it before
// serving requests, and a full database restore runs it again: an older
// archive brings back older data, without the markers that say the
// one-time migrations already ran.
const { dropLegacyTagNameIndex } = require('../migrations/dropLegacyTagNameIndex');
const { runPendingMigrations } = require('./moneyMigration');
const { runPendingTextRepair } = require('./textRepairMigration');
const { generateRecurringEvents } = require('./recurringEventService');
const { ensureUpcomingBirthdays, repairLegacyBirthdayType } = require('./birthdayEventService');
const { initializeDatabase } = require('../utils/dbInitializer');
const { repairLocalMidnightDates, realignHolidayEvents } = require('./eventDateRepair');
const { assignOwnerlessVendors } = require('./legacyOwnership');
const { encryptStoredSmtpPasswords } = require('./smtpPasswordMigration');
const { addGermanPublicHolidays } = require('./holidayCategoryUpgrade');
const { regenerateAllHolidayEvents } = require('./holidayService');
const { dropEmptyRetiredCollections } = require('./retiredCollections');
const logger = require('../utils/logger');

// 'applied' | 'not needed' | 'failed' | 'interrupted', from a migration result
const outcome = (result) => {
    if (result.error) return 'failed';
    if (result.interrupted) return 'interrupted';
    return result.skipped ? 'not needed' : 'applied';
};

/**
 * One-time migrations, default data and repairs, in boot order. Only the
 * tag index fix throws; the migrations log their own failures and retry.
 * @returns {Promise<Object>} What each step did
 */
const upgradeData = async () => {
    await dropLegacyTagNameIndex();
    const moneyModel = outcome(await runPendingMigrations());
    const textRepair = outcome(await runPendingTextRepair());

    const { eventTypesSeeded = 0 } = (await initializeDatabase()) || {};
    if (eventTypesSeeded > 0) logger.info(`Initialized database with ${eventTypesSeeded} event types`);

    // German public holidays filed as religious before 2026-10 (once)
    let germanHolidaysAdded = 0;
    try {
        ({ created: germanHolidaysAdded = 0 } = await addGermanPublicHolidays());
    } catch (error) {
        logger.error(`German public holiday upgrade failed: ${error.message}`);
    }

    // Birthday events from before 2026-10 point at a type id that only
    // existed in the original database: point them at this Birthday type
    let birthdayTypesRepaired = 0;
    try {
        birthdayTypesRepaired = await repairLegacyBirthdayType();
    } catch (error) {
        logger.error(`Birthday event type repair failed: ${error.message}`);
    }

    // Holidays used to be stored at the server's local midnight (a day
    // early east of UTC); event dates are UTC-midnight calendar days
    let eventDatesRepaired = 0;
    try {
        eventDatesRepaired = await repairLocalMidnightDates();
    } catch (error) {
        logger.error(`Event date repair failed: ${error.message}`);
    }

    // Floating holidays used to be generated on a fixed month/day
    let holidayEventsRealigned = 0;
    try {
        holidayEventsRealigned = await realignHolidayEvents();
    } catch (error) {
        logger.error(`Holiday date repair failed: ${error.message}`);
    }

    // Vendors from before accounts were separated have no owner
    let vendorsOwned = 0;
    try {
        vendorsOwned = await assignOwnerlessVendors();
        if (vendorsOwned > 0) logger.info(`Gave ${vendorsOwned} vendors without an owner to the instance owner`);
    } catch (error) {
        logger.error(`Vendor owner repair failed: ${error.message}`);
    }

    // SMTP passwords stored in plaintext before they were encrypted
    let smtpPasswordsEncrypted = 0;
    try {
        ({ encrypted: smtpPasswordsEncrypted } = await encryptStoredSmtpPasswords());
    } catch (error) {
        logger.error(`SMTP password encryption failed: ${error.message}`);
    }

    // Collections of removed features (gift reviews)
    try {
        await dropEmptyRetiredCollections();
    } catch (error) {
        logger.error(`Removing collections of removed features failed: ${error.message}`);
    }

    return { moneyModel, textRepair, eventTypesSeeded, germanHolidaysAdded, smtpPasswordsEncrypted, birthdayTypesRepaired, eventDatesRepaired, holidayEventsRealigned, vendorsOwned };
};

/**
 * Upcoming recurring occurrences, birthday events and holidays (the monthly
 * job, also run after startup and after a restore). A holiday that has
 * passed gets next year's event here.
 * @returns {Promise<{recurringCreated: number, birthdaysSynced: number, holidaysCreated: number}>}
 */
const calendarUpkeep = async () => {
    const recurring = await generateRecurringEvents();
    logger.info(`Recurring events: ${recurring.created} created`);
    const birthdays = await ensureUpcomingBirthdays();
    logger.info(`Birthday events: ${birthdays.synced} created or caught up`);
    const holidays = await regenerateAllHolidayEvents();
    if (!holidays.success) logger.error(`Holiday events could not be brought up to date: ${holidays.error}`);
    return {
        recurringCreated: recurring.created || 0,
        birthdaysSynced: birthdays.synced,
        holidaysCreated: holidays.totalCreated || 0
    };
};

module.exports = { upgradeData, calendarUpkeep };
