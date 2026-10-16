// A borrowed session must not be a way to guess the account's password:
// wrong current passwords on change-password and on an email change are
// counted per account and per address, and the sixth within 15 minutes is
// refused even when it is right. Through the real routes and MongoDB.
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const request = require('supertest');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-password-attempts-${process.pid}`;

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));
// The route limiters have their own tests; this is the account's own counter
jest.mock('../../middleware/rateLimitMiddleware', () => {
  const pass = new Proxy({}, { get: () => (req, res, next) => next() });
  return { authLimiters: pass, apiLimiters: pass };
});

const userRoutes = require('../../routes/userRoutes');
const errorHandler = require('../../middleware/errorHandler');
const User = require('../../models/User');
const { resetPasswordAttempts } = require('../../utils/passwordAttempts');

jest.setTimeout(60000);

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/users', userRoutes);
app.use(errorHandler);

const PASSWORD = 'Passw0rd!one';
const WRONG = 'Wrong-pass1!';
let seq = 0;

const signedIn = async () => {
  seq += 1;
  const email = `attempts${seq}@example.com`;
  await User.create({ username: `attempts${seq}`, email, password: PASSWORD, firstName: 'At', lastName: 'Tempt' });
  // One listening server: parallel requests through supertest's per-request
  // servers reset connections
  const agent = request.agent(server);
  expect((await agent.post('/api/users/login').send({ email, password: PASSWORD })).status).toBe(200);
  return { agent, email };
};

const changePassword = (agent, currentPassword) => agent.post('/api/users/change-password')
  .send({ currentPassword, newPassword: 'Passw0rd!new' });
const changeEmail = (agent, currentPassword) => agent.put('/api/users/profile')
  .send({ email: `moved-${seq}@example.com`, currentPassword });

let server;
beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
  server = app.listen(0, '127.0.0.1');
});
beforeEach(() => resetPasswordAttempts());
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await teardownTestDB();
});

describe('wrong current passwords', () => {
  it('change-password: a wrong one is a 400 with the generic message (not 401, which signs the app out)', async () => {
    const { agent } = await signedIn();
    const res = await changePassword(agent, WRONG);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Current password is incorrect');
  });

  it('change-password: the sixth attempt after five wrong ones is refused, even with the right password', async () => {
    const { agent, email } = await signedIn();
    for (let i = 0; i < 5; i += 1) expect((await changePassword(agent, WRONG)).status).toBe(400);

    const res = await changePassword(agent, PASSWORD);

    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/too many wrong passwords/i);
    // Nothing changed: the old password still signs in
    expect((await request(app).post('/api/users/login').send({ email, password: PASSWORD })).status).toBe(200);
  });

  it('email change: the sixth attempt after five wrong ones is refused, even with the right password', async () => {
    const { agent, email } = await signedIn();
    for (let i = 0; i < 5; i += 1) {
      const wrong = await changeEmail(agent, WRONG);
      expect(wrong.status).toBe(400);
      expect(wrong.body.errors[0].message).toBe('Current password is incorrect');
    }

    const res = await changeEmail(agent, PASSWORD);

    expect(res.status).toBe(429);
    expect((await User.findOne({ username: `attempts${seq}` }).lean()).email).toBe(email);
  });

  it('counts both forms together for one account', async () => {
    const { agent } = await signedIn();
    for (let i = 0; i < 3; i += 1) await changePassword(agent, WRONG);
    for (let i = 0; i < 2; i += 1) await changeEmail(agent, WRONG);

    expect((await changePassword(agent, PASSWORD)).status).toBe(429);
  });

  it('right passwords are not counted', async () => {
    const { agent } = await signedIn();
    for (let i = 0; i < 4; i += 1) await changeEmail(agent, WRONG);
    // An unchanged email needs no password and is not an attempt
    expect((await agent.put('/api/users/profile').send({ firstName: 'Still' })).status).toBe(200);
    expect((await changePassword(agent, PASSWORD)).status).toBe(200);
  });

  it('limits one address across accounts too (20 wrong in 15 minutes)', async () => {
    for (let a = 0; a < 4; a += 1) {
      const { agent } = await signedIn();
      for (let i = 0; i < 5; i += 1) expect((await changePassword(agent, WRONG)).status).toBe(400);
    }
    const { agent } = await signedIn();

    expect((await changePassword(agent, PASSWORD)).status).toBe(429);
  });

  it('counts parallel attempts before checking any: 20 at once, at most 5 are checked', async () => {
    const { agent } = await signedIn();
    const bcrypt = require('bcryptjs');
    const compare = jest.spyOn(bcrypt, 'compare');

    const results = await Promise.all(Array.from({ length: 20 }, () => changePassword(agent, WRONG)));

    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 400)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(15);
    // Each checked attempt costs up to two compares (the legacy-encoded form)
    expect(compare.mock.calls.length).toBeLessThanOrEqual(10);
    compare.mockRestore();
  });

  it('gives a right password its attempt back', async () => {
    const { agent } = await signedIn();
    for (let i = 0; i < 4; i += 1) await changeEmail(agent, WRONG);
    expect((await agent.put('/api/users/profile').send({ email: `back-${seq}@example.com`, currentPassword: PASSWORD })).status).toBe(200);
    // Still one wrong one left before the limit
    expect((await changePassword(agent, WRONG)).status).toBe(400);
    expect((await changePassword(agent, PASSWORD)).status).toBe(429);
  });

  // Deleting the account is as final as it gets: it needs the password too
  describe('deleting the account', () => {
    const deleteAccount = (agent, currentPassword) => agent.delete('/api/users/account')
      .send(currentPassword === undefined ? {} : { currentPassword });

    it('refuses without the current password, or with a wrong one, as a field error, and deletes nothing', async () => {
      const { agent, email } = await signedIn();

      for (const res of [await deleteAccount(agent), await deleteAccount(agent, WRONG)]) {
        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual([{ field: 'currentPassword', message: expect.any(String) }]);
      }
      expect((await deleteAccount(agent, WRONG)).body.errors[0].message).toBe('Current password is incorrect');
      expect(await User.exists({ email })).toBeTruthy();
    });

    it('deletes with the right password', async () => {
      const { agent, email } = await signedIn();
      expect((await deleteAccount(agent, PASSWORD)).status).toBe(200);
      expect(await User.exists({ email })).toBeNull();
    });

    it('counts wrong passwords with the other forms: the sixth attempt is refused even when right', async () => {
      const { agent, email } = await signedIn();
      for (let i = 0; i < 3; i += 1) await changePassword(agent, WRONG);
      for (let i = 0; i < 2; i += 1) expect((await deleteAccount(agent, WRONG)).status).toBe(400);

      expect((await deleteAccount(agent, PASSWORD)).status).toBe(429);
      expect(await User.exists({ email })).toBeTruthy();
    });
  });
});

