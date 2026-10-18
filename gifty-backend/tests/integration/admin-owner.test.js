// The owner hands ownership to another account (1b): one write moves it,
// and every refusal leaves owner and roles as they were
const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');
const { openSignup } = require('../utils/signupMode');
const { TEST_SETUP_CODE } = require('../utils/setupCode');

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

const User = require('../../models/User');
const { buildApp, signUp: signUpOn, idOf, PASSWORD } = require('../utils/adminTestApp');

jest.setTimeout(30000);
const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-admin-owner-${process.pid}`;
const app = buildApp();
const signUp = (name, extra) => signUpOn(app, name, extra);
const settingsOwner = async () => String((await mongoose.connection.db.collection('instance').findOne({ _id: 'settings' })).ownerId);

describe('ownership hand-over', () => {
  let owner; let admin; let member;

  beforeAll(async () => {
    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.db.dropDatabase();
    // Several accounts sign up here without invites
    await openSignup();
    owner = await signUp('owner', { setupCode: TEST_SETUP_CODE });
    admin = await signUp('admin');
    member = await signUp('member');
    await owner.patch(`/api/admin/users/${await idOf('admin')}/role`).send({ role: 'admin' }).expect(200);
  });
  afterAll(teardownTestDB);

  it('refuses non-owners, wrong passwords, self and deactivated targets without changing anything', async () => {
    const before = await settingsOwner();
    const memberId = await idOf('member');
    expect((await admin.post('/api/admin/owner').send({ userId: memberId, currentPassword: PASSWORD }).expect(403)).body.code).toBe('OWNER_ONLY');
    const wrong = await owner.post('/api/admin/owner').send({ userId: memberId, currentPassword: 'nope' }).expect(400);
    expect(wrong.body.errors[0].field).toBe('currentPassword');
    await owner.post('/api/admin/owner').send({ userId: memberId }).expect(400);
    expect((await owner.post('/api/admin/owner').send({ userId: await idOf('owner'), currentPassword: PASSWORD }).expect(400)).body.code).toBe('SELF');
    await owner.patch(`/api/admin/users/${memberId}/active`).send({ active: false }).expect(200);
    expect((await owner.post('/api/admin/owner').send({ userId: memberId, currentPassword: PASSWORD }).expect(400)).body.code).toBe('INACTIVE');
    await owner.patch(`/api/admin/users/${memberId}/active`).send({ active: true }).expect(200);
    await owner.post('/api/admin/owner').send({ userId: 'nope', currentPassword: PASSWORD }).expect(404);
    await owner.post('/api/admin/owner').send({ userId: String(new mongoose.Types.ObjectId()), currentPassword: PASSWORD }).expect(404);
    expect(await settingsOwner()).toBe(before);
    expect((await User.findById(memberId)).role).toBe('member');
  });

  it('hands over to a member: promoted, becomes owner; old owner stays admin', async () => {
    const memberId = await idOf('member');
    // The member was signed out by the deactivation above
    await member.post('/api/users/login').send({ email: 'member@example.com', password: PASSWORD }).expect(200);
    const res = await owner.post('/api/admin/owner').send({ userId: memberId, currentPassword: PASSWORD }).expect(200);
    expect(res.body.owner).toMatchObject({ _id: memberId, role: 'admin', isOwner: true });
    expect(await settingsOwner()).toBe(memberId);
    expect((await User.findOne({ username: 'owner' })).role).toBe('admin');
    expect((await owner.get('/api/users/profile')).body).toMatchObject({ role: 'admin', isOwner: false });
    expect((await member.get('/api/users/profile')).body).toMatchObject({ role: 'admin', isOwner: true });
    // The previous owner is now an ordinary admin
    expect((await owner.post('/api/admin/owner').send({ userId: await idOf('admin'), currentPassword: PASSWORD }).expect(403)).body.code).toBe('OWNER_ONLY');
    const events = await mongoose.connection.db.collection('auditevents').find({ action: 'owner.transferred' }).toArray();
    expect(events).toHaveLength(1);
  });

  it('the new owner manages the old one, who may now delete their account', async () => {
    await member.patch(`/api/admin/users/${await idOf('owner')}/role`).send({ role: 'member' }).expect(200);
    expect((await owner.delete('/api/users/account').send({ currentPassword: PASSWORD })).status).toBe(200);
    expect(await User.exists({ username: 'owner' })).toBeNull();
  });
});
