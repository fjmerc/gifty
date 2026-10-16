// On a fresh instance the first account becomes the instance owner, so it
// needs a one-time setup code from the server log or the data folder.
// Instances that already have accounts are not affected. Real MongoDB.
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), `gifty-test-setup-${process.pid}`);

const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const request = require('supertest');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-first-run-${process.pid}`;

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));
jest.mock('../../middleware/rateLimitMiddleware', () => {
  const pass = new Proxy({}, { get: () => (req, res, next) => next() });
  return { authLimiters: pass, apiLimiters: pass };
});
jest.mock('../../services/holidayService', () => ({
  generateHolidayEvents: jest.fn().mockResolvedValue({ created: 0 }),
  updateUserHolidayEvents: jest.fn().mockResolvedValue({})
}));

const logger = require('../../utils/logger');
const setup = require('../../services/setupCodeService');
const errorHandler = require('../../middleware/errorHandler');
const User = require('../../models/User');

jest.setTimeout(30000);

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/users', require('../../routes/userRoutes'));
app.use('/api/instance', require('../../routes/instanceRoutes'));
app.use(errorHandler);

const CODE_FILE = path.join(process.env.DATA_DIR, 'setup-code.txt');
const account = (n, extra = {}) => ({
  username: `first${n}`, email: `first${n}@example.com`, password: 'Passw0rd!one', firstName: 'Fi', lastName: 'Rst', ...extra
});
// The code as the server wrote it to the data folder (never printed here)
const codeFromFile = () => fs.readFileSync(CODE_FILE, 'utf8').match(/Setup code: (\S+)/)[1];

let savedSetupCode;
beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
  // These tests use the real code, not the test-only shortcut
  savedSetupCode = process.env.SETUP_CODE;
  delete process.env.SETUP_CODE;
});
beforeEach(async () => {
  await User.deleteMany({});
  await setup.clearSetupCode();
  jest.clearAllMocks();
});
afterAll(async () => {
  process.env.SETUP_CODE = savedSetupCode;
  await teardownTestDB();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

describe('first-run setup code', () => {
  it('on a boot with no accounts: logs the code once with instructions, writes it 0600 to the data folder and stores only a hash', async () => {
    await setup.ensureSetupCode();

    const code = codeFromFile();
    expect(fs.statSync(CODE_FILE).mode & 0o777).toBe(0o600);
    const warned = logger.warn.mock.calls.map((c) => String(c[0])).filter((line) => line.includes(code));
    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatch(/\/register/);
    expect(warned[0]).toMatch(/setup code/i);
    const stored = await mongoose.connection.db.collection('instance').findOne({ _id: 'setup-code' });
    expect(stored.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(code);
  });

  it('reports setupRequired on /api/instance until the first account exists', async () => {
    await setup.ensureSetupCode();
    expect((await request(app).get('/api/instance')).body.setupRequired).toBe(true);

    expect((await request(app).post('/api/users/register').send(account(1, { setupCode: codeFromFile() }))).status).toBe(201);

    expect((await request(app).get('/api/instance')).body.setupRequired).toBe(false);
  });

  it('refuses the first registration without the code, or with a wrong one, as a setupCode field error', async () => {
    await setup.ensureSetupCode();

    const missing = await request(app).post('/api/users/register').send(account(1));
    const wrong = await request(app).post('/api/users/register').send(account(1, { setupCode: 'AAAA-BBBB-CCCC-DDDD' }));

    for (const res of [missing, wrong]) {
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual([{ field: 'setupCode', message: expect.stringMatching(/setup code/i) }]);
    }
    expect(await User.countDocuments()).toBe(0);
  });

  it('accepts the code however it is typed, then deletes the file and the hash; later accounts need no code', async () => {
    await setup.ensureSetupCode();
    const typed = ` ${codeFromFile().toLowerCase().replace(/-/g, ' ')} `;

    expect((await request(app).post('/api/users/register').send(account(1, { setupCode: typed }))).status).toBe(201);

    expect(fs.existsSync(CODE_FILE)).toBe(false);
    expect(await mongoose.connection.db.collection('instance').findOne({ _id: 'setup-code' })).toBeNull();
    expect((await request(app).post('/api/users/register').send(account(2))).status).toBe(201);
  });

  it('a new boot with no accounts replaces the old code', async () => {
    await setup.ensureSetupCode();
    const first = codeFromFile();
    await setup.ensureSetupCode();
    const second = codeFromFile();

    expect(second).not.toBe(first);
    expect((await request(app).post('/api/users/register').send(account(1, { setupCode: first }))).status).toBe(400);
    expect((await request(app).post('/api/users/register').send(account(1, { setupCode: second }))).status).toBe(201);
  });

  it('makes a code when the accounts disappear while the server runs, and says where to find it', async () => {
    const res = await request(app).post('/api/users/register').send(account(1, { setupCode: 'AAAA-BBBB-CCCC-DDDD' }));

    expect(res.status).toBe(400);
    expect(fs.existsSync(CODE_FILE)).toBe(true);
    expect((await request(app).post('/api/users/register').send(account(1, { setupCode: codeFromFile() }))).status).toBe(201);
  });

  // A second "first" registration racing the first: by the time it checks
  // the code, the first account exists and the code is gone
  it('does not make a new code when an account appeared in the meantime', async () => {
    await setup.ensureSetupCode();
    await User.create(account(1));
    await setup.clearSetupCode();
    jest.clearAllMocks();

    expect(await setup.verifySetupCode('AAAA-BBBB-CCCC-DDDD')).toBe(false);

    expect(fs.existsSync(CODE_FILE)).toBe(false);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(await mongoose.connection.db.collection('instance').findOne({ _id: 'setup-code' })).toBeNull();
  });

  it('leaves an instance that already has accounts alone: no code, no file, open registration', async () => {
    await User.create(account(1));
    fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
    fs.writeFileSync(CODE_FILE, 'Setup code: STALE-CODE-FROM-OLD\n');

    await setup.ensureSetupCode();

    expect(fs.existsSync(CODE_FILE)).toBe(false);
    expect(logger.warn).not.toHaveBeenCalled();
    expect((await request(app).get('/api/instance')).body.setupRequired).toBe(false);
    expect((await request(app).post('/api/users/register').send(account(2))).status).toBe(201);
  });

  it('honours SETUP_CODE from the environment only under NODE_ENV=test', async () => {
    await setup.ensureSetupCode();
    const savedEnv = process.env.NODE_ENV;
    process.env.SETUP_CODE = 'TEST-ONLY-CODE';
    try {
      process.env.NODE_ENV = 'production';
      expect(await setup.verifySetupCode('TEST-ONLY-CODE')).toBe(false);
      process.env.NODE_ENV = 'test';
      expect(await setup.verifySetupCode('TEST-ONLY-CODE')).toBe(true);
    } finally {
      process.env.NODE_ENV = savedEnv;
      delete process.env.SETUP_CODE;
    }
  });
});
