// Web-Enhanced gifts link to the pages the web search returned for them in
// this generation, and to nothing else: no link the AI wrote, no non-http(s)
// link, at most three, and no price taken from the web. Real routers,
// services, MongoDB and Redis; the AI provider and Brave's HTTP are stubbed.
process.env.REDIS_DB = '11';
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-web-sources-${process.pid}`;

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
jest.mock('../../services/ai/aiProviderService', () => ({ complete: jest.fn() }));
jest.mock('axios');
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const savedEnv = { ...process.env };
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.BRAVE_SEARCH_API_KEY = 'test-brave-key';

const axios = require('axios');
const giftRoutes = require('../../routes/giftRoutes');
const errorHandler = require('../../middleware/errorHandler');
const Gift = require('../../models/Gift');
const Recipient = require('../../models/Recipient');
const Event = require('../../models/Event');
require('../../models/Tags');
require('../../models/User');
const aiProviderService = require('../../services/ai/aiProviderService');
const { redisClient, publisherClient, subscriberClient } = require('../../config/redis');

jest.setTimeout(30000);

const oid = () => new mongoose.Types.ObjectId();
const json = (obj) => ({ content: JSON.stringify(obj), provider: 'openai', model: 'gpt-4o' });
const idea = (name, price, extra = {}) => ({
  name, description: `${name} for the trail`, primaryCategory: 'Sports', tags: ['bike'],
  estimatedPrice: price, priceRange: { min: price - 5, max: price + 5 }, whereToBuy: ['Shop'], ...extra
});
const brave = (results) => ({ data: { web: { results } } });

describe('web sources of Web-Enhanced gifts', () => {
  let app;
  let user;
  let paul;
  let anniversary;
  const generate = (mode) => request(app).post('/api/gifts/suggestions')
    .set('x-test-user', String(user))
    .send({ recipientId: String(paul), eventId: String(anniversary), ...mode });

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
  });

  afterAll(async () => {
    process.env = savedEnv;
    await redisClient.flushdb();
    await Promise.all([redisClient, publisherClient, subscriberClient].map((c) => c.quit().catch(() => {})));
    await teardownTestDB();
  });

  it('stores only pages the search returned: http(s), at most 3, host from the URL, no web price', async () => {
    aiProviderService.complete.mockResolvedValue(json({ suggestions: [
      // The AI invents links of its own: none may be stored
      idea('Bike light', 30, { sourceUrl: 'https://invented.example/light', url: 'https://invented.example/u',
        webSources: [{ title: 'Made up', url: 'https://invented.example/w', host: 'invented.example' }] }),
      idea('Jersey', 60)
    ] }));
    axios.get
      .mockResolvedValueOnce(brave([
        { title: 'Bike light $9.99 - shop.example', url: 'https://www.shop.example/light', description: '$9.99, in stock, 5 stars' },
        { title: 'Script', url: 'javascript:alert(1)', description: 'Bike light' },
        { title: 'Data', url: 'data:text/html,x', description: 'Bike light' },
        { title: 'Review', url: 'http://blog.example/review', description: 'A bike light review' },
        { title: 'Third', url: 'https://third.example/', description: 'Bike light deals' },
        { title: 'Fourth', url: 'https://fourth.example/', description: 'Bike light' }
      ]))
      .mockResolvedValueOnce(brave([{ title: 'Jersey', url: 'https://kit.example/jersey' }]));

    const res = await generate({ webEnhanced: true });
    expect(res.status).toBe(201);
    const light = await Gift.findOne({ name: 'Bike light' }).lean();
    expect(light.price).toBe(30);
    expect(light.webSources.map(({ title, url, host }) => ({ title, url, host }))).toEqual([
      { title: 'Bike light $9.99 - shop.example', url: 'https://www.shop.example/light', host: 'shop.example' },
      { title: 'Review', url: 'http://blog.example/review', host: 'blog.example' },
      { title: 'Third', url: 'https://third.example/', host: 'third.example' }
    ]);
    const all = (await Gift.find({}).lean()).flatMap((g) => g.webSources || []).map((s) => s.url);
    expect(all.some((url) => url.includes('invented.example'))).toBe(false);
    ['currentPrice', 'availability', 'reviews'].forEach((field) => expect(light).not.toHaveProperty(field));
    const jersey = res.body.suggestions.find((g) => g.name === 'Jersey');
    expect(jersey.webSources.map((s) => s.url)).toEqual(['https://kit.example/jersey']);
  });

  it('Basic gifts carry no web sources, even when the AI writes some', async () => {
    aiProviderService.complete.mockResolvedValue(json({ suggestions: [
      idea('Bike light', 30, { webSources: [{ title: 'Made up', url: 'https://invented.example/w' }] })
    ] }));
    const res = await generate({});
    expect(res.status).toBe(201);
    expect(res.body.suggestions[0].webSources || []).toEqual([]);
    expect(axios.get).not.toHaveBeenCalled();
  });
});
