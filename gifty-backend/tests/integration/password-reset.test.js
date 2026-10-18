// Reset links (1b): an admin makes a one-time link for a member (the owner
// for an admin); the person sets a new password with it. Real MongoDB.
const request = require('supertest');
const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-password-reset-${process.pid}`;
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../middleware/rateLimitMiddleware', () => {
  const pass = new Proxy({}, { get: () => (req, res, next) => next() });
  return { authLimiters: pass, apiLimiters: pass };
});
jest.mock('../../services/holidayService', () => ({
  generateHolidayEvents: jest.fn().mockResolvedValue({ created: 0 }),
  updateUserHolidayEvents: jest.fn().mockResolvedValue({})
}));

const { buildApp, signUp, idOf, PASSWORD } = require('../utils/adminTestApp');
const { openSignup } = require('../utils/signupMode');
const { TEST_SETUP_CODE } = require('../utils/setupCode');
const InstanceToken = require('../../models/InstanceToken');
const { auditCollection } = require('../../services/auditLog');

jest.setTimeout(30000);
const app = buildApp();
app.use('/api/password-reset', require('../../routes/passwordResetRoutes'));
app.use(require('../../middleware/errorHandler'));

const NEW_PASSWORD = 'N3w!passw0rd';
const tokenOf = (link) => link.split('/reset/')[1];
let owner; let admin; let member;

beforeAll(async () => { await mongoose.connect(TEST_DB_URI); });
afterAll(async () => { await teardownTestDB(); });
beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  await InstanceToken.syncIndexes();
  await openSignup();
  owner = await signUp(app, 'owner', { setupCode: TEST_SETUP_CODE });
  admin = await signUp(app, 'admin');
  member = await signUp(app, 'member');
  await owner.patch(`/api/admin/users/${await idOf('admin')}/role`).send({ role: 'admin' }).expect(200);
});

const resetLinkFor = async (agent, name) => agent.post(`/api/admin/users/${await idOf(name)}/reset-link`);

describe('reset links', () => {
  it('a member gets a new password through a link, once, and old sessions end', async () => {
    const made = await resetLinkFor(admin, 'member');
    expect(made.status).toBe(201);
    const token = tokenOf(made.body.link);
    expect((await request(app).get(`/api/password-reset/${token}`)).status).toBe(200);
    const used = await request(app).post(`/api/password-reset/${token}`).send({ password: NEW_PASSWORD });
    expect(used.status).toBe(200);
    expect(used.body.message).toBe('Your password was changed. Sign in with the new one.');
    expect((await member.get('/api/users/profile')).status).toBe(401);
    await request(app).post('/api/users/login').send({ email: 'member@example.com', password: NEW_PASSWORD }).expect(200);
    const again = await request(app).post(`/api/password-reset/${token}`).send({ password: NEW_PASSWORD });
    expect(again.status).toBe(410);
    expect(again.body.code).toBe('RESET_USED');
    expect(await auditCollection().countDocuments({ action: { $in: ['reset.created', 'reset.used'] } })).toBe(2);
  });

  it('two uses of one link at once: exactly one succeeds', async () => {
    const token = tokenOf((await resetLinkFor(owner, 'member')).body.link);
    const results = await Promise.all([1, 2, 3].map(() => request(app).post(`/api/password-reset/${token}`).send({ password: NEW_PASSWORD })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it('a weak password is refused and the link stays usable', async () => {
    const token = tokenOf((await resetLinkFor(owner, 'member')).body.link);
    expect((await request(app).post(`/api/password-reset/${token}`).send({ password: 'short' })).status).toBe(400);
    expect((await request(app).post(`/api/password-reset/${token}`).send({ password: 'alllowercase1!' })).status).toBe(400);
    expect((await request(app).get(`/api/password-reset/${token}`)).status).toBe(200);
  });

  it('admins make links for members only; the owner for admins; nobody for the owner or themselves', async () => {
    expect((await resetLinkFor(admin, 'admin')).status).toBe(400);
    const forAdmin = await resetLinkFor(admin, 'owner');
    expect(forAdmin.status).toBe(403);
    expect(forAdmin.body.code).toBe('OWNER_PROTECTED');
    await owner.patch(`/api/admin/users/${await idOf('member')}/role`).send({ role: 'admin' }).expect(200);
    const adminOnAdmin = await resetLinkFor(admin, 'member');
    expect(adminOnAdmin.status).toBe(403);
    expect(adminOnAdmin.body.code).toBe('OWNER_ONLY');
    expect((await resetLinkFor(owner, 'admin')).status).toBe(201);
    expect((await resetLinkFor(member, 'owner')).status).toBe(403);
  });

  it('a new link replaces the earlier one', async () => {
    const first = tokenOf((await resetLinkFor(owner, 'member')).body.link);
    await resetLinkFor(owner, 'member');
    expect((await request(app).get(`/api/password-reset/${first}`)).body.code).toBe('RESET_UNKNOWN');
  });

  it('deactivation deletes pending links and refuses new ones', async () => {
    const token = tokenOf((await resetLinkFor(owner, 'member')).body.link);
    await owner.patch(`/api/admin/users/${await idOf('member')}/active`).send({ active: false }).expect(200);
    expect((await request(app).get(`/api/password-reset/${token}`)).status).toBe(404);
    const refused = await resetLinkFor(owner, 'member');
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('INACTIVE');
  });

  it('a link for an account deactivated some other way answers ACCOUNT_DEACTIVATED', async () => {
    const token = tokenOf((await resetLinkFor(owner, 'member')).body.link);
    await require('../../models/User').updateOne({ username: 'member' }, { $set: { active: false } });
    const res = await request(app).get(`/api/password-reset/${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_DEACTIVATED');
    expect((await request(app).post(`/api/password-reset/${token}`).send({ password: NEW_PASSWORD })).status).toBe(403);
  });

  it('changing your own password deletes your pending reset links', async () => {
    const token = tokenOf((await resetLinkFor(owner, 'member')).body.link);
    await member.post('/api/users/change-password').send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }).expect(200);
    expect((await request(app).get(`/api/password-reset/${token}`)).status).toBe(404);
  });

  it('expired links say so', async () => {
    const token = tokenOf((await resetLinkFor(owner, 'member')).body.link);
    await InstanceToken.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await request(app).get(`/api/password-reset/${token}`);
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('RESET_EXPIRED');
  });

  describe('a link made for a member is no use against a stronger account', () => {
    it('stops working when the member is made an admin', async () => {
      const token = tokenOf((await resetLinkFor(admin, 'member')).body.link);
      await owner.patch(`/api/admin/users/${await idOf('member')}/role`).send({ role: 'admin' }).expect(200);
      expect((await request(app).post(`/api/password-reset/${token}`).send({ password: NEW_PASSWORD })).status).toBe(404);
    });

    it('stops working when the member becomes the owner', async () => {
      const token = tokenOf((await resetLinkFor(admin, 'member')).body.link);
      await owner.post('/api/admin/owner').send({ userId: await idOf('member'), currentPassword: PASSWORD }).expect(200);
      expect((await request(app).post(`/api/password-reset/${token}`).send({ password: NEW_PASSWORD })).status).toBe(404);
    });

    it('is refused when the account became an admin some other way (a race, a restore)', async () => {
      const token = tokenOf((await resetLinkFor(admin, 'member')).body.link);
      await require('../../models/User').updateOne({ username: 'member' }, { $set: { role: 'admin' } });
      expect((await request(app).get(`/api/password-reset/${token}`)).status).toBe(404);
      expect((await request(app).post(`/api/password-reset/${token}`).send({ password: NEW_PASSWORD })).status).toBe(404);
    });

    it("the owner's own links for an admin keep working", async () => {
      const token = tokenOf((await resetLinkFor(owner, 'admin')).body.link);
      expect((await request(app).post(`/api/password-reset/${token}`).send({ password: NEW_PASSWORD })).status).toBe(200);
    });
  });

  describe('a link is only as good as the admin who made it', () => {
    it('stops working when its maker is deactivated', async () => {
      const token = tokenOf((await resetLinkFor(admin, 'member')).body.link);
      await owner.patch(`/api/admin/users/${await idOf('admin')}/active`).send({ active: false }).expect(200);
      expect((await request(app).post(`/api/password-reset/${token}`).send({ password: NEW_PASSWORD })).status).toBe(404);
    });

    it('stops working when its maker is no longer an admin', async () => {
      const token = tokenOf((await resetLinkFor(admin, 'member')).body.link);
      await owner.patch(`/api/admin/users/${await idOf('admin')}/role`).send({ role: 'member' }).expect(200);
      expect((await request(app).get(`/api/password-reset/${token}`)).status).toBe(404);
    });
  });
});
