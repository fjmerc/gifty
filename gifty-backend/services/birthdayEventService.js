const mongoose = require('mongoose');
const Event = require('../models/Event');
const EventType = require('../models/EventType');
const Recipient = require('../models/Recipient');
const logger = require('../utils/logger');
const { todayAsDateOnly } = require('../utils/dates');

// Every recipient gets one upcoming "<first name>'s Birthday" event. It
// follows birthdate and name changes, and once it has passed the monthly
// event job creates the next one; past birthdays stay as they were.

// Birthday events made before 2026-10 used this type id, which only exists
// in the database it was copied from
const LEGACY_BIRTHDAY_TYPE_ID = '668c562ebe2f009a58f1949a';

const birthdayName = (firstName) => `${firstName}'s Birthday`;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The next birthday on or after `from` (both UTC-midnight calendar days).
 * Feb 29 birthdays fall on Feb 28 in common years.
 * @param {Date} birthdate
 * @param {Date} from
 * @returns {Date}
 */
const nextBirthday = (birthdate, from) => {
    const born = new Date(birthdate);
    const on = (year) => {
        const lastDay = new Date(Date.UTC(year, born.getUTCMonth() + 1, 0)).getUTCDate();
        return new Date(Date.UTC(year, born.getUTCMonth(), Math.min(born.getUTCDate(), lastDay)));
    };
    const thisYear = on(from.getUTCFullYear());
    return thisYear >= from ? thisYear : on(from.getUTCFullYear() + 1);
};

/** The shared (system) Birthday event type, or null if it was never seeded */
const getBirthdayType = () => EventType.findOne({ name: 'Birthday', createdBy: null }).select('_id').lean();

/**
 * Create or update a recipient's upcoming birthday event
 * @param {Object} recipient - The recipient as saved
 * @param {{firstName: string}} [previous] - The recipient before the change
 *   (finds birthday events made before they were marked, which carry the old name)
 */
const syncBirthdayEvent = async (recipient, previous = recipient) => {
    if (recipient.isSystemAccount || recipient.archived || !recipient.birthdate) return false;
    const type = await getBirthdayType();
    if (!type) {
        logger.warn('Birthday event type missing; birthday events not created');
        return false;
    }

    const from = todayAsDateOnly();
    const date = nextBirthday(recipient.birthdate, from);
    const name = birthdayName(recipient.firstName);
    const legacyTypes = [type._id];
    if (mongoose.isValidObjectId(LEGACY_BIRTHDAY_TYPE_ID)) legacyTypes.push(new mongoose.Types.ObjectId(LEGACY_BIRTHDAY_TYPE_ID));

    const upcoming = await Event.findOne({
        user: recipient.user,
        recipient: recipient._id,
        date: { $gte: from },
        $or: [
            { isAutoBirthday: true },
            {
                name: { $in: [birthdayName(previous.firstName), name] },
                type: { $in: legacyTypes },
                series: { $exists: false },
                'recurring.frequency': { $in: ['None', null] }
            }
        ]
    }).sort('date');

    if (upcoming) {
        upcoming.set({ name, date, type: type._id, isAutoBirthday: true });
        await upcoming.save();
        return true;
    }
    // The user's own event that day (often a yearly series they made, under
    // any name) already is the birthday: a second one would show and remind twice
    const own = await Event.exists({
        user: recipient.user,
        recipient: recipient._id,
        isAutoBirthday: { $ne: true },
        date: { $gte: date, $lt: new Date(date.getTime() + DAY_MS) },
        $or: [{ type: { $in: legacyTypes } }, { name: /birthday|geburtstag|cumpleaños|anniversaire/i }]
    });
    if (own) return false;
    await Event.create({ user: recipient.user, recipient: recipient._id, name, date, type: type._id, isAutoBirthday: true });
    return true;
};

/**
 * Give every recipient whose birthday event has passed the next one
 * (runs with the monthly event job and at startup)
 * @returns {Promise<{synced: number}>}
 */
const ensureUpcomingBirthdays = async () => {
    const recipients = await Recipient.find({ isSystemAccount: { $ne: true }, archived: { $ne: true }, birthdate: { $ne: null } })
        .select('user firstName birthdate isSystemAccount archived').lean();
    const from = todayAsDateOnly();
    let synced = 0;
    for (const recipient of recipients) {
        const hasUpcoming = await Event.exists({ recipient: recipient._id, isAutoBirthday: true, date: { $gte: from } });
        if (hasUpcoming) continue;
        try {
            if (await syncBirthdayEvent(recipient)) synced += 1;
        } catch (error) {
            logger.error(`Birthday event for recipient ${recipient._id} failed: ${error.message}`);
        }
    }
    return { synced };
};

/**
 * Point events that still carry the legacy Birthday type id at the real
 * Birthday type (only when that id is not a real event type here)
 * @returns {Promise<number>} Events repaired
 */
const repairLegacyBirthdayType = async () => {
    if (await EventType.exists({ _id: LEGACY_BIRTHDAY_TYPE_ID })) return 0;
    const type = await getBirthdayType();
    if (!type) return 0;
    const { modifiedCount } = await Event.updateMany({ type: LEGACY_BIRTHDAY_TYPE_ID }, { $set: { type: type._id } });
    if (modifiedCount > 0) logger.info(`Repaired the event type of ${modifiedCount} birthday events`);
    return modifiedCount;
};

module.exports = {
    LEGACY_BIRTHDAY_TYPE_ID,
    nextBirthday,
    syncBirthdayEvent,
    ensureUpcomingBirthdays,
    repairLegacyBirthdayType
};
