// tests/security/feedback.security.test.js
// Cross-user authorization and money-safety tests for the feedback routes,
// run against the real test MongoDB with the real router and service. Only
// auth (a stub that trusts an x-test-user header) and the Redis-backed
// suggestion cache are stubbed.
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const { teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Isolated database: other suites clear the shared gifty-test DB mid-run
const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-feedback-sec-${process.pid}`;

jest.mock('../../middleware/authMiddleware', () => {
  const { Types } = require('mongoose');
  const protect = (req, res, next) => {
    const id = req.headers['x-test-user'];
    if (!id) return res.status(401).json({ message: 'Not authorized, no token' });
    req.user = { _id: new Types.ObjectId(id), id };
    next();
  };
  return { protect, admin: (req, res, next) => next() };
});
jest.mock('../../services/suggestionCacheService');
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const feedbackRoutes = require('../../routes/feedbackRoutes');
const errorHandler = require('../../middleware/errorHandler');
const Gift = require('../../models/Gift');
const Recipient = require('../../models/Recipient');
const FeedbackLog = require('../../models/FeedbackLog');
const { Budget } = require('../../models/Budget');
const suggestionCache = require('../../services/suggestionCacheService');

jest.setTimeout(30000);

const oid = () => new mongoose.Types.ObjectId();

const insertRecipient = async (user) => {
  const doc = {
    _id: oid(), user, firstName: 'R', lastName: 'X', relation: 'friend',
    relationship: 'friendship', birthdate: new Date('1990-01-01'), tags: []
  };
  await Recipient.collection.insertOne(doc);
  return doc;
};
const insertGift = async (user, recipient, extra = {}) => {
  const doc = {
    _id: oid(), user, recipient, event: oid(), name: 'Gift', price: 25,
    status: 'suggestion', budgetStatus: 'no_budget', favorite: false,
    isAISuggested: true, category: 'Books', tags: ['reading'], whereToBuy: [],
    ...extra
  };
  await Gift.collection.insertOne(doc);
  return doc;
};

describe('Feedback routes - cross-user authorization', () => {
  let app;
  let userA, userB, recA, recB;

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(TEST_DB_URI);
    app = express();
    app.use(express.json());
    app.use('/api/feedback', feedbackRoutes);
    app.use(errorHandler);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    suggestionCache.invalidateForRecipient.mockResolvedValue(undefined);
    userA = oid();
    userB = oid();
    recA = await insertRecipient(userA);
    recB = await insertRecipient(userB);
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  const postAsA = (body) => request(app).post('/api/feedback').set('x-test-user', String(userA)).send(body);

  describe('POST /api/feedback', () => {
    it("returns 404 for another user's gift and changes nothing", async () => {
      const giftB = await insertGift(userB, recB._id);
      const res = await postAsA({ giftId: String(giftB._id), action: 'ignored' });
      expect(res.status).toBe(404);
      const saved = await Gift.findById(giftB._id).lean();
      expect(saved.status).toBe('suggestion');
      expect(await FeedbackLog.countDocuments({})).toBe(0);
    });

    it('does not change the status of a purchased gift', async () => {
      const gift = await insertGift(userA, recA._id, { status: 'purchased', purchaseDate: new Date() });
      const res = await postAsA({ giftId: String(gift._id), action: 'ignored' });
      expect(res.status).toBe(200);
      const saved = await Gift.findById(gift._id).lean();
      expect(saved.status).toBe('purchased');
    });

    it("'purchased' feedback records the signal but does not mark the gift purchased (no budget bypass)", async () => {
      const budget = {
        _id: oid(), user: userA, recipient: recA._id, year: new Date().getFullYear(),
        isLimited: true, maximumAmount: 100, spentAmount: 0, remainingAmount: 100
      };
      await Budget.collection.insertOne(budget);
      const gift = await insertGift(userA, recA._id, { status: 'saved', budget: budget._id });
      const res = await postAsA({ giftId: String(gift._id), action: 'purchased', explicitRating: 5 });
      expect(res.status).toBe(200);
      const saved = await Gift.findById(gift._id).lean();
      expect(saved.status).toBe('saved');
      expect(saved.purchaseDate).toBeUndefined();
      expect(await FeedbackLog.countDocuments({ gift: gift._id, action: 'purchased' })).toBe(1);
    });

    it("'saved' feedback does not change a suggestion's status", async () => {
      const gift = await insertGift(userA, recA._id);
      const res = await postAsA({ giftId: String(gift._id), action: 'saved' });
      expect(res.status).toBe(200);
      expect((await Gift.findById(gift._id).lean()).status).toBe('suggestion');
    });

    it("'ignored' feedback still hides an unpurchased suggestion (UI contract)", async () => {
      const gift = await insertGift(userA, recA._id);
      const res = await postAsA({ giftId: String(gift._id), action: 'ignored', explicitRating: 1 });
      expect(res.status).toBe(200);
      expect(res.body.gift.status).toBe('ignored');
      expect((await Gift.findById(gift._id).lean()).status).toBe('ignored');
      expect(await FeedbackLog.countDocuments({ gift: gift._id, user: userA })).toBe(1);
    });

    it("'favorited' feedback still sets favorite", async () => {
      const gift = await insertGift(userA, recA._id);
      const res = await postAsA({ giftId: String(gift._id), action: 'favorited' });
      expect(res.status).toBe(200);
      expect((await Gift.findById(gift._id).lean()).favorite).toBe(true);
    });
  });

  // The Feedback Analytics page and the Gifts page read this: one account's
  // categories, tags, counts and trends must never show in another's
  describe('GET /api/feedback/analytics', () => {
    const log = (user, recipient, category, action = 'purchased') => FeedbackLog.collection.insertOne({
      gift: oid(), user, recipient, action, category, tags: [category],
      explicitRating: 5, timestamp: new Date()
    });

    it("counts only the caller's own feedback", async () => {
      await log(userA, recA._id, 'MineA');
      await log(userB, recB._id, 'SecretB');
      await log(userB, recB._id, 'SecretB', 'ignored');

      const res = await request(app)
        .get('/api/feedback/analytics?includeTimeTrends=true')
        .set('x-test-user', String(userA));

      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain('SecretB');
      expect(res.body.categoryMetrics.map((c) => c.category)).toEqual(['MineA']);
      expect(res.body.tagMetrics.map((t) => t.tag)).toEqual(['MineA']);
      expect(res.body.globalMetrics.totalInteractions).toBe(1);
      const trendTotal = (res.body.timeTrends || []).reduce((sum, p) => sum + (p.total || p.count || 0), 0);
      expect(trendTotal).toBeLessThanOrEqual(1);
    });
  });
});
