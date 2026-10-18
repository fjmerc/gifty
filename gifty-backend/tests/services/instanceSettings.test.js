const mongoose = require('mongoose');
const { setupTestDB, teardownTestDB } = require('../utils/testSetup');
const User = require('../../models/User');
const settings = require('../../services/instanceSettings');
const { SETTINGS_ID, settingsCollection, ensureInstanceSettings, getInstanceSettings, getInstanceDefaultsFromDb, updateInstanceSettings } = settings;

const raw = () => mongoose.connection.db.collection('users');
const instance = () => mongoose.connection.db.collection('instance');
const legacyUser = async (name, extra = {}) =>
  (await raw().insertOne({ username: name, email: `${name}@example.com`, password: 'x', firstName: name, lastName: 'L', ...extra })).insertedId;

describe('instanceSettings', () => {
  beforeAll(setupTestDB);
  afterAll(teardownTestDB);
  beforeEach(async () => {
    await raw().deleteMany({});
    await instance().deleteMany({});
  });

  it('upgrades a pre-1b database: oldest account owner and admin, others members, all active', async () => {
    const oldest = await legacyUser('oldest');
    const other = await legacyUser('other');
    const result = await settings.ensureInstanceSettings();
    expect(result).toEqual({ ownerId: String(oldest), changed: true });
    const users = await raw().find({}).sort({ _id: 1 }).toArray();
    expect(users.map((u) => [u.role, u.active])).toEqual([['admin', true], ['member', true]]);
    expect(String((await instance().findOne({ _id: 'settings' })).ownerId)).toBe(String(oldest));
    expect(await settings.isOwner(other)).toBe(false);
  });

  it('is a no-op once settled', async () => {
    await legacyUser('a');
    await settings.ensureInstanceSettings();
    expect((await settings.ensureInstanceSettings()).changed).toBe(false);
  });

  it('keeps a valid stored owner even when it is not the oldest account', async () => {
    await legacyUser('a', { role: 'admin', active: true });
    const b = await legacyUser('b', { role: 'admin', active: true });
    await instance().insertOne({ _id: 'settings', ownerId: b });
    expect(await settings.ensureInstanceSettings()).toEqual({ ownerId: String(b), changed: false });
  });

  it('falls back to the oldest active admin when ownerId dangles (restore from another server)', async () => {
    await legacyUser('m', { role: 'member', active: true });
    const admin = await legacyUser('adm', { role: 'admin', active: true });
    await instance().insertOne({ _id: 'settings', ownerId: new mongoose.Types.ObjectId() });
    expect((await settings.ensureInstanceSettings()).ownerId).toBe(String(admin));
  });

  it('never picks an inactive account', async () => {
    await legacyUser('gone', { role: 'admin', active: false });
    const next = await legacyUser('next', { role: 'member', active: true });
    expect((await settings.ensureInstanceSettings()).ownerId).toBe(String(next));
    expect((await raw().findOne({ _id: next })).role).toBe('admin');
  });

  it('replaces an owner who is inactive', async () => {
    const old = await legacyUser('old', { role: 'admin', active: false });
    const next = await legacyUser('next', { role: 'admin', active: true });
    await instance().insertOne({ _id: 'settings', ownerId: old });
    expect((await settings.ensureInstanceSettings()).ownerId).toBe(String(next));
  });

  it('leaves ownerId unset without accounts', async () => {
    expect(await settings.ensureInstanceSettings()).toEqual({ ownerId: null, changed: false });
    expect(await settings.getOwnerId()).toBeNull();
  });

  it('getOwnerId repairs a stored owner that no longer exists', async () => {
    const u = await legacyUser('u', { role: 'member', active: true });
    await instance().insertOne({ _id: 'settings', ownerId: new mongoose.Types.ObjectId() });
    expect(await settings.getOwnerId()).toBe(String(u));
  });

  it('getOwnerId makes a stored owner who lost the admin role an admin again', async () => {
    // e.g. a demotion that raced a hand-over to the same account
    const u = await legacyUser('u', { role: 'member', active: true });
    await instance().insertOne({ _id: 'settings', ownerId: u });
    expect(await settings.getOwnerId()).toBe(String(u));
    expect((await raw().findOne({ _id: u })).role).toBe('admin');
  });

  it('getOwnerId settles a database nobody upgraded yet (users made directly)', async () => {
    const u = await User.create({ username: 'u', email: 'u@example.com', password: 'Passw0rd!', firstName: 'U', lastName: 'U' });
    expect(await settings.getOwnerId()).toBe(String(u._id));
    expect((await User.findById(u._id)).role).toBe('admin');
  });
  describe('settings fields (1b-b)', () => {
    const seededFrom = { DEFAULT_COUNTRY: 'DE', DEFAULT_CURRENCY: 'EUR' };
    let savedEnv;
    beforeEach(() => {
      savedEnv = { DEFAULT_COUNTRY: process.env.DEFAULT_COUNTRY, DEFAULT_CURRENCY: process.env.DEFAULT_CURRENCY };
      Object.assign(process.env, seededFrom);
    });
    afterEach(() => {
      for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    });

    it('a fresh instance gets invite-only, the env defaults and an unfinished setup', async () => {
      await ensureInstanceSettings();
      const s = await getInstanceSettings();
      expect(s).toMatchObject({ signupMode: 'invite-only', defaultCountry: 'DE', defaultCurrency: 'EUR', setupCompletedAt: null, ownerId: null });
    });

    it('upgrades a settings document that only names the owner', async () => {
      const owner = await User.create({ username: 'o1', email: 'o1@example.com', password: 'x', firstName: 'O', lastName: 'O', role: 'admin' });
      await settingsCollection().insertOne({ _id: SETTINGS_ID, ownerId: owner._id });
      await ensureInstanceSettings();
      const s = await getInstanceSettings();
      expect(s.signupMode).toBe('invite-only');
      expect(s.defaultCountry).toBe('DE');
      expect(s.setupCompletedAt).toBeInstanceOf(Date);
      expect(s.ownerId).toBe(String(owner._id));
    });

    it('never overwrites stored values, and the database wins over a changed .env', async () => {
      await settingsCollection().insertOne({ _id: SETTINGS_ID, signupMode: 'open', defaultCountry: 'US', defaultCurrency: 'USD', setupCompletedAt: null });
      await ensureInstanceSettings();
      expect(await getInstanceDefaultsFromDb()).toEqual({ country: 'US', currency: 'USD' });
      expect((await getInstanceSettings()).signupMode).toBe('open');
    });

    it('a pre-1b restore (no settings document, accounts present) comes back invite-only and set up', async () => {
      await User.collection.insertOne({ username: 'legacy', email: 'l@example.com', password: 'x', firstName: 'L', lastName: 'L' });
      await ensureInstanceSettings();
      const s = await getInstanceSettings();
      expect(s.signupMode).toBe('invite-only');
      expect(s.setupCompletedAt).toBeInstanceOf(Date);
    });

    it('updateInstanceSettings changes only the given fields', async () => {
      await ensureInstanceSettings();
      await updateInstanceSettings({ signupMode: 'open' });
      expect(await getInstanceSettings()).toMatchObject({ signupMode: 'open', defaultCountry: 'DE' });
    });
  });
});
