// The budget API on the money service: real router, real JWT `protect`,
// real errorHandler, real MongoDB (isolated database).
process.env.TZ = 'UTC';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const { teardownTestDB } = require('../utils/testSetup');
const { generateToken } = require('../../utils/generateToken');
const budgetRoutes = require('../../routes/budgetRoutes');
const errorHandler = require('../../middleware/errorHandler');
const User = require('../../models/User');
const Recipient = require('../../models/Recipient');
const Gift = require('../../models/Gift');
require('../../models/Event');
const { Budget, OverallBudget } = require('../../models/Budget');

const MONGO_URI = `mongodb://localhost:27017/gifty-test-budgets-api-${process.pid}`;
const YEAR = 2031;
const oid = () => new mongoose.Types.ObjectId();

describe('Budget API on the money service', () => {
  let app;
  let user;
  let token;
  let ann;
  let bob;

  const as = (req) => req.set('Authorization', `Bearer ${token}`);
  const insertRecipient = async (firstName) => {
    const doc = {
      _id: oid(), user: user._id, firstName, lastName: 'Lee', relation: 'friend',
      relationship: 'friendship', birthdate: new Date('1990-01-01'), tags: []
    };
    await Recipient.collection.insertOne(doc);
    return doc;
  };
  const purchase = (recipient, price, iso) => Gift.collection.insertOne({
    _id: oid(), user: user._id, recipient: recipient._id, event: oid(), name: 'Gift',
    price, status: 'purchased', purchaseDate: new Date(iso)
  });
  const putOverall = (amount, extra = {}) => as(request(app).put(`/api/budgets/overall/${YEAR}`))
    .send({ amount, isLimited: true, currency: 'USD', ...extra });

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(MONGO_URI);
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/budgets', budgetRoutes);
    app.use(errorHandler);
  });

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
    user = await User.create({
      username: `money-${Date.now()}`, email: `money-${Date.now()}@example.com`,
      password: 'Passw0rd!x', firstName: 'Mo', lastName: 'Ney'
    });
    token = generateToken(user._id.toString());
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  it('a brand-new user gets zeros and exists:false, never 404 or NaN (Review Focus 5)', async () => {
    const all = await as(request(app).get(`/api/budgets/all/${YEAR}`));
    expect(all.status).toBe(200);
    expect(all.body).toEqual({
      year: YEAR,
      currency: 'USD',
      overallBudget: {
        exists: false, year: YEAR, amount: null, isLimited: false, currency: 'USD', notes: '',
        allocated: 0, unallocated: null, spent: 0, leftToSpend: null,
        allocatedAmount: 0, totalAllocated: 0, remainingAmount: null, totalSpent: 0, unspentAmount: null
      },
      recipientBudgets: [],
      unbudgetedSpent: 0,
      budgetStatuses: { within: 0, warning: 0, over: 0, unlimited: 0, no_budget: 0 }
    });

    const analytics = await as(request(app).get(`/api/budgets/analytics/${YEAR}`));
    expect(analytics.body).toEqual({
      year: YEAR, currency: 'USD', totalBudgets: 0, totalSpent: 0,
      monthlySpending: Array(12).fill(0),
      budgetStatuses: { within: 0, warning: 0, over: 0, unlimited: 0, no_budget: 0 }
    });

    const overall = await as(request(app).get(`/api/budgets/overall/${YEAR}`));
    expect(overall.status).toBe(200);
    expect(overall.body.exists).toBe(false);
    expect(overall.body.amount).toBeNull();

    ann = await insertRecipient('Ann');
    const recipient = await as(request(app).get(`/api/budgets/recipient/${ann._id}/${YEAR}`));
    expect(recipient.status).toBe(200);
    expect(recipient.body).toMatchObject({
      exists: false, limit: null, spent: 0, left: null, status: 'no_budget', budgetStatus: 'no_budget'
    });
    expect(recipient.body).not.toHaveProperty('_id');
  });

  it('GET /all keeps the legacy names with new values and never echoes a stored spentAmount (Review Focus 2)', async () => {
    ann = await insertRecipient('Ann');
    await OverallBudget.collection.insertOne({
      _id: oid(), user: user._id, year: YEAR, amount: 1000, isLimited: true, currency: 'USD',
      allocatedAmount: 999, remainingAmount: 1
    });
    await Budget.collection.insertOne({
      _id: oid(), user: user._id, recipient: ann._id, year: YEAR, allocationType: 'fixed',
      minimumAmount: 0, maximumAmount: 200, isLimited: true,
      spentAmount: 999, remainingAmount: 5, budgetStatus: 'critical'
    });
    await purchase(ann, 50, '2031-04-01T12:00:00Z');

    const res = await as(request(app).get(`/api/budgets/all/${YEAR}`));
    expect(res.status).toBe(200);
    expect(res.body.overallBudget).toMatchObject({
      exists: true, amount: 1000, allocated: 200, unallocated: 800, spent: 50, leftToSpend: 950,
      allocatedAmount: 200, totalAllocated: 200, remainingAmount: 800, totalSpent: 50, unspentAmount: 950
    });
    expect(res.body.recipientBudgets[0]).toMatchObject({
      _id: String(ann._id), firstName: 'Ann', spent: 50, left: 150, status: 'within', limit: 200
    });
    expect(res.body.recipientBudgets[0].budget).toMatchObject({
      exists: true, type: 'fixed', allocationType: 'fixed', maximumAmount: 200, limit: 200,
      currency: 'USD', spentAmount: 50, remainingAmount: 150, budgetStatus: 'within'
    });
    expect(res.body.budgetStatuses).toEqual({ within: 1, warning: 0, over: 0, unlimited: 0, no_budget: 0 });
  });

  it('row 9: a client-sent spentAmount is ignored on POST and PUT', async () => {
    ann = await insertRecipient('Ann');
    await putOverall(1000);
    const created = await as(request(app).post('/api/budgets/recipient')).send({
      recipientId: String(ann._id), year: YEAR, minimumAmount: 0, maximumAmount: 100,
      isLimited: true, spentAmount: 999, remainingAmount: 1, budgetStatus: 'critical', currency: 'EUR'
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ exists: true, spent: 0, left: 100, status: 'within', currency: 'USD' });
    let stored = await Budget.collection.findOne({ recipient: ann._id, year: YEAR });
    expect(stored.spentAmount).toBeUndefined();
    expect(stored.remainingAmount).toBeUndefined();
    expect(stored.budgetStatus).toBeUndefined();
    expect(stored.currency).toBeUndefined();

    const updated = await as(request(app).put(`/api/budgets/recipient/${ann._id}/${YEAR}`)).send({
      minimumAmount: 0, maximumAmount: 120, isLimited: true, spentAmount: 999
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ spent: 0, left: 120 });
    stored = await Budget.collection.findOne({ recipient: ann._id, year: YEAR });
    expect(stored.spentAmount).toBeUndefined();
    expect(stored.maximumAmount).toBe(120);
  });

  it('rejects a percentage budget of 0 or less with a clear 400, on create and update', async () => {
    ann = await insertRecipient('Ann');
    await putOverall(1000);
    for (const bad of [0, -5, '0']) {
      const res = await as(request(app).post('/api/budgets/recipient')).send({
        recipientId: String(ann._id), year: YEAR, allocationType: 'percentage', percentageAllocation: bad, isLimited: true
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/greater than 0/);
    }
    expect(await Budget.collection.findOne({ recipient: ann._id })).toBeNull();

    const ok = await as(request(app).post('/api/budgets/recipient')).send({
      recipientId: String(ann._id), year: YEAR, allocationType: 'percentage', percentageAllocation: 10, isLimited: true
    });
    expect(ok.status).toBe(201);
    const upd = await as(request(app).put(`/api/budgets/recipient/${ann._id}/${YEAR}`)).send({
      allocationType: 'percentage', percentageAllocation: 0, isLimited: true
    });
    expect(upd.status).toBe(400);
    expect(upd.body.message).toMatch(/greater than 0/);
  });

  it('row 3: a percentage budget sends no maximum and its limit follows the overall amount', async () => {
    ann = await insertRecipient('Ann');
    await putOverall(1000);
    const created = await as(request(app).post('/api/budgets/recipient')).send({
      recipientId: String(ann._id), year: YEAR, allocationType: 'percentage', percentageAllocation: 10,
      maximumAmount: 999, isLimited: true
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ type: 'percentage', limit: 100, maximumAmount: null, percentageAllocation: 10 });
    expect((await Budget.collection.findOne({ recipient: ann._id })).maximumAmount).toBeUndefined();

    await purchase(ann, 40, '2031-02-02T12:00:00Z');
    expect((await putOverall(2000)).status).toBe(200);
    const res = await as(request(app).get(`/api/budgets/recipient/${ann._id}/${YEAR}`));
    expect(res.body).toMatchObject({ limit: 200, spent: 40, left: 160, status: 'within' });
  });

  it('the overall allocation guard uses the new amount and the same Limit formula', async () => {
    ann = await insertRecipient('Ann');
    bob = await insertRecipient('Bob');
    await putOverall(1000);
    await as(request(app).post('/api/budgets/recipient')).send({
      recipientId: String(ann._id), year: YEAR, minimumAmount: 0, maximumAmount: 600, isLimited: true
    });
    await as(request(app).post('/api/budgets/recipient')).send({
      recipientId: String(bob._id), year: YEAR, allocationType: 'percentage', percentageAllocation: 30, isLimited: true
    });

    // 600 + 30% of 800 = 840 > 800
    const tooLow = await putOverall(800);
    expect(tooLow.status).toBe(400);
    expect(tooLow.body).toEqual({ message: 'Overall budget cannot be less than total allocated amount', totalAllocated: 840 });

    // 600 + 30% of 870 = 861 ≤ 870 (the old check compared 870 with 900 at the old amount and refused)
    const ok = await putOverall(870);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ amount: 870, allocated: 861, unallocated: 9 });
  });

  it('the recipient allocation guard counts the new budget against the others', async () => {
    ann = await insertRecipient('Ann');
    bob = await insertRecipient('Bob');
    await putOverall(1000);
    await as(request(app).post('/api/budgets/recipient')).send({
      recipientId: String(ann._id), year: YEAR, minimumAmount: 0, maximumAmount: 600, isLimited: true
    });

    // isLimited omitted → limited (R12), so the guard applies
    const tooMuch = await as(request(app).post('/api/budgets/recipient')).send({
      recipientId: String(bob._id), year: YEAR, minimumAmount: 0, maximumAmount: 500
    });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body).toEqual({ message: 'Total allocated amount would exceed overall budget', availableAmount: 400 });

    // Raising Ann's own budget replaces her old allocation instead of adding to it
    const raised = await as(request(app).put(`/api/budgets/recipient/${ann._id}/${YEAR}`)).send({
      minimumAmount: 0, maximumAmount: 1000, isLimited: true
    });
    expect(raised.status).toBe(200);
    expect(raised.body.limit).toBe(1000);
  });

  it('a PUT that omits percentageAllocation keeps the stored percentage (profile-form save)', async () => {
    ann = await insertRecipient('Ann');
    await putOverall(1000);
    const created = await as(request(app).post('/api/budgets/recipient')).send({
      recipientId: String(ann._id), year: YEAR, allocationType: 'percentage', percentageAllocation: 10, isLimited: true
    });
    expect(created.status).toBe(201);

    // What EditRecipientProfileForm sends: min/max and isActive, no percentage
    const saved = await as(request(app).put(`/api/budgets/recipient/${ann._id}/${YEAR}`)).send({
      minimumAmount: 5, maximumAmount: 50, isActive: true
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      type: 'percentage', percentageAllocation: 10, limit: 100, maximumAmount: null, minimumAmount: 5
    });
    const stored = await Budget.collection.findOne({ recipient: ann._id, year: YEAR });
    expect(stored.percentageAllocation).toBe(10);
    expect(stored.maximumAmount).toBeUndefined();
  });

  it('a percentage budget without a limited overall budget never 500s (Review Focus 4)', async () => {
    ann = await insertRecipient('Ann');
    const noOverall = await as(request(app).post('/api/budgets/recipient')).send({
      recipientId: String(ann._id), year: YEAR, allocationType: 'percentage', percentageAllocation: 25, isLimited: true
    });
    expect(noOverall.status).toBe(400);
    expect(noOverall.body.message).toBe('Overall budget must be set first');

    await as(request(app).put(`/api/budgets/overall/${YEAR}`)).send({ isLimited: false, currency: 'USD' });
    const unlimitedOverall = await as(request(app).post('/api/budgets/recipient')).send({
      recipientId: String(ann._id), year: YEAR, allocationType: 'percentage', percentageAllocation: 25, isLimited: true
    });
    expect(unlimitedOverall.status).toBe(201);
    expect(unlimitedOverall.body).toMatchObject({ limit: null, left: null, status: 'unlimited' });

    const all = await as(request(app).get(`/api/budgets/all/${YEAR}`));
    expect(all.body.overallBudget).toMatchObject({ exists: true, isLimited: false, amount: null, allocated: 0 });
    expect(all.body.budgetStatuses.unlimited).toBe(1);
  });

  it('shows overspending unclamped and analytics from purchases', async () => {
    ann = await insertRecipient('Ann');
    await putOverall(50);
    await purchase(ann, 40, '2031-01-10T12:00:00Z');
    await purchase(ann, 25, '2031-03-10T12:00:00Z');

    const overall = await as(request(app).get(`/api/budgets/overall/${YEAR}`));
    expect(overall.body).toMatchObject({ spent: 65, leftToSpend: -15, unspentAmount: -15 });

    const analytics = await as(request(app).get(`/api/budgets/analytics/${YEAR}`));
    expect(analytics.body.totalSpent).toBe(65);
    expect(analytics.body.monthlySpending).toEqual([40, 0, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(analytics.body.budgetStatuses.no_budget).toBe(1);
  });

  it('rejects a malformed year with 400', async () => {
    expect((await as(request(app).get('/api/budgets/all/abc'))).status).toBe(400);
    expect((await as(request(app).get('/api/budgets/analytics/12'))).status).toBe(400);
  });

  it('rounds budget amounts to cents', async () => {
    const res = await putOverall(99.999);
    expect(res.body.amount).toBe(100);
  });
});
