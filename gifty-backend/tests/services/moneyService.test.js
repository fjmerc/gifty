// moneyService against the real database. Fixtures are raw inserts so they can
// carry legacy fields (spentAmount, budgetStatus, …) exactly as old documents
// do, and so no model hook runs.
const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');
const Gift = require('../../models/Gift');
const Recipient = require('../../models/Recipient');
require('../../models/Event');
require('../../models/Tags');
const { Budget, OverallBudget, UserPreferences } = require('../../models/Budget');
const moneyService = require('../../services/moneyService');

const MONGO_URI = `mongodb://localhost:27017/gifty-test-money-service-${process.pid}`;
const YEAR = 2031;
const oid = () => new mongoose.Types.ObjectId();

describe('moneyService', () => {
  const originalTZ = process.env.TZ;
  let user;

  const insertRecipient = async (extra = {}) => {
    const doc = {
      _id: oid(), user, firstName: 'Ann', lastName: 'Lee', relation: 'friend',
      relationship: 'friendship', birthdate: new Date('1990-01-01'), tags: [], ...extra
    };
    await Recipient.collection.insertOne(doc);
    return doc;
  };
  const insertGift = async (recipient, extra = {}) => {
    const doc = {
      _id: oid(), user, recipient: recipient._id, event: oid(), name: 'Gift',
      price: 10, status: 'saved', ...extra
    };
    await Gift.collection.insertOne(doc);
    return doc;
  };
  const purchase = (recipient, price, isoDate, extra = {}) =>
    insertGift(recipient, { price, status: 'purchased', purchaseDate: new Date(isoDate), ...extra });
  const insertBudget = async (recipient, extra = {}) => {
    const doc = {
      _id: oid(), user, recipient: recipient._id, year: YEAR, allocationType: 'fixed',
      minimumAmount: 0, maximumAmount: 100, isLimited: true, ...extra
    };
    await Budget.collection.insertOne(doc);
    return doc;
  };
  const insertOverall = async (extra = {}) => {
    const doc = { _id: oid(), user, year: YEAR, amount: 1000, isLimited: true, currency: 'USD', ...extra };
    await OverallBudget.collection.insertOne(doc);
    return doc;
  };
  const summaryEntry = async (recipient, year = YEAR) =>
    (await moneyService.getYearSummary(user, year)).recipients
      .find((r) => r.recipientId === String(recipient._id));

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(MONGO_URI);
  });

  beforeEach(async () => {
    process.env.TZ = 'UTC';
    user = oid();
    await Promise.all(
      [Gift, Recipient, Budget, OverallBudget, UserPreferences].map((Model) => Model.collection.deleteMany({}))
    );
  });

  afterAll(async () => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
    await teardownTestDB();
  });

  describe('Problem table', () => {
    it("row 1: a gift saved before the year's budget existed counts once bought", async () => {
      const ann = await insertRecipient();
      await purchase(ann, 40, '2031-03-10T15:00:00Z');
      await insertOverall();
      await insertBudget(ann, { maximumAmount: 100 });
      const entry = await summaryEntry(ann);
      expect(entry.spent).toBe(40);
      expect(entry.left).toBe(60);
      expect(entry.status).toBe('within');
    });

    it('row 2: deleting a purchased AI gift removes its spend', async () => {
      const ann = await insertRecipient();
      await insertOverall();
      await insertBudget(ann);
      const gift = await purchase(ann, 45, '2031-04-01T12:00:00Z', { isAISuggested: true });
      expect((await summaryEntry(ann)).spent).toBe(45);
      await Gift.collection.deleteOne({ _id: gift._id });
      const entry = await summaryEntry(ann);
      expect(entry.spent).toBe(0);
      expect(entry.left).toBe(100);
    });

    it('row 3: a percentage limit follows the overall amount ($1000 → $2000)', async () => {
      const ann = await insertRecipient();
      const overall = await insertOverall({ amount: 1000 });
      // maximumAmount is a stale client-sent value and must be ignored
      await insertBudget(ann, { allocationType: 'percentage', percentageAllocation: 10, maximumAmount: 60 });
      await purchase(ann, 40, '2031-05-05T12:00:00Z');

      let summary = await moneyService.getYearSummary(user, YEAR);
      expect(summary.recipients[0].budget.limit).toBe(100);
      expect(summary.recipients[0].left).toBe(60);
      expect(summary.overall.allocated).toBe(100);

      await OverallBudget.collection.updateOne({ _id: overall._id }, { $set: { amount: 2000 } });
      summary = await moneyService.getYearSummary(user, YEAR);
      expect(summary.recipients[0].budget).toEqual({
        exists: true, type: 'percentage', limit: 200, isLimited: true, percentage: 10
      });
      expect(summary.recipients[0].left).toBe(160);
      expect(summary.overall.allocated).toBe(200);
      expect(summary.overall.unallocated).toBe(1800);
    });

    it('row 4: $9.99 + $34.99 against $50 leaves exactly $5.02, and a $5.02 gift fits', async () => {
      const ann = await insertRecipient();
      await insertOverall();
      await insertBudget(ann, { maximumAmount: 50 });
      await purchase(ann, 9.99, '2031-06-01T12:00:00Z');
      await purchase(ann, 34.99, '2031-06-02T12:00:00Z');

      const entry = await summaryEntry(ann);
      expect(entry.spent).toBe(44.98);
      expect(entry.left).toBe(5.02);
      expect(entry.status).toBe('warning');

      const check = await moneyService.checkPurchase(user, {
        recipientId: ann._id, price: 5.02, date: new Date('2031-06-03T12:00:00Z')
      });
      expect(check).toEqual({ status: 'warning', left: 0, wouldExceedBy: 0, currency: 'USD' });
    });

    it('row 5: two purchases at the same moment both count', async () => {
      const ann = await insertRecipient();
      await insertBudget(ann);
      await Promise.all([
        purchase(ann, 30, '2031-07-01T12:00:00Z'),
        purchase(ann, 40, '2031-07-01T12:00:00Z')
      ]);
      expect((await summaryEntry(ann)).spent).toBe(70);
    });

    it('row 6: a purchased $60 gift edited to $70 leaves $30 of $100', async () => {
      const ann = await insertRecipient();
      await insertOverall();
      await insertBudget(ann, { maximumAmount: 100 });
      const gift = await purchase(ann, 60, '2031-08-01T12:00:00Z');
      await Gift.collection.updateOne({ _id: gift._id }, { $set: { price: 70 } });

      expect(await moneyService.checkPurchase(user, gift._id)).toEqual({
        status: 'within', left: 30, wouldExceedBy: 0, currency: 'USD'
      });
      expect((await summaryEntry(ann)).left).toBe(30);
    });

    it('row 7: a gift for a January event counts in the year it was bought; un-buying removes it', async () => {
      const ann = await insertRecipient();
      await insertBudget(ann);
      await insertBudget(ann, { _id: oid(), year: YEAR + 1 });
      const gift = await purchase(ann, 35, '2031-12-15T12:00:00Z'); // for a Jan 2032 birthday

      expect((await summaryEntry(ann, YEAR)).spent).toBe(35);
      expect((await summaryEntry(ann, YEAR + 1)).spent).toBe(0);
      expect((await moneyService.getMonthlySpend(user, YEAR))[11]).toBe(35);

      await Gift.collection.updateOne({ _id: gift._id }, { $set: { status: 'saved' }, $unset: { purchaseDate: '' } });
      expect((await summaryEntry(ann, YEAR)).spent).toBe(0);
      expect((await summaryEntry(ann, YEAR + 1)).spent).toBe(0);
    });

    it('row 8: moving a purchased gift to another recipient moves the spend', async () => {
      const ann = await insertRecipient();
      const bob = await insertRecipient({ firstName: 'Bob' });
      await insertBudget(ann);
      await insertBudget(bob);
      const gift = await purchase(ann, 25, '2031-09-09T12:00:00Z');
      await Gift.collection.updateOne({ _id: gift._id }, { $set: { recipient: bob._id } });
      expect((await summaryEntry(ann)).spent).toBe(0);
      expect((await summaryEntry(bob)).spent).toBe(25);
    });
  });

  describe('figures', () => {
    it('ignores a stale stored spentAmount and other legacy bookkeeping (legacy documents)', async () => {
      const ann = await insertRecipient();
      await insertOverall({ allocatedAmount: 12345, remainingAmount: 1 });
      await insertBudget(ann, {
        spentAmount: 999, remainingAmount: 5, budgetStatus: 'critical',
        lastAnalysis: { date: new Date(), spentPercentage: 999, monthlySpending: [{ month: 0, amount: 999 }] }
      });
      await purchase(ann, 10, '2031-02-02T12:00:00Z', { budget: oid(), budgetStatus: 'over_budget' });

      const summary = await moneyService.getYearSummary(user, YEAR);
      expect(summary.recipients[0]).toMatchObject({ spent: 10, left: 90, status: 'within' });
      expect(summary.overall).toMatchObject({ allocated: 100, unallocated: 900, spent: 10, leftToSpend: 990 });
      expect((await moneyService.getMonthlySpend(user, YEAR))[0]).toBe(0);
    });

    it('shows overspending as negative Left, Unallocated and Left to spend (never clamped)', async () => {
      const ann = await insertRecipient();
      const bob = await insertRecipient({ firstName: 'Bob' });
      await insertOverall({ amount: 50 });
      await insertBudget(ann, { maximumAmount: 50 });
      await insertBudget(bob, { maximumAmount: 30 });
      await purchase(ann, 65, '2031-03-03T12:00:00Z');

      const summary = await moneyService.getYearSummary(user, YEAR);
      const annEntry = summary.recipients.find((r) => r.recipientId === String(ann._id));
      expect(annEntry.left).toBe(-15);
      expect(annEntry.status).toBe('over');
      expect(summary.overall.allocated).toBe(80);
      expect(summary.overall.unallocated).toBe(-30);
      expect(summary.overall.leftToSpend).toBe(-15);
    });

    it('counts purchases without a budget, and for system accounts, in overall Spent', async () => {
      const ann = await insertRecipient();
      const bob = await insertRecipient({ firstName: 'Bob' });
      const system = await insertRecipient({ firstName: 'Gifty', lastName: 'Holidays', isSystemAccount: true });
      await insertOverall();
      await insertBudget(ann);
      await purchase(ann, 10, '2031-01-10T12:00:00Z');
      await purchase(bob, 20, '2031-01-11T12:00:00Z');
      await purchase(system, 5, '2031-01-12T12:00:00Z');

      const summary = await moneyService.getYearSummary(user, YEAR);
      expect(summary.overall.spent).toBe(35);
      expect(summary.unbudgetedSpent).toBe(25);
      expect(summary.recipients.map((r) => r.name)).toEqual(['Ann Lee', 'Bob Lee']);
      const bobEntry = summary.recipients.find((r) => r.recipientId === String(bob._id));
      expect(bobEntry).toEqual({
        recipientId: String(bob._id), name: 'Bob Lee', archived: false,
        budget: { exists: false, type: null, limit: null, isLimited: false, percentage: null },
        spent: 20, left: null, status: 'no_budget'
      });
    });

    it('reports an unlimited recipient budget as unlimited and leaves it out of Allocated', async () => {
      const ann = await insertRecipient();
      await insertOverall();
      await insertBudget(ann, { isLimited: false });
      await purchase(ann, 500, '2031-04-04T12:00:00Z');
      const summary = await moneyService.getYearSummary(user, YEAR);
      expect(summary.recipients[0]).toMatchObject({ spent: 500, left: null, status: 'unlimited' });
      expect(summary.recipients[0].budget.limit).toBeNull();
      expect(summary.overall.allocated).toBe(0);
    });

    it('excludes non-purchased gifts even when they carry a pre-filled purchaseDate', async () => {
      const ann = await insertRecipient();
      await insertGift(ann, { price: 99, status: 'saved', purchaseDate: new Date('2031-05-05T00:00:00Z') });
      await insertGift(ann, { price: 99, status: 'suggestion', purchaseDate: new Date('2031-05-05T00:00:00Z') });
      expect((await moneyService.getYearSummary(user, YEAR)).overall.spent).toBe(0);
    });

    it("excludes other users' purchases", async () => {
      const ann = await insertRecipient();
      await Gift.collection.insertOne({
        _id: oid(), user: oid(), recipient: ann._id, event: oid(), name: 'Theirs',
        price: 77, status: 'purchased', purchaseDate: new Date('2031-05-05T12:00:00Z')
      });
      expect((await moneyService.getYearSummary(user, YEAR)).overall.spent).toBe(0);
    });

    it("uses the user's warning threshold (default 80%)", async () => {
      const ann = await insertRecipient();
      await insertBudget(ann, { maximumAmount: 100 });
      await purchase(ann, 50, '2031-06-06T12:00:00Z');
      expect((await summaryEntry(ann)).status).toBe('within');

      await UserPreferences.collection.insertOne({ user, alertThresholds: { warning: 50, critical: 95 } });
      expect((await summaryEntry(ann)).status).toBe('warning');

      await UserPreferences.collection.deleteMany({ user });
      await purchase(ann, 30, '2031-06-07T12:00:00Z');
      expect((await summaryEntry(ann)).status).toBe('warning');
    });

    it('sums in cents (0.1 + 0.2 = 0.3)', async () => {
      const ann = await insertRecipient();
      await purchase(ann, 0.1, '2031-02-01T12:00:00Z');
      await purchase(ann, 0.2, '2031-02-02T12:00:00Z');
      expect((await moneyService.getYearSummary(user, YEAR)).overall.spent).toBe(0.3);
    });
  });

  describe('Review Focus', () => {
    it('year boundary in a non-UTC TZ: Dec 31 23:30 in New York counts in December of that year', async () => {
      process.env.TZ = 'America/New_York';
      const ann = await insertRecipient();
      await purchase(ann, 7, '2032-01-01T04:30:00Z');
      expect((await moneyService.getYearSummary(user, YEAR)).overall.spent).toBe(7);
      expect((await moneyService.getMonthlySpend(user, YEAR))[11]).toBe(7);
      expect((await moneyService.getYearSummary(user, YEAR + 1)).overall.spent).toBe(0);
      expect(await moneyService.getRecipientSpend(user, ann._id)).toEqual({ total: 7, byYear: { 2031: 7 } });
    });

    it('year boundary in a positive-offset TZ: Jan 1 00:30 in Auckland counts in January of the next year', async () => {
      process.env.TZ = 'Pacific/Auckland';
      const ann = await insertRecipient();
      await purchase(ann, 9, '2031-12-31T11:30:00Z');
      expect((await moneyService.getYearSummary(user, YEAR)).overall.spent).toBe(0);
      expect((await moneyService.getYearSummary(user, YEAR + 1)).overall.spent).toBe(9);
      expect((await moneyService.getMonthlySpend(user, YEAR + 1))[0]).toBe(9);
    });

    it('a percentage budget with no overall budget is unlimited and not allocated', async () => {
      const ann = await insertRecipient();
      await insertBudget(ann, { allocationType: 'percentage', percentageAllocation: 25 });
      await purchase(ann, 12, '2031-03-03T12:00:00Z');
      const summary = await moneyService.getYearSummary(user, YEAR);
      expect(summary.recipients[0]).toMatchObject({ spent: 12, left: null, status: 'unlimited' });
      expect(summary.recipients[0].budget).toEqual({
        exists: true, type: 'percentage', limit: null, isLimited: true, percentage: 25
      });
      expect(summary.overall).toEqual({
        exists: false, amount: null, isLimited: false, allocated: 0,
        unallocated: null, spent: 12, leftToSpend: null
      });
    });

    it('a percentage budget under an unlimited overall budget is unlimited', async () => {
      const ann = await insertRecipient();
      await insertOverall({ isLimited: false, amount: 1000 });
      await insertBudget(ann, { allocationType: 'percentage', percentageAllocation: 25 });
      const summary = await moneyService.getYearSummary(user, YEAR);
      expect(summary.recipients[0].status).toBe('unlimited');
      expect(summary.overall).toMatchObject({ exists: true, isLimited: false, amount: null, unallocated: null });
    });

    it('a user with zero purchases and zero budgets gets zeros, not nulls or NaN', async () => {
      const ann = await insertRecipient();
      const summary = await moneyService.getYearSummary(user, YEAR);
      expect(summary).toEqual({
        year: YEAR,
        currency: 'USD',
        overall: {
          exists: false, amount: null, isLimited: false, allocated: 0,
          unallocated: null, spent: 0, leftToSpend: null
        },
        recipients: [{
          recipientId: String(ann._id), name: 'Ann Lee', archived: false,
          budget: { exists: false, type: null, limit: null, isLimited: false, percentage: null },
          spent: 0, left: null, status: 'no_budget'
        }],
        unbudgetedSpent: 0
      });
      expect(await moneyService.getMonthlySpend(user, YEAR)).toEqual(Array(12).fill(0));
      expect(await moneyService.getRecipientSpend(user, ann._id)).toEqual({ total: 0, byYear: {} });
    });
  });

  describe('getMonthlySpend', () => {
    it('sums each month of the year', async () => {
      const ann = await insertRecipient();
      await purchase(ann, 10, '2031-01-05T12:00:00Z');
      await purchase(ann, 5.5, '2031-01-20T12:00:00Z');
      await purchase(ann, 20, '2031-03-15T12:00:00Z');
      await purchase(ann, 1, '2031-12-31T12:00:00Z');
      await purchase(ann, 100, '2030-12-31T12:00:00Z');
      expect(await moneyService.getMonthlySpend(user, YEAR)).toEqual([15.5, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    });
  });

  describe('getRecipientSpend', () => {
    it('returns every year, or one year, and skips purchases without a date', async () => {
      const ann = await insertRecipient();
      await purchase(ann, 10, '2030-06-01T12:00:00Z');
      await purchase(ann, 20, '2031-06-01T12:00:00Z');
      await purchase(ann, 5.25, '2031-07-01T12:00:00Z');
      await insertGift(ann, { price: 99, status: 'purchased' }); // legacy: no purchaseDate

      expect(await moneyService.getRecipientSpend(user, ann._id)).toEqual({
        total: 35.25, byYear: { 2030: 10, 2031: 25.25 }
      });
      expect(await moneyService.getRecipientSpend(user, String(ann._id), { year: 2031 })).toEqual({
        total: 25.25, byYear: { 2031: 25.25 }
      });
    });
  });

  describe('checkPurchase', () => {
    it("returns null for another user's gift or a malformed id", async () => {
      const ann = await insertRecipient();
      const theirs = { _id: oid(), user: oid(), recipient: ann._id, event: oid(), name: 'X', price: 5, status: 'saved' };
      await Gift.collection.insertOne(theirs);
      expect(await moneyService.checkPurchase(user, theirs._id)).toBeNull();
      expect(await moneyService.checkPurchase(user, 'not-an-id')).toBeNull();
    });

    it('reports no budget for a recipient without one', async () => {
      const ann = await insertRecipient();
      expect(await moneyService.checkPurchase(user, { recipientId: ann._id, price: 10 })).toEqual({
        status: 'no_budget', left: null, wouldExceedBy: 0, currency: 'USD'
      });
    });

    it('reports how far a purchase would go over, in the overall budget currency', async () => {
      const ann = await insertRecipient();
      await insertOverall({ currency: 'EUR' });
      await insertBudget(ann, { maximumAmount: 50 });
      await purchase(ann, 45, '2031-05-01T12:00:00Z');
      expect(await moneyService.checkPurchase(user, {
        recipientId: String(ann._id), price: 10, date: '2031-05-02T12:00:00Z'
      })).toEqual({ status: 'over', left: -5, wouldExceedBy: 5, currency: 'EUR' });
    });

    it("checks a not-yet-purchased gift against the current year's budget", async () => {
      const thisYear = new Date().getUTCFullYear(); // TZ is UTC in these tests
      const ann = await insertRecipient();
      await insertBudget(ann, { year: thisYear, maximumAmount: 20 });
      await purchase(ann, 15, new Date().toISOString());
      const gift = await insertGift(ann, { price: 10, status: 'saved' });
      expect(await moneyService.checkPurchase(user, gift._id)).toEqual({
        status: 'over', left: -5, wouldExceedBy: 5, currency: 'USD'
      });
    });
  });
});
