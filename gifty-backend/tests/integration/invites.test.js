// Invites (1b): admins make one-time links; registration on an invite-only
// instance needs one. Real MongoDB and real auth cookies.
const request = require('supertest');
const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-invites-${process.pid}`;
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../middleware/rateLimitMiddleware', () => {
  const pass = new Proxy({}, { get: () => (req, res, next) => next() });
  return { authLimiters: pass, apiLimiters: pass };
});
jest.mock('../../services/holidayService', () => ({
  generateHolidayEvents: jest.fn().mockResolvedValue({ created: 0 }),
  updateUserHolidayEvents: jest.fn().mockResolvedValue({})
}));

const { buildApp, signUp, PASSWORD } = require('../utils/adminTestApp');
const { openSignup } = require('../utils/signupMode');
const { TEST_SETUP_CODE } = require('../utils/setupCode');
const User = require('../../models/User');
const InstanceToken = require('../../models/InstanceToken');
const { auditCollection } = require('../../services/auditLog');

jest.setTimeout(30000);
const app = buildApp();
app.use('/api/invites', require('../../routes/inviteRoutes'));
// errorHandler is mounted inside buildApp before this router; mount it again after
app.use(require('../../middleware/errorHandler'));

const newcomer = (name, extra = {}) => ({
  username: name, email: `${name}@example.com`, password: PASSWORD, firstName: name, lastName: 'N', ...extra
});
const tokenOf = (link) => link.split('/invite/')[1];

let owner;
beforeAll(async () => { await mongoose.connect(TEST_DB_URI); await InstanceToken.syncIndexes(); });
afterAll(async () => { await teardownTestDB(); });
beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  await InstanceToken.syncIndexes();
  owner = await signUp(app, 'owner', { setupCode: TEST_SETUP_CODE });
});

describe('invite-only registration', () => {
  it('refuses a registration without an invite', async () => {
    const res = await request(app).post('/api/users/register').send(newcomer('stranger'));
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'INVITE_REQUIRED', message: 'This Gifty is invite-only. Ask someone who uses it for an invite link.' });
    expect(await User.exists({ username: 'stranger' })).toBeNull();
  });

  it('open mode lets anyone register as a member', async () => {
    await openSignup();
    await request(app).post('/api/users/register').send(newcomer('walkin')).expect(201);
    expect((await User.findOne({ username: 'walkin' })).role).toBe('member');
  });

  it('an invite admits one member, once, and is recorded', async () => {
    const { body } = await owner.post('/api/admin/invites').send({}).expect(201);
    const inviteToken = tokenOf(body.link);
    await request(app).post('/api/users/register').send(newcomer('kid', { inviteToken })).expect(201);
    expect((await User.findOne({ username: 'kid' })).role).toBe('member');
    const again = await request(app).post('/api/users/register').send(newcomer('kid2', { inviteToken }));
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('INVITE_USED');
    expect(await auditCollection().countDocuments({ action: 'invite.used' })).toBe(1);
    expect(await auditCollection().countDocuments({ action: 'invite.created' })).toBe(1);
  });

  it('an invite tied to an email admits only that email', async () => {
    const { body } = await owner.post('/api/admin/invites').send({ email: 'gran@example.com' }).expect(201);
    const inviteToken = tokenOf(body.link);
    const wrong = await request(app).post('/api/users/register').send(newcomer('other', { inviteToken }));
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('INVITE_EMAIL');
    await request(app).post('/api/users/register').send(newcomer('gran', { inviteToken, email: 'Gran@Example.com' })).expect(201);
  });

  it('an invite tied to a gmail address matches the address as typed', async () => {
    const { body } = await owner.post('/api/admin/invites').send({ email: 'Jane.Doe@gmail.com' }).expect(201);
    await request(app).post('/api/users/register')
      .send(newcomer('jane', { inviteToken: tokenOf(body.link), email: 'Jane.Doe@gmail.com' })).expect(201);
  });

  it('an email that already has an account is refused and the invite stays valid', async () => {
    const { body } = await owner.post('/api/admin/invites').send({}).expect(201);
    const inviteToken = tokenOf(body.link);
    const taken = await request(app).post('/api/users/register').send(newcomer('dup', { inviteToken, email: 'owner@example.com' }));
    expect(taken.status).toBe(400);
    expect((await request(app).get(`/api/invites/${inviteToken}`)).status).toBe(200);
  });

  it('two registrations on one invite at once: exactly one account', async () => {
    const { body } = await owner.post('/api/admin/invites').send({}).expect(201);
    const inviteToken = tokenOf(body.link);
    const results = await Promise.all(['reg1', 'reg2', 'reg3'].map((n) => request(app).post('/api/users/register').send(newcomer(n, { inviteToken }))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await User.countDocuments({ username: { $in: ['reg1', 'reg2', 'reg3'] } })).toBe(1);
  });

  it('a registration that fails after the invite was taken gives the invite back', async () => {
    const { body } = await owner.post('/api/admin/invites').send({}).expect(201);
    const inviteToken = tokenOf(body.link);
    const spy = jest.spyOn(User, 'create').mockRejectedValueOnce(new Error('disk full'));
    const res = await request(app).post('/api/users/register').send(newcomer('unlucky', { inviteToken }));
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect((await request(app).get(`/api/invites/${inviteToken}`)).status).toBe(200);
  });

  it('open mode still uses an invite that comes with the registration', async () => {
    await openSignup();
    const { body } = await owner.post('/api/admin/invites').send({}).expect(201);
    const inviteToken = tokenOf(body.link);
    await request(app).post('/api/users/register').send(newcomer('both', { inviteToken })).expect(201);
    expect((await request(app).get(`/api/invites/${inviteToken}`)).body.code).toBe('INVITE_USED');
  });
});

describe('invite management', () => {
  it('lists pending invites with who made them, never the hash, and revokes them', async () => {
    const { body } = await owner.post('/api/admin/invites').send({ email: 'x@example.com', days: 30 }).expect(201);
    const list = (await owner.get('/api/admin/invites').expect(200)).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ email: 'x@example.com', createdBy: { firstName: 'owner' } });
    expect(list[0]).not.toHaveProperty('hash');
    await owner.delete(`/api/admin/invites/${body.invite._id}`).expect(204);
    expect((await request(app).get(`/api/invites/${tokenOf(body.link)}`)).body.code).toBe('INVITE_UNKNOWN');
    await owner.delete(`/api/admin/invites/${body.invite._id}`).expect(404);
    expect(await auditCollection().countDocuments({ action: 'invite.revoked' })).toBe(1);
  });

  it('refuses an expiry other than 1, 7 or 30 days and a malformed email', async () => {
    expect((await owner.post('/api/admin/invites').send({ days: 3 })).status).toBe(400);
    expect((await owner.post('/api/admin/invites').send({ email: 'not-an-email' })).status).toBe(400);
  });

  it('members cannot make invites', async () => {
    await openSignup();
    const member = await signUp(app, 'member');
    expect((await member.post('/api/admin/invites').send({})).status).toBe(403);
  });

  it('the public lookup says expired, used or unknown', async () => {
    const { body } = await owner.post('/api/admin/invites').send({ email: 'Tied@Example.com' }).expect(201);
    const lookup = await request(app).get(`/api/invites/${tokenOf(body.link)}`);
    expect(lookup.status).toBe(200);
    expect(lookup.body.email).toBe('tied@example.com');
    await InstanceToken.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await request(app).get(`/api/invites/${tokenOf(body.link)}`);
    expect(expired.status).toBe(410);
    expect(expired.body.code).toBe('INVITE_EXPIRED');
    expect((await request(app).get('/api/invites/nonsense')).status).toBe(404);
  });
});
