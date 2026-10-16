// Every read endpoint of the API, against real MongoDB (the dev and the
// maintainer's server run 4.4) and Redis, for a user with realistic data
// written through the API. Mocked tests can't see an aggregation stage or
// operator the database doesn't support, a populate of a missing path, or a
// cast error on real ids; this sweep fails on any server error.
process.env.REDIS_DB = '13';

const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const request = require('supertest');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-read-endpoints-${process.pid}`;

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), http: jest.fn(),
  addRequestContext: () => ({})
}));
jest.mock('../../middleware/rateLimitMiddleware', () => {
  const pass = new Proxy({}, { get: () => (req, res, next) => next() });
  return { authLimiters: pass, apiLimiters: pass };
});
jest.mock('../../services/aiService');
jest.mock('../../services/enhancedAiService');
jest.mock('../../services/webSearchAiService');

const apiRouter = require('../../routes/api');
const databaseRoutes = require('../../routes/databaseRoutes');
const errorHandler = require('../../middleware/errorHandler');
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const { generateToken } = require('../../utils/generateToken');
const { seedEventTypes, seedHolidays } = require('../../utils/dbInitializer');
const { redisClient, publisherClient, subscriberClient } = require('../../config/redis');
const queues = require('../../queues');

jest.setTimeout(60000);

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', apiRouter);
app.use('/api/database', databaseRoutes);
app.use(errorHandler);

// Outbound: discovery calls out
const SKIP = new Set(['/gift-library/discover/status']);

let auth;
const ids = {};

const call = (method, path, body) => {
  const req = request(app)[method](`/api${path}`).set(auth);
  return body ? req.send(body) : req;
};

// GET routes of a router, with their mount prefixes
const getRoutes = (stack, prefix = '') => stack.flatMap((layer) => {
  if (layer.route) return layer.route.methods.get ? [prefix + layer.route.path] : [];
  if (layer.name === 'router' && layer.handle.stack) {
    const mount = layer.regexp.source.replace('^\\', '').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/');
    return getRoutes(layer.handle.stack, prefix + mount);
  }
  return [];
});

const fill = (route) => route
  .replace(':recipientId', ids.recipient)
  .replace(':id', ids.recipient)
  .replace(':year', '2026')
  .replace(':requestId', 'no-such-request')
  .replace(/\/$/, '');

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
  await mongoose.connection.db.dropDatabase();
  await redisClient.flushdb();
  await seedEventTypes();
  await seedHolidays();

  const user = await User.create({
    username: 'reader', email: 'reader@example.com', password: 'Passw0rd!x', firstName: 'Rea', lastName: 'Der',
    preferences: { holidaySettings: { enabled: true, countryCode: 'US', categories: ['national'] } }
  });
  auth = { Authorization: `Bearer ${generateToken(user._id.toString())}` };

  // Realistic data, written the way the app writes it
  const types = (await call('get', '/eventTypes')).body;
  const typeId = (types.find((t) => t.name === 'Birthday') || types[0])._id;
  ids.recipient = (await call('post', '/recipients', {
    firstName: "Sean", lastName: "O'Brien", relation: 'Friend', relationship: 'friendship', birthdate: '1990-11-20',
    tags: ['books', 'tea'], interests: ['hiking']
  })).body._id;
  const other = (await call('post', '/recipients', {
    firstName: 'Bea', lastName: 'Lee', relation: 'Sister', relationship: 'family', birthdate: '1985-02-28'
  })).body._id;
  const event = (await call('post', '/events', { name: 'Party', date: '2026-12-12', type: typeId, recipient: ids.recipient,
    reminder: { isSet: true, time: '2026-12-11T14:00:00.000Z', method: 'Email' } })).body._id;
  await call('post', '/events', { name: 'Club', date: '2026-11-02', type: typeId, recipient: other,
    recurring: { frequency: 'Weekly', until: '2026-11-30', exceptions: [] } });
  const gift = async (body) => {
    const res = await call('post', '/gifts', { recipient: ids.recipient, event, ...body });
    return res.body._id || res.body.gift?._id;
  };
  const bought = await gift({ name: 'Scarf', price: 40, status: 'purchased', category: 'Clothing', tags: ['winter'] });
  const saved = await gift({ name: 'Mug', price: 12.5, status: 'saved' });
  await gift({ name: 'Idea', price: 30, status: 'suggestion', isAISuggested: true });
  await call('patch', `/gifts/${saved}/favorite`);
  await call('post', '/budgets/overall', { year: 2026, amount: 500, isLimited: true });
  await call('post', '/budgets/recipient', { recipientId: ids.recipient, year: 2026, allocationType: 'fixed', maximumAmount: 100, minimumAmount: 0 });
  for (const [action, rating] of [['liked', 5], ['purchased', 4], ['ignored', null]]) {
    await call('post', '/feedback', { giftId: bought, action, explicitRating: rating, comment: 'ok' });
  }
  await Notification.create({ user: user._id, event, notificationType: 'info', notificationDate: new Date() });
  await call('post', '/holidays/generate').catch(() => {});
});

afterAll(async () => {
  await teardownTestDB();
  await redisClient.flushdb();
  await Promise.all([redisClient, publisherClient, subscriberClient].map((c) => c.quit().catch(() => {})));
  await Promise.all(Object.values(queues).map((q) => q.close().catch(() => {})));
});

describe('every read endpoint', () => {
  const variants = [
    '/gifts?status=purchased', '/gifts?recipientId=RID&page=2&limit=1', '/gifts?sort=-price', '/gifts?search=scarf',
    '/events?recipient=RID', '/feedback/analytics?groupBy=week', '/feedback/analytics?groupBy=month',
    '/analytics/report?period=month', '/notifications?unreadOnly=true', '/recipients?archived=true'
  ];

  it('answers without a server error', async () => {
    const routes = [...getRoutes(apiRouter.stack), ...getRoutes(databaseRoutes.stack, '/database')]
      .filter((route) => !SKIP.has(route)).map(fill);
    expect(routes.length).toBeGreaterThan(35);
    const failures = [];
    for (const path of [...new Set([...routes, ...variants.map((v) => v.replace('RID', ids.recipient))])]) {
      const res = await call('get', path);
      if (res.status >= 500) failures.push(`${path} → ${res.status} ${res.body?.message || ''}`.trim());
    }
    expect(failures).toEqual([]);
  });

  it('answers the same from the cache as from the database', async () => {
    const first = await call('get', '/gifts');
    const second = await call('get', '/gifts');
    expect(second.body).toEqual(first.body);
  });
});
