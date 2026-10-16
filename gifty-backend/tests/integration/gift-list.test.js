// GET /api/gifts filters, sorting and paging against real MongoDB: the
// Gifts, Purchase History and Home pages rely on them returning the right
// gifts, and a malformed query must be a 400, not a server error.
const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-gift-list-${process.pid}`;

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

jest.setTimeout(30000);

const app = express();
app.use(express.json());
app.use('/api/gifts', giftRoutes);
app.use(errorHandler);

const oid = () => new mongoose.Types.ObjectId();
const user = oid();
const other = oid();
const ann = oid();
const bea = oid();
const party = oid();
const list = (query = '', who = user) => request(app).get(`/api/gifts${query}`).set('x-test-user', String(who));
const names = (res) => res.body.gifts.map((g) => g.name);

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
  await mongoose.connection.db.dropDatabase();
  const gift = (name, extra) => ({
    _id: oid(), user, recipient: ann, event: party, name, price: 10, status: 'saved', favorite: false,
    createdAt: new Date('2026-01-01'), ...extra
  });
  await Gift.collection.insertMany([
    gift('Scarf', { status: 'purchased', price: 40, purchaseDate: new Date('2026-03-01'), createdAt: new Date('2026-01-05') }),
    gift('Book', { status: 'purchased', price: 15, purchaseDate: new Date('2026-05-01'), createdAt: new Date('2026-01-04') }),
    gift('Mug', { favorite: true, createdAt: new Date('2026-01-03') }),
    gift('Idea', { status: 'suggestion', recipient: bea, createdAt: new Date('2026-01-02') }),
    { ...gift('Theirs', { status: 'purchased' }), user: other }
  ]);
});

afterAll(async () => {
  await teardownTestDB();
});

describe('GET /api/gifts', () => {
  it("lists only the caller's gifts, newest first", async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(names(res)).toEqual(['Scarf', 'Book', 'Mug', 'Idea']);
  });

  it('filters by status, recipient and favorite', async () => {
    expect(names(await list('?status=purchased'))).toEqual(['Scarf', 'Book']);
    expect(names(await list(`?recipientId=${bea}`))).toEqual(['Idea']);
    expect(names(await list('?favorite=true'))).toEqual(['Mug']);
  });

  it('sorts purchases by purchase date, as Purchase History asks', async () => {
    const res = await list('?status=purchased&sortBy=purchaseDate&sortOrder=desc');
    expect(names(res)).toEqual(['Book', 'Scarf']);
  });

  it('accepts the 1000 the pages ask for', async () => {
    expect((await list('?limit=1000')).status).toBe(200);
  });

  it('pages through the list', async () => {
    const page2 = await list('?limit=2&page=2');
    expect(names(page2)).toEqual(['Mug', 'Idea']);
    expect(page2.body.pagination).toMatchObject({ total: 4, page: 2, limit: 2, totalPages: 2 });
  });

  it.each([
    ['a negative page', '?page=-1'],
    ['a negative limit', '?limit=-5'],
    ['a limit over 1000', '?limit=1001'],
    ['a malformed recipient id', '?recipientId=not-an-id'],
    ['a malformed event id', '?eventId=123']
  ])('answers %s with a 400, not a server error', async (_, query) => {
    const res = await list(query);
    expect(res.status).toBe(400);
  });
});
