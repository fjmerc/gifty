// Asking for suggestions again within a few minutes reuses the last answer
// instead of paying the AI twice. The reused answer must be today's truth:
// a suggestion deleted, saved or rated since is not offered again, and once
// none is left the AI is asked anew. Real router, MongoDB and Redis; the AI
// provider is stubbed.
process.env.REDIS_DB = '12';
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-suggestion-cache-${process.pid}`;

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
const { getAISuggestions } = require('../../services/aiService');
const { redisClient, publisherClient, subscriberClient } = require('../../config/redis');

jest.setTimeout(30000);

const oid = () => new mongoose.Types.ObjectId();
const idea = (name, price) => ({ name, description: `${name}!`, estimatedPrice: price, priceRange: { min: price - 5, max: price + 5 }, category: 'Books', tags: ['x'], whereToBuy: ['Shop'], relevanceScore: 80 });

describe('asking for suggestions again', () => {
  let app;
  let user;
  let paul;
  let anniversary;
  const asUser = (req) => req.set('x-test-user', String(user));
  const generate = () => asUser(request(app).post('/api/gifts/suggestions'))
    .send({ recipientId: String(paul), eventId: String(anniversary) });
  const names = (res) => res.body.suggestions.map((g) => g.name).sort();

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
    await redisClient.flushdb();
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
    user = oid();
    paul = (await Recipient.collection.insertOne({
      user, firstName: 'Paul', lastName: 'Becker', relation: 'Father', relationship: 'family',
      birthdate: new Date('1958-09-02'), tags: [], interests: ['cycling']
    })).insertedId;
    anniversary = (await Event.collection.insertOne({
      user, recipient: paul, name: 'Anniversary', date: new Date('2099-11-20T00:00:00Z'), type: oid()
    })).insertedId;
    getAISuggestions.mockResolvedValue([idea('Bike light', 30), idea('Jersey', 60), idea('Map book', 25)]);
  });

  afterAll(async () => {
    await redisClient.flushdb();
    await Promise.all([redisClient, publisherClient, subscriberClient].map((c) => c.quit().catch(() => {})));
    await teardownTestDB();
  });

  it('reuses the last answer without asking the AI again', async () => {
    const first = await generate();
    expect(first.status).toBe(201);
    const second = await generate();
    expect(second.status).toBe(200);
    expect(second.body.fromCache).toBe(true);
    expect(names(second)).toEqual(names(first));
    expect(getAISuggestions).toHaveBeenCalledTimes(1);
  });

  it('leaves out suggestions deleted, saved or rated away since', async () => {
    const first = await generate();
    const [light, jersey] = ['Bike light', 'Jersey'].map((n) => first.body.suggestions.find((g) => g.name === n)._id);
    await Gift.deleteOne({ _id: light });
    await Gift.updateOne({ _id: jersey }, { status: 'saved' });

    const second = await generate();
    expect(names(second)).toEqual(['Map book']);
    expect(second.body.suggestions[0].recipient).toMatchObject({ firstName: 'Paul' });
    expect(getAISuggestions).toHaveBeenCalledTimes(1);
  });

  it('asks the AI again once none of the last answer is left', async () => {
    await generate();
    await Gift.deleteMany({ user });
    getAISuggestions.mockResolvedValue([idea('Bell', 15)]);

    const second = await generate();
    expect(second.status).toBe(201);
    expect(names(second)).toEqual(['Bell']);
    expect(getAISuggestions).toHaveBeenCalledTimes(2);
  });

  it('leaves out a suggestion moved to another recipient since', async () => {
    const first = await generate();
    const moved = first.body.suggestions.find((g) => g.name === 'Jersey')._id;
    const maria = (await Recipient.collection.insertOne({
      user, firstName: 'Maria', lastName: 'O', relation: 'Mother', relationship: 'family', birthdate: new Date('1960-03-14'), tags: []
    })).insertedId;
    await Gift.updateOne({ _id: moved }, { recipient: maria });

    const second = await generate();
    expect(names(second)).toEqual(['Bike light', 'Map book']);
  });
});
