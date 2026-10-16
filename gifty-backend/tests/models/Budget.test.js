// Budget models hold configuration only (spec: Data model changes).
const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');
const { Budget, OverallBudget, UserPreferences } = require('../../models/Budget');

const MONGO_URI = `mongodb://localhost:27017/gifty-test-budget-model-${process.pid}`;
const oid = () => new mongoose.Types.ObjectId();
const fixed = (extra = {}) => ({
  user: oid(), recipient: oid(), year: 2031, minimumAmount: 0, maximumAmount: 100, ...extra
});

describe('Budget models', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(MONGO_URI);
    await Promise.all([Budget.init(), OverallBudget.init(), UserPreferences.init()]);
  });

  beforeEach(async () => {
    await Promise.all([Budget, OverallBudget, UserPreferences].map((Model) => Model.deleteMany({})));
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  describe('Budget', () => {
    it('creates a fixed budget with defaults and no stored money figures', async () => {
      const budget = await Budget.create(fixed());
      const raw = await Budget.collection.findOne({ _id: budget._id });
      expect(raw).toMatchObject({ allocationType: 'fixed', minimumAmount: 0, maximumAmount: 100, isLimited: true, isActive: true });
      ['spentAmount', 'remainingAmount', 'budgetStatus', 'lastAnalysis', 'currency'].forEach((field) => {
        expect(raw).not.toHaveProperty(field);
      });
      expect(budget.updateSpentAmount).toBeUndefined();
    });

    it('ignores legacy bookkeeping fields passed to create', async () => {
      const budget = await Budget.create(fixed({ spentAmount: 50, remainingAmount: 50, budgetStatus: 'warning' }));
      const raw = await Budget.collection.findOne({ _id: budget._id });
      expect(raw.spentAmount).toBeUndefined();
      expect(raw.budgetStatus).toBeUndefined();
    });

    it('rounds amounts to cents', async () => {
      const budget = await Budget.create(fixed({ minimumAmount: 0.105, maximumAmount: 99.999 }));
      expect(budget.minimumAmount).toBe(0.11);
      expect(budget.maximumAmount).toBe(100);
    });

    it('requires maximumAmount for a fixed budget only', async () => {
      await expect(Budget.create(fixed({ maximumAmount: undefined }))).rejects.toThrow(/Maximum amount is required/);
      const percentage = await Budget.create(fixed({
        allocationType: 'percentage', percentageAllocation: 10, maximumAmount: undefined
      }));
      expect(percentage.maximumAmount).toBeUndefined();
    });

    it('requires percentageAllocation for a percentage budget', async () => {
      await expect(Budget.create(fixed({ allocationType: 'percentage', maximumAmount: undefined })))
        .rejects.toThrow(/Percentage allocation is required/);
    });

    it('rejects a minimum above the maximum and an end before the start, as validation errors', async () => {
      await expect(Budget.create(fixed({ minimumAmount: 200 }))).rejects.toMatchObject({ name: 'ValidationError' });
      await expect(Budget.create(fixed({ startDate: new Date('2031-05-01'), endDate: new Date('2031-01-01') })))
        .rejects.toMatchObject({ name: 'ValidationError' });
    });

    it('rejects negative amounts', async () => {
      await expect(Budget.create(fixed({ maximumAmount: -1 }))).rejects.toThrow(/Amount cannot be negative/);
    });

    it('is unique per user, recipient and year', async () => {
      const data = fixed();
      await Budget.create(data);
      await expect(Budget.create({ ...data })).rejects.toMatchObject({ code: 11000 });
    });

    it('becomes unlimited when the user turned the budget feature off', async () => {
      const user = oid();
      await UserPreferences.create({ user, useBudgetFeature: false });
      const budget = await Budget.create(fixed({ user }));
      expect(budget.isLimited).toBe(false);
    });
  });

  describe('OverallBudget', () => {
    it('stores configuration only', async () => {
      const overall = await OverallBudget.create({ user: oid(), year: 2031, amount: 1000.005 });
      const raw = await OverallBudget.collection.findOne({ _id: overall._id });
      expect(raw).toMatchObject({ amount: 1000.01, isLimited: true, currency: 'USD' });
      expect(raw).not.toHaveProperty('allocatedAmount');
      expect(raw).not.toHaveProperty('remainingAmount');
      expect(overall.recalculateAllocatedAmount).toBeUndefined();
      expect(overall.updateAllocations).toBeUndefined();
    });

    it('requires an amount only when limited', async () => {
      await expect(OverallBudget.create({ user: oid(), year: 2031 })).rejects.toMatchObject({ name: 'ValidationError' });
      const unlimited = await OverallBudget.create({ user: oid(), year: 2031, isLimited: false });
      expect(unlimited.amount).toBeUndefined();
    });

    it('is unique per user and year', async () => {
      const user = oid();
      await OverallBudget.create({ user, year: 2031, amount: 1 });
      await expect(OverallBudget.create({ user, year: 2031, amount: 2 })).rejects.toMatchObject({ code: 11000 });
    });
  });

  describe('UserPreferences', () => {
    it('defaults the alert thresholds to 80/95', async () => {
      const prefs = await UserPreferences.create({ user: oid() });
      expect(prefs.alertThresholds.warning).toBe(80);
      expect(prefs.alertThresholds.critical).toBe(95);
      expect(prefs.useBudgetFeature).toBe(true);
    });

    it('rejects thresholds outside 0-100', async () => {
      await expect(UserPreferences.create({ user: oid(), alertThresholds: { warning: 150 } }))
        .rejects.toMatchObject({ name: 'ValidationError' });
    });
  });
});
