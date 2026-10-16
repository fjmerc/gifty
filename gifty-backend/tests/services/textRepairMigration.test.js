// The one-off repair of text the removed xssMiddleware HTML-encoded, against
// raw documents exactly as pre-2026-10 databases store them.
const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));
jest.mock('../../middleware/cacheMiddleware', () => ({
  clearCache: jest.fn(async () => 0),
  keyPrefixes: { gifts: 'gifty:gifts:', recipients: 'gifty:recipients:' }
}));

const Gift = require('../../models/Gift');
const Recipient = require('../../models/Recipient');
const Tag = require('../../models/Tags');
const User = require('../../models/User');
const { clearCache } = require('../../middleware/cacheMiddleware');
const { legacyEncode } = require('../../utils/legacyInputEncoding');
const { runTextRepair, runPendingTextRepair, MIGRATION_ID } = require('../../services/textRepairMigration');
const { parseArgs } = require('../../scripts/repair-encoded-text');

const MONGO_URI = `mongodb://localhost:27017/gifty-test-text-repair-${process.pid}`;
const oid = () => new mongoose.Types.ObjectId();
const markers = () => mongoose.connection.db.collection('migrations');
const raw = (Model, _id) => Model.collection.findOne({ _id });

describe('encoded-text repair migration', () => {
  let ids;

  const seedLegacy = async () => {
    const user = oid();
    ids = { user, recipient: oid(), gift: oid(), plain: oid(), tagA: oid(), tagB: oid() };
    await User.collection.insertOne({
      _id: user, username: 'obrien', email: 'ann@example.com', firstName: legacyEncode(`Ann-Marie "Annie"`),
      lastName: legacyEncode(`O'Brien`), password: '$2a$10$&amp;not-a-real-hash'
    });
    await Recipient.collection.insertOne({
      _id: ids.recipient, user, firstName: legacyEncode(`D'Arcy`), lastName: 'Smith',
      interests: [legacyEncode('Arts & Crafts'), 'Hiking', 42],
      // Nested fields never went through the middleware: left exactly as stored
      address: { street: '1 Main St &amp; 2nd' }
    });
    await Gift.collection.insertMany([
      { _id: ids.gift, user, recipient: ids.recipient, event: oid(), price: 10, status: 'saved',
        name: legacyEncode(`Tom & Jerry's <Box>`), // Edit forms sent stored (encoded) text back, so each save added a layer
        description: legacyEncode(legacyEncode(legacyEncode(`Ann's "wish" list`))),
        whereToBuy: [legacyEncode('https://shop.example/?a=1&b=2')] },
      { _id: ids.plain, user, recipient: ids.recipient, event: oid(), price: 5, status: 'saved', name: 'Plain' }
    ]);
    // Decoding A gives exactly B's name: a unique-index conflict to report, not abort on
    await Tag.collection.insertMany([
      { _id: ids.tagA, user, name: legacyEncode('Rock & Roll') },
      { _id: ids.tagB, user, name: 'Rock & Roll' }
    ]);
  };

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(MONGO_URI);
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    await Tag.createIndexes();
    clearCache.mockClear();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  it('dry run counts what it would decode and writes nothing (no backup either)', async () => {
    await seedLegacy();
    const createBackup = jest.fn();
    const before = await Gift.collection.find().toArray();

    const log = jest.fn();
    const report = await runTextRepair({ apply: false, createBackup, log });

    expect(createBackup).not.toHaveBeenCalled();
    // The upgrade guide says to read the report with `grep text-repair`
    expect(log.mock.calls.length).toBeGreaterThan(1);
    for (const [line] of log.mock.calls) expect(line).toMatch(/^\[text-repair\]/);
    expect(report.collections.gifts).toEqual({ documents: 1, fields: 3 });
    expect(report.collections.recipients).toEqual({ documents: 1, fields: 2 });
    expect(report.collections.users).toEqual({ documents: 1, fields: 2 });
    expect(report.collections.tags).toEqual({ documents: 1, fields: 1 });
    expect(await Gift.collection.find().toArray()).toEqual(before);
    expect(await markers().countDocuments()).toBe(0);
  });

  it('apply backs up first, then decodes top-level strings and string arrays, every layer', async () => {
    await seedLegacy();
    const createBackup = jest.fn(async () => ({ backupName: 'pre-repair' }));

    const report = await runTextRepair({ apply: true, createBackup, log: jest.fn() });

    expect(report.backup).toBe('pre-repair');
    const gift = await raw(Gift, ids.gift);
    expect(gift.name).toBe(`Tom & Jerry's <Box>`);
    expect(gift.description).toBe(`Ann's "wish" list`);
    expect(gift.whereToBuy).toEqual(['https://shop.example/?a=1&b=2']);
    const recipient = await raw(Recipient, ids.recipient);
    expect(recipient.firstName).toBe(`D'Arcy`);
    expect(recipient.interests).toEqual(['Arts & Crafts', 'Hiking', 42]);
    expect(recipient.address.street).toBe('1 Main St &amp; 2nd');
    const user = await raw(User, ids.user);
    expect(user.firstName).toBe(`Ann-Marie "Annie"`);
    expect(user.lastName).toBe(`O'Brien`);
    expect(user.password).toBe('$2a$10$&amp;not-a-real-hash');
    expect((await raw(Gift, ids.plain)).name).toBe('Plain');
  });

  it('reports a decoded value that collides with a unique index instead of aborting', async () => {
    await seedLegacy();
    const report = await runTextRepair({ apply: true, createBackup: async () => ({ backupName: 'b' }), log: jest.fn() });

    expect(report.conflicts).toEqual([{ collection: 'tags', id: String(ids.tagA) }]);
    expect((await raw(Tag, ids.tagA)).name).toBe('Rock &amp; Roll');
    expect((await raw(Gift, ids.gift)).name).toBe(`Tom & Jerry's <Box>`);
  });

  it('a driver or write-concern error mid-write aborts and leaves the marker in progress', async () => {
    await seedLegacy();
    const failure = Object.assign(new Error('connection reset'), { writeErrors: [] });
    const spy = jest.spyOn(Gift.collection, 'bulkWrite').mockRejectedValueOnce(failure);
    try {
      await expect(runTextRepair({ apply: true, createBackup: async () => ({ backupName: 'b' }), log: jest.fn() }))
        .rejects.toThrow('connection reset');
    } finally {
      spy.mockRestore();
    }
    expect((await markers().findOne({ _id: MIGRATION_ID })).status).toBe('in_progress');
  });

  it('apply refuses to run a second time unless forced (decoding is not idempotent)', async () => {
    await seedLegacy();
    const createBackup = jest.fn(async () => ({ backupName: 'b' }));
    await runTextRepair({ apply: true, createBackup, log: jest.fn() });

    // Text typed after the repair is stored as typed, entity-like or not
    await Gift.collection.updateOne({ _id: ids.gift }, { $set: { description: 'I &lt;3 it' } });

    await expect(runTextRepair({ apply: true, createBackup, log: jest.fn() })).rejects.toThrow(/already/);
    expect((await raw(Gift, ids.gift)).description).toBe('I &lt;3 it');

    await runTextRepair({ apply: true, force: true, createBackup, log: jest.fn() });
    expect((await raw(Gift, ids.gift)).description).toBe('I <3 it');
  });

  it('boot: runs once after a backup, records the marker and clears cached responses', async () => {
    await seedLegacy();
    const createBackup = jest.fn(async () => ({ backupName: 'boot-backup' }));

    const first = await runPendingTextRepair({ createBackup, log: jest.fn() });
    expect(first.skipped).toBe(false);
    expect(createBackup).toHaveBeenCalledTimes(1);
    expect(clearCache).toHaveBeenCalled();
    const marker = await markers().findOne({ _id: MIGRATION_ID });
    expect(marker).toMatchObject({ status: 'done', backup: 'boot-backup' });

    await Gift.collection.updateOne({ _id: ids.gift }, { $set: { description: 'I &lt;3 it' } });
    const second = await runPendingTextRepair({ createBackup, log: jest.fn() });
    expect(second).toEqual({ skipped: true });
    expect(createBackup).toHaveBeenCalledTimes(1);
    expect((await raw(Gift, ids.gift)).description).toBe('I &lt;3 it');
  });

  it('boot on a database with nothing encoded skips the backup but records the marker', async () => {
    const createBackup = jest.fn();
    const result = await runPendingTextRepair({ createBackup, log: jest.fn() });
    expect(result.skipped).toBe(false);
    expect(createBackup).not.toHaveBeenCalled();
    expect((await markers().findOne({ _id: MIGRATION_ID })).status).toBe('done');
  });

  it('boot never retries an interrupted run: it logs how to recover and leaves data alone', async () => {
    await seedLegacy();
    await markers().insertOne({ _id: MIGRATION_ID, status: 'in_progress', backup: 'half-way' });
    const createBackup = jest.fn();
    const log = jest.fn();

    const result = await runPendingTextRepair({ createBackup, log });

    expect(result).toMatchObject({ skipped: true, interrupted: true });
    expect(createBackup).not.toHaveBeenCalled();
    expect((await raw(Gift, ids.gift)).name).toBe(legacyEncode(`Tom & Jerry's <Box>`));
    expect(require('../../utils/logger').error).toHaveBeenCalledWith(expect.stringContaining('half-way'));
  });

  it('a failed backup leaves the data untouched, records no marker and never throws', async () => {
    await seedLegacy();
    const createBackup = jest.fn(async () => { throw new Error('disk full'); });
    const result = await runPendingTextRepair({ createBackup, log: jest.fn() });
    expect(result.error.message).toBe('disk full');
    expect((await raw(Gift, ids.gift)).name).toBe(legacyEncode(`Tom & Jerry's <Box>`));
    expect(await markers().countDocuments()).toBe(0);
  });

  it('CLI: dry run by default; --apply applies; --force only with --apply', () => {
    expect(parseArgs([])).toEqual({ apply: false, force: false });
    expect(parseArgs(['--dry-run'])).toEqual({ apply: false, force: false });
    expect(parseArgs(['--apply'])).toEqual({ apply: true, force: false });
    expect(parseArgs(['--apply', '--force'])).toEqual({ apply: true, force: true });
    expect(parseArgs(['--force'])).toEqual({ apply: false, force: false });
    expect(parseArgs(['--apply', '--dry-run'])).toEqual({ apply: false, force: false });
  });
});
