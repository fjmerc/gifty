// Accounts from before the upgrade have cost-10 (or legacy HTML-encoded)
// password hashes, which a correct password re-hashes. That must never
// leave the loaded account holding a changed password that a later save
// hashes a second time: the account could not sign in again. Every flow
// that checks the password and then saves the account, through the real
// routes and MongoDB.
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const request = require('supertest');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-password-rehash-${process.pid}`;

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));
jest.mock('../../middleware/rateLimitMiddleware', () => {
  const pass = new Proxy({}, { get: () => (req, res, next) => next() });
  return { authLimiters: pass, apiLimiters: pass };
});

const userRoutes = require('../../routes/userRoutes');
const errorHandler = require('../../middleware/errorHandler');
const User = require('../../models/User');
const { legacyEncode } = require('../../utils/legacyInputEncoding');

jest.setTimeout(60000);

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/users', userRoutes);
app.use(errorHandler);

const PASSWORD = `Tom&Jerry's<pw>1A`;
let seq = 0;

// An account as an older version stored it, written past the model
const oldAccount = async (hashOf = (pw) => bcrypt.hash(pw, 10)) => {
  seq += 1;
  const _id = new mongoose.Types.ObjectId();
  const email = `old${seq}@example.com`;
  await User.collection.insertOne({
    _id, username: `old${seq}`, email, firstName: 'Old', lastName: 'Timer',
    password: await hashOf(PASSWORD), createdAt: new Date(), updatedAt: new Date()
  });
  return { _id, email };
};

const login = (email, password = PASSWORD) => request(app).post('/api/users/login').send({ email, password });
const signIn = async (email) => {
  const agent = request.agent(app);
  expect((await agent.post('/api/users/login').send({ email, password: PASSWORD })).status).toBe(200);
  return agent;
};

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
});
afterAll(async () => {
  await teardownTestDB();
});

describe.each([
  ['a cost-10 hash', undefined],
  ['a legacy HTML-encoded hash', (pw) => bcrypt.hash(legacyEncode(pw), 10)]
])('an account with %s', (_, hashOf) => {
  it('signs in, is re-hashed to cost 12, and signs in again', async () => {
    const { _id, email } = await oldAccount(hashOf);
    expect((await login(email)).status).toBe(200);
    expect(bcrypt.getRounds((await User.collection.findOne({ _id })).password)).toBe(12);
    expect((await login(email)).status).toBe(200);
  });

  it('changes its email with the password in the same request that re-hashes it, and still signs in', async () => {
    const { _id, email } = await oldAccount(hashOf);
    // Sign in with a token made for it, so the email change is the first password check
    const agent = request.agent(app);
    const { generateToken } = require('../../utils/generateToken');
    agent.set('Cookie', `access_token=${generateToken(_id, 'access', 0)}`);

    const moved = `moved-${email}`;
    const res = await agent.put('/api/users/profile').send({ email: moved, currentPassword: PASSWORD, firstName: 'Renamed' });
    expect(res.status).toBe(200);

    expect((await login(moved)).status).toBe(200);
    expect(await bcrypt.compare(PASSWORD, (await User.collection.findOne({ _id })).password)).toBe(true);
  });

  it('changes its password with the old one, and signs in with the new one', async () => {
    const { _id, email } = await oldAccount(hashOf);
    const agent = request.agent(app);
    const { generateToken } = require('../../utils/generateToken');
    agent.set('Cookie', `access_token=${generateToken(_id, 'access', 0)}`);

    const res = await agent.post('/api/users/change-password').send({ currentPassword: PASSWORD, newPassword: 'Passw0rd!new' });
    expect(res.status).toBe(200);

    expect((await login(email, 'Passw0rd!new')).status).toBe(200);
    expect((await login(email)).status).toBe(401);
  });

  it('signs out (session bump) and saves its profile after a re-hash, and still signs in', async () => {
    const { email } = await oldAccount(hashOf);
    const agent = await signIn(email);
    expect((await agent.put('/api/users/profile').send({ firstName: 'Saved' })).status).toBe(200);
    expect((await agent.post('/api/users/logout')).status).toBe(200);

    expect((await login(email)).status).toBe(200);
  });
});

describe('a cost-10 account through every flow in a row', () => {
  it('signs in (re-hash), signs out (session bump), changes password, changes email, and signs in again', async () => {
    const { _id, email } = await oldAccount();

    const agent = await signIn(email); // re-hashes to cost 12
    expect(bcrypt.getRounds((await User.collection.findOne({ _id })).password)).toBe(12);
    expect((await agent.post('/api/users/logout')).status).toBe(200);

    const again = await signIn(email);
    const NEW = 'Passw0rd!next';
    const changed = await again.post('/api/users/change-password').send({ currentPassword: PASSWORD, newPassword: NEW });
    expect(changed.status).toBe(200);

    const moved = `moved-${email}`;
    const emailChange = await again.put('/api/users/profile').send({ email: moved, currentPassword: NEW });
    expect(emailChange.status).toBe(200);

    expect((await login(moved, NEW)).status).toBe(200);
    expect((await login(moved)).status).toBe(401);
  });
});

describe('the password hook', () => {
  it('never hashes a stored bcrypt hash a second time when a loaded account is saved', async () => {
    const { _id, email } = await oldAccount();
    const user = await User.findById(_id);
    expect(await user.matchPassword(PASSWORD)).toBe(true);
    // A later save of the same document in the same request
    user.firstName = 'Later';
    await user.save();

    expect((await login(email)).status).toBe(200);
  });
});
