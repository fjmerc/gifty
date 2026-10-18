const request = require('supertest');
const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-instance-admin-${process.pid}`;
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../middleware/rateLimitMiddleware', () => {
  const pass = new Proxy({}, { get: () => (req, res, next) => next() });
  return { authLimiters: pass, apiLimiters: pass };
});
jest.mock('../../services/holidayService', () => ({
  generateHolidayEvents: jest.fn().mockResolvedValue({ created: 0 }),
  updateUserHolidayEvents: jest.fn().mockResolvedValue({})
}));

const { buildApp, signUp } = require('../utils/adminTestApp');
const { openSignup } = require('../utils/signupMode');
const { TEST_SETUP_CODE } = require('../utils/setupCode');
const { auditCollection } = require('../../services/auditLog');
const { getInstanceSettings } = require('../../services/instanceSettings');

jest.setTimeout(30000);
const app = buildApp();
let owner; let member;

beforeAll(async () => { await mongoose.connect(TEST_DB_URI); });
afterAll(async () => { await teardownTestDB(); });
beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  owner = await signUp(app, 'owner', { setupCode: TEST_SETUP_CODE });
  await openSignup();
  member = await signUp(app, 'member');
});

describe('instance settings on the Admin page', () => {
  it('admins read the settings, the choices and the status', async () => {
    const { body } = await owner.get('/api/admin/settings').expect(200);
    expect(body).toMatchObject({ signupMode: 'open', setupCompletedAt: null });
    expect(body.choices.countries).toEqual(expect.arrayContaining(['US', 'DE']));
    expect(body.choices.currencies).toEqual(['USD', 'EUR', 'GBP', 'JPY', 'CNY']);
    expect(body.status).toMatchObject({ backups: { time: '02:30' } });
    expect(typeof body.status.features.ai).toBe('boolean');
    expect(body.publicUrl).toMatch(/^https?:\/\//);
  });

  it('admins change sign-up mode and defaults; a mode change is recorded', async () => {
    const { body } = await owner.patch('/api/admin/settings').send({ signupMode: 'invite-only', defaultCountry: 'DE', defaultCurrency: 'EUR' }).expect(200);
    expect(body).toMatchObject({ signupMode: 'invite-only', defaultCountry: 'DE', defaultCurrency: 'EUR' });
    const event = await auditCollection().findOne({ action: 'signup-mode.changed' });
    expect(event.details).toEqual({ from: 'open', to: 'invite-only' });
  });

  it('refuses values it does not know and fields it does not manage', async () => {
    expect((await owner.patch('/api/admin/settings').send({ signupMode: 'everyone' })).status).toBe(400);
    expect((await owner.patch('/api/admin/settings').send({ defaultCountry: 'XX' })).status).toBe(400);
    expect((await owner.patch('/api/admin/settings').send({ defaultCurrency: 'BTC' })).status).toBe(400);
    await owner.patch('/api/admin/settings').send({ ownerId: 'x', setupCompletedAt: null }).expect(400);
    expect((await getInstanceSettings()).ownerId).toBeTruthy();
  });

  it('members can do none of it', async () => {
    expect((await member.get('/api/admin/settings')).status).toBe(403);
    expect((await member.patch('/api/admin/settings').send({ signupMode: 'open' })).status).toBe(403);
  });

  it('only the owner finishes setup, and the first date stays', async () => {
    expect((await member.post('/api/admin/setup-complete')).status).toBe(403);
    const first = (await owner.post('/api/admin/setup-complete').expect(200)).body.setupCompletedAt;
    const second = (await owner.post('/api/admin/setup-complete').expect(200)).body.setupCompletedAt;
    expect(second).toBe(first);
  });
});
