// Request input can't carry MongoDB operators: keys starting with $ or
// containing a dot are dropped from bodies and query strings before any
// route sees them. Arrays and ordinary nested objects pass untouched.
// Real MongoDB for the gift library feedback case.
const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-operator-input-${process.pid}`;

jest.mock('../../middleware/authMiddleware', () => {
  const { Types } = require('mongoose');
  return {
    protect: (req, res, next) => {
      req.user = { _id: new Types.ObjectId(req.headers['x-test-user']) };
      next();
    }
  };
});
jest.mock('../../middleware/instanceOwnerMiddleware', () => ({
  requireInstanceOwner: (req, res, next) => next(), isInstanceOwner: jest.fn()
}));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const { stripMongoOperators } = require('../../middleware/sanitizeMongoKeys');
const GiftLibrary = require('../../models/GiftLibrary');
const errorHandler = require('../../middleware/errorHandler');

jest.setTimeout(30000);

// Mounted as server.js mounts it: after the body parser, before every router
const app = express();
app.use(express.json());
app.use(stripMongoOperators);
app.use('/api/gift-library', require('../../routes/giftLibraryRoutes'));
app.post('/echo', (req, res) => res.json({ body: req.body, query: req.query }));
app.use(errorHandler);

const user = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
});
afterAll(async () => {
  await teardownTestDB();
});

describe('POST /api/gift-library/feedback with an operator for giftId', () => {
  it('reacts to nothing: 400, and no library item gets a reaction', async () => {
    const gift = await GiftLibrary.create({ name: 'Any gift', description: 'd', status: 'active' });

    const res = await request(app).post('/api/gift-library/feedback').set('x-test-user', user)
      .send({ giftId: { $ne: null }, action: 'liked' });

    expect(res.status).toBe(400);
    const stored = await GiftLibrary.findById(gift._id).select('+reactions').lean();
    expect(stored.reactions || []).toEqual([]);
  });

  it('still records a reaction for a real gift id', async () => {
    const gift = await GiftLibrary.create({ name: 'Real gift', description: 'd', status: 'active' });

    const res = await request(app).post('/api/gift-library/feedback').set('x-test-user', user)
      .send({ giftId: String(gift._id), action: 'liked' });

    expect(res.status).toBe(200);
  });
});

describe('what reaches a route', () => {
  it('drops $-prefixed and dotted keys at any depth, in the body and the query', async () => {
    const res = await request(app)
      .post('/echo?status[$ne]=x&ok=1&a.b=2')
      .send({ name: 'n', $where: 'sleep(1)', nested: { $gt: '', keep: 1, 'x.y': 2 }, list: [{ $set: 1, v: 2 }] });

    expect(res.body.body).toEqual({ name: 'n', nested: { keep: 1 }, list: [{ v: 2 }] });
    expect(res.body.query).toEqual({ status: {}, ok: '1' });
  });

  it('leaves arrays as the app sends them (axios array params, list fields)', async () => {
    const res = await request(app)
      .post('/echo?tags[]=books&tags[]=games&recipientId=abc')
      .send({ categories: ['national', 'cultural'], reminders: [{ days: 1 }, { days: 7 }], preferences: { holidaySettings: { categories: ['national'] } } });

    expect(res.body.query).toEqual({ tags: ['books', 'games'], recipientId: 'abc' });
    expect(res.body.body).toEqual({ categories: ['national', 'cultural'], reminders: [{ days: 1 }, { days: 7 }], preferences: { holidaySettings: { categories: ['national'] } } });
  });

  it('drops values nested deeper than it checks, instead of passing them on unchecked', async () => {
    let deep = { $where: 'sleep(1)', note: 'bottom' };
    for (let i = 0; i < 30; i += 1) deep = { level: deep };
    let list = [{ $gt: 1 }];
    for (let i = 0; i < 30; i += 1) list = [list];
    const res = await request(app).post('/echo').send({ keep: 'yes', deep, list });

    expect(res.body.body.keep).toBe('yes');
    expect(JSON.stringify(res.body.body)).not.toContain('$where');
    expect(JSON.stringify(res.body.body)).not.toContain('$gt');
    // Ordinary shallow nesting is untouched
    let shallow = res.body.body.deep;
    for (let i = 0; i < 5; i += 1) shallow = shallow.level;
    expect(shallow).toBeDefined();
  });
});

