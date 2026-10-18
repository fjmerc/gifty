// Spec §2 as a table: every row, for the owner, an admin, a member and a
// visitor. "allowed" means the request got past the role check (anything
// but 401/403); the handlers' own behaviour is tested elsewhere.
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const cookieParser = require('cookie-parser');
const { teardownTestDB } = require('../utils/testSetup');

// databaseRoutes pulls in the response cache, which opens Redis: its own logical DB
process.env.REDIS_DB = '10';
const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-permissions-${process.pid}`;
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), http: jest.fn(), addRequestContext: () => ({}) }));
jest.mock('../../middleware/rateLimitMiddleware', () => {
  const pass = new Proxy({}, { get: () => (req, res, next) => next() });
  return { authLimiters: pass, apiLimiters: pass };
});
jest.mock('../../services/holidayService', () => ({
  generateHolidayEvents: jest.fn().mockResolvedValue({ created: 0 }),
  updateUserHolidayEvents: jest.fn().mockResolvedValue({})
}));
jest.mock('../../services/backupService');
jest.mock('../../controllers/giftLibraryController', () => new Proxy({}, { get: () => (req, res) => res.status(204).end() }));

const { signUp, idOf } = require('../utils/adminTestApp');
const { openSignup } = require('../utils/signupMode');
const { TEST_SETUP_CODE } = require('../utils/setupCode');
const backupService = require('../../services/backupService');

jest.setTimeout(60000);

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/users', require('../../routes/userRoutes'));
app.use('/api/admin', require('../../routes/adminRoutes'));
app.use('/api/database', require('../../routes/databaseRoutes'));
app.use('/api/gift-library', require('../../routes/giftLibraryRoutes'));
app.use('/api/health', require('../../routes/healthRoutes'));
app.use(require('../../middleware/errorHandler'));

const ADMIN = ['owner', 'admin'];
const OWNER = ['owner'];
// [label, method, path (ids filled in), who may]
const ROWS = [
  ['list accounts', 'get', '/api/admin/users', ADMIN],
  ['create invite', 'post', '/api/admin/invites', ADMIN],
  ['list invites', 'get', '/api/admin/invites', ADMIN],
  ['revoke invite', 'delete', '/api/admin/invites/:fakeId', ADMIN],
  ['reset link for a member', 'post', '/api/admin/users/:target/reset-link', ADMIN],
  ['reset link for an admin', 'post', '/api/admin/users/:adminTarget/reset-link', OWNER],
  ['deactivate a member', 'patch', '/api/admin/users/:target/active', ADMIN],
  ['change a role', 'patch', '/api/admin/users/:target/role', OWNER],
  ['read instance settings', 'get', '/api/admin/settings', ADMIN],
  ['change instance settings', 'patch', '/api/admin/settings', ADMIN],
  ['finish setup', 'post', '/api/admin/setup-complete', OWNER],
  ['make a backup', 'post', '/api/database/backup', ADMIN],
  ['list backups', 'get', '/api/database/backups', ADMIN],
  ['system check', 'get', '/api/database/system-check', ADMIN],
  ['restore a backup', 'post', '/api/database/restore/b.tar.gz', OWNER],
  ['delete a backup', 'delete', '/api/database/backups/b.tar.gz', OWNER],
  ['trigger discovery', 'post', '/api/gift-library/discover/trigger', ADMIN],
  ['delete a library gift', 'delete', '/api/gift-library/gifts/:fakeId', ADMIN],
  ['detailed health', 'get', '/api/health/detailed', ADMIN],
  ['hand over ownership', 'post', '/api/admin/owner', OWNER]
];
const BODY = { 'patch /api/admin/users/:target/active': { active: true }, 'patch /api/admin/users/:target/role': { role: 'member' }, 'patch /api/admin/settings': {} };

let agents; let ids;
beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
  await mongoose.connection.db.dropDatabase();
  await openSignup();
  agents = { owner: await signUp(app, 'owner', { setupCode: TEST_SETUP_CODE }), admin: await signUp(app, 'admin'), member: await signUp(app, 'member') };
  await signUp(app, 'target');
  await signUp(app, 'admintarget');
  await agents.owner.patch(`/api/admin/users/${await idOf('admin')}/role`).send({ role: 'admin' }).expect(200);
  await agents.owner.patch(`/api/admin/users/${await idOf('admintarget')}/role`).send({ role: 'admin' }).expect(200);
  ids = { target: await idOf('target'), adminTarget: await idOf('admintarget'), fakeId: String(new mongoose.Types.ObjectId()) };
  backupService.listBackups.mockResolvedValue([]);
  backupService.createBackup.mockResolvedValue({ backupName: 'x' });
  backupService.restoreBackup.mockRejectedValue(new Error('not found'));
  backupService.deleteBackup.mockRejectedValue(new Error('not found'));
});
afterAll(async () => {
  await teardownTestDB();
  // As database-restore.test.js does: close Redis and the queues so Jest exits on its own
  const { redisClient, publisherClient, subscriberClient } = require('../../config/redis');
  await redisClient.flushdb();
  await Promise.all([redisClient, publisherClient, subscriberClient].map((c) => c.quit().catch(() => {})));
  await Promise.all(Object.values(require('../../queues')).map((q) => q.close().catch(() => {})));
});

const fill = (path) => path.replace(':target', ids.target).replace(':adminTarget', ids.adminTarget).replace(':fakeId', ids.fakeId);
const send = (who, method, path) => {
  const r = (who === 'visitor' ? request(app) : agents[who])[method](fill(path));
  return method === 'get' || method === 'delete' ? r : r.send(BODY[`${method} ${path}`] || {});
};

describe.each(ROWS)('%s', (label, method, path, allowed) => {
  it.each(['owner', 'admin', 'member', 'visitor'])('%s', async (who) => {
    const { status } = await send(who, method, path);
    if (allowed.includes(who)) expect([401, 403]).not.toContain(status);
    else expect([401, 403]).toContain(status);
  });
});
