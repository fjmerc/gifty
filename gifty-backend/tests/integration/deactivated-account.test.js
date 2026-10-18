// An admin can deactivate an account (1b): from then on it is refused on
// every request, on refresh and at login, even with a token issued before
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const request = require('supertest');
const { teardownTestDB } = require('../utils/testSetup');
const { openSignup } = require('../utils/signupMode');
const { TEST_SETUP_CODE } = require('../utils/setupCode');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-deactivated-${process.pid}`;

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

const register = (agent, name, extra = {}) => agent.post('/api/users/register').send({
  username: name, email: `${name}@example.com`, password: 'Passw0rd!x', firstName: name, lastName: 'L', ...extra
});

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
  await mongoose.connection.db.dropDatabase();
  // Several accounts sign up here without invites
  await openSignup();
});
afterAll(teardownTestDB);

describe('deactivated accounts', () => {
  it('ends the session on the next request, refuses refresh and login', async () => {
    const owner = request.agent(app);
    await register(owner, 'boss', { setupCode: TEST_SETUP_CODE }).expect(201);
    const kid = request.agent(app);
    await register(kid, 'kid').expect(201);
    await kid.get('/api/users/profile').expect(200);

    await User.updateOne({ username: 'kid' }, { $set: { active: false }, $inc: { tokenVersion: 1 } });
    // A real deactivation also raises the session version: the answer must
    // still say why, so the person knows to ask an admin
    const res = await kid.get('/api/users/profile').expect(401);
    expect(res.body.code).toBe('ACCOUNT_DEACTIVATED');

    // With the session version back where the kid's cookies have it, only
    // active: false can refuse them
    await User.updateOne({ username: 'kid' }, { $set: { tokenVersion: 0 } });
    expect((await kid.get('/api/users/profile').expect(401)).body.code).toBe('ACCOUNT_DEACTIVATED');
    await kid.post('/api/users/refresh-token').expect(401);
    const login = await request.agent(app).post('/api/users/login').send({ email: 'kid@example.com', password: 'Passw0rd!x' });
    expect(login.status).toBe(403);
    expect(login.body.code).toBe('ACCOUNT_DEACTIVATED');
  });

  it('profile reports role and isOwner', async () => {
    const owner = request.agent(app);
    await owner.post('/api/users/login').send({ email: 'boss@example.com', password: 'Passw0rd!x' }).expect(200);
    expect((await owner.get('/api/users/profile')).body).toMatchObject({ role: 'admin', isOwner: true });
    const kid = request.agent(app);
    await User.updateOne({ username: 'kid' }, { $set: { active: true } });
    await kid.post('/api/users/login').send({ email: 'kid@example.com', password: 'Passw0rd!x' }).expect(200);
    expect((await kid.get('/api/users/profile')).body).toMatchObject({ role: 'member', isOwner: false });
  });
});
