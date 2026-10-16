// Cross-user authorization tests for the budget API, against the real test
// MongoDB, the real budget router and the real JWT `protect` middleware.
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const { teardownTestDB } = require('../utils/testSetup');
const { generateToken } = require('../../utils/generateToken');
const budgetRoutes = require('../../routes/budgetRoutes');
const errorHandler = require('../../middleware/errorHandler');
const User = require('../../models/User');
const Recipient = require('../../models/Recipient');
require('../../models/Gift'); // read by moneyService
const { Budget, OverallBudget, UserPreferences } = require('../../models/Budget');

const YEAR = 2031;
const OTHER_YEAR = 2032;

describe('Budget API cross-user authorization', () => {
  let app;
  let userA;
  let userB;
  let tokenA;
  let recipientA;
  let recipientB;
  const runId = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

  const asA = (req) => req.set('Authorization', `Bearer ${tokenA}`);

  const cleanup = async () => {
    const ids = [userA?._id, userB?._id].filter(Boolean);
    if (!ids.length) return;
    await Promise.all([
      Budget.deleteMany({ user: { $in: ids } }),
      OverallBudget.deleteMany({ user: { $in: ids } }),
      UserPreferences.deleteMany({ user: { $in: ids } }),
      Recipient.deleteMany({ user: { $in: ids } })
    ]);
  };

  beforeAll(async () => {
    // A private database: other suites share gifty-test and clear it between
    // tests, which would delete these users mid-run when suites overlap.
    // teardownTestDB drops whichever database the connection points at.
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(`mongodb://localhost:27017/gifty-test-budgets-security-${process.pid}`);

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/budgets', budgetRoutes);
    app.use(errorHandler);

    [userA, userB] = await User.create([
      { username: `budget-a-${runId}`, email: `budget-a-${runId}@example.com`, password: 'Passw0rd!x', firstName: 'Alice', lastName: 'A' },
      { username: `budget-b-${runId}`, email: `budget-b-${runId}@example.com`, password: 'Passw0rd!x', firstName: 'Bob', lastName: 'B' }
    ]);
    tokenA = generateToken(userA._id.toString());
  });

  beforeEach(async () => {
    await cleanup();
    // insertMany skips the post-save birthday-event hook but still validates
    [recipientA, recipientB] = await Recipient.insertMany([
      { user: userA._id, firstName: 'Ann', lastName: 'Recipient', relation: 'friend', birthdate: new Date('1990-01-01') },
      { user: userB._id, firstName: 'Ben', lastName: 'Recipient', relation: 'friend', birthdate: new Date('1990-01-01') }
    ]);
    await Budget.create([
      { user: userA._id, recipient: recipientA._id, year: YEAR, minimumAmount: 10, maximumAmount: 200, spentAmount: 50, isLimited: false },
      { user: userB._id, recipient: recipientB._id, year: YEAR, minimumAmount: 20, maximumAmount: 300, spentAmount: 120, isLimited: false, notes: 'B private' }
    ]);
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  describe('reading a recipient budget', () => {
    it("A cannot probe B's recipient via GET /recipient/:id/:year (404)", async () => {
      const res = await asA(request(app).get(`/api/budgets/recipient/${recipientB._id}/${YEAR}`));
      expect(res.status).toBe(404);
    });

    it('invalid recipient id is a 404, not a 500', async () => {
      const res = await asA(request(app).get(`/api/budgets/recipient/not-an-id/${YEAR}`));
      expect(res.status).toBe(404);
    });
  });

  describe('creating a recipient budget (POST)', () => {
    it("A cannot create a budget for B's recipient, and B's giftStatus is unchanged", async () => {
      const res = await asA(request(app).post('/api/budgets/recipient')).send({
        recipientId: recipientB._id.toString(),
        year: OTHER_YEAR,
        minimumAmount: 1,
        maximumAmount: 5,
        isLimited: false,
        isActive: true
      });
      expect(res.status).toBe(404);
      const fresh = await Recipient.findById(recipientB._id).lean();
      expect(fresh.giftStatus).toBe('inactive');
      expect(await Budget.countDocuments({ recipient: recipientB._id, year: OTHER_YEAR })).toBe(0);
    });

    it('client-supplied spentAmount/remainingAmount/budgetStatus/user are ignored', async () => {
      const res = await asA(request(app).post('/api/budgets/recipient')).send({
        recipientId: recipientA._id.toString(),
        year: OTHER_YEAR,
        minimumAmount: 10,
        maximumAmount: 100,
        isLimited: false,
        spentAmount: 999,
        remainingAmount: 12345,
        budgetStatus: 'critical',
        user: userB._id.toString()
      });
      expect(res.status).toBe(201);
      const stored = await Budget.findOne({ recipient: recipientA._id, year: OTHER_YEAR }).lean();
      expect(stored.spentAmount).toBeUndefined();
      expect(stored.budgetStatus).toBeUndefined();
      expect(stored.user.toString()).toBe(userA._id.toString());
      expect(stored.remainingAmount).toBeUndefined();
      expect(res.body.spent).toBe(0);
    });

    it('invalid recipient id is a 404, not a 500', async () => {
      const res = await asA(request(app).post('/api/budgets/recipient')).send({
        recipientId: 'not-an-id', year: OTHER_YEAR, minimumAmount: 1, maximumAmount: 5, isLimited: false
      });
      expect(res.status).toBe(404);
    });

    it('missing minimumAmount/maximumAmount is a 400 with a clear message', async () => {
      const res = await asA(request(app).post('/api/budgets/recipient')).send({
        recipientId: recipientA._id.toString(), year: OTHER_YEAR, isLimited: false
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/minimumAmount and maximumAmount/);
    });
  });

  describe('updating a recipient budget (PUT)', () => {
    it("A cannot update B's recipient budget, and B's data is unchanged", async () => {
      const res = await asA(request(app).put(`/api/budgets/recipient/${recipientB._id}/${YEAR}`)).send({
        minimumAmount: 0,
        maximumAmount: 1,
        isLimited: false,
        isActive: true,
        spentAmount: 999
      });
      expect(res.status).toBe(404);
      const fresh = await Recipient.findById(recipientB._id).lean();
      expect(fresh.giftStatus).toBe('inactive');
      const bBudget = await Budget.findOne({ recipient: recipientB._id, year: YEAR }).lean();
      expect(bBudget.maximumAmount).toBe(300);
    });

    it("A's own budget row pointing at B's recipient cannot be used to touch B's recipient", async () => {
      // A row like this could be created through the old unscoped POST
      await Budget.create({ user: userA._id, recipient: recipientB._id, year: OTHER_YEAR, minimumAmount: 0, maximumAmount: 10, isLimited: false });
      const res = await asA(request(app).put(`/api/budgets/recipient/${recipientB._id}/${OTHER_YEAR}`)).send({
        minimumAmount: 0,
        maximumAmount: 20,
        isLimited: false,
        isActive: true
      });
      expect(res.status).toBe(404);
      const fresh = await Recipient.findById(recipientB._id).lean();
      expect(fresh.giftStatus).toBe('inactive');
    });

    it('client-supplied spentAmount does not change spent', async () => {
      // isLimited budgets require an overall budget for the year
      await OverallBudget.create({ user: userA._id, year: YEAR, amount: 1000, isLimited: true });
      const res = await asA(request(app).put(`/api/budgets/recipient/${recipientA._id}/${YEAR}`)).send({
        minimumAmount: 10,
        maximumAmount: 250,
        isLimited: true,
        spentAmount: 999,
        budgetStatus: 'critical',
        remainingAmount: 12345
      });
      expect(res.status).toBe(200);
      const stored = await Budget.findOne({ recipient: recipientA._id, year: YEAR }).lean();
      expect(stored.spentAmount).toBeUndefined();
      expect(stored.maximumAmount).toBe(250);
      expect(stored.remainingAmount).toBeUndefined();
      expect(stored.budgetStatus).toBeUndefined();
      expect(res.body).toMatchObject({ spent: 0, left: 250, status: 'within' });
    });

    it('invalid recipient id is a 404, not a 500', async () => {
      const res = await asA(request(app).put(`/api/budgets/recipient/not-an-id/${YEAR}`)).send({
        minimumAmount: 1, maximumAmount: 5, isLimited: false
      });
      expect(res.status).toBe(404);
    });

    it('missing minimumAmount/maximumAmount is a 400 with a clear message', async () => {
      const res = await asA(request(app).put(`/api/budgets/recipient/${recipientA._id}/${YEAR}`)).send({
        isLimited: false
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/minimumAmount and maximumAmount/);
    });
  });

  describe('overall budget routes are scoped to the caller', () => {
    beforeEach(async () => {
      await OverallBudget.create({ user: userB._id, year: OTHER_YEAR, amount: 5000, isLimited: true, notes: 'B overall' });
    });

    it("A's GET /overall/:year does not return B's overall budget", async () => {
      const res = await asA(request(app).get(`/api/budgets/overall/${OTHER_YEAR}`));
      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(false);
      expect(res.body.amount).toBeNull();
      expect(res.body.notes).not.toBe('B overall');
    });

    it("A's POST /overall for the same year creates A's own, leaving B's untouched", async () => {
      const res = await asA(request(app).post('/api/budgets/overall')).send({
        year: OTHER_YEAR, amount: 100, isLimited: true, currency: 'USD', user: userB._id.toString()
      });
      expect(res.status).toBe(201);
      expect(res.body.exists).toBe(true);
      expect(await OverallBudget.exists({ user: userA._id, year: OTHER_YEAR })).toBeTruthy();
      const b = await OverallBudget.findOne({ user: userB._id, year: OTHER_YEAR }).lean();
      expect(b.amount).toBe(5000);
    });

    it("A's PUT /overall/:year does not modify B's overall budget", async () => {
      const res = await asA(request(app).put(`/api/budgets/overall/${OTHER_YEAR}`)).send({
        amount: 1, isLimited: true, currency: 'USD'
      });
      expect(res.status).toBe(200);
      const b = await OverallBudget.findOne({ user: userB._id, year: OTHER_YEAR }).lean();
      expect(b.amount).toBe(5000);
    });

    it("A's /all/:year and /analytics/:year never include B's data", async () => {
      const gifts = mongoose.connection.db.collection('gifts');
      await gifts.deleteMany({});
      await gifts.insertMany([
        { user: userA._id, recipient: recipientA._id, event: new mongoose.Types.ObjectId(), name: 'A gift',
          price: 50, status: 'purchased', purchaseDate: new Date(Date.UTC(YEAR, 5, 1, 12)) },
        { user: userB._id, recipient: recipientB._id, event: new mongoose.Types.ObjectId(), name: 'B gift',
          price: 120, status: 'purchased', purchaseDate: new Date(Date.UTC(YEAR, 5, 1, 12)) }
      ]);
      const all = await asA(request(app).get(`/api/budgets/all/${YEAR}`));
      expect(all.status).toBe(200);
      const ids = all.body.recipientBudgets.map((r) => r._id);
      expect(ids).toContain(recipientA._id.toString());
      expect(ids).not.toContain(recipientB._id.toString());
      expect(all.body.overallBudget.totalSpent).toBe(50);

      const analytics = await asA(request(app).get(`/api/budgets/analytics/${YEAR}`));
      expect(analytics.status).toBe(200);
      expect(analytics.body.totalBudgets).toBe(1);
      expect(analytics.body.totalSpent).toBe(50);
    });
  });
});
