// Cached GET responses must never outlive a write by the same user: the
// real API router, MongoDB and Redis (a separate logical DB). Only auth and
// the AI providers are stubbed.
process.env.REDIS_DB = '13';

const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-response-cache-${process.pid}`;

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
jest.mock('../../services/aiService');
jest.mock('../../services/enhancedAiService');
jest.mock('../../services/webSearchAiService');
jest.mock('../../services/hybridSuggestionService');
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const apiRouter = require('../../routes/api');
const errorHandler = require('../../middleware/errorHandler');
const Gift = require('../../models/Gift');
const Recipient = require('../../models/Recipient');
const Event = require('../../models/Event');
const { redisClient, publisherClient, subscriberClient, keyPrefixes } = require('../../config/redis');
const queues = require('../../queues');

jest.setTimeout(30000);

const app = express();
app.use(express.json());
app.use('/api', apiRouter);
app.use(errorHandler);

const oid = () => new mongoose.Types.ObjectId();
const userA = oid();
const userB = oid();
const as = (req, user) => req.set('x-test-user', String(user));

const seed = async (user) => {
  const recipient = {
    _id: oid(), user, firstName: 'Ann', lastName: 'Lee', relation: 'friend', relationship: 'friendship',
    birthdate: new Date('1990-01-01'), tags: []
  };
  await Recipient.collection.insertOne(recipient);
  const event = { _id: oid(), user, recipient: recipient._id, name: 'Party', date: new Date('2030-01-01'), type: oid() };
  await Event.collection.insertOne(event);
  const gift = {
    _id: oid(), user, recipient: recipient._id, event: event._id, name: 'Book', price: 10,
    status: 'saved', favorite: false, createdAt: new Date()
  };
  await Gift.collection.insertOne(gift);
  return { recipient, event, gift };
};

const listGifts = (user) => as(request(app).get('/api/gifts'), user);

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
});

afterAll(async () => {
  await teardownTestDB();
  await redisClient.flushdb();
  await Promise.all([redisClient, publisherClient, subscriberClient].map((c) => c.quit().catch(() => {})));
  await Promise.all(Object.values(queues).map((q) => q.close().catch(() => {})));
});

beforeEach(async () => {
  await redisClient.flushdb();
  await Promise.all([Gift, Recipient, Event].map((M) => M.deleteMany({})));
});

describe('response cache', () => {
  it('serves a repeated read from the cache', async () => {
    await seed(userA);
    expect((await listGifts(userA)).headers['x-cache']).toBe('MISS');
    expect((await listGifts(userA)).headers['x-cache']).toBe('HIT');
  });

  it('refreshes the gift list after a PATCH (favorite toggle)', async () => {
    const { gift } = await seed(userA);
    await listGifts(userA);
    await as(request(app).get('/api/gifts/favorites'), userA);

    const toggle = await as(request(app).patch(`/api/gifts/${gift._id}/favorite`), userA);
    expect(toggle.status).toBe(200);

    const list = await listGifts(userA);
    expect(list.headers['x-cache']).toBe('MISS');
    expect(list.body.gifts[0].favorite).toBe(true);
    const favorites = await as(request(app).get('/api/gifts/favorites'), userA);
    expect(favorites.body.map((g) => String(g._id))).toEqual([String(gift._id)]);
  });

  it('refreshes the gift list after the recipient is renamed', async () => {
    const { recipient } = await seed(userA);
    await listGifts(userA);

    const rename = await as(request(app).put(`/api/recipients/${recipient._id}`), userA).send({ firstName: 'Bea' });
    expect(rename.status).toBe(200);

    const list = await listGifts(userA);
    expect(list.body.gifts[0].recipient.firstName).toBe('Bea');
  });

  it("leaves other users' cached reads alone", async () => {
    const { gift } = await seed(userA);
    await seed(userB);
    await listGifts(userB);

    await as(request(app).patch(`/api/gifts/${gift._id}/favorite`), userA);

    expect((await listGifts(userB)).headers['x-cache']).toBe('HIT');
  });

  it('keeps in-flight suggestion results, which share the suggestions prefix', async () => {
    const { gift } = await seed(userA);
    const statusKey = `${keyPrefixes.suggestions}req-123`;
    await redisClient.setex(statusKey, 300, JSON.stringify({ suggestions: [] }));

    await as(request(app).patch(`/api/gifts/${gift._id}/favorite`), userA);

    expect(await redisClient.get(statusKey)).not.toBeNull();
  });
});
