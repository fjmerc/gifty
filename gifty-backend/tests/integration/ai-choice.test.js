// The AI provider/model a user picks is checked against what this server can
// actually call: an unknown or unconfigured provider, or a model the provider
// does not offer, is a 400 with a plain message, never a 500 and never a
// silent switch to another model. Real routers, registry and MongoDB; the AI
// services are stubbed.
process.env.REDIS_DB = '15';
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-ai-choice-${process.pid}`;

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

const savedEnv = { ...process.env };
process.env.OPENAI_API_KEY = 'test-openai-key';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.AI_DEFAULT_PROVIDER;

const giftRoutes = require('../../routes/giftRoutes');
const settingsRoutes = require('../../routes/settingsRoutes');
const errorHandler = require('../../middleware/errorHandler');
const Recipient = require('../../models/Recipient');
const Event = require('../../models/Event');
const User = require('../../models/User');
require('../../models/Tags');
const hybridSuggestionService = require('../../services/hybridSuggestionService');
const { getAISuggestions } = require('../../services/aiService');
const { redisClient, publisherClient, subscriberClient } = require('../../config/redis');

jest.setTimeout(30000);

const oid = () => new mongoose.Types.ObjectId();

describe('choosing an AI provider and model', () => {
  let app;
  let user;
  let paul;
  let anniversary;
  const asUser = (req) => req.set('x-test-user', String(user));
  const savePrefs = (body) => asUser(request(app).post('/api/settings/user-preferences')).send(body);
  const generate = (extra = {}) => asUser(request(app).post('/api/gifts/suggestions'))
    .send({ recipientId: String(paul), eventId: String(anniversary), ...extra });

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(TEST_DB_URI);
    app = express();
    app.use(express.json());
    app.use('/api/gifts', giftRoutes);
    app.use('/api/settings', settingsRoutes);
    app.use(errorHandler);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await redisClient.flushdb();
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
    user = (await User.collection.insertOne({ username: 'ana', firstName: 'Ana', lastName: 'K', email: 'ana@example.com', password: 'x', preferences: {} })).insertedId;
    paul = (await Recipient.collection.insertOne({
      user, firstName: 'Paul', lastName: 'Becker', relation: 'Father', relationship: 'family',
      birthdate: new Date('1958-09-02'), tags: []
    })).insertedId;
    anniversary = (await Event.collection.insertOne({
      user, recipient: paul, name: 'Anniversary', date: new Date('2099-11-20T00:00:00Z'), type: oid()
    })).insertedId;
    hybridSuggestionService.isHybridSystemHealthy.mockResolvedValue({ isHealthy: false, totalGifts: 0 });
    getAISuggestions.mockResolvedValue([{ name: 'Bike light', description: 'Bright', estimatedPrice: 30, priceRange: { min: 25, max: 35 }, category: 'Sports', tags: ['x'], whereToBuy: ['Shop'], relevanceScore: 80 }]);
  });

  afterAll(async () => {
    process.env = savedEnv;
    await redisClient.flushdb();
    await Promise.all([redisClient, publisherClient, subscriberClient].map((c) => c.quit().catch(() => {})));
    await teardownTestDB();
  });

  const storedPrefs = async () => (await User.findById(user).lean()).preferences;

  describe('saving the choice', () => {
    it('refuses a model the provider does not offer with a 400', async () => {
      const res = await savePrefs({ aiProvider: 'openai', aiModel: 'gpt-bogus' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/gpt-bogus/);
      expect((await storedPrefs()).aiModel).toBeUndefined();
    });

    it('refuses an unknown provider with a 400', async () => {
      const res = await savePrefs({ aiProvider: 'mistral' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/mistral/);
    });

    it('refuses a provider this server has no key for', async () => {
      const res = await savePrefs({ aiProvider: 'anthropic', aiModel: 'claude-opus-4-7' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/not configured/i);
      expect((await storedPrefs()).aiProvider).toBeUndefined();
    });

    it('checks a model sent alone against the provider in use', async () => {
      const res = await savePrefs({ aiModel: 'gpt-bogus' });
      expect(res.status).toBe(400);
    });

    it('saves a model the configured provider offers', async () => {
      const res = await savePrefs({ aiProvider: 'openai', aiModel: 'gpt-4o-mini' });
      expect(res.status).toBe(200);
      expect(await storedPrefs()).toMatchObject({ aiProvider: 'openai', aiModel: 'gpt-4o-mini' });
    });

    it('clears the choice back to the server default', async () => {
      await savePrefs({ aiProvider: 'openai', aiModel: 'gpt-4o-mini' });
      const res = await savePrefs({ aiProvider: null, aiModel: null });
      expect(res.status).toBe(200);
    });
  });

  describe('asking for suggestions', () => {
    it.each([
      ['an unknown provider', { aiProvider: 'nope' }],
      ['an unconfigured provider', { aiProvider: 'anthropic' }],
      ['a model the provider does not offer', { aiProvider: 'openai', aiModel: 'gpt-bogus' }]
    ])('refuses %s with a 400 and calls no AI', async (_label, choice) => {
      const res = await generate(choice);
      expect(res.status).toBe(400);
      expect(res.body.message).toBeTruthy();
      expect(getAISuggestions).not.toHaveBeenCalled();
    });

    it('runs with a model the provider offers', async () => {
      const res = await generate({ aiProvider: 'openai', aiModel: 'gpt-4o-mini' });
      expect(res.status).toBe(201);
      expect(getAISuggestions).toHaveBeenCalledTimes(1);
    });
  });

  describe('the suggestion mode', () => {
    const getPrefs = () => asUser(request(app).get('/api/settings/user-preferences'));

    beforeEach(() => {
      hybridSuggestionService.isHybridSystemHealthy.mockResolvedValue({ isHealthy: false, totalGifts: 0 });
    });

    it('is saved and comes back on the next visit', async () => {
      const res = await savePrefs({ suggestionMode: 'web' });
      expect(res.status).toBe(200);
      expect((await storedPrefs()).suggestionMode).toBe('web');
      expect((await getPrefs()).body.suggestionMode).toBe('web');
    });

    it('refuses an unknown mode with a 400', async () => {
      const res = await savePrefs({ suggestionMode: 'turbo' });
      expect(res.status).toBe(400);
      expect((await storedPrefs()).suggestionMode).toBeUndefined();
    });

    it('answers a change with the provider and model that will now be used', async () => {
      const picked = await savePrefs({ aiProvider: 'openai', aiModel: 'gpt-4o-mini' });
      expect(picked.body).toMatchObject({ activeProvider: 'openai', activeModel: 'gpt-4o-mini' });
      const cleared = await savePrefs({ aiProvider: null, aiModel: null });
      expect(cleared.body.activeProvider).toBe('openai');
      expect(cleared.body.activeModel).not.toBe('gpt-4o-mini');
    });

    it('no longer stores the old per-mode switches, and still reads old documents', async () => {
      await User.collection.updateOne({ _id: user }, { $set: { 'preferences.useHybridSuggestions': true } });
      expect((await getPrefs()).status).toBe(200);
      await savePrefs({ useWebSearch: true });
      expect((await storedPrefs()).useWebSearch).toBeUndefined();
    });
  });
});
