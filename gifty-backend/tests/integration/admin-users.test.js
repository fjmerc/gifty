// Admins list accounts and deactivate members; the owner changes roles (1b)
const mongoose = require('mongoose');
const request = require('supertest');
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
const { buildApp, signUp: signUpOn, idOf } = require('../utils/adminTestApp');

jest.setTimeout(30000);
const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-admin-users-${process.pid}`;
const app = buildApp();
const signUp = (name, extra) => signUpOn(app, name, extra);

describe('admin users API', () => {
  let owner; let admin; let member;

  beforeAll(async () => {
    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.db.dropDatabase();
    // Several accounts sign up here without invites
    await openSignup();
    owner = await signUp('owner', { setupCode: TEST_SETUP_CODE });
    admin = await signUp('admin');
    member = await signUp('member');
    await signUp('member2');
    await owner.patch(`/api/admin/users/${await idOf('admin')}/role`).send({ role: 'admin' }).expect(200);
  });
  afterAll(teardownTestDB);

  it('lists accounts for admins only, without private data', async () => {
    const res = await admin.get('/api/admin/users').expect(200);
    expect(res.body.map((u) => [u.username, u.role, u.isOwner])).toEqual([
      ['owner', 'admin', true], ['admin', 'admin', false], ['member', 'member', false], ['member2', 'member', false]
    ]);
    expect(Object.keys(res.body[0]).sort()).toEqual(['_id', 'active', 'createdAt', 'email', 'firstName', 'isOwner', 'lastName', 'role', 'username']);
    expect((await member.get('/api/admin/users').expect(403)).body.code).toBe('ADMIN_ONLY');
    await request(app).get('/api/admin/users').expect(401);
  });

  it('only the owner changes roles', async () => {
    const id = await idOf('member');
    expect((await admin.patch(`/api/admin/users/${id}/role`).send({ role: 'admin' }).expect(403)).body.code).toBe('OWNER_ONLY');
    await owner.patch(`/api/admin/users/${id}/role`).send({ role: 'admin' }).expect(200);
    await owner.patch(`/api/admin/users/${id}/role`).send({ role: 'member' }).expect(200);
    expect((await User.findById(id)).role).toBe('member');
  });

  it('protects the owner and refuses self-changes and bad input', async () => {
    const ownerId = await idOf('owner');
    expect((await owner.patch(`/api/admin/users/${ownerId}/role`).send({ role: 'member' }).expect(400)).body.code).toBe('SELF');
    expect((await admin.patch(`/api/admin/users/${ownerId}/active`).send({ active: false }).expect(403)).body.code).toBe('OWNER_PROTECTED');
    expect((await admin.patch(`/api/admin/users/${await idOf('admin')}/active`).send({ active: false }).expect(400)).body.code).toBe('SELF');
    await owner.patch(`/api/admin/users/${await idOf('member')}/role`).send({ role: 'owner' }).expect(400);
    await owner.patch(`/api/admin/users/${await idOf('member')}/active`).send({ active: 'no' }).expect(400);
    await owner.patch('/api/admin/users/not-an-id/active').send({ active: false }).expect(404);
    await owner.patch(`/api/admin/users/${new mongoose.Types.ObjectId()}/active`).send({ active: false }).expect(404);
  });

  it('admins deactivate members; deactivation ends sessions', async () => {
    const memberId = await idOf('member');
    const before = (await User.findById(memberId)).tokenVersion;
    await admin.patch(`/api/admin/users/${memberId}/active`).send({ active: false }).expect(200);
    expect((await User.findById(memberId)).tokenVersion).toBe(before + 1);
    await member.get('/api/users/profile').expect(401);
    const res = await admin.patch(`/api/admin/users/${memberId}/active`).send({ active: true }).expect(200);
    expect(res.body.user).toMatchObject({ active: true, role: 'member', isOwner: false });
  });

  it('only the owner deactivates an admin', async () => {
    const id = await idOf('member2');
    await owner.patch(`/api/admin/users/${id}/role`).send({ role: 'admin' }).expect(200);
    expect((await admin.patch(`/api/admin/users/${id}/active`).send({ active: false }).expect(403)).body.code).toBe('OWNER_ONLY');
    await owner.patch(`/api/admin/users/${id}/active`).send({ active: false }).expect(200);
    await owner.patch(`/api/admin/users/${id}/active`).send({ active: true }).expect(200);
    await owner.patch(`/api/admin/users/${id}/role`).send({ role: 'member' }).expect(200);
  });

  it('concurrent promotions: one wins, one 409', async () => {
    const id = await idOf('member2');
    const results = await Promise.all([
      owner.patch(`/api/admin/users/${id}/role`).send({ role: 'admin' }),
      owner.patch(`/api/admin/users/${id}/role`).send({ role: 'admin' })
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409).body.code).toBe('CONFLICT');
    await owner.patch(`/api/admin/users/${id}/role`).send({ role: 'member' }).expect(200);
  });

  it('records audit events', async () => {
    const events = await mongoose.connection.db.collection('auditevents').find({}).sort({ at: 1 }).toArray();
    expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(['role.changed', 'account.deactivated', 'account.reactivated']));
    expect(events[0]).toMatchObject({ action: 'role.changed', details: { from: 'member', to: 'admin' } });
    expect(String(events[0].actor)).toBe(await idOf('owner'));
    expect(String(events[0].target)).toBe(await idOf('admin'));
    expect(events[0].at).toBeInstanceOf(Date);
  });
});
