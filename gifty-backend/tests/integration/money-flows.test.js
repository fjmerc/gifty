// Purchase, un-purchase, delete, re-price, move and re-date are plain gift
// writes; totals follow because they are derived on read (spec: Flow changes).
// Real router, controller and MongoDB. Only auth, caches, rate limits, the AI
// providers are stubbed.
// Jest gives each test file a copy of process.env; Node's date handling only
// follows a TZ set on the real process (see tests/utils/dates.test.js).
const realProcess = require('vm').runInThisContext('process');
const originalTZ = realProcess.env.TZ;
process.env.TZ = 'UTC';
realProcess.env.TZ = 'UTC';
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-money-flows-${process.pid}`;

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
jest.mock('../../services/suggestionCacheService', () => ({
  get: jest.fn(async () => null),
  set: jest.fn(async () => {}),
  getVersion: jest.fn(async () => 0),
  invalidateForRecipient: jest.fn(async () => {}),
  buildKey: jest.fn(() => 'key')
}));
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
require('../../models/Tags');
require('../../models/User');
const { Budget } = require('../../models/Budget');
const moneyService = require('../../services/moneyService');
const { yearInTimeZone } = require('../../utils/dates');
const { getAISuggestions } = require('../../services/aiService');
const { redisClient, publisherClient, subscriberClient } = require('../../config/redis');

jest.setTimeout(30000);

const oid = () => new mongoose.Types.ObjectId();

const insertRecipient = async (user, extra = {}) => {
  const doc = {
    _id: oid(), user, firstName: 'R', lastName: 'Lee', relation: 'friend', relationship: 'friendship',
    birthdate: new Date('1990-01-01'), tags: [], ...extra
  };
  await Recipient.collection.insertOne(doc);
  return doc;
};
const insertEvent = async (user, recipient, date) => {
  const doc = { _id: oid(), user, recipient, name: 'Birthday', date, type: oid() };
  await Event.collection.insertOne(doc);
  return doc;
};
const insertGift = async (user, recipient, event, extra = {}) => {
  const doc = {
    _id: oid(), user, recipient, event, name: 'Gift', description: 'A gift', price: 10,
    status: 'saved', favorite: false, tags: [], whereToBuy: [], ...extra
  };
  await Gift.collection.insertOne(doc);
  return doc;
};

describe('Gift money flows', () => {
  let app;
  let userA;
  let ann;
  let bob;
  let birthday;
  let thisYear;

  const asA = (req) => req.set('x-test-user', String(userA));
  const spentFor = async (recipient) =>
    (await moneyService.getYearSummary(userA, thisYear)).recipients
      .find((r) => r.recipientId === String(recipient._id)).spent;
  const purchasedGift = (recipient, extra = {}) =>
    insertGift(userA, recipient._id, birthday._id, { status: 'purchased', purchaseDate: new Date(), ...extra });

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(TEST_DB_URI);
    app = express();
    app.use(express.json());
    app.use('/api/gifts', giftRoutes);
    app.use(errorHandler);
    thisYear = yearInTimeZone(new Date());
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
    userA = oid();
    ann = await insertRecipient(userA, { firstName: 'Ann' });
    bob = await insertRecipient(userA, { firstName: 'Bob' });
    // A January birthday next year: the purchase must still count this year (Problem row 7)
    birthday = await insertEvent(userA, ann._id, new Date(Date.UTC(thisYear + 1, 0, 15)));
  });

  afterAll(async () => {
    try {
      await redisClient.quit();
      await publisherClient.quit();
      await subscriberClient.quit();
    } catch (e) { /* ignore */ }
    await teardownTestDB();
    if (originalTZ === undefined) delete realProcess.env.TZ;
    else realProcess.env.TZ = originalTZ;
  });

  describe('POST /api/gifts/:giftId/purchase', () => {
    it('marks the gift purchased now and counts it this year', async () => {
      const gift = await insertGift(userA, ann._id, birthday._id, { price: 40 });
      const before = Date.now();
      const res = await asA(request(app).post(`/api/gifts/${gift._id}/purchase`)).send({});
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Gift purchased successfully');
      expect(res.body.gift.status).toBe('purchased');
      expect(new Date(res.body.gift.purchaseDate).getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(res.body.warning).toBeNull();
      expect(res.body.budgetCheck).toEqual({ status: 'no_budget', left: null, wouldExceedBy: 0, currency: 'USD' });
      expect(res.body.gift).not.toHaveProperty('budget');
      expect(res.body.gift).not.toHaveProperty('budgetStatus');
      expect(await spentFor(ann)).toBe(40);
    });

    it('ignores an ISO timestamp (e.g. the event date) but honours a YYYY-MM-DD day', async () => {
      const g1 = await insertGift(userA, ann._id, birthday._id);
      const r1 = await asA(request(app).post(`/api/gifts/${g1._id}/purchase`))
        .send({ purchaseDate: birthday.date.toISOString() });
      expect(r1.status).toBe(200);
      expect(yearInTimeZone(new Date(r1.body.gift.purchaseDate))).toBe(thisYear);

      const g2 = await insertGift(userA, ann._id, birthday._id);
      const r2 = await asA(request(app).post(`/api/gifts/${g2._id}/purchase`)).send({ purchaseDate: `${thisYear}-03-04` });
      expect(r2.body.gift.purchaseDate).toBe(`${thisYear}-03-04T12:00:00.000Z`);
    });

    it('a double purchase of the same gift counts once (concurrent requests)', async () => {
      const gift = await insertGift(userA, ann._id, birthday._id, { price: 30 });
      const [r1, r2] = await Promise.all([
        asA(request(app).post(`/api/gifts/${gift._id}/purchase`)).send({}),
        asA(request(app).post(`/api/gifts/${gift._id}/purchase`)).send({})
      ]);
      expect([r1.status, r2.status].sort()).toEqual([200, 400]);
      const rejected = r1.status === 400 ? r1 : r2;
      expect(rejected.body.message).toBe('Gift has already been purchased');
      expect(await spentFor(ann)).toBe(30);
    });

    it('row 5: concurrent purchases of different gifts both count', async () => {
      const g1 = await insertGift(userA, ann._id, birthday._id, { price: 30 });
      const g2 = await insertGift(userA, ann._id, birthday._id, { price: 40 });
      const results = await Promise.all([
        asA(request(app).post(`/api/gifts/${g1._id}/purchase`)).send({}),
        asA(request(app).post(`/api/gifts/${g2._id}/purchase`)).send({})
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(await spentFor(ann)).toBe(70);
    });

    it('warns when the purchase goes over the recipient budget', async () => {
      await Budget.collection.insertOne({
        _id: oid(), user: userA, recipient: ann._id, year: thisYear, allocationType: 'fixed',
        minimumAmount: 0, maximumAmount: 20, isLimited: true
      });
      const gift = await insertGift(userA, ann._id, birthday._id, { price: 30 });
      const res = await asA(request(app).post(`/api/gifts/${gift._id}/purchase`)).send({});
      expect(res.status).toBe(200);
      expect(res.body.warning).toBe('This purchase puts the recipient over budget by $10.00');
      expect(res.body.budgetCheck).toEqual({ status: 'over', left: -10, wouldExceedBy: 10, currency: 'USD' });
    });

    it("another user's gift is a 404 and stays unpurchased", async () => {
      const theirs = await insertGift(oid(), ann._id, birthday._id);
      const res = await asA(request(app).post(`/api/gifts/${theirs._id}/purchase`)).send({});
      expect(res.status).toBe(404);
      expect((await Gift.findById(theirs._id).lean()).status).toBe('saved');
    });
  });

  describe('edits are plain gift writes', () => {
    describe('the over-budget warning comes only with a money change', () => {
      let gift;
      beforeEach(async () => {
        await Budget.collection.insertOne({
          _id: oid(), user: userA, recipient: ann._id, year: thisYear, allocationType: 'fixed',
          minimumAmount: 0, maximumAmount: 20, isLimited: true
        });
        gift = await purchasedGift(ann, { price: 30, purchaseDate: new Date(Date.UTC(thisYear, 2, 10, 12)) });
      });

      it('a rename of an over-budget purchased gift carries no warning', async () => {
        const res = await asA(request(app).put(`/api/gifts/${gift._id}`)).send({ name: 'Renamed' });
        expect(res.status).toBe(200);
        expect(res.body.warning).toBeNull();
      });

      it('re-sending the same price, date and recipient carries no warning', async () => {
        const res = await asA(request(app).put(`/api/gifts/${gift._id}`))
          .send({ price: 30, purchaseDate: `${thisYear}-03-10`, recipientId: String(ann._id) });
        expect(res.status).toBe(200);
        expect(res.body.warning).toBeNull();
      });

      it('a re-price warns', async () => {
        const res = await asA(request(app).put(`/api/gifts/${gift._id}`)).send({ price: 35 });
        expect(res.body.warning).toBe('This purchase puts the recipient over budget by $15.00');
      });

      it('a re-date warns', async () => {
        const res = await asA(request(app).put(`/api/gifts/${gift._id}`)).send({ purchaseDate: `${thisYear}-04-01` });
        expect(res.body.warning).toBe('This purchase puts the recipient over budget by $10.00');
      });

      it('a move to another recipient warns when that recipient goes over', async () => {
        await Budget.collection.insertOne({
          _id: oid(), user: userA, recipient: bob._id, year: thisYear, allocationType: 'fixed',
          minimumAmount: 0, maximumAmount: 25, isLimited: true
        });
        const res = await asA(request(app).put(`/api/gifts/${gift._id}`)).send({ recipientId: String(bob._id) });
        expect(res.body.warning).toBe('This purchase puts the recipient over budget by $5.00');
      });
    });

    it('row 2: deleting a purchased AI gift removes its spend', async () => {
      const gift = await purchasedGift(ann, { price: 45, isAISuggested: true });
      expect(await spentFor(ann)).toBe(45);
      const res = await asA(request(app).delete(`/api/gifts/${gift._id}`));
      expect(res.status).toBe(200);
      expect(await spentFor(ann)).toBe(0);
    });

    it('row 6: re-pricing a purchased $60 gift to $70 reports $30 left of $100', async () => {
      await Budget.collection.insertOne({
        _id: oid(), user: userA, recipient: ann._id, year: thisYear, allocationType: 'fixed',
        minimumAmount: 0, maximumAmount: 100, isLimited: true
      });
      const gift = await purchasedGift(ann, { price: 60 });
      const res = await asA(request(app).put(`/api/gifts/${gift._id}`)).send({ price: 70 });
      expect(res.status).toBe(200);
      expect(res.body.warning).toBeNull();
      expect(res.body.budgetCheck).toEqual({ status: 'within', left: 30, wouldExceedBy: 0, currency: 'USD' });
      expect(await spentFor(ann)).toBe(70);
    });

    it('row 7: un-purchasing clears purchaseDate and the spend (PATCH status and PUT)', async () => {
      const g1 = await purchasedGift(ann, { price: 35 });
      const r1 = await asA(request(app).patch(`/api/gifts/${g1._id}/status`)).send({ status: 'saved' });
      expect(r1.status).toBe(200);
      expect(r1.body.status).toBe('saved');
      expect((await Gift.findById(g1._id).lean()).purchaseDate).toBeUndefined();

      const g2 = await purchasedGift(ann, { price: 15 });
      const r2 = await asA(request(app).put(`/api/gifts/${g2._id}`)).send({ status: 'saved' });
      expect(r2.status).toBe(200);
      expect((await Gift.findById(g2._id).lean()).purchaseDate).toBeUndefined();
      expect(await spentFor(ann)).toBe(0);
    });

    it('row 8: moving a purchased gift to another recipient moves its spend', async () => {
      const gift = await purchasedGift(ann, { price: 25 });
      const res = await asA(request(app).put(`/api/gifts/${gift._id}`)).send({ recipientId: String(bob._id) });
      expect(res.status).toBe(200);
      expect(await spentFor(ann)).toBe(0);
      expect(await spentFor(bob)).toBe(25);
    });

    it('re-dating a purchase with YYYY-MM-DD moves it to that month', async () => {
      const gift = await purchasedGift(ann, { price: 12 });
      const res = await asA(request(app).put(`/api/gifts/${gift._id}`)).send({ purchaseDate: `${thisYear}-02-10` });
      expect(res.status).toBe(200);
      expect(res.body.gift.purchaseDate).toBe(`${thisYear}-02-10T12:00:00.000Z`);
      expect((await moneyService.getMonthlySpend(userA, thisYear))[1]).toBe(12);
    });

    it('saves field edits and the purchase in one request (PUT status purchased)', async () => {
      const gift = await insertGift(userA, ann._id, birthday._id);
      const res = await asA(request(app).put(`/api/gifts/${gift._id}`)).send({
        name: 'Renamed', price: 12.345, status: 'purchased', purchaseDate: `${thisYear}-05-06`
      });
      expect(res.status).toBe(200);
      expect(res.body.gift).toMatchObject({
        name: 'Renamed', price: 12.35, status: 'purchased', purchaseDate: `${thisYear}-05-06T12:00:00.000Z`
      });
      expect(await spentFor(ann)).toBe(12.35);
    });

    it('a gift that is not purchased never keeps a purchaseDate', async () => {
      const gift = await insertGift(userA, ann._id, birthday._id, { purchaseDate: birthday.date }); // legacy prefill
      const res = await asA(request(app).put(`/api/gifts/${gift._id}`)).send({ name: 'Still saved', purchaseDate: `${thisYear}-01-01` });
      expect(res.status).toBe(200);
      expect((await Gift.findById(gift._id).lean()).purchaseDate).toBeUndefined();
    });

    it('rejects a negative price and accepts a free gift', async () => {
      const gift = await insertGift(userA, ann._id, birthday._id);
      expect((await asA(request(app).put(`/api/gifts/${gift._id}`)).send({ price: -5 })).status).toBe(400);
      const ok = await asA(request(app).put(`/api/gifts/${gift._id}`)).send({ price: 0 });
      expect(ok.status).toBe(200);
      expect(ok.body.gift.price).toBe(0);
    });
  });

  describe('POST /api/gifts', () => {
    it('creates a gift as purchased in one request (R2)', async () => {
      const res = await asA(request(app).post('/api/gifts')).send({
        name: 'Book', price: 15, recipientId: String(ann._id), eventId: String(birthday._id),
        status: 'purchased', purchaseDate: `${thisYear}-07-08`
      });
      expect(res.status).toBe(201);
      expect(res.body.gift).toMatchObject({ status: 'purchased', purchaseDate: `${thisYear}-07-08T12:00:00.000Z` });
      expect(res.body.budgetCheck).toEqual({ status: 'no_budget', left: null, wouldExceedBy: 0, currency: 'USD' });
      expect(await spentFor(ann)).toBe(15);
    });

    it('accepts a free gift and rejects a missing or negative price', async () => {
      const body = { name: 'Card', recipientId: String(ann._id), eventId: String(birthday._id) };
      const free = await asA(request(app).post('/api/gifts')).send({ ...body, price: 0 });
      expect(free.status).toBe(201);
      expect(free.body.gift.price).toBe(0);
      expect(free.body.budgetCheck).toBeNull();
      expect((await asA(request(app).post('/api/gifts')).send(body)).status).toBe(400);
      expect((await asA(request(app).post('/api/gifts')).send({ ...body, price: -1 })).status).toBe(400);
    });

    it('a saved gift has no purchaseDate even when the client sends one', async () => {
      const res = await asA(request(app).post('/api/gifts')).send({
        name: 'Book', price: 5, recipientId: String(ann._id), eventId: String(birthday._id),
        status: 'saved', purchaseDate: `${thisYear}-07-08`
      });
      expect(res.status).toBe(201);
      expect((await Gift.findById(res.body.gift._id).lean()).purchaseDate).toBeUndefined();
    });
  });

  describe('responses', () => {
    it('gift lists carry no budget, budgetStatus or budgetInfo', async () => {
      await asA(request(app).post('/api/gifts')).send({
        name: 'Book', price: 5, recipientId: String(ann._id), eventId: String(birthday._id), favorite: true
      });
      const list = await asA(request(app).get('/api/gifts'));
      expect(list.status).toBe(200);
      expect(list.body.gifts[0]).not.toHaveProperty('budgetInfo');
      expect(list.body.gifts[0]).not.toHaveProperty('budget');
      expect(list.body.gifts[0]).not.toHaveProperty('budgetStatus');
      const favorites = await asA(request(app).get('/api/gifts/favorites'));
      expect(favorites.status).toBe(200);
      expect(favorites.body[0]).not.toHaveProperty('budgetInfo');
    });

    // Pages spread a write's answer over the gift card they show; an id where
    // the list had { firstName, lastName } rendered "undefined undefined"
    it('every gift write answers with the recipient and event named, like the list', async () => {
      const named = (gift) => {
        expect(gift.recipient).toMatchObject({ _id: String(ann._id), firstName: 'Ann', lastName: 'Lee' });
        expect(gift.event).toMatchObject({ _id: String(birthday._id), name: 'Birthday' });
      };
      const created = await asA(request(app).post('/api/gifts')).send({
        name: 'Book', price: 5, recipientId: String(ann._id), eventId: String(birthday._id), status: 'suggestion'
      });
      expect(created.status).toBe(201);
      named(created.body.gift);
      const id = created.body.gift._id;

      const saved = await asA(request(app).patch(`/api/gifts/${id}/status`)).send({ status: 'saved' });
      named(saved.body);
      const favorite = await asA(request(app).patch(`/api/gifts/${id}/favorite`));
      named(favorite.body);
      const edited = await asA(request(app).put(`/api/gifts/${id}`)).send({ name: 'Big book' });
      named(edited.body.gift);
      const bought = await asA(request(app).post(`/api/gifts/${id}/purchase`)).send({});
      named(bought.body.gift);
      const again = await asA(request(app).patch(`/api/gifts/${id}/status`)).send({ status: 'purchased' });
      named(again.body);
    });
  });

  describe('suggestions', () => {
    it('are saved without a purchaseDate (no event-date prefill)', async () => {
      getAISuggestions.mockResolvedValue([{
        name: 'Puzzle', description: 'A puzzle', estimatedPrice: 25, priceRange: { min: 20, max: 30 },
        category: 'Games', tags: ['fun'], whereToBuy: ['Shop'], relevanceScore: 80
      }]);
      const res = await asA(request(app).post('/api/gifts/suggestions'))
        .send({ recipientId: String(ann._id), eventId: String(birthday._id) });
      expect(res.status).toBe(201);
      expect(res.body.suggestions[0]).not.toHaveProperty('budgetInfo');
      const stored = await Gift.findOne({ name: 'Puzzle' }).lean();
      expect(stored.status).toBe('suggestion');
      expect(stored.purchaseDate).toBeUndefined();
    });
  });
});
