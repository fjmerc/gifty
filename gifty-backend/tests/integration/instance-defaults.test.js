// A fresh install outside the US: DEFAULT_COUNTRY and DEFAULT_CURRENCY give
// new accounts that country's holidays and that currency wherever money is
// shown before any budget exists. Existing accounts keep what they had.
// Real user routes, budget routes, holiday generation and MongoDB.
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), `gifty-test-instance-defaults-${process.pid}`);

const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const request = require('supertest');
const { teardownTestDB } = require('../utils/testSetup');
const { openSignup } = require('../utils/signupMode');
const { TEST_SETUP_CODE } = require('../utils/setupCode');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-instance-defaults-${process.pid}`;

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));
jest.mock('../../middleware/rateLimitMiddleware', () => {
  const pass = new Proxy({}, { get: () => (req, res, next) => next() });
  return { authLimiters: pass, apiLimiters: pass };
});

const errorHandler = require('../../middleware/errorHandler');
const User = require('../../models/User');
const Event = require('../../models/Event');
const Recipient = require('../../models/Recipient');
const { initializeDatabase } = require('../../utils/dbInitializer');
const { getSuggestionPriceGuide } = require('../../services/moneyService');
const { buildExport } = require('../../services/exportService');

jest.setTimeout(30000);

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/users', require('../../routes/userRoutes'));
app.use('/api/budgets', require('../../routes/budgetRoutes'));
app.use('/api/instance', require('../../routes/instanceRoutes'));
app.use(errorHandler);

const YEAR = new Date().getFullYear();
const ENV_KEYS = ['DEFAULT_COUNTRY', 'DEFAULT_CURRENCY'];
const savedEnv = {};
let n = 0;

const register = async () => {
  n += 1;
  const agent = request.agent(app);
  const res = await agent.post('/api/users/register').send({
    username: `fresh${n}`, email: `fresh${n}@example.com`, password: 'Passw0rd!one',
    firstName: 'Fre', lastName: 'Sh', setupCode: TEST_SETUP_CODE
  });
  expect(res.status).toBe(201);
  return { agent, user: await User.findById(res.body._id) };
};

const holidayNames = async (userId) => (await Event.find({ user: userId, isSystemGenerated: true }).lean()).map((e) => e.name);

beforeAll(async () => {
  ENV_KEYS.forEach((key) => { savedEnv[key] = process.env[key]; });
  await mongoose.connect(TEST_DB_URI);
  await initializeDatabase();
});
beforeEach(async () => {
  ENV_KEYS.forEach((key) => delete process.env[key]);
  // Each test seeds the stored defaults from its own env
  await mongoose.connection.db.collection('instance').deleteMany({});
  // Several accounts sign up here without invites
  await openSignup();
});
afterAll(async () => {
  ENV_KEYS.forEach((key) => {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  });
  await teardownTestDB();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

describe('an instance set to Germany and euros', () => {
  beforeEach(() => {
    process.env.DEFAULT_COUNTRY = 'DE';
    process.env.DEFAULT_CURRENCY = 'EUR';
  });

  it('gives a new account German holidays and euros', async () => {
    const { agent, user } = await register();

    expect(user.preferences.holidaySettings.countryCode).toBe('DE');
    expect(user.preferences.currency).toBe('EUR');
    const names = await holidayNames(user._id);
    expect(names).toContain('Tag der Deutschen Einheit');
    expect(names).not.toContain('Independence Day');

    const overall = await agent.get(`/api/budgets/overall/${YEAR}`);
    expect(overall.status).toBe(200);
    expect(overall.body).toMatchObject({ exists: false, currency: 'EUR' });
    const all = await agent.get(`/api/budgets/all/${YEAR}`);
    expect(all.body.currency).toBe('EUR');
    const analytics = await agent.get(`/api/budgets/analytics/${YEAR}`);
    expect(analytics.body.currency).toBe('EUR');
  });

  it('asks the AI for prices in euros when there is no budget', async () => {
    const { user } = await register();
    const recipient = await Recipient.create({
      user: user._id, firstName: 'Ann', lastName: 'Lee', relation: 'Friend', relationship: 'friendship', birthdate: new Date('1990-01-01')
    });
    expect((await getSuggestionPriceGuide(user._id, recipient, YEAR)).currency).toBe('EUR');
  });

  it('exports budgets of a year without an overall budget in euros', async () => {
    const { user } = await register();
    const recipient = await Recipient.create({
      user: user._id, firstName: 'Ann', lastName: 'Lee', relation: 'Friend', relationship: 'friendship', birthdate: new Date('1990-01-01')
    });
    await mongoose.model('Budget').create({ user: user._id, recipient: recipient._id, year: YEAR, maximumAmount: 50 });
    const exported = await buildExport(user._id, ['budgets']);
    expect(exported.budgets.every((row) => row.Currency === 'EUR')).toBe(true);
  });

  it('leaves an account made before the setting in dollars with US holidays', async () => {
    const id = new mongoose.Types.ObjectId();
    await User.collection.insertOne({ _id: id, username: `old${id}`, email: `old${id}@example.com`, password: 'x', firstName: 'O', lastName: 'Ld', preferences: {} });
    const old = await User.findById(id);
    expect(old.preferences.holidaySettings.countryCode).toBe('US');
    const recipient = await Recipient.create({
      user: id, firstName: 'Bo', lastName: 'Lee', relation: 'Friend', relationship: 'friendship', birthdate: new Date('1990-01-01')
    });
    expect((await getSuggestionPriceGuide(id, recipient, YEAR)).currency).toBe('USD');
  });

  it('says what the defaults are, before sign-in', async () => {
    const res = await request(app).get('/api/instance');
    expect(res.status).toBe(200);
    expect(res.body.defaults).toEqual({ country: 'DE', currency: 'EUR' });
  });
});

describe('an instance without the settings', () => {
  it('gives a new account US holidays and dollars, as before', async () => {
    const { agent, user } = await register();

    expect(user.preferences.holidaySettings.countryCode).toBe('US');
    expect(user.preferences.currency).toBe('USD');
    expect(await holidayNames(user._id)).toContain('Independence Day');
    expect((await agent.get(`/api/budgets/overall/${YEAR}`)).body.currency).toBe('USD');
    expect((await request(app).get('/api/instance')).body.defaults).toEqual({ country: 'US', currency: 'USD' });
  });
});

describe('stored defaults', () => {
  it('once stored, the database defaults win over a changed .env', async () => {
    process.env.DEFAULT_CURRENCY = 'EUR';
    await require('../../services/instanceSettings').ensureInstanceSettings();
    process.env.DEFAULT_CURRENCY = 'GBP';
    const info = (await request(app).get('/api/instance')).body;
    expect(info.defaults.currency).toBe('EUR');
  });
});
