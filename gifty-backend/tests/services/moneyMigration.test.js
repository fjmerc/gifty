// The one-off money-model migration against raw legacy documents, exactly as
// pre-Phase-2 databases store them (Review Focus 2: legacy fields, re-runs).
process.env.TZ = 'UTC';
const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const Gift = require('../../models/Gift');
const Tag = require('../../models/Tags');
const EventType = require('../../models/EventType');
require('../../models/Recipient');
const Event = require('../../models/Event');
const logger = require('../../utils/logger');
const { Budget, OverallBudget } = require('../../models/Budget');
const moneyService = require('../../services/moneyService');
const { runMoneyModelMigration, runPendingMigrations } = require('../../services/moneyMigration');
const { parseArgs } = require('../../scripts/migrate-money-model');

const MONGO_URI = `mongodb://localhost:27017/gifty-test-money-migration-${process.pid}`;
const oid = () => new mongoose.Types.ObjectId();
const indexNames = async (Model) => (await Model.collection.indexes()).map((i) => i.name);
// Every document and index the migration can touch, for "nothing changed" checks
const snapshot = async () => {
  const all = async (Model) => Model.collection.find().sort({ _id: 1 }).toArray();
  const idx = async (Model) => (await indexNames(Model)).sort();
  return {
    gifts: await all(Gift),
    budgets: await all(Budget),
    overallBudgets: await all(OverallBudget),
    tags: await all(Tag),
    eventTypes: await all(EventType),
    migrations: await mongoose.connection.db.collection('migrations').find().toArray(),
    indexes: {
      gifts: await idx(Gift), tags: await idx(Tag), eventTypes: await idx(EventType),
      budgets: await idx(Budget), overallBudgets: await idx(OverallBudget)
    }
  };
};

describe('money-model migration', () => {
  let ids;

  const seedLegacy = async () => {
    const user = oid();
    const ann = oid();
    const bob = oid();
    ids = {
      user, ann, bob,
      unrounded: oid(), purchased: oid(), undated: oid(), prefilled: oid(), negative: oid(),
      budget: oid(), overall: oid()
    };
    await Gift.collection.insertMany([
      { _id: ids.unrounded, user, recipient: ann, event: oid(), name: 'Unrounded', price: 34.999, status: 'saved' },
      { _id: ids.purchased, user, recipient: ann, event: oid(), name: 'Bought', price: 40, status: 'purchased',
        purchaseDate: new Date('2031-03-03T12:00:00Z'), budget: ids.budget, budgetStatus: 'within_budget' },
      { _id: ids.undated, user, recipient: bob, event: oid(), name: 'Undated', price: 15, status: 'purchased',
        updatedAt: new Date('2031-05-05T12:00:00Z'), createdAt: new Date('2031-01-01T12:00:00Z') },
      { _id: ids.prefilled, user, recipient: ann, event: oid(), name: 'Suggested', price: 20, status: 'suggestion',
        purchaseDate: new Date('2032-01-15T00:00:00Z') },
      { _id: ids.negative, user, recipient: bob, event: oid(), name: 'Odd', price: -5, status: 'saved' }
    ]);
    await Budget.collection.insertOne({
      _id: ids.budget, user, recipient: ann, year: 2031, allocationType: 'fixed', minimumAmount: 0,
      maximumAmount: 100, isLimited: true, spentAmount: 999, remainingAmount: 0, budgetStatus: 'critical',
      lastAnalysis: { date: new Date(), spentPercentage: 999, monthlySpending: [] }
    });
    await OverallBudget.collection.insertOne({
      _id: ids.overall, user, year: 2031, amount: 1000, isLimited: true, currency: 'USD',
      allocatedAmount: 100, remainingAmount: 900
    });
    await Gift.collection.createIndex({ budget: 1, price: 1 }, { name: 'budget_price' });
    await Tag.collection.createIndex({ name: 1 }, { unique: true, name: 'name_1' });
    await EventType.collection.createIndex({ name: 1 }, { unique: true, name: 'name_1' });
  };

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(MONGO_URI);
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    await Promise.all([Gift.createIndexes(), Tag.createIndexes(), EventType.createIndexes()]);
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  it('dry run reports everything and writes nothing (no backup either)', async () => {
    await seedLegacy();
    const before = await snapshot();
    const createBackup = jest.fn();
    const log = jest.fn();
    const report = await runMoneyModelMigration({ apply: false, createBackup, log });

    expect(createBackup).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      apply: false,
      backup: null,
      pricesRounded: 1,
      negativePrices: [{ giftId: String(ids.negative), price: -5 }],
      purchaseDatesBackfilled: 1,
      legacyFieldsRemoved: { budgets: 1, overallBudgets: 1, gifts: 1 },
      purchaseDatesCleared: 1,
      indexes: { giftsBudgetPrice: true, tagsName: true, eventTypesName: true }
    });
    expect(report.drift).toEqual([{
      budgetId: String(ids.budget), user: String(ids.user), recipient: String(ids.ann),
      year: 2031, stored: 999, derived: 40, difference: -959
    }]);
    expect(log.mock.calls.map((c) => c[0]).join('\n')).toMatch(/DRY RUN/);
    // The upgrade guide says to read the report with `grep money-migration`
    for (const [line] of log.mock.calls) expect(line).toMatch(/^\[money-migration\]/);

    expect((await Gift.collection.findOne({ _id: ids.unrounded })).price).toBe(34.999);
    expect((await Budget.collection.findOne({ _id: ids.budget })).spentAmount).toBe(999);
    expect(await indexNames(Gift)).toContain('budget_price');
    expect(await indexNames(Tag)).toContain('name_1');
    expect(await snapshot()).toEqual(before);
  });

  it("applies on a database whose gift indexes carry MongoDB's old automatic names", async () => {
    // A real pre-upgrade database (rehearsed 2026-10-14): the AI-suggestion
    // index existed as recipient_1_event_1_isAISuggested_1, which the model
    // now names ai_suggestions, next to an index on the removed budgetStatus
    await mongoose.connection.dropDatabase();
    await seedLegacy();
    await Gift.collection.createIndex({ recipient: 1, event: 1, isAISuggested: 1 });
    await Gift.collection.createIndex({ user: 1, recipient: 1, status: 1, budgetStatus: 1 });

    const report = await runMoneyModelMigration({ apply: true, createBackup: jest.fn().mockResolvedValue({ backupName: 'b' }), log: jest.fn() });

    expect(report.pricesRounded).toBeGreaterThan(0);
    const names = await indexNames(Gift);
    expect(names).not.toContain('user_1_recipient_1_status_1_budgetStatus_1');
    expect(names).toContain('user_status_purchase_date');
    expect(names.filter((n) => /isAISuggested|ai_suggestions/.test(n))).toHaveLength(1);
  });

  it('apply backs up first, then cleans every legacy field and index', async () => {
    await seedLegacy();
    let priceAtBackup;
    const createBackup = jest.fn(async () => {
      priceAtBackup = (await Gift.collection.findOne({ _id: ids.unrounded })).price;
      return { backupName: 'gifty-backup-20311231-000000.tar.gz', backupPath: '/tmp/x' };
    });
    const report = await runMoneyModelMigration({ apply: true, createBackup, log: jest.fn() });

    expect(createBackup).toHaveBeenCalledTimes(1);
    expect(priceAtBackup).toBe(34.999);
    expect(report.backup).toBe('gifty-backup-20311231-000000.tar.gz');

    expect((await Gift.collection.findOne({ _id: ids.unrounded })).price).toBe(35);
    expect((await Gift.collection.findOne({ _id: ids.negative })).price).toBe(-5); // reported, not changed
    expect((await Gift.collection.findOne({ _id: ids.undated })).purchaseDate).toEqual(new Date('2031-05-05T12:00:00Z'));
    expect((await Gift.collection.findOne({ _id: ids.prefilled })).purchaseDate).toBeUndefined();
    const purchased = await Gift.collection.findOne({ _id: ids.purchased });
    expect(purchased).not.toHaveProperty('budget');
    expect(purchased).not.toHaveProperty('budgetStatus');
    expect(purchased.purchaseDate).toEqual(new Date('2031-03-03T12:00:00Z'));

    const budget = await Budget.collection.findOne({ _id: ids.budget });
    ['spentAmount', 'remainingAmount', 'budgetStatus', 'lastAnalysis'].forEach((f) => expect(budget).not.toHaveProperty(f));
    expect(budget.maximumAmount).toBe(100);
    const overall = await OverallBudget.collection.findOne({ _id: ids.overall });
    expect(overall).not.toHaveProperty('allocatedAmount');
    expect(overall).not.toHaveProperty('remainingAmount');

    expect(await indexNames(Gift)).not.toContain('budget_price');
    expect(await indexNames(Gift)).toContain('user_status_purchase_date');
    expect(await indexNames(Tag)).not.toContain('name_1');
    expect(await indexNames(EventType)).not.toContain('name_1');
    expect(await indexNames(EventType)).toContain('creator_name_unique');

    // Figures afterwards come only from purchases (the backfilled one counts in May)
    const summary = await moneyService.getYearSummary(ids.user, 2031);
    expect(summary.overall.spent).toBe(55);
    expect((await moneyService.getMonthlySpend(ids.user, 2031))[4]).toBe(15);
  });

  it('is idempotent: a second run finds nothing to change', async () => {
    await seedLegacy();
    await runMoneyModelMigration({ apply: true, createBackup: jest.fn(async () => ({ backupName: 'b1' })), log: jest.fn() });
    const before = await snapshot();
    const second = await runMoneyModelMigration({ apply: true, createBackup: jest.fn(async () => ({ backupName: 'b2' })), log: jest.fn() });

    expect(second).toMatchObject({
      pricesRounded: 0,
      purchaseDatesBackfilled: 0,
      drift: [],
      legacyFieldsRemoved: { budgets: 0, overallBudgets: 0, gifts: 0 },
      purchaseDatesCleared: 0,
      indexes: { giftsBudgetPrice: false, tagsName: false, eventTypesName: false }
    });
    expect(await snapshot()).toEqual(before);
  });

  it('boot runs it once after a backup and records a marker', async () => {
    await seedLegacy();
    const createBackup = jest.fn(async () => ({ backupName: 'boot-backup' }));
    const first = await runPendingMigrations({ createBackup, log: jest.fn() });
    expect(first.skipped).toBe(false);
    expect(first.report.pricesRounded).toBe(1);
    expect(createBackup).toHaveBeenCalledTimes(1);
    const marker = await mongoose.connection.db.collection('migrations').findOne({ _id: 'money-model-2026-10' });
    expect(marker.appliedAt).toBeInstanceOf(Date);

    const second = await runPendingMigrations({ createBackup, log: jest.fn() });
    expect(second).toEqual({ skipped: true });
    expect(createBackup).toHaveBeenCalledTimes(1);
  });

  it('boot on a database with nothing to migrate skips the backup but records the marker', async () => {
    const createBackup = jest.fn();
    const result = await runPendingMigrations({ createBackup, log: jest.fn() });
    expect(result.skipped).toBe(false);
    expect(createBackup).not.toHaveBeenCalled();
    expect(await mongoose.connection.db.collection('migrations').countDocuments({ _id: 'money-model-2026-10' })).toBe(1);
  });

  it('a failed backup leaves the data untouched, records no marker and never throws', async () => {
    await seedLegacy();
    const createBackup = jest.fn(async () => { throw new Error('disk full'); });
    const result = await runPendingMigrations({ createBackup, log: jest.fn() });
    expect(result.error.message).toBe('disk full');
    expect((await Gift.collection.findOne({ _id: ids.unrounded })).price).toBe(34.999);
    expect(await mongoose.connection.db.collection('migrations').countDocuments()).toBe(0);
  });

  it('dry-run drift counts undated purchases as the backfill will date them, matching apply', async () => {
    await seedLegacy();
    // Bob's only purchase is the undated $15 gift, backfilled to May 2031: no real drift
    const bobBudget = oid();
    await Budget.collection.insertOne({
      _id: bobBudget, user: ids.user, recipient: ids.bob, year: 2031, allocationType: 'fixed',
      minimumAmount: 0, maximumAmount: 50, isLimited: true, spentAmount: 15
    });
    const log = jest.fn();
    const dry = await runMoneyModelMigration({ apply: false, createBackup: jest.fn(), log });
    expect(dry.drift.map((d) => d.budgetId)).toEqual([String(ids.budget)]);
    expect(log.mock.calls.map((c) => c[0]).join('\n')).toMatch(/undated purchased gifts counted as they will be dated: 1/);

    const applied = await runMoneyModelMigration({ apply: true, createBackup: jest.fn(async () => ({ backupName: 'b' })), log: jest.fn() });
    expect(applied.drift).toEqual(dry.drift);
  });

  it("reports purchased gifts dated on their event's day without changing them", async () => {
    const user = oid();
    const recipient = oid();
    const eventDay = new Date('2031-06-01T00:00:00Z');
    const party = oid();
    const other = oid();
    await Event.collection.insertMany([
      { _id: party, user, recipient, name: 'Party', date: eventDay, type: oid() },
      { _id: other, user, recipient, name: 'Other', date: new Date('2031-09-09T00:00:00Z'), type: oid() }
    ]);
    const onEventDay = oid();
    const sameDayLater = oid();
    await Gift.collection.insertMany([
      { _id: onEventDay, user, recipient, event: party, name: 'Prefilled', price: 10, status: 'purchased', purchaseDate: eventDay },
      { _id: sameDayLater, user, recipient, event: party, name: 'Same day', price: 12, status: 'purchased', purchaseDate: new Date('2031-06-01T15:00:00Z') },
      { _id: oid(), user, recipient, event: other, name: 'Real', price: 20, status: 'purchased', purchaseDate: new Date('2031-03-03T12:00:00Z') },
      { _id: oid(), user, recipient, event: party, name: 'Saved', price: 5, status: 'saved' }
    ]);
    const log = jest.fn();
    const report = await runMoneyModelMigration({ apply: true, createBackup: jest.fn(async () => ({ backupName: 'b' })), log });

    expect(report.purchasedOnEventDate.map((g) => g.giftId).sort()).toEqual([String(onEventDay), String(sameDayLater)].sort());
    expect(report.purchasedOnEventDate.find((g) => g.giftId === String(onEventDay))).toEqual({
      giftId: String(onEventDay), name: 'Prefilled', event: 'Party', purchaseDate: eventDay
    });
    const lines = log.mock.calls.map((c) => c[0]).join('\n');
    expect(lines).toMatch(/purchased gifts dated on their event's day \(review in Purchase History\): 2/);
    expect((await Gift.collection.findOne({ _id: onEventDay })).purchaseDate).toEqual(eventDay);
  });

  it('a failed boot migration logs the stack, not just the message', async () => {
    await seedLegacy();
    logger.error.mockClear();
    await runPendingMigrations({ createBackup: jest.fn(async () => { throw new Error('disk full'); }), log: jest.fn() });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(/money-migration\] failed/),
      expect.objectContaining({ error: 'disk full', stack: expect.stringMatching(/Error: disk full\n\s+at /) })
    );
  });

  it('the CLI is a dry run unless --apply is given, and --dry-run always wins', () => {
    expect(parseArgs([])).toEqual({ apply: false });
    expect(parseArgs(['--dry-run'])).toEqual({ apply: false });
    expect(parseArgs(['--apply'])).toEqual({ apply: true });
    expect(parseArgs(['--apply', '--dry-run'])).toEqual({ apply: false });
  });
});
