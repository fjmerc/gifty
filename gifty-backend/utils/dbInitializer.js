const mongoose = require('mongoose');
const EventType = require('../models/EventType');
const Holiday = require('../models/Holiday');
const logger = require('./logger');
const { resolveHolidayDate } = require('./holidayDates');

// Default event types to seed - all marked as system types (not custom)
const eventTypes = [
    { name: 'Birthday', description: 'Celebrating the anniversary of a person\'s birth.', isCustom: false },
    { name: 'Anniversary', description: 'Commemorating the date of an important event, often a wedding.', isCustom: false },
    { name: 'Graduation', description: 'Marking the completion of an academic degree or course.', isCustom: false },
    { name: 'Engagement', description: 'Celebrating a couple\'s decision to marry.', isCustom: false },
    { name: 'Wedding', description: 'Celebrating the marriage of a couple.', isCustom: false },
    { name: 'Baby Shower', description: 'Celebrating the impending birth of a child.', isCustom: false },
    { name: 'Retirement', description: 'Marking the end of a person\'s career or work life.', isCustom: false },
    { name: 'Housewarming', description: 'Celebrating the move into a new home.', isCustom: false },
    { name: 'Christmas', description: 'Celebrating the birth of Jesus Christ.', isCustom: false },
    { name: 'Hanukkah', description: 'Jewish festival of lights.', isCustom: false },
    { name: 'Easter', description: 'Celebrating the resurrection of Jesus Christ.', isCustom: false },
    { name: 'Diwali', description: 'Hindu festival of lights.', isCustom: false },
    { name: 'Ramadan/Eid', description: 'Celebrating the end of fasting during Ramadan in Islam.', isCustom: false },
    { name: 'Rosh Hashanah/Yom Kippur', description: 'Jewish New Year and Day of Atonement.', isCustom: false },
    { name: 'Kwanzaa', description: 'African American cultural festival celebrating family, community, and culture.', isCustom: false },
    { name: 'Valentine\'s Day', description: 'Celebrating love and affection between intimate partners.', isCustom: false },
    { name: 'Mother\'s Day', description: 'Honoring mothers and motherhood.', isCustom: false },
    { name: 'Father\'s Day', description: 'Honoring fathers and fatherhood.', isCustom: false },
    { name: 'Thanksgiving', description: 'Celebrating the harvest and blessings of the past year.', isCustom: false },
    { name: 'New Year\'s Eve/Day', description: 'Celebrating the end of one year and the beginning of the next.', isCustom: false },
    { name: 'Promotions', description: 'Celebrating a job promotion or career advancement.', isCustom: false },
    { name: 'New Job', description: 'Marking the start of a new job or position.', isCustom: false },
    { name: 'Passing Exams/Certifications', description: 'Celebrating the achievement of passing significant exams or earning certifications.', isCustom: false },
    { name: 'Get Well Soon', description: 'Wishing someone a speedy recovery from illness.', isCustom: false },
    { name: 'Condolences', description: 'Offering sympathy and support during times of loss.', isCustom: false },
    { name: 'Apologies', description: 'Offering a gift as a gesture of apology and reconciliation.', isCustom: false },
    { name: 'Friendship Day', description: 'Celebrating and appreciating friendships.', isCustom: false }
];

/**
 * Seeds event types in the database if none exist
 * @returns {Promise<number>} Number of event types seeded
 */
const seedEventTypes = async () => {
    try {
        // Check if any event types already exist
        const existingTypes = await EventType.countDocuments();
        
        if (existingTypes === 0) {
            logger.info('No event types found, seeding default event types...');
            await EventType.insertMany(eventTypes);
            logger.info(`Successfully seeded ${eventTypes.length} event types`);
            return eventTypes.length;
        } else {
            logger.info(`Event types already exist (${existingTypes} found). No seeding needed.`);
            
            // Ensure all existing system event types have isCustom set to false
            // Only system types (no creator): a user's custom "Birthday" stays custom
            await EventType.updateMany(
                { name: { $in: eventTypes.map(et => et.name) }, createdBy: null },
                { $set: { isCustom: false } }
            );
            logger.info('Updated existing system event types with isCustom flag.');
            
            return 0;
        }
    } catch (error) {
        logger.error('Error seeding event types:', error);
        throw error;
    }
};

/**
 * Initialize all necessary database collections with default data
 */
const initializeDatabase = async () => {
    try {
        // Seed event types
        const eventTypesCount = await module.exports.seedEventTypes();
        
        // Seed holidays
        const holidaysResult = await module.exports.seedHolidays();
        
        logger.info('Database initialization completed successfully');
        return {
            eventTypesSeeded: eventTypesCount,
            holidaysSeeded: holidaysResult
        };
    } catch (error) {
        logger.error('Database initialization failed:', error);
        throw error;
    }
};

// Default holidays to seed. Floating holidays (different calendar date each
// year) carry hasFixedDate: false and a formula understood by
// utils/holidayDates.js; their month/day are recomputed at seed time.
const holidays = [
    // US Holidays
    { name: "New Year's Day", month: 1, day: 1, countryCode: "US", category: "national", description: "First day of the Gregorian calendar year" },
    { name: "Martin Luther King Jr. Day", month: 1, day: 20, hasFixedDate: false, formula: "nth-weekday:1:1:3", countryCode: "US", category: "national", description: "Honors civil rights leader Martin Luther King Jr." },
    { name: "Valentine's Day", month: 2, day: 14, countryCode: "US", category: "cultural", description: "Celebration of romance and love" },
    { name: "Presidents' Day", month: 2, day: 17, hasFixedDate: false, formula: "nth-weekday:2:1:3", countryCode: "US", category: "national", description: "Honors US presidents, particularly Washington and Lincoln" },
    { name: "St. Patrick's Day", month: 3, day: 17, countryCode: "US", category: "cultural", description: "Celebrates Irish heritage and culture" },
    { name: "Memorial Day", month: 5, day: 26, hasFixedDate: false, formula: "nth-weekday:5:1:-1", countryCode: "US", category: "national", description: "Honors those who died while serving in the military" },
    { name: "Independence Day", month: 7, day: 4, countryCode: "US", category: "national", description: "Celebrates US independence from Great Britain" },
    { name: "Labor Day", month: 9, day: 1, hasFixedDate: false, formula: "nth-weekday:9:1:1", countryCode: "US", category: "national", description: "Honors the American labor movement" },
    { name: "Columbus Day", month: 10, day: 13, hasFixedDate: false, formula: "nth-weekday:10:1:2", countryCode: "US", category: "national", description: "Commemorates Columbus's arrival in the Americas" },
    { name: "Halloween", month: 10, day: 31, countryCode: "US", category: "cultural", description: "Evening of costume parties and trick-or-treating" },
    { name: "Veterans Day", month: 11, day: 11, countryCode: "US", category: "national", description: "Honors military veterans" },
    { name: "Thanksgiving", month: 11, day: 27, hasFixedDate: false, formula: "nth-weekday:11:4:4", countryCode: "US", category: "national", description: "Celebrates the harvest and blessings of the past year" },
    { name: "Christmas Day", month: 12, day: 25, countryCode: "US", category: "religious", description: "Celebrates the birth of Jesus Christ" },
    { name: "Mother's Day", month: 5, day: 11, hasFixedDate: false, formula: "nth-weekday:5:0:2", countryCode: "US", category: "cultural", description: "Honors mothers and motherhood" },
    { name: "Father's Day", month: 6, day: 15, hasFixedDate: false, formula: "nth-weekday:6:0:3", countryCode: "US", category: "cultural", description: "Honors fathers and fatherhood" },

    // German holidays. "national" = gesetzliche Feiertage observed nationwide,
    // including the Christian ones (Karfreitag … Zweiter Weihnachtsfeiertag)
    { name: "Neujahrstag", month: 1, day: 1, countryCode: "DE", category: "national", description: "First day of the Gregorian calendar year" },
    { name: "Karfreitag", month: 4, day: 10, hasFixedDate: false, formula: "easter-2", countryCode: "DE", category: "national", description: "Commemorates the crucifixion of Jesus Christ" },
    { name: "Ostermontag", month: 4, day: 13, hasFixedDate: false, formula: "easter+1", countryCode: "DE", category: "national", description: "Easter Monday, celebrates the resurrection of Jesus" },
    { name: "Tag der Arbeit", month: 5, day: 1, countryCode: "DE", category: "national", description: "International Workers' Day" },
    { name: "Christi Himmelfahrt", month: 5, day: 21, hasFixedDate: false, formula: "easter+39", countryCode: "DE", category: "national", description: "Ascension of Jesus into heaven" },
    { name: "Pfingstmontag", month: 6, day: 1, hasFixedDate: false, formula: "easter+50", countryCode: "DE", category: "national", description: "Pentecost Monday" },
    { name: "Tag der Deutschen Einheit", month: 10, day: 3, countryCode: "DE", category: "national", description: "German Unity Day" },
    { name: "Weihnachten", month: 12, day: 25, countryCode: "DE", category: "national", description: "Christmas Day" },
    { name: "Zweiter Weihnachtsfeiertag", month: 12, day: 26, countryCode: "DE", category: "national", description: "Second day of Christmas" },
    { name: "Muttertag", month: 5, day: 11, hasFixedDate: false, formula: "nth-weekday:5:0:2", countryCode: "DE", category: "cultural", description: "Honors mothers and motherhood" },
    { name: "Vatertag", month: 5, day: 21, hasFixedDate: false, formula: "easter+39", countryCode: "DE", category: "cultural", description: "Celebrates fathers and fatherhood (Ascension Day)" }
];

// The system Holiday event type, never a user's custom type of the same name
const getHolidayEventType = async () => {
    const existing = await EventType.findOne({ name: 'Holiday', createdBy: null });
    if (existing) return existing;
    const created = await EventType.create({
        name: 'Holiday',
        description: 'Official holidays and observances',
        isCustom: false
    });
    logger.info('Created Holiday event type');
    return created;
};

/**
 * Seeds the default holidays on a fresh install. On an existing install it
 * brings the stored definitions up to date: before 2026-10 every holiday was
 * seeded with a fixed month/day, so floating ones (Thanksgiving, Easter-based
 * days) need their formula, and holidays added since are inserted.
 * @returns {Promise<Object>} Results of holiday seeding
 */
const withoutCategory = ({ category, ...rest }) => rest;

const seedHolidays = async () => {
    try {
        const existingHolidays = await Holiday.countDocuments();
        const holidayEventType = await getHolidayEventType();
        const currentYear = new Date().getFullYear();
        const withDates = (holiday) => {
            const date = resolveHolidayDate(holiday, currentYear);
            return {
                ...holiday,
                date,
                month: date.getMonth() + 1,
                day: date.getDate(),
                eventType: holidayEventType._id
            };
        };

        if (existingHolidays === 0) {
            logger.info('No holidays found, seeding default holidays...');
            await Holiday.insertMany(holidays.map(withDates));
            logger.info(`Successfully seeded ${holidays.length} holidays`);
            return { created: holidays.length, skipped: 0 };
        }

        const now = new Date();
        const result = await Holiday.bulkWrite(holidays.map((holiday) => {
            const { hasFixedDate, formula, ...rest } = withDates(holiday);
            return {
                updateOne: {
                    filter: { name: holiday.name, countryCode: holiday.countryCode },
                    update: {
                        // The list is the reference for dates and categories
                        $set: { hasFixedDate: hasFixedDate !== false, formula: formula || null, category: holiday.category },
                        $setOnInsert: { ...withoutCategory(rest), createdAt: now, updatedAt: now }
                    },
                    upsert: true,
                    // An automatic updatedAt would count every definition as changed on every boot
                    timestamps: false
                }
            };
        }));
        const created = result.upsertedCount || 0;
        const updated = result.modifiedCount || 0;
        if (created || updated) logger.info(`Holidays: ${created} added, ${updated} definitions updated`);
        return { created, updated, skipped: existingHolidays - updated };
    } catch (error) {
        logger.error('Error seeding holidays:', error);
        throw error;
    }
};

// Countries that have holidays to choose from
const HOLIDAY_COUNTRIES = [...new Set(holidays.map((holiday) => holiday.countryCode))];

module.exports = {
    seedEventTypes,
    seedHolidays,
    initializeDatabase,
    HOLIDAY_COUNTRIES
};
