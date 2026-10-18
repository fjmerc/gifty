// An account from registration to deletion, through the real user routes,
// real JWT cookies and MongoDB. Deleting an account must leave nothing of
// the user behind: no documents that point at them, no uploaded photos.
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), `gifty-test-account-${process.pid}`);

const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const request = require('supertest');
const { teardownTestDB } = require('../utils/testSetup');
const { openSignup } = require('../utils/signupMode');
const { TEST_SETUP_CODE } = require('../utils/setupCode');


const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-account-lifecycle-${process.pid}`;

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));
// Rate limits have their own tests; a whole lifecycle would trip them
jest.mock('../../middleware/rateLimitMiddleware', () => {
  const pass = new Proxy({}, { get: () => (req, res, next) => next() });
  return { authLimiters: pass, apiLimiters: pass };
});
jest.mock('../../services/holidayService', () => ({
  generateHolidayEvents: jest.fn().mockResolvedValue({ created: 0 }),
  updateUserHolidayEvents: jest.fn().mockResolvedValue({})
}));

const { UPLOADS_DIR } = require('../../config/runtime');
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
const account = { username: 'lifecycle', email: 'life@example.com', password: PASSWORD, firstName: 'Liv', lastName: 'Cycle', setupCode: TEST_SETUP_CODE };

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
  // Every model, so every collection a user's data can live in is checked
  const modelsDir = path.join(__dirname, '../../models');
  fs.readdirSync(modelsDir).filter((f) => f.endsWith('.js')).forEach((f) => require(path.join(modelsDir, f)));
  // Several accounts sign up here without invites
  await openSignup();
});

afterAll(async () => {
  await teardownTestDB();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

// Every document in any collection that names the user as owner or creator
const leftovers = async (userId) => {
  const found = [];
  for (const name of mongoose.modelNames()) {
    const Model = mongoose.model(name);
    const fields = ['user', 'createdBy', 'userId'].filter((field) => Model.schema.path(field));
    if (name === 'User') continue;
    for (const field of fields) {
      const count = await Model.collection.countDocuments({ [field]: userId });
      if (count) found.push(`${name}.${field}: ${count}`);
    }
  }
  return found;
};

describe('an account from registration to deletion', () => {
  it('registers, signs out and in, refreshes, changes its password and is deleted without a trace', async () => {
    const agent = request.agent(app);

    const registered = await agent.post('/api/users/register').send(account);
    expect(registered.status).toBe(201);
    expect((await agent.get('/api/users/profile')).status).toBe(200);

    expect((await agent.post('/api/users/logout')).status).toBe(200);
    expect((await agent.get('/api/users/profile')).status).toBe(401);

    expect((await agent.post('/api/users/login').send({ email: account.email, password: 'wrong-Pass1!' })).status).toBe(401);
    expect((await agent.post('/api/users/login').send({ email: account.email, password: PASSWORD })).status).toBe(200);
    expect((await agent.post('/api/users/refresh-token')).status).toBe(200);
    expect((await agent.get('/api/users/profile')).status).toBe(200);

    const changed = await agent.post('/api/users/change-password').send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(changed.status).toBe(200);
    expect((await request(app).post('/api/users/login').send({ email: account.email, password: PASSWORD })).status).toBe(401);
    expect((await request(app).post('/api/users/login').send({ email: account.email, password: NEW_PASSWORD })).status).toBe(200);

    // Data of every kind the user can own, written as the app writes it
    const userId = (await User.findOne({ email: account.email }))._id;
    const id = () => new mongoose.Types.ObjectId();
    const photo = '/uploads/1700000000000-0123456789abcdef0123456789abcdef.png';
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOADS_DIR, path.basename(photo)), 'png');
    const ownPicture = '/uploads/1700000000001-fedcba9876543210fedcba9876543210.png';
    fs.writeFileSync(path.join(UPLOADS_DIR, path.basename(ownPicture)), 'png');
    await User.updateOne({ _id: userId }, { $set: { profilePicture: ownPicture } });
    const insert = (model, doc) => mongoose.model(model).collection.insertOne({ _id: id(), ...doc });
    const recipientId = id();
    await insert('Recipient', { _id: recipientId, user: userId, firstName: 'Ann', lastName: 'Lee', profilePicture: photo });
    await insert('Event', { user: userId, recipient: recipientId, name: 'Party', date: new Date() });
    await insert('Gift', { user: userId, recipient: recipientId, name: 'Book', price: 5 });
    await insert('Tag', { user: userId, name: 'Books' });
    await insert('EventType', { name: 'Name day', isCustom: true, createdBy: userId });
    await insert('Vendor', { user: userId, name: 'Corner shop' });
    await insert('SuggestionMetric', { user: userId });
    await insert('Notification', { user: userId, event: id(), notificationType: 'info', notificationDate: new Date() });
    // Reactions to the shared gift library name the account too
    const otherUser = id();
    const libraryGiftId = id();
    await insert('GiftLibrary', { _id: libraryGiftId, name: 'Shared gift', popularityScore: 7, reactions: [
      { user: userId, action: 'liked', at: new Date() },
      { user: otherUser, action: 'purchased', at: new Date() }
    ] });

    // Gift reviews from before that feature was removed (no model any more)
    const reviews = mongoose.connection.db.collection('reviews');
    const othersReview = id();
    await reviews.insertMany([
      { _id: id(), user: userId, gift: id(), rating: 4, reviewText: 'Lovely' },
      { _id: othersReview, user: otherUser, gift: id(), rating: 2, reviewText: 'Meh' }
    ]);

    const deleted = await agent.delete('/api/users/account').send({ currentPassword: NEW_PASSWORD });
    expect(deleted.status).toBe(200);

    expect((await agent.get('/api/users/profile')).status).toBe(401);
    expect((await request(app).post('/api/users/login').send({ email: account.email, password: NEW_PASSWORD })).status).toBe(401);
    expect(await leftovers(userId)).toEqual([]);
    expect(await reviews.countDocuments({ user: userId })).toBe(0);
    expect(await reviews.countDocuments({ _id: othersReview })).toBe(1);
    const libraryGift = await mongoose.model('GiftLibrary').collection.findOne({ _id: libraryGiftId });
    expect(libraryGift.reactions).toEqual([expect.objectContaining({ user: otherUser, action: 'purchased' })]);
    expect(fs.existsSync(path.join(UPLOADS_DIR, path.basename(photo)))).toBe(false);
    expect(fs.existsSync(path.join(UPLOADS_DIR, path.basename(ownPicture)))).toBe(false);
  });

  it("refuses to delete the instance owner's account while other accounts exist", async () => {
    const owner = request.agent(app);
    await owner.post('/api/users/register').send({ ...account, username: 'owner1', email: 'owner@example.com' });
    await request(app).post('/api/users/register').send({ ...account, username: 'member1', email: 'member@example.com' });

    const res = await owner.delete('/api/users/account').send({ currentPassword: PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/owner/i);
    expect(await User.exists({ email: 'owner@example.com' })).toBeTruthy();
  });
});

