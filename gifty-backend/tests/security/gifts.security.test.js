// tests/security/gifts.security.test.js
// Cross-user authorization tests for the gift routes, run against the real
// test MongoDB with the real gift router and controller. Only auth (a stub
// that trusts an x-test-user header), caching, rate limiting and the AI
// providers are stubbed.
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const { teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Isolated database: other suites clear the shared gifty-test DB mid-run
const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-gifts-sec-${process.pid}`;

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
jest.mock('../../middleware/cacheMiddleware', () => ({
  cacheMiddleware: jest.fn(() => (req, res, next) => next()),
  clearCacheMiddleware: jest.fn(() => (req, res, next) => next())
}));
jest.mock('../../middleware/rateLimitMiddleware', () => ({
  apiLimiters: new Proxy({}, { get: () => (req, res, next) => next() })
}));
jest.mock('../../services/suggestionCacheService');
jest.mock('../../services/aiService');
jest.mock('../../services/enhancedAiService');
jest.mock('../../services/webSearchAiService');
jest.mock('../../services/hybridSuggestionService');
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const giftRoutes = require('../../routes/giftRoutes');
const errorHandler = require('../../middleware/errorHandler');
const Gift = require('../../models/Gift');
const Recipient = require('../../models/Recipient');
const Event = require('../../models/Event');
const FeedbackLog = require('../../models/FeedbackLog');
const trendAnalysisService = require('../../services/trendAnalysisService');
require('../../models/Tags'); // registers Tag for Recipient.populate('tags')
require('../../models/User');
const { Budget } = require('../../models/Budget');
const { getAISuggestions } = require('../../services/aiService');
const { getEnhancedGiftSuggestions } = require('../../services/enhancedAiService');
const { redisClient, publisherClient, subscriberClient } = require('../../config/redis');

jest.setTimeout(30000);

const oid = () => new mongoose.Types.ObjectId();

// Raw inserts: fixtures shouldn't depend on unrelated model hooks/validation
const insertRecipient = async (user, extra = {}) => {
  const doc = {
    _id: oid(), user, firstName: 'R', lastName: String(user).slice(-4),
    relation: 'friend', relationship: 'friendship', birthdate: new Date('1990-01-01'),
    tags: [], ...extra
  };
  await Recipient.collection.insertOne(doc);
  return doc;
};
const insertEvent = async (user, recipient) => {
  const doc = { _id: oid(), user, recipient, name: 'Birthday', date: new Date(), type: oid() };
  await Event.collection.insertOne(doc);
  return doc;
};
const insertBudget = async (user, recipient) => {
  const doc = {
    _id: oid(), user, recipient, year: new Date().getFullYear(),
    isLimited: true, maximumAmount: 100, spentAmount: 0, remainingAmount: 100
  };
  await Budget.collection.insertOne(doc);
  return doc;
};
const insertGift = async (user, recipient, event, extra = {}) => {
  const doc = {
    _id: oid(), user, recipient, event, name: 'Gift', price: 10,
    status: 'saved', budgetStatus: 'no_budget', favorite: false, tags: [], whereToBuy: [],
    ...extra
  };
  await Gift.collection.insertOne(doc);
  return doc;
};

describe('Gift routes - cross-user authorization', () => {
  let app;
  let userA, userB, recA, recA2, recB, evA, evB;

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(TEST_DB_URI);
    app = express();
    app.use(express.json());
    app.use('/api/gifts', giftRoutes);
    app.use(errorHandler);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    userA = oid();
    userB = oid();
    recA = await insertRecipient(userA);
    recA2 = await insertRecipient(userA, { firstName: 'R2' });
    recB = await insertRecipient(userB);
    evA = await insertEvent(userA, recA._id);
    evB = await insertEvent(userB, recB._id);
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    try {
      await redisClient.quit();
      await publisherClient.quit();
      await subscriberClient.quit();
    } catch (e) { /* ignore */ }
    await teardownTestDB();
  });

  const asA = (req) => req.set('x-test-user', String(userA));

  describe('POST /api/gifts (createGift)', () => {
    it("rejects creating a gift under another user's recipient with 404", async () => {
      const res = await asA(request(app).post('/api/gifts')).send({
        name: 'Sneaky', price: 10, recipientId: String(recB._id), eventId: String(evA._id)
      });
      expect(res.status).toBe(404);
      expect(await Gift.countDocuments({ recipient: recB._id })).toBe(0);
    });

    it("rejects creating a gift under another user's event with 404", async () => {
      const res = await asA(request(app).post('/api/gifts')).send({
        name: 'Sneaky', price: 10, recipientId: String(recA._id), eventId: String(evB._id)
      });
      expect(res.status).toBe(404);
      expect(await Gift.countDocuments({ event: evB._id })).toBe(0);
    });

    it('stores the form fields and never client-set ownership/bookkeeping fields', async () => {
      const budgetB = await insertBudget(userB, recB._id);
      const res = await asA(request(app).post('/api/gifts')).send({
        name: 'Book', description: 'A novel', price: 20,
        recipientId: String(recA._id), eventId: String(evA._id),
        category: 'Books', tags: ['reading'], whereToBuy: ['Shop'],
        priceRange: { min: 10, max: 30 }, favorite: true, status: 'saved',
        user: String(userB), budget: String(budgetB._id), budgetStatus: 'within_budget',
        isAISuggested: true
      });
      expect(res.status).toBe(201);
      const gift = await Gift.findById(res.body.gift._id).lean();
      expect(String(gift.user)).toBe(String(userA));
      expect(gift.budget).toBeUndefined();
      expect(gift.budgetStatus).toBeUndefined();
      expect(gift.isAISuggested).toBe(false);
      expect(gift.category).toBe('Books');
      expect(gift.tags).toEqual(['reading']);
      expect(gift.whereToBuy).toEqual(['Shop']);
      expect(gift.priceRange).toEqual({ min: 10, max: 30 });
      expect(gift.favorite).toBe(true);
      expect(gift.status).toBe('saved');
    });

    it("creates a gift as 'purchased' in one request, dated by the server (no counter to bypass)", async () => {
      const before = Date.now();
      const res = await asA(request(app).post('/api/gifts')).send({
        name: 'Book', price: 20, recipientId: String(recA._id), eventId: String(evA._id),
        status: 'purchased', purchaseDate: '1999-12-31T00:00:00Z'
      });
      expect(res.status).toBe(201);
      const gift = await Gift.findById(res.body.gift._id).lean();
      expect(gift.status).toBe('purchased');
      expect(gift.purchaseDate.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(String(gift.user)).toBe(String(userA));
    });
  });

  describe('PUT /api/gifts/:giftId (updateGift)', () => {
    it('ignores user, budget and budgetStatus sent by the client', async () => {
      const budgetB = await insertBudget(userB, recB._id);
      const gift = await insertGift(userA, recA._id, evA._id);
      const res = await asA(request(app).put(`/api/gifts/${gift._id}`)).send({
        name: 'Renamed', user: String(userB), budget: String(budgetB._id), budgetStatus: 'over_budget'
      });
      expect(res.status).toBe(200);
      const saved = await Gift.findById(gift._id).lean();
      expect(saved.name).toBe('Renamed');
      expect(String(saved.user)).toBe(String(userA));
      expect(saved.budget).toBeUndefined();
      expect(saved.budgetStatus).toBe('no_budget');
    });

    it('moves the gift to another of my recipients via recipientId (ignoring stale populated objects)', async () => {
      const gift = await insertGift(userA, recA._id, evA._id);
      const res = await asA(request(app).put(`/api/gifts/${gift._id}`)).send({
        name: 'Gift',
        recipientId: String(recA2._id),
        eventId: String(evA._id),
        // the edit form also sends the stale populated objects from initialData
        recipient: { _id: String(recA._id), firstName: 'R' },
        event: { _id: String(evA._id), name: 'Birthday' }
      });
      expect(res.status).toBe(200);
      const saved = await Gift.findById(gift._id).lean();
      expect(String(saved.recipient)).toBe(String(recA2._id));
      expect(String(saved.event)).toBe(String(evA._id));
    });

    it("refuses to move the gift to another user's recipient (404)", async () => {
      const gift = await insertGift(userA, recA._id, evA._id);
      const res = await asA(request(app).put(`/api/gifts/${gift._id}`)).send({
        recipientId: String(recB._id)
      });
      expect(res.status).toBe(404);
      const saved = await Gift.findById(gift._id).lean();
      expect(String(saved.recipient)).toBe(String(recA._id));
    });

    it("refuses to move the gift to another user's event (404)", async () => {
      const gift = await insertGift(userA, recA._id, evA._id);
      const res = await asA(request(app).put(`/api/gifts/${gift._id}`)).send({
        eventId: String(evB._id)
      });
      expect(res.status).toBe(404);
      const saved = await Gift.findById(gift._id).lean();
      expect(String(saved.event)).toBe(String(evA._id));
    });

    it("returns 404 (not 401) for another user's gift", async () => {
      const giftB = await insertGift(userB, recB._id, evB._id);
      const res = await asA(request(app).put(`/api/gifts/${giftB._id}`)).send({ name: 'x' });
      expect(res.status).toBe(404);
    });
  });

  describe("other gift endpoints on another user's gift return 404 (not 401)", () => {
    it.each([
      ['delete', (id) => `/api/gifts/${id}`, {}],
      ['patch', (id) => `/api/gifts/${id}/status`, { status: 'saved' }],
      ['patch', (id) => `/api/gifts/${id}/favorite`, {}],
      ['post', (id) => `/api/gifts/${id}/purchase`, {}]
    ])('%s %p', async (method, path, body) => {
      const giftB = await insertGift(userB, recB._id, evB._id);
      const res = await asA(request(app)[method](path(giftB._id))).send(body);
      expect(res.status).toBe(404);
      expect(await Gift.countDocuments({ _id: giftB._id })).toBe(1);
    });
  });

  describe('POST /api/gifts/suggestions (generateGiftSuggestions)', () => {
    beforeEach(() => {
      getAISuggestions.mockResolvedValue([]);
      getEnhancedGiftSuggestions.mockResolvedValue([]);
    });

    it("does not send another user's recipient to the AI (404)", async () => {
      const res = await asA(request(app).post('/api/gifts/suggestions')).send({
        recipientId: String(recB._id), eventId: String(evA._id)
      });
      expect(getAISuggestions).not.toHaveBeenCalled();
      expect(getEnhancedGiftSuggestions).not.toHaveBeenCalled();
      expect(res.status).toBe(404);
    });

    it("does not use another user's event (404)", async () => {
      const res = await asA(request(app).post('/api/gifts/suggestions')).send({
        recipientId: String(recA._id), eventId: String(evB._id)
      });
      expect(getAISuggestions).not.toHaveBeenCalled();
      expect(getEnhancedGiftSuggestions).not.toHaveBeenCalled();
      expect(res.status).toBe(404);
    });
  });

  // The AI paths read a recipient's preferences from feedback: only the
  // caller's own feedback may count, even on the same recipient id
  describe("a recipient's feedback preferences", () => {
    const insertLog = (user, recipient, category) => FeedbackLog.collection.insertOne({
      gift: oid(), user, recipient, action: 'purchased', category, tags: [category],
      explicitRating: 5, timestamp: new Date()
    });

    it("exclude other users' feedback", async () => {
      await insertLog(userA, recA._id, 'MineA');
      await insertLog(userB, recA._id, 'LeakB');
      const metrics = await trendAnalysisService.analyzeRecipientPreferences(recA._id, {}, userA);
      expect(metrics.categoryPreferences.map((c) => c.category)).toEqual(['MineA']);
      expect(metrics.tagPreferences.map((t) => t.tag)).toEqual(['MineA']);
    });
  });
});
