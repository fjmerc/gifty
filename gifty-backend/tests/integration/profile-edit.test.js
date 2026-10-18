// Editing your own profile through the real routes, JWT cookies and MongoDB.
// The profile form must not be a way to change the password (that needs the
// current one), and accounts without a date of birth must be able to save.
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const request = require('supertest');
const { teardownTestDB } = require('../utils/testSetup');
const { openSignup } = require('../utils/signupMode');
const { TEST_SETUP_CODE } = require('../utils/setupCode');


const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-profile-edit-${process.pid}`;

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
let seq = 0;

// A signed-in account; dateOfBirth left out unless given
const signedIn = async (extra = {}) => {
  seq += 1;
  const agent = request.agent(app);
  const account = { username: `prof${seq}`, email: `prof${seq}@example.com`, password: PASSWORD, firstName: 'Pro', lastName: 'File', setupCode: TEST_SETUP_CODE, ...extra };
  const registered = await agent.post('/api/users/register').send(account);
  expect(registered.status).toBe(201);
  expect(typeof registered.body.isOwner).toBe('boolean');
  const user = await User.findOne({ email: account.email });
  return { agent, account, user };
};

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
  // Several accounts sign up here without invites
  await openSignup();
});

afterAll(async () => {
  await teardownTestDB();
});

describe('PUT /api/users/profile', () => {
  it('does not change the password', async () => {
    const { agent, account } = await signedIn();

    const res = await agent.put('/api/users/profile').send({ firstName: 'Pia', password: 'x' });

    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Pia');
    const fresh = request.agent(app);
    expect((await fresh.post('/api/users/login').send({ email: account.email, password: PASSWORD })).status).toBe(200);
    expect((await fresh.post('/api/users/login').send({ email: account.email, password: 'x' })).status).toBe(401);
  });

  it('saves for an account without a date of birth, as the form sends it', async () => {
    const { agent, user } = await signedIn();
    await User.updateOne({ _id: user._id }, { $unset: { dateOfBirth: 1 } });

    const res = await agent.put('/api/users/profile').send({
      username: user.username, email: user.email, firstName: 'Nobirth', lastName: 'Day', dateOfBirth: ''
    });

    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Nobirth');
    expect((await User.findById(user._id).lean()).dateOfBirth).toBeUndefined();
  });

  it('clears a date of birth when the field is emptied', async () => {
    const { agent, user } = await signedIn({ dateOfBirth: '1990-05-17' });
    expect((await User.findById(user._id).lean()).dateOfBirth).toBeDefined();

    const res = await agent.put('/api/users/profile').send({ dateOfBirth: '' });

    expect(res.status).toBe(200);
    expect((await User.findById(user._id).lean()).dateOfBirth).toBeUndefined();
  });

  it('keeps the date of birth when the field is left out', async () => {
    const { agent, user } = await signedIn({ dateOfBirth: '1990-05-17' });

    await agent.put('/api/users/profile').send({ firstName: 'Keep' });

    expect((await User.findById(user._id).lean()).dateOfBirth).toEqual(new Date('1990-05-17T00:00:00.000Z'));
  });

  it('still refuses a date of birth that is not a date', async () => {
    const { agent } = await signedIn();
    expect((await agent.put('/api/users/profile').send({ dateOfBirth: 'yesterday' })).status).toBe(400);
  });

  it('answers an email already in use with a message the form can show', async () => {
    const { account: other } = await signedIn();
    const { agent } = await signedIn();

    const res = await agent.put('/api/users/profile').send({ email: other.email, currentPassword: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);
  });
});

// The email is the login: a borrowed session alone must not be able to
// take the account over by changing it
describe('changing the email on PUT /api/users/profile', () => {
  it('asks for the current password, as a field error, and changes nothing without it', async () => {
    const { agent, user } = await signedIn();

    const res = await agent.put('/api/users/profile').send({ email: 'taken-over@example.com', firstName: 'Mal' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ field: 'currentPassword', message: expect.stringMatching(/current password/i) }]);
    const stored = await User.findById(user._id).lean();
    expect(stored.email).toBe(user.email);
    expect(stored.firstName).toBe('Pro');
  });

  it('refuses a wrong current password as a field error', async () => {
    const { agent, user } = await signedIn();

    const res = await agent.put('/api/users/profile').send({ email: 'taken-over@example.com', currentPassword: 'Wrong-pass1' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ field: 'currentPassword', message: 'Current password is incorrect' }]);
    expect((await User.findById(user._id).lean()).email).toBe(user.email);
  });

  it('changes it with the right password, ends other sessions and keeps this one', async () => {
    const { agent, account, user } = await signedIn();
    const other = request.agent(app);
    expect((await other.post('/api/users/login').send({ email: account.email, password: PASSWORD })).status).toBe(200);

    const res = await agent.put('/api/users/profile').send({ email: `NEW-${account.email}`, currentPassword: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(`new-${account.email}`);
    expect((await User.findById(user._id).lean()).email).toBe(`new-${account.email}`);
    expect((await agent.get('/api/users/profile')).status).toBe(200);
    expect((await other.get('/api/users/profile')).status).toBe(401);
  });

  it('needs no password when the form sends the unchanged email, in any case', async () => {
    const { agent, account } = await signedIn();

    const res = await agent.put('/api/users/profile').send({ email: account.email.toUpperCase(), firstName: 'Same' });

    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Same');
  });
});

describe('GET /api/users/profile', () => {
  it('says whether the account is the owner, and its role', async () => {
    const { agent: newer } = await signedIn();
    const owner = await User.findOne({}, { email: 1 }).sort({ _id: 1 }).lean();
    const ownerAgent = request.agent(app);
    // Every account in this file has the same password
    const login = await ownerAgent.post('/api/users/login').send({ email: owner.email, password: PASSWORD });
    expect(login.status).toBe(200);
    // The app keeps the login answer as the signed-in user
    expect(login.body).toMatchObject({ isOwner: true, role: 'admin' });

    expect((await ownerAgent.get('/api/users/profile')).body.isOwner).toBe(true);
    expect((await newer.get('/api/users/profile')).body).toMatchObject({ isOwner: false, role: 'member' });
  });
});

// The home page greets a brand-new account differently and the backup
// reminder waits until the account has existed for a while
describe('account creation date', () => {
  it('is returned by register, login and the profile', async () => {
    const { agent, account, user } = await signedIn();
    const created = user.createdAt.toISOString();

    const profile = await agent.get('/api/users/profile');
    const login = await request.agent(app).post('/api/users/login').send({ email: account.email, password: PASSWORD });
    const registered = await request.agent(app).post('/api/users/register').send({
      username: 'brandnew', email: 'brandnew@example.com', password: PASSWORD, firstName: 'Bran', lastName: 'New', setupCode: TEST_SETUP_CODE
    });

    expect(profile.body.createdAt).toBe(created);
    expect(login.body.createdAt).toBe(created);
    expect(Date.parse(registered.body.createdAt)).not.toBeNaN();
  });
});

describe('hasRecipients', () => {
  const Recipient = require('../../models/Recipient');
  const addRecipient = (user, extra = {}) => Recipient.collection.insertOne({
    user: user._id, firstName: 'Ann', lastName: 'Lee', relation: 'Friend', relationship: 'friendship',
    birthdate: new Date('1990-01-01'), tags: [], ...extra
  });

  it('is false for a new account, even with the holidays account, and true once it has a recipient', async () => {
    const { agent, account, user } = await signedIn();
    await addRecipient(user, { firstName: 'Gifty', lastName: 'Holidays', isSystemAccount: true });

    expect((await agent.get('/api/users/profile')).body.hasRecipients).toBe(false);
    expect((await request.agent(app).post('/api/users/login').send({ email: account.email, password: PASSWORD })).body.hasRecipients).toBe(false);

    await addRecipient(user, { archived: true });

    expect((await agent.get('/api/users/profile')).body.hasRecipients).toBe(true);
    expect((await request.agent(app).post('/api/users/login').send({ email: account.email, password: PASSWORD })).body.hasRecipients).toBe(true);
  });
});
