// Signing out, or changing the password, must end every copy of the
// session: a refresh token copied before then stops working. Through the
// real user routes, JWT cookies and MongoDB.
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), `gifty-test-tokens-${process.pid}`);

const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-token-revocation-${process.pid}`;

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

const userRoutes = require('../../routes/userRoutes');
const errorHandler = require('../../middleware/errorHandler');
const User = require('../../models/User');

jest.setTimeout(30000);

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/users', userRoutes);
app.use(errorHandler);

const PASSWORD = 'Passw0rd!one';
const NEW_PASSWORD = 'Passw0rd!two';
let seq = 0;

// A fresh account, created directly (registration has its own tests)
const newAccount = async () => {
  seq += 1;
  const email = `tokens${seq}@example.com`;
  await User.create({ username: `tokens${seq}`, email, password: PASSWORD, firstName: 'Tok', lastName: 'En' });
  return email;
};

// The cookie values a response set, by name
const cookiesFrom = (res) => Object.fromEntries((res.headers['set-cookie'] || [])
  .map((c) => c.split(';')[0].split('='))
  .filter(([, value]) => value));

const login = async (email, password = PASSWORD) => {
  const res = await request(app).post('/api/users/login').send({ email, password });
  expect(res.status).toBe(200);
  return cookiesFrom(res);
};

const refreshWith = (refreshToken) => request(app)
  .post('/api/users/refresh-token').set('Cookie', `refresh_token=${refreshToken}`);
const profileWith = (accessToken) => request(app)
  .get('/api/users/profile').set('Cookie', `access_token=${accessToken}`);

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
});

afterAll(async () => {
  await teardownTestDB();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

describe('token revocation', () => {
  it('rejects a refresh token copied before logout, and the access token too', async () => {
    const email = await newAccount();
    const stolen = await login(email);
    expect((await refreshWith(stolen.refresh_token)).status).toBe(200);

    const out = await request(app).post('/api/users/logout').set('Cookie', `access_token=${stolen.access_token}`);
    expect(out.status).toBe(200);

    const refreshed = await refreshWith(stolen.refresh_token);
    expect(refreshed.status).toBe(401);
    const profile = await profileWith(stolen.access_token);
    expect(profile.status).toBe(401);
    // Not "expired": the client must not try to refresh its way back in
    expect(profile.body.code).not.toBe('TOKEN_EXPIRED');
  });

  it('rejects a refresh token copied before a password change, while the session that changed it carries on', async () => {
    const email = await newAccount();
    const stolen = await login(email);
    const mine = await login(email);

    const changed = await request(app).post('/api/users/change-password')
      .set('Cookie', `access_token=${mine.access_token}`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(changed.status).toBe(200);

    expect((await refreshWith(stolen.refresh_token)).status).toBe(401);
    expect((await profileWith(stolen.access_token)).status).toBe(401);

    const renewed = cookiesFrom(changed);
    expect((await profileWith(renewed.access_token)).status).toBe(200);
    expect((await refreshWith(renewed.refresh_token)).status).toBe(200);
  });

  it('refresh hands out a new pair of tokens that keeps working', async () => {
    const email = await newAccount();
    const first = await login(email);

    const res = await refreshWith(first.refresh_token);
    expect(res.status).toBe(200);
    const next = cookiesFrom(res);
    expect(next.access_token).toBeTruthy();
    expect(next.refresh_token).toBeTruthy();
    expect((await profileWith(next.access_token)).status).toBe(200);
    expect((await refreshWith(next.refresh_token)).status).toBe(200);
  });

  it('keeps tokens issued before the upgrade (no version claim) working until the next sign-out', async () => {
    const email = await newAccount();
    const user = await User.findOne({ email });
    // Accounts from before the upgrade have no tokenVersion stored either
    await User.collection.updateOne({ _id: user._id }, { $unset: { tokenVersion: '' } });
    const oldAccess = jwt.sign({ id: user._id, type: 'access' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const oldRefresh = jwt.sign({ id: user._id, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: '7d' });

    expect((await profileWith(oldAccess)).status).toBe(200);
    expect((await refreshWith(oldRefresh)).status).toBe(200);

    expect((await request(app).post('/api/users/logout').set('Cookie', `access_token=${oldAccess}`)).status).toBe(200);

    expect((await profileWith(oldAccess)).status).toBe(401);
    expect((await refreshWith(oldRefresh)).status).toBe(401);
  });

  it('a new login after logout works', async () => {
    const email = await newAccount();
    const first = await login(email);
    await request(app).post('/api/users/logout').set('Cookie', `access_token=${first.access_token}`);

    const again = await login(email);
    expect((await profileWith(again.access_token)).status).toBe(200);
    expect((await refreshWith(again.refresh_token)).status).toBe(200);
  });
});
