const Event = require('../models/Event');
const Gift = require('../models/Gift');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');
const { todayAsDateOnly } = require('../utils/dates');

// A recurring event (the series' first event) owns separate one-off
// occurrence events, linked by `series`. Event dates are calendar days stored
// as UTC midnight (what the event form sends), so occurrence dates are
// computed on UTC days; reminders are instants and keep their wall-clock
// time in the instance zone (TZ).

const DAY_MS = 24 * 60 * 60 * 1000;
const YEARS_AHEAD = 3;
// The old generator stepped in local time, so a DST change could move a
// stored occurrence an hour off its UTC midnight
const LEGACY_MATCH_MS = 13 * 60 * 60 * 1000;

const dayKey = (value) => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    return new Date(value).toISOString().slice(0, 10);
};

const isRecurring = (event) => Boolean(event.recurring?.frequency) && event.recurring.frequency !== 'None';

// The nth occurrence, counted from the first date so month-end dates don't
// drift (Jan 31 -> Feb 28 -> Mar 31, not Mar 28 or Mar 3)
const nthOccurrence = (first, frequency, n) => {
    const d = new Date(first);
    switch (frequency) {
        case 'Daily':
            return new Date(d.getTime() + n * DAY_MS);
        case 'Weekly':
            return new Date(d.getTime() + 7 * n * DAY_MS);
        case 'Monthly':
        case 'Yearly': {
            const month = d.getUTCMonth() + (frequency === 'Monthly' ? n : 12 * n);
            const lastDay = new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0)).getUTCDate();
            const result = new Date(d);
            result.setUTCFullYear(d.getUTCFullYear(), month, Math.min(d.getUTCDate(), lastDay));
            return result;
        }
        default:
            throw new Error(`Unsupported frequency: ${frequency}`);
    }
};

/**
 * Dates of a recurring event's occurrences after its own date, up to its end
 * date (at most three years ahead), without exception days
 * @param {Object} master - Event with date and recurring
 * @param {Date} [now]
 * @returns {Date[]}
 */
const occurrenceDates = (master, now = new Date()) => {
    if (!isRecurring(master)) return [];
    const { frequency, until, exceptions = [] } = master.recurring;
    const horizon = new Date(now);
    horizon.setUTCFullYear(horizon.getUTCFullYear() + YEARS_AHEAD);
    const end = until && new Date(until) < horizon ? new Date(until) : horizon;
    const skip = new Set(exceptions.filter(Boolean).map(dayKey));

    const dates = [];
    for (let n = 1; ; n++) {
        const date = nthOccurrence(master.date, frequency, n);
        if (date > end) break;
        if (!skip.has(dayKey(date))) dates.push(date);
    }
    return dates;
};

/**
 * The master's reminder moved to one occurrence: same offset in days, same
 * local time of day
 * @param {Object} master
 * @param {Date} date - The occurrence's date
 * @returns {{isSet: boolean, time: Date|null, method: string|null}}
 */
const reminderFor = (master, date) => {
    const reminder = master.reminder;
    if (!reminder?.isSet || !reminder.time) return { isSet: false, time: null, method: null };
    const days = Math.round((new Date(date) - new Date(master.date)) / DAY_MS);
    const time = new Date(reminder.time);
    time.setDate(time.getDate() + days);
    return { isSet: true, time, method: reminder.method };
};


const withGifts = async (eventIds) => new Set(
    (await Gift.distinct('event', { event: { $in: eventIds } })).map(String)
);

const removeEvents = async (ids) => {
    if (ids.length === 0) return 0;
    await Notification.deleteMany({ event: { $in: ids } });
    const { deletedCount } = await Event.deleteMany({ _id: { $in: ids } });
    return deletedCount;
};

/**
 * Link occurrences made before series links existed (matched the old way:
 * same user, recipient and name, within hours of one of the master's dates)
 * and put each on its scheduled day: the old generator stepped in local time,
 * so after a DST change it stored them an hour off. Runs once per master
 * (seriesLinked), so later one-off events with the same name stay separate.
 * @param {Object} master - The master as it is stored (before any edit)
 */
const adoptLegacyOccurrences = async (master) => {
    if (master.seriesLinked) return;
    const dates = occurrenceDates(master);
    if (dates.length > 0) {
        const candidates = await Event.find({
            _id: { $ne: master._id },
            user: master.user,
            recipient: master.recipient,
            name: master.name,
            series: { $exists: false },
            isAutoBirthday: { $ne: true },
            'recurring.frequency': { $in: ['None', null] },
            date: { $gte: new Date(dates[0] - LEGACY_MATCH_MS), $lte: new Date(dates[dates.length - 1].getTime() + LEGACY_MATCH_MS) }
        }).select('date').lean();
        const adopt = [];
        for (const candidate of candidates) {
            const time = candidate.date.getTime();
            const scheduled = dates.find((d) => Math.abs(time - d.getTime()) < LEGACY_MATCH_MS);
            if (scheduled) {
                adopt.push({
                    updateOne: {
                        filter: { _id: candidate._id, user: master.user },
                        update: { $set: { series: master._id, date: scheduled } }
                    }
                });
            }
        }
        if (adopt.length > 0) await Event.bulkWrite(adopt);
    }
    await Event.updateOne({ _id: master._id, user: master.user }, { $set: { seriesLinked: true } });
};

/**
 * Bring a series in line with its master. Future occurrences without gifts
 * follow the master (kept in place when their day is still scheduled, so
 * reminders already sent are not repeated; removed when it isn't); missing
 * days are created. Past occurrences and ones with gifts are left alone, and
 * past days are only filled in for a new series (backfill).
 * @param {Object} master
 * @param {{backfill?: boolean}} [options]
 * @returns {Promise<{created: number, updated: number, removed: number}>}
 */
const syncSeries = async (master, { backfill = false } = {}) => {
    const dates = occurrenceDates(master);
    const scheduled = new Map(dates.map((d) => [dayKey(d), d]));

    const found = await Event.find({ series: master._id, user: master.user }).select('date').sort({ _id: 1 }).lean();
    const used = await withGifts(found.map((e) => e._id));
    // Two occurrences on one day: the one holding gifts is the one kept
    const existing = [...found.filter((e) => used.has(String(e._id))), ...found.filter((e) => !used.has(String(e._id)))];
    const from = todayAsDateOnly();

    const updates = [];
    const stale = [];
    const covered = new Set();
    for (const occurrence of existing) {
        const key = dayKey(occurrence.date);
        if (scheduled.has(key) && !covered.has(key)) {
            covered.add(key);
            if (occurrence.date >= from && !used.has(String(occurrence._id))) {
                const date = scheduled.get(key);
                updates.push({
                    updateOne: {
                        filter: { _id: occurrence._id },
                        update: { $set: { name: master.name, type: master.type, recipient: master.recipient, date, reminder: reminderFor(master, date) } }
                    }
                });
            }
        } else if (occurrence.date >= from && !used.has(String(occurrence._id))) {
            stale.push(occurrence._id);
        }
    }

    const toCreate = dates
        .filter((d) => !covered.has(dayKey(d)) && (backfill || d >= from))
        .map((date) => ({
            user: master.user,
            recipient: master.recipient,
            name: master.name,
            date,
            type: master.type,
            series: master._id,
            isSystemGenerated: false,
            recurring: { frequency: 'None', until: null, exceptions: [] },
            reminder: reminderFor(master, date)
        }));

    if (updates.length > 0) await Event.bulkWrite(updates);
    const removed = await removeEvents(stale);
    if (toCreate.length > 0) await Event.insertMany(toCreate, { ordered: false });

    return { created: toCreate.length, updated: updates.length, removed };
};

/**
 * The master is being deleted: remove its future occurrences that have no
 * gifts and unlink the rest, which stay as one-off events
 * @param {Object} master
 */
const removeSeries = async (master) => {
    await adoptLegacyOccurrences(master);
    const future = await Event.find({ series: master._id, user: master.user, date: { $gte: todayAsDateOnly() } }).select('_id').lean();
    const used = await withGifts(future.map((e) => e._id));
    await removeEvents(future.map((e) => e._id).filter((id) => !used.has(String(id))));
    await Event.updateMany({ series: master._id, user: master.user }, { $unset: { series: 1 } });
};

// Is this day one of the master's scheduled days (ignoring its end date)?
const isOnSchedule = (master, date) => {
    const key = dayKey(date);
    for (let n = 1; ; n++) {
        const next = nthOccurrence(master.date, master.recurring.frequency, n);
        if (dayKey(next) === key) return true;
        if (next > date) return false;
    }
};

// Old versions could leave the same series as two masters (a later one on the
// first one's schedule, while it still runs): each would make its own
// occurrences. Series that never overlapped stay apart, and a month-end day
// clamped onto the 28th isn't the same day.
const sameDayOfCycle = (master, other) => {
    const a = new Date(master.date);
    const b = new Date(other.date);
    if (master.recurring.frequency === 'Monthly') return a.getUTCDate() === b.getUTCDate();
    if (master.recurring.frequency === 'Yearly') return a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
    return true;
};
const sameSeries = (master, other) =>
    String(other.user) === String(master.user)
    && String(other.recipient) === String(master.recipient)
    && other.name === master.name
    && other.recurring?.frequency === master.recurring.frequency
    && other.date > master.date
    && (!master.recurring.until || new Date(other.date) <= new Date(master.recurring.until))
    && sameDayOfCycle(master, other)
    && isOnSchedule(master, other.date);

/**
 * Make the later master an occurrence of the earlier one, with its own
 * occurrences; the series keeps the later end date and both sets of exceptions
 */
const foldInto = async (master, other) => {
    await Event.updateMany({ series: other._id, user: master.user }, { $set: { series: master._id } });
    await Event.updateOne(
        { _id: other._id, user: master.user },
        { $set: { series: master._id, recurring: { frequency: 'None', until: null, exceptions: [] } }, $unset: { seriesLinked: 1 } }
    );
    // No end date on either means the series has none
    const ends = [master.recurring.until, other.recurring.until];
    const until = ends.some((d) => !d) ? null : new Date(Math.max(...ends.map((d) => new Date(d).getTime())));
    const exceptions = [...(master.recurring.exceptions || []), ...(other.recurring.exceptions || [])];
    master.recurring = { ...master.recurring, until, exceptions };
    await Event.updateOne({ _id: master._id, user: master.user }, { $set: { recurring: master.recurring } });
    logger.info(`Folded a duplicate recurring event into series ${master._id}`);
};

/**
 * Sync every recurring series (daily job; also after a manual request)
 * @param {string} [userId] - Only this user's events
 * @returns {Promise<Object>}
 */
const generateRecurringEvents = async (userId = null) => {
    try {
        logger.info('Starting recurring event generation...');
        const query = { 'recurring.frequency': { $nin: ['None', null] } };
        if (userId) query.user = userId;

        // Oldest first: a later master on an older one's schedule folds into it
        const masters = await Event.find(query).sort({ date: 1, _id: 1 }).lean();
        logger.info(`Found ${masters.length} recurring events to process`);

        let created = 0;
        const folded = new Set();
        for (const master of masters) {
            if (folded.has(String(master._id))) continue;
            for (const other of masters) {
                if (other === master || folded.has(String(other._id)) || !sameSeries(master, other)) continue;
                await foldInto(master, other);
                folded.add(String(other._id));
            }
            await adoptLegacyOccurrences(master);
            created += (await syncSeries(master)).created;
        }

        logger.info(`Recurring event generation complete. Created: ${created}`);
        return { success: true, created };
    } catch (error) {
        logger.error('Error generating recurring events:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    occurrenceDates,
    reminderFor,
    isRecurring,
    syncSeries,
    removeSeries,
    adoptLegacyOccurrences,
    generateRecurringEvents
};
