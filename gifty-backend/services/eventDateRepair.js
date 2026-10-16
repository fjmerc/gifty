const Event = require('../models/Event');
const EventType = require('../models/EventType');
const Gift = require('../models/Gift');
const Holiday = require('../models/Holiday');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { resolveHolidayDate } = require('../utils/holidayDates');
const logger = require('../utils/logger');

// Event dates are calendar days stored as UTC midnight (the event form sends
// 'YYYY-MM-DD'). Until 2026-10, holidays (and older generators) stored the
// server's local midnight instead: on a server east of UTC that is the
// evening before in UTC, so those events showed a day early. Move such dates
// onto the calendar day they meant. Dates at UTC midnight and dates with a
// real time of day are left alone, so running it again changes nothing.

const DAY_MS = 24 * 60 * 60 * 1000;

const isLocalMidnight = (date) => date instanceof Date && !Number.isNaN(date.getTime())
    && date.getTime() % DAY_MS !== 0
    && date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0;

const toCalendarDay = (date) => new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

// Holidays only ever meant a day: whatever zone wrote them, the nearest UTC
// midnight is that day (zones are within ±14h, local midnights within ±12h
// for every inhabited zone but a few Pacific ones)
const nearestUtcMidnight = (date) => new Date(Math.floor((date.getTime() + DAY_MS / 2) / DAY_MS) * DAY_MS);

/**
 * @returns {Promise<number>} Events repaired
 */
const repairLocalMidnightDates = async () => {
    const notUtcMidnight = (path) => ({
        $expr: { $ne: [{ $mod: [{ $toLong: path }, DAY_MS] }, 0] }
    });
    const candidates = await Event.collection.find({
        $or: [
            { date: { $type: 'date' }, ...notUtcMidnight('$date') },
            { 'recurring.until': { $type: 'date' }, ...notUtcMidnight('$recurring.until') },
            { 'recurring.exceptions.0': { $exists: true } }
        ]
    }, { projection: { date: 1, recurring: 1, isSystemGenerated: 1 } }).toArray();

    let repaired = 0;
    for (const event of candidates) {
        const set = {};
        if (event.isSystemGenerated && event.date instanceof Date && event.date.getTime() % DAY_MS !== 0) {
            set.date = nearestUtcMidnight(event.date);
        } else if (isLocalMidnight(event.date)) {
            set.date = toCalendarDay(event.date);
        }
        const until = event.recurring?.until;
        if (isLocalMidnight(until)) set['recurring.until'] = toCalendarDay(until);
        const exceptions = event.recurring?.exceptions;
        if (Array.isArray(exceptions) && exceptions.some(isLocalMidnight)) {
            set['recurring.exceptions'] = exceptions.map((d) => (isLocalMidnight(d) ? toCalendarDay(d) : d));
        }
        if (Object.keys(set).length) {
            await Event.collection.updateOne({ _id: event._id }, { $set: set });
            repaired += 1;
        }
    }
    if (repaired > 0) logger.info(`Moved ${repaired} events stored at local midnight onto their calendar day`);
    return repaired;
};

/**
 * Holiday events the generator made are moved onto the day their holiday
 * really falls in their year. Before 2026-10 every holiday was seeded with a
 * fixed month/day, so floating ones (Thanksgiving, Mother's Day, Easter-based
 * days) landed on the wrong day. The reminder moves with the event. Two
 * copies that end up on the same day become one, keeping a copy with gifts.
 * Runs after the holiday definitions are updated; a second run changes nothing.
 * @returns {Promise<number>} Events moved
 */
const realignHolidayEvents = async () => {
    const holidayType = await EventType.findOne({ name: 'Holiday', createdBy: null }).lean();
    if (!holidayType) return 0;
    const events = await Event.collection.find(
        { type: holidayType._id, isSystemGenerated: true, date: { $type: 'date' } },
        { projection: { user: 1, name: 1, date: 1, reminder: 1, createdAt: 1 } }
    ).sort({ createdAt: 1, _id: 1 }).toArray();
    if (!events.length) return 0;

    const definitions = await Holiday.find({}).lean();
    const users = await User.find({ _id: { $in: [...new Set(events.map((e) => String(e.user)))] } })
        .select('preferences.holidaySettings.countryCode').lean();
    const countryOf = new Map(users.map((u) => [String(u._id), u.preferences?.holidaySettings?.countryCode]));
    // The user's own country first: Mother's Day is defined for more than one
    const definitionFor = (event) => {
        const named = definitions.filter((h) => h.name === event.name);
        return named.find((h) => h.countryCode === countryOf.get(String(event.user))) || (named.length === 1 ? named[0] : null);
    };

    const removeCopy = async (id) => {
        await Event.collection.deleteOne({ _id: id });
        await Notification.deleteMany({ event: id });
    };

    let moved = 0;
    const kept = new Map(); // user|name|day -> event kept on that day
    for (const event of events) {
        const definition = definitionFor(event);
        const date = definition ? toCalendarDay(resolveHolidayDate(definition, event.date.getUTCFullYear())) : event.date;
        const key = `${event.user}|${event.name}|${date.getTime()}`;
        const other = kept.get(key);
        if (!other) {
            kept.set(key, event);
        } else if (!(await Gift.exists({ event: event._id }))) {
            await removeCopy(event._id);
            continue;
        } else if (!(await Gift.exists({ event: other._id }))) {
            await removeCopy(other._id);
            kept.set(key, event);
        } // both copies hold gifts: keep both
        const shift = date.getTime() - event.date.getTime();
        if (shift !== 0) {
            const set = { date };
            if (event.reminder?.time instanceof Date) set['reminder.time'] = new Date(event.reminder.time.getTime() + shift);
            await Event.collection.updateOne({ _id: event._id }, { $set: set });
            moved += 1;
        }
    }
    if (moved > 0) logger.info(`Moved ${moved} holiday events onto the day their holiday falls`);
    return moved;
};

module.exports = { repairLocalMidnightDates, realignHolidayEvents };
