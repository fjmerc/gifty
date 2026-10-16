const fsp = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = require('bson');
const { Budget, OverallBudget } = require('../models/Budget');
const Event = require('../models/Event');
const EventType = require('../models/EventType');
const Gift = require('../models/Gift');
const Notification = require('../models/Notification');
const Recipient = require('../models/Recipient');
const Tag = require('../models/Tags');
const User = require('../models/User');
const { HttpError } = require('../utils/ownership');
const { toCents, fromCents } = require('../utils/money');
const { decodeIfEncoded } = require('./textRepairMigration');
const { generateRecurringEvents } = require('./recurringEventService');
const { LEGACY_BIRTHDAY_TYPE_ID, syncBirthdayEvent } = require('./birthdayEventService');
const { ALLOWED_PREFERENCE_KEYS } = require('../config/userPreferences');
const { DATA_DIR } = require('../config/runtime');
const modelRegistry = require('./ai/modelRegistry');
const logger = require('../utils/logger');

// A user's own backup file (Settings → Backup / Restore). Restoring replaces
// all of the user's recipients, events, gifts and budgets with the file's,
// on this server or another one: ids are re-linked, and event types and
// tags travel by name, since their ids differ between installs.
//
// Format 2 (2026-10) carries `metadata.format`. Files without it come from
// before the 2026-10 upgrades: their text was stored HTML-encoded, money
// fields were counters, and only ids travelled. Those get the same fixes the
// upgrade gave stored data, as they come in.
const FORMAT = 2;
const COLLECTIONS = ['recipients', 'events', 'gifts', 'budgets', 'overallBudgets', 'tags', 'eventTypes'];
const IMPORTED_TYPE = 'Imported';

const unique = (values) => [...new Set(values.filter(Boolean).map(String))];

/**
 * Everything of one user a backup carries
 * @param {ObjectId} userId
 * @returns {Promise<Object>} The backup file's content
 */
const buildUserBackup = async (userId) => {
    const owned = { user: userId };
    const [user, recipients, events, gifts, budgets, overallBudgets] = await Promise.all([
        User.findById(userId).select('preferences').lean(),
        Recipient.find(owned).lean(),
        Event.find(owned).lean(),
        Gift.find(owned).lean(),
        Budget.find(owned).lean(),
        OverallBudget.find(owned).lean()
    ]);
    // The user's own tags, used or not, and the shared legacy tags their recipients use
    const tags = await Tag.find({
        $or: [{ _id: { $in: unique(recipients.flatMap((r) => r.tags || [])) } }, { user: userId }]
    }).select('name').lean();
    const eventTypes = await EventType.find({
        $or: [{ _id: { $in: unique(events.map((e) => e.type)) } }, { createdBy: userId }]
    }).select('name description createdBy').lean();

    return {
        metadata: { format: FORMAT, timestamp: new Date().toISOString(), appVersion: process.env.APP_VERSION || null },
        data: {
            preferences: user?.preferences || {},
            tags: tags.map(({ _id, name }) => ({ _id, name })),
            eventTypes: eventTypes.map(({ _id, name, description, createdBy }) => ({ _id, name, description, isCustom: Boolean(createdBy) })),
            recipients,
            events,
            gifts,
            budgets,
            overallBudgets
        }
    };
};

/**
 * Parse and check an uploaded backup file
 * @param {Buffer} buffer
 * @returns {{data: Object, format: number, legacy: boolean, timestamp: ?string}}
 */
const parseUserBackup = (buffer) => {
    let file;
    try {
        // Editors such as Notepad save a byte order mark first
        file = JSON.parse(buffer.toString().replace(/^\uFEFF/, ''));
    } catch {
        throw new HttpError(400, 'Invalid JSON file format');
    }
    if (!file || typeof file.metadata !== 'object' || typeof file.data !== 'object' || !file.metadata || !file.data) {
        throw new HttpError(400, 'This is not a Gifty backup file. Exports cannot be restored; use a file made with Create Backup.');
    }
    const format = file.metadata.format ?? 1;
    if (!Number.isInteger(format) || format < 1) throw new HttpError(400, 'Invalid backup file structure');
    if (format > FORMAT) throw new HttpError(400, 'This backup was made by a newer version of Gifty; update this server first');
    for (const name of COLLECTIONS) {
        const list = file.data[name];
        if (list === undefined) continue;
        if (!Array.isArray(list) || list.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
            throw new HttpError(400, `Invalid backup file structure: ${name} is not a list of items`);
        }
    }
    return { data: file.data, format, legacy: format < 2, timestamp: file.metadata.timestamp || null };
};

/** What the restore dialog shows about a file */
const describeBackup = ({ data, format, legacy, timestamp }) => ({
    format,
    legacy,
    timestamp,
    dataTypes: Object.keys(data),
    counts: Object.fromEntries(['recipients', 'events', 'gifts', 'budgets'].map((name) => [name, (data[name] || []).length]))
});

// The old input filter HTML-encoded top-level strings of request bodies
// only, so, like the text repair, decode top-level strings and string
// lists of each document (nested text was stored as typed)
const decodeDocument = (doc, counter) => Object.fromEntries(Object.entries(doc).map(([key, value]) => {
    if (key === '_id') return [key, value];
    const decode = (item) => {
        const decoded = decodeIfEncoded(item);
        if (decoded !== item) counter.count += 1;
        return decoded;
    };
    if (typeof value === 'string') return [key, decode(value)];
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return [key, value.map(decode)];
    return [key, value];
}));

const strip = ({ _id, __v, user, ...rest }) => rest;
const isValidId = (value) => mongoose.isValidObjectId(value);

/**
 * Turn the file's documents into this user's documents: new ids, every
 * reference re-linked, event types and tags resolved on this server
 */
const planRestore = async (userId, { data, legacy }) => {
    const fixes = { textFieldsDecoded: 0, pricesRounded: 0, purchaseDatesAdded: 0, eventsWithImportedType: 0 };
    const skipped = { events: 0, gifts: 0, budgets: 0 };
    if (legacy) {
        const counter = { count: 0 };
        data = Object.fromEntries(Object.entries(data).map(([name, value]) => [
            name, Array.isArray(value) ? value.map((doc) => decodeDocument(doc, counter)) : value
        ]));
        fixes.textFieldsDecoded = counter.count;
    }
    const list = (name) => data[name] || [];
    const newTags = [];
    const newTypes = [];

    // Tags: by name (format 2); old files only keep ids that are still the user's here
    const tagMap = new Map();
    if (!legacy) {
        for (const { _id, name } of list('tags')) {
            if (!name) continue;
            let tag = await Tag.findOne({ user: userId, name }).select('_id').lean()
                || newTags.find((t) => t.name === name);
            if (!tag) {
                tag = { _id: new mongoose.Types.ObjectId(), user: userId, name };
                newTags.push(tag);
            }
            tagMap.set(String(_id), tag._id);
        }
    } else {
        const ids = unique(list('recipients').flatMap((r) => r.tags || [])).filter(isValidId);
        const kept = await Tag.find({ _id: { $in: ids }, user: { $in: [userId, null] } }).select('_id').lean();
        kept.forEach((tag) => tagMap.set(String(tag._id), tag._id));
    }

    // Event types: system types by name, custom ones as the user's own
    const typesById = new Map(list('eventTypes').map((t) => [String(t._id), t]));
    const typeCache = new Map();
    const customType = async (name) => {
        const existing = await EventType.findOne({ createdBy: userId, name }).select('_id').lean()
            || newTypes.find((t) => t.name === name);
        if (existing) return existing._id;
        const type = { _id: new mongoose.Types.ObjectId(), name, isCustom: true, createdBy: userId };
        newTypes.push(type);
        return type._id;
    };
    const resolveType = async (oldId) => {
        const key = String(oldId);
        if (typeCache.has(key)) return typeCache.get(key);
        let typeId = null;
        if (!legacy && typesById.has(key)) {
            const { name, isCustom } = typesById.get(key);
            const system = isCustom ? null : await EventType.findOne({ name, createdBy: null }).select('_id').lean();
            typeId = system ? system._id : await customType(name);
        } else if (key === LEGACY_BIRTHDAY_TYPE_ID) {
            typeId = (await EventType.findOne({ name: 'Birthday', createdBy: null }).select('_id').lean())?._id || null;
        } else if (legacy && isValidId(key)) {
            typeId = (await EventType.findOne({ _id: key, createdBy: { $in: [null, userId] } }).select('_id').lean())?._id || null;
        }
        typeCache.set(key, typeId);
        return typeId;
    };

    const recipientMap = new Map();
    const recipients = list('recipients').map((recipient) => {
        const _id = new mongoose.Types.ObjectId();
        recipientMap.set(String(recipient._id), _id);
        const doc = { ...strip(recipient), _id, user: userId };
        doc.tags = (recipient.tags || []).map((tag) => tagMap.get(String(tag))).filter(Boolean);
        // An active recipient needs a full address; old files may lack one
        const address = recipient.address || {};
        if (doc.giftStatus === 'active' && !['street', 'city', 'state', 'country', 'zipCode'].every((f) => address[f])) {
            doc.giftStatus = 'inactive';
        }
        return doc;
    });

    const eventMap = new Map();
    const fileEvents = list('events').filter((event) => {
        if (recipientMap.has(String(event.recipient))) {
            eventMap.set(String(event._id), new mongoose.Types.ObjectId());
            return true;
        }
        skipped.events += 1;
        return false;
    });
    const events = [];
    for (const event of fileEvents) {
        const doc = { ...strip(event), _id: eventMap.get(String(event._id)), user: userId, recipient: recipientMap.get(String(event.recipient)) };
        doc.type = await resolveType(event.type);
        if (!doc.type) {
            doc.type = await customType(IMPORTED_TYPE);
            fixes.eventsWithImportedType += 1;
        }
        if (event.series) {
            if (eventMap.has(String(event.series))) doc.series = eventMap.get(String(event.series));
            else delete doc.series;
        }
        events.push(doc);
    }

    const gifts = [];
    for (const gift of list('gifts')) {
        const recipient = recipientMap.get(String(gift.recipient));
        const event = eventMap.get(String(gift.event));
        if (!recipient || !event) {
            skipped.gifts += 1;
            continue;
        }
        const doc = { ...strip(gift), _id: new mongoose.Types.ObjectId(), user: userId, recipient, event };
        // Money as the 2026-10 upgrade stored it: whole cents, and every
        // purchase dated so it counts in a year
        const cents = toCents(doc.price);
        if (Number.isFinite(cents) && fromCents(cents) !== doc.price) {
            doc.price = fromCents(cents);
            fixes.pricesRounded += 1;
        }
        if (doc.status === 'purchased' && !doc.purchaseDate) {
            doc.purchaseDate = gift.updatedAt || gift.createdAt
                || (isValidId(gift._id) ? new mongoose.Types.ObjectId(String(gift._id)).getTimestamp() : new Date());
            fixes.purchaseDatesAdded += 1;
        }
        if (doc.status !== 'purchased') delete doc.purchaseDate;
        gifts.push(doc);
    }

    const budgets = list('budgets').filter((budget) => {
        if (recipientMap.has(String(budget.recipient))) return true;
        skipped.budgets += 1;
        return false;
    }).map((budget) => ({
        ...strip(budget), _id: new mongoose.Types.ObjectId(), user: userId, recipient: recipientMap.get(String(budget.recipient))
    }));
    // Old files never carried overall budgets: the user's current ones stay
    const overallBudgets = legacy
        ? null
        : list('overallBudgets').map((budget) => ({ ...strip(budget), _id: new mongoose.Types.ObjectId(), user: userId }));

    const source = legacy ? data.user?.preferences : data.preferences;
    const { preferences, refused } = checkPreferences(source);

    return { recipients, events, gifts, budgets, overallBudgets, newTags, newTypes, preferences, refusedPreferences: refused, fixes, skipped };
};

// Preferences this server accepts: allowed keys, values the User schema
// casts, and AI providers and models this server knows
const checkPreferences = (source) => {
    const preferences = {};
    const refused = [];
    for (const [key, value] of Object.entries(source && typeof source === 'object' ? source : {})) {
        if (!ALLOWED_PREFERENCE_KEYS.has(key)) continue;
        const probe = new User({ preferences: { [key]: value } });
        const invalid = probe.validateSync([`preferences.${key}`]) || (probe.preferences?.[key] === undefined && value !== undefined);
        if (invalid) {
            refused.push(key);
            continue;
        }
        preferences[key] = probe.preferences[key];
    }
    if (preferences.aiProvider) {
        const provider = modelRegistry.getProvider(preferences.aiProvider);
        if (!provider) {
            refused.push('aiProvider');
            delete preferences.aiProvider;
            delete preferences.aiModel;
        } else if (preferences.aiModel && !provider.models.some((m) => m.id === preferences.aiModel)) {
            refused.push('aiModel');
            delete preferences.aiModel;
        }
    }
    return { preferences, refused };
};

// Check every document before anything is deleted, with the same checks as
// saving (validate hooks) and the unique keys inserting would trip on
const validatePlan = async (plan) => {
    const duplicate = (docs, keyOf) => {
        const seen = new Set();
        return docs.find((doc) => {
            const key = keyOf(doc);
            if (seen.has(key)) return true;
            seen.add(key);
            return false;
        });
    };
    const twice = duplicate(plan.budgets, (b) => `${b.recipient}|${b.year}`);
    if (twice) throw new HttpError(400, `The backup has two budgets for one recipient in ${twice.year}. Nothing was restored.`);
    const twiceOverall = duplicate(plan.overallBudgets || [], (b) => String(b.year));
    if (twiceOverall) throw new HttpError(400, `The backup has two overall budgets for ${twiceOverall.year}. Nothing was restored.`);

    const checks = [
        ['recipient', Recipient, plan.recipients, (d) => `${d.firstName || ''} ${d.lastName || ''}`.trim()],
        ['event', Event, plan.events, (d) => d.name],
        ['gift', Gift, plan.gifts, (d) => d.name],
        ['budget', Budget, plan.budgets, (d) => d.year],
        ['overall budget', OverallBudget, plan.overallBudgets || [], (d) => d.year]
    ];
    for (const [label, Model, docs, nameOf] of checks) {
        for (const doc of docs) {
            try {
                await new Model(doc).validate();
            } catch (error) {
                const first = Object.values(error.errors || {})[0];
                throw new HttpError(400, `The backup's ${label} "${nameOf(doc) ?? ''}" is invalid (${first?.message || error.message}). Nothing was restored.`);
            }
        }
    }
};

/**
 * Replace the user's data with the backup's. Without transactions (MongoDB
 * standalone), the user's current data is kept in memory and put back if
 * inserting fails.
 * @returns {Promise<Object>} Summary for the client
 */
const restoreUserBackup = async (userIdInput, parsed) => {
    const userId = new mongoose.Types.ObjectId(String(userIdInput));
    const plan = await planRestore(userId, parsed);
    await validatePlan(plan);

    const owned = { user: userId };
    const replaced = [Recipient, Event, Gift, Budget, Notification, ...(plan.overallBudgets ? [OverallBudget] : [])];
    const snapshot = await Promise.all(replaced.map((Model) => Model.collection.find(owned).toArray()));
    // A copy on disk, in case the server stops mid-restore or the rollback fails
    const snapshotFile = path.join(DATA_DIR, 'restore-snapshots', `user-${userId}-${Date.now()}.json`);
    await fsp.mkdir(path.dirname(snapshotFile), { recursive: true });
    await fsp.writeFile(snapshotFile, EJSON.stringify(
        Object.fromEntries(replaced.map((Model, i) => [Model.collection.collectionName, snapshot[i]])), { relaxed: false }
    ));

    try {
        if (plan.newTags.length) await Tag.insertMany(plan.newTags);
        if (plan.newTypes.length) await EventType.insertMany(plan.newTypes);
        for (const Model of replaced) await Model.deleteMany(owned);
        await Recipient.insertMany(plan.recipients);
        await Event.insertMany(plan.events);
        await Gift.insertMany(plan.gifts);
        await Budget.insertMany(plan.budgets);
        if (plan.overallBudgets) await OverallBudget.insertMany(plan.overallBudgets);
    } catch (error) {
        logger.error(`Restore for user ${userId} failed; putting their data back: ${error.message}`);
        // Each step on its own, so one failure doesn't stop the rest
        let rollbackFailed = false;
        const attempt = async (step, what) => {
            try {
                await step();
            } catch (rollbackError) {
                rollbackFailed = true;
                logger.error(`Restore rollback for user ${userId} could not put back ${what}: ${rollbackError.message}. Copy: ${snapshotFile}`);
            }
        };
        for (const [i, Model] of replaced.entries()) {
            await attempt(async () => {
                await Model.deleteMany(owned);
                if (snapshot[i].length) await Model.collection.insertMany(snapshot[i]);
            }, Model.collection.collectionName);
        }
        await attempt(() => Tag.deleteMany({ _id: { $in: plan.newTags.map((t) => t._id) } }), 'tags');
        await attempt(() => EventType.deleteMany({ _id: { $in: plan.newTypes.map((t) => t._id) } }), 'event types');
        if (rollbackFailed) {
            // Shown to the user: no driver text and no server paths (both are in the log)
            throw new HttpError(500, 'Restoring failed, and putting your data back did not fully work. '
                + `A copy of your data before the restore is saved as restore-snapshots/${path.basename(snapshotFile)} `
                + 'in the server\'s data folder; ask the server\'s owner to restore it.', { expose: true });
        }
        await fsp.rm(snapshotFile, { force: true });
        throw new HttpError(500, 'Restoring failed and your data was left as it was. Please try again.', { expose: true });
    }
    await fsp.rm(snapshotFile, { force: true });

    // The data is restored; what follows only reports problems
    const warnings = [];
    if (plan.refusedPreferences.length) {
        warnings.push(`Some preferences were not restored because this server doesn't accept them: ${plan.refusedPreferences.join(', ')}.`);
    }
    try {
        if (Object.keys(plan.preferences).length) {
            const set = Object.fromEntries(Object.entries(plan.preferences).map(([key, value]) => [`preferences.${key}`, value]));
            await User.updateOne({ _id: userId }, { $set: set }, { runValidators: true });
        }
    } catch (error) {
        logger.error(`Restoring preferences for user ${userId} failed: ${error.message}`);
        warnings.push('Your preferences could not be restored.');
    }

    // Bring the calendar up to date as the monthly job would
    let recurringCreated = 0;
    try {
        const recurring = await generateRecurringEvents(userId);
        recurringCreated = recurring.created || 0;
        for (const recipient of await Recipient.find(owned).lean()) {
            try {
                await syncBirthdayEvent(recipient);
            } catch (error) {
                logger.error(`Birthday event for recipient ${recipient._id} failed: ${error.message}`);
            }
        }
    } catch (error) {
        logger.error(`Calendar upkeep after restore for user ${userId} failed: ${error.message}`);
        warnings.push('Recurring events and birthdays will be brought up to date by the next monthly run.');
    }

    return {
        legacy: parsed.legacy,
        restoredData: {
            recipients: plan.recipients.length,
            events: plan.events.length,
            gifts: plan.gifts.length,
            budgets: plan.budgets.length,
            overallBudgets: plan.overallBudgets ? plan.overallBudgets.length : 0
        },
        skipped: plan.skipped,
        fixes: plan.fixes,
        calendar: { recurringCreated },
        warnings
    };
};

module.exports = { FORMAT, buildUserBackup, parseUserBackup, describeBackup, restoreUserBackup };
