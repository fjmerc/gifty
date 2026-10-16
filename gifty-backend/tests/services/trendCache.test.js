// The trend analyses are cached in Redis. The cache is off in the test
// environment, so this file turns it on with an in-memory Redis stand-in:
// a cached result must never be served to another account. Real MongoDB.
const mongoose = require('mongoose');

const MONGO_URI = `mongodb://localhost:27017/gifty-test-trend-cache-${process.pid}`;

jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../config/redis', () => {
  const store = new Map();
  return {
    redisClient: {
      status: 'ready',
      get: jest.fn(async (k) => store.get(k) ?? null),
      setex: jest.fn(async (k, ttl, v) => { store.set(k, v); }),
      incr: jest.fn(async (k) => { const n = Number(store.get(k) || 0) + 1; store.set(k, String(n)); return n; })
    }
  };
});

// The cache decides at load time whether it is on
const realEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'development';
const trendAnalysisService = require('../../services/trendAnalysisService');
const FeedbackLog = require('../../models/FeedbackLog');
process.env.NODE_ENV = realEnv;

beforeAll(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(MONGO_URI);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

it("serves each account its own cached categories and tags", async () => {
  const a = new mongoose.Types.ObjectId();
  const b = new mongoose.Types.ObjectId();
  const log = (user, category) => FeedbackLog.collection.insertOne({
    gift: new mongoose.Types.ObjectId(), user, recipient: new mongoose.Types.ObjectId(),
    action: 'purchased', category, tags: [category], timestamp: new Date()
  });
  await log(a, 'MineA');
  await log(b, 'SecretB');
  const { redisClient } = require('../../config/redis');

  const names = async (user) => [
    ...(await trendAnalysisService.analyzeCategorySuccess({}, user)).map((c) => c.category),
    ...(await trendAnalysisService.analyzeTagEffectiveness({}, user)).map((t) => t.tag)
  ];
  expect(await names(a)).toEqual(['MineA', 'MineA']);
  expect(redisClient.setex).toHaveBeenCalled();
  expect(await names(b)).toEqual(['SecretB', 'SecretB']);
  // Second reads come from the cache and stay separate
  expect(await names(a)).toEqual(['MineA', 'MineA']);
  expect(await names(b)).toEqual(['SecretB', 'SecretB']);
});
