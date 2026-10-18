// The instance's own settings: one document { _id: 'settings' } in the
// `instance` collection (beside the first-run setup code). It names the
// owner. MongoDB 4.4 standalone has no transactions, so ownership is this
// one field: a change of owner is a single write and the instance can never
// have two owners or none.
const mongoose = require('mongoose');
const User = require('../models/User');
const logger = require('../utils/logger');

const SETTINGS_ID = 'settings';
const settingsCollection = () => mongoose.connection.db.collection('instance');

const ACTIVE = { active: { $ne: false } };

const { getInstanceDefaults } = require('../config/instanceDefaults');

const SIGNUP_MODES = ['invite-only', 'open'];
let mismatchLogged = false;

// Fields a settings document needs, added only where missing: the database
// wins over .env once a value is stored. setupCompletedAt: an instance that
// already has accounts (an upgrade, a pre-1b restore) is set up; a fresh
// one is not (the first registration also writes null itself)
const seedInstanceSettings = async () => {
    const stored = (await settingsCollection().findOne({ _id: SETTINGS_ID })) || {};
    const env = getInstanceDefaults();
    const wanted = { signupMode: 'invite-only', defaultCountry: env.country, defaultCurrency: env.currency };
    const set = {};
    for (const [key, value] of Object.entries(wanted)) if (!(key in stored)) set[key] = value;
    if (!('setupCompletedAt' in stored)) set.setupCompletedAt = (await User.exists({})) ? new Date() : null;
    if (Object.keys(set).length) await settingsCollection().updateOne({ _id: SETTINGS_ID }, { $set: set }, { upsert: true });

    const explicit = (name) => (process.env[name] || '').trim().toUpperCase();
    const differs = (stored.defaultCountry && explicit('DEFAULT_COUNTRY') && explicit('DEFAULT_COUNTRY') !== stored.defaultCountry)
        || (stored.defaultCurrency && explicit('DEFAULT_CURRENCY') && explicit('DEFAULT_CURRENCY') !== stored.defaultCurrency);
    if (differs && !mismatchLogged) {
        mismatchLogged = true;
        logger.info(`DEFAULT_COUNTRY/DEFAULT_CURRENCY in .env differ from this instance's stored defaults (${stored.defaultCountry}/${stored.defaultCurrency}); the stored ones apply. Change them on the Admin page.`);
    }
};

// Oldest active admin, else oldest active account (_id order: server
// generated and immutable, unlike createdAt)
const fallbackOwner = async () =>
    (await User.findOne({ role: 'admin', ...ACTIVE }, { _id: 1 }).sort({ _id: 1 }).lean())
    || (await User.findOne(ACTIVE, { _id: 1 }).sort({ _id: 1 }).lean());

/**
 * Bring accounts and the owner up to what 1b expects. Runs at boot and
 * after every restore (from upgradeData): an older archive brings back users
 * without roles, and an ownerId from another server may name nobody.
 * @returns {Promise<{ownerId: string|null, changed: boolean}>}
 */
const ensureInstanceSettings = async () => {
    await seedInstanceSettings();
    await User.collection.updateMany({ role: { $exists: false } }, { $set: { role: 'member' } });
    await User.collection.updateMany({ active: { $exists: false } }, { $set: { active: true } });

    const stored = await settingsCollection().findOne({ _id: SETTINGS_ID });
    const current = stored?.ownerId
        ? await User.findOne({ _id: stored.ownerId, ...ACTIVE }, { _id: 1, role: 1 }).lean()
        : null;
    const owner = current || await fallbackOwner();
    if (!owner) return { ownerId: null, changed: false };

    // The fallback query reads only _id, so a fallback owner is always (re)made admin
    if (owner.role !== 'admin') await User.collection.updateOne({ _id: owner._id }, { $set: { role: 'admin' } });
    if (current) return { ownerId: String(owner._id), changed: false };

    await settingsCollection().updateOne({ _id: SETTINGS_ID }, { $set: { ownerId: owner._id } }, { upsert: true });
    logger.warn(`Instance owner set to account ${owner._id}${stored?.ownerId ? ` (the stored owner ${stored.ownerId} is missing or deactivated)` : ''}`);
    return { ownerId: String(owner._id), changed: true };
};

/** @returns {Promise<string|null>} The owner's id */
const getOwnerId = async () => {
    const stored = await settingsCollection().findOne({ _id: SETTINGS_ID }, { projection: { ownerId: 1 } });
    // The stored owner must still exist, be active and be an admin (a
    // restore, tests that clear only model collections, or a demotion that
    // raced a hand-over can leave it otherwise); ensureInstanceSettings repairs
    if (stored?.ownerId && await User.exists({ _id: stored.ownerId, role: 'admin', ...ACTIVE })) return String(stored.ownerId);
    return (await ensureInstanceSettings()).ownerId;
};

const isOwner = async (userId) => Boolean(userId) && (await getOwnerId()) === String(userId);

/** The settings, seeded first if a field is missing */
const getInstanceSettings = async () => {
    let doc = await settingsCollection().findOne({ _id: SETTINGS_ID });
    if (!doc || !('signupMode' in doc) || !('setupCompletedAt' in doc) || !('defaultCountry' in doc) || !('defaultCurrency' in doc)) {
        await seedInstanceSettings();
        doc = await settingsCollection().findOne({ _id: SETTINGS_ID });
    }
    return {
        ownerId: doc.ownerId ? String(doc.ownerId) : null,
        signupMode: SIGNUP_MODES.includes(doc.signupMode) ? doc.signupMode : 'invite-only',
        defaultCountry: doc.defaultCountry,
        defaultCurrency: doc.defaultCurrency,
        setupCompletedAt: doc.setupCompletedAt || null
    };
};

/** What a new account starts with: the stored household defaults */
const getInstanceDefaultsFromDb = async () => {
    const s = await getInstanceSettings();
    return { country: s.defaultCountry, currency: s.defaultCurrency };
};

const updateInstanceSettings = async (fields) => {
    await getInstanceSettings(); // the document exists and is seeded
    await settingsCollection().updateOne({ _id: SETTINGS_ID }, { $set: fields });
    return getInstanceSettings();
};

module.exports = {
    SETTINGS_ID, SIGNUP_MODES, settingsCollection, seedInstanceSettings, ensureInstanceSettings,
    getOwnerId, isOwner, getInstanceSettings, getInstanceDefaultsFromDb, updateInstanceSettings
};
