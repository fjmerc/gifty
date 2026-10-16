// Settings → Export data (CSV / JSON / ZIP), through the real settings routes
// and MongoDB. Only auth is stubbed. An export is a readable copy for a
// spreadsheet: every row has the same columns, people and events appear by
// name, prices come with their currency, and the file opens cleanly in Excel.
const realProcess = require('vm').runInThisContext('process');
process.env.TZ = 'Europe/Berlin';
realProcess.env.TZ = 'Europe/Berlin';

const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const AdmZip = require('adm-zip');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-data-export-${process.pid}`;

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
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const settingsRoutes = require('../../routes/settingsRoutes');
const errorHandler = require('../../middleware/errorHandler');
const { Budget, OverallBudget } = require('../../models/Budget');
const Event = require('../../models/Event');
const EventType = require('../../models/EventType');
const Gift = require('../../models/Gift');
const Recipient = require('../../models/Recipient');
const Tag = require('../../models/Tags');

jest.setTimeout(30000);

const app = express();
app.use(express.json());
app.use('/api/settings', settingsRoutes);
app.use(errorHandler);

const oid = () => new mongoose.Types.ObjectId();
const userA = oid();
const userB = oid();
const day = (s) => new Date(`${s}T00:00:00.000Z`);
const noon = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };

const exportAs = (body, user = userA) => request(app).post('/api/settings/export')
  .set('x-test-user', String(user)).send(body)
  .buffer(true).parse((res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });

// Minimal RFC 4180 reader: rows of fields, quotes and line breaks inside quotes
const readCsv = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\r') continue;
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
};

// The rows of one section, as objects keyed by the header row
const section = (rows, title) => {
  const start = rows.findIndex((r) => r.length === 1 && r[0] === title);
  expect(start).toBeGreaterThanOrEqual(0);
  const header = rows[start + 1];
  const body = [];
  for (let i = start + 2; i < rows.length && !(rows[i].length === 1 && rows[i][0] === ''); i += 1) {
    expect(rows[i]).toHaveLength(header.length);
    body.push(Object.fromEntries(header.map((h, j) => [h, rows[i][j]])));
  }
  return body;
};

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
  await mongoose.connection.db.dropDatabase();
  const birthday = await EventType.create({ name: 'Birthday' });
  const tag = await Tag.create({ name: 'books', user: userA });
  const ann = await Recipient.create({
    user: userA, firstName: 'José', lastName: '=HYPERLINK("http://x","y")', relation: 'Friend', relationship: 'friendship',
    birthdate: day('1990-03-04'), tags: [tag._id], interests: ['reading', 'tea, green'],
    address: { street: '1 Main, Apt 2', city: 'Köln' }
  });
  const party = await Event.create({ user: userA, recipient: ann._id, name: 'Birthday party', date: day('2026-03-04'), type: birthday._id });
  // Saved first: its columns must not decide the header
  await Gift.create({ user: userA, recipient: ann._id, event: party._id, name: 'Idea first', price: 15, status: 'saved', description: 'line1\nline2 "quoted"' });
  await Gift.create({ user: userA, recipient: ann._id, event: party._id, name: 'Book, Novel', price: 40.1, status: 'purchased', purchaseDate: noon('2026-02-28') });
  // Bought in a year with no overall budget
  await Gift.create({ user: userA, recipient: ann._id, event: party._id, name: 'Old gift', price: 5, status: 'purchased', purchaseDate: noon('2025-06-01') });
  await OverallBudget.create({ user: userA, year: 2026, amount: 500, currency: 'EUR', isLimited: true });
  await Budget.create({ user: userA, recipient: ann._id, year: 2026, allocationType: 'fixed', maximumAmount: 100, currency: 'EUR', isLimited: true });
  // Someone else's data never appears
  const other = await Recipient.create({ user: userB, firstName: 'Other', lastName: 'Person', relation: 'x', relationship: 'friendship', birthdate: day('1980-01-01') });
  await Gift.create({ user: userB, recipient: other._id, event: party._id, name: 'Not yours', price: 1, status: 'saved' });
});

afterAll(async () => {
  await teardownTestDB();
});

describe('CSV export', () => {
  let text;
  let rows;

  beforeAll(async () => {
    const res = await exportAs({ dataTypes: ['recipients', 'gifts', 'events', 'budgets'], format: 'csv' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv; charset=utf-8/);
    text = res.body.toString('utf8');
    rows = readCsv(text.replace(/^﻿/, ''));
  });

  it('starts with a UTF-8 byte order mark so Excel reads accents', () => {
    expect(text.charCodeAt(0)).toBe(0xFEFF);
    expect(text).toContain('José');
  });

  it('gives every gift the same columns, purchase date and currency included', () => {
    const gifts = section(rows, 'GIFTS').slice(0, 2);
    expect(gifts).toEqual([
      expect.objectContaining({ Name: 'Idea first', Recipient: expect.stringContaining('José'), Event: 'Birthday party', 'Event date': '2026-03-04', Status: 'saved', Price: '15', Currency: 'EUR', 'Purchase date': '', Description: 'line1\nline2 "quoted"' }),
      expect.objectContaining({ Name: 'Book, Novel', Status: 'purchased', Price: '40.1', Currency: 'EUR', 'Purchase date': '2026-02-28' })
    ]);
  });

  it('a year without a budget takes the household\'s latest currency', () => {
    const old = section(rows, 'GIFTS').find((g) => g.Name === 'Old gift');
    expect(old).toEqual(expect.objectContaining({ Currency: 'EUR', 'Purchase date': '2025-06-01' }));
  });

  it('keeps commas, quotes and line breaks in their cell', () => {
    const [recipient] = section(rows, 'RECIPIENTS');
    expect(recipient['First name']).toBe('José');
    expect(recipient.Interests).toBe('reading; tea, green');
    expect(recipient.Tags).toBe('books');
    expect(recipient.Birthday).toBe('1990-03-04');
  });

  it('stops a cell from being read as a formula', () => {
    const [recipient] = section(rows, 'RECIPIENTS');
    expect(recipient['Last name']).toBe('\'=HYPERLINK("http://x","y")');
  });

  it('names event types and recipients instead of ids', () => {
    const [event] = section(rows, 'EVENTS');
    expect(event).toEqual(expect.objectContaining({ Name: 'Birthday party', Date: '2026-03-04', Type: 'Birthday', Recipient: expect.stringContaining('José') }));
    expect(text).not.toMatch(/[0-9a-f]{24}/);
  });

  it('exports budgets with their recipient and currency', () => {
    expect(section(rows, 'BUDGETS')).toEqual([
      expect.objectContaining({ Recipient: '(whole year)', Year: '2026', Limit: '500', Currency: 'EUR' }),
      expect.objectContaining({ Recipient: expect.stringContaining('José'), Year: '2026', Limit: '100', Currency: 'EUR' })
    ]);
  });

  it('contains nothing of another account', () => {
    expect(text).not.toMatch(/Not yours|Other Person/);
  });
});

describe('JSON export', () => {
  it('has the same readable rows', async () => {
    const res = await exportAs({ dataTypes: ['gifts'], format: 'json' });
    const body = JSON.parse(res.body.toString('utf8'));
    expect(body.gifts[1]).toEqual(expect.objectContaining({ Name: 'Book, Novel', Currency: 'EUR', 'Purchase date': '2026-02-28', Recipient: expect.stringContaining('José') }));
    expect(JSON.stringify(body)).not.toMatch(/"_id"|"user"/);
  });
});

describe('ZIP export', () => {
  it('holds a CSV and a JSON file per type', async () => {
    const res = await request(app).post('/api/settings/export-zip').set('x-test-user', String(userA))
      .send({ dataTypes: ['gifts', 'events'] })
      .buffer(true).parse((r, cb) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); });
    expect(res.status).toBe(200);
    const names = new AdmZip(res.body).getEntries().map((e) => e.entryName).sort();
    expect(names).toEqual(['events.csv', 'events.json', 'gifts.csv', 'gifts.json', 'metadata.json']);
  });
});

describe('bad export requests', () => {
  it.each([
    ['no types', { format: 'csv' }, /specify data types/],
    ['an empty type list', { dataTypes: [], format: 'csv' }, /specify data types/],
    ['only unknown types', { dataTypes: ['passwords'], format: 'csv' }, /Choose from/],
    ['an unknown format', { dataTypes: ['gifts'], format: 'xlsx' }, /Invalid format/]
  ])('refuses %s with a 400', async (label, body, message) => {
    const res = await exportAs(body);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body.toString('utf8')).message).toMatch(message);
  });

  it('needs a signed-in user', async () => {
    expect((await request(app).post('/api/settings/export').send({ dataTypes: ['gifts'], format: 'csv' })).status).toBe(401);
  });
});
