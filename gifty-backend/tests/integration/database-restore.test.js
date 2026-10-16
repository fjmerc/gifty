// A full database restore brings back whatever the archive holds, including
// data from before this version's upgrades (and no migration markers). The
// restore route must bring that data up to date, as boot does, and drop every
// user's cached responses. Real routes, MongoDB and Redis (a separate logical
// DB); only auth, the owner check and the archive itself are stubbed.
process.env.REDIS_DB = '13';
const realProcess = require('vm').runInThisContext('process');
const originalTZ = realProcess.env.TZ;
process.env.TZ = 'UTC';
realProcess.env.TZ = 'UTC';

const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-database-restore-${process.pid}`;

jest.mock('../../middleware/authMiddleware', () => {
  const { Types } = require('mongoose');
  const protect = (req, res, next) => {
    const id = req.headers['x-test-user'];
    if (!id) return res.status(401).json({ message: 'Not authorized, no token' });
    req.user = { _id: new Types.ObjectId(id), id };
    next();
  };
  return { protect, admin: (req, res, next) => next() };
});
jest.mock('../../middleware/instanceOwnerMiddleware', () => ({
  requireInstanceOwner: (req, res, next) => next()
}));
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const backupService = require('../../services/backupService');
const databaseRoutes = require('../../routes/databaseRoutes');
const errorHandler = require('../../middleware/errorHandler');
const Gift = require('../../models/Gift');
const Recipient = require('../../models/Recipient');
const User = require('../../models/User');
const { redisClient, publisherClient, subscriberClient, keyPrefixes } = require('../../config/redis');
const queues = require('../../queues');
const { MIGRATION_ID: MONEY_MIGRATION } = require('../../services/moneyMigration');
const { MIGRATION_ID: TEXT_REPAIR } = require('../../services/textRepairMigration');

jest.setTimeout(30000);

const app = express();
app.use(express.json());
app.use('/api/database', databaseRoutes);
app.use(errorHandler);

const oid = () => new mongoose.Types.ObjectId();
const owner = oid();
const other = oid();
const ids = { recipient: oid(), event: oid(), gift: oid() };

// What an archive from before the 2026-10 upgrades puts back: encoded text,
// an unrounded price, a purchase with no date, and no migration markers
const restoreLegacyArchive = async () => {
  const db = mongoose.connection.db;
  await db.collection('migrations').drop().catch(() => {});
  return insertArchiveData();
};

// An archive made after the upgrades: its markers say the migrations ran
const restoreCurrentArchive = async () => {
  const db = mongoose.connection.db;
  await db.collection('migrations').insertMany([{ _id: MONEY_MIGRATION }, { _id: TEXT_REPAIR, status: 'done' }]);
  return insertArchiveData();
};

const insertArchiveData = async () => {
  for (const _id of [owner, other]) {
    await User.collection.insertOne({ _id, username: `u${_id}`, email: `${_id}@example.com`, password: 'x' });
  }
  await Recipient.collection.insertOne({
    _id: ids.recipient, user: other, firstName: 'Sean', lastName: 'O&#39;Brien', relation: 'Friend',
    relationship: 'friendship', birthdate: new Date('1990-01-01'), tags: []
  });
  await Gift.collection.insertOne({
    _id: ids.gift, user: other, recipient: ids.recipient, event: ids.event, name: 'Book', price: 19.999,
    status: 'purchased', createdAt: new Date('2025-05-01'), updatedAt: new Date('2025-05-02')
  });
  return { collections: { users: 2, recipients: 1, gifts: 1 }, safetyBackup: 'safety.tar.gz' };
};

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
});

afterAll(async () => {
  await teardownTestDB();
  await redisClient.flushdb();
  await Promise.all([redisClient, publisherClient, subscriberClient].map((c) => c.quit().catch(() => {})));
  await Promise.all(Object.values(queues).map((q) => q.close().catch(() => {})));
  process.env.TZ = originalTZ;
  realProcess.env.TZ = originalTZ;
});

beforeEach(async () => {
  await redisClient.flushdb();
  await mongoose.connection.db.dropDatabase();
  jest.spyOn(backupService, 'restoreBackup').mockImplementation(restoreLegacyArchive);
  // The migrations take their own safety backup first
  jest.spyOn(backupService, 'createBackup').mockResolvedValue({ backupName: 'pre-migration.tar.gz' });
});

afterEach(() => jest.restoreAllMocks());

describe('POST /api/database/restore/:backupName', () => {
  it('brings data from an older archive up to date', async () => {
    const res = await request(app).post('/api/database/restore/old.tar.gz').set('x-test-user', String(owner));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, safetyBackup: 'safety.tar.gz', collections: { gifts: 1 } });
    expect(res.body.upgrade).toMatchObject({ moneyModel: 'applied', textRepair: 'applied' });

    const gift = await Gift.findById(ids.gift).lean();
    expect(gift.price).toBe(20);
    expect(gift.purchaseDate).toEqual(new Date('2025-05-02'));
    expect((await Recipient.findById(ids.recipient).lean()).lastName).toBe("O'Brien");
    const markers = await mongoose.connection.db.collection('migrations').find().toArray();
    // The one-time German holiday upgrade runs on a restore too (2026-10)
    const { MIGRATION_ID: DE_HOLIDAYS } = require('../../services/holidayCategoryUpgrade');
    expect(markers.map((m) => m._id).sort()).toEqual([TEXT_REPAIR, MONEY_MIGRATION, DE_HOLIDAYS].sort());
  });

  it("drops every user's cached responses, not just the owner's", async () => {
    const cached = [`${keyPrefixes.gifts}${other}:/`, `${keyPrefixes.analytics}${owner}:/spending`];
    // Suggestion job results share the prefix but are not response caches
    const job = `${keyPrefixes.suggestions}job:123`;
    for (const key of [...cached, job]) await redisClient.set(key, '{}');
    backupService.restoreBackup.mockImplementation(restoreCurrentArchive);

    await request(app).post('/api/database/restore/old.tar.gz').set('x-test-user', String(owner));

    for (const key of cached) expect(await redisClient.exists(key)).toBe(0);
    expect(await redisClient.exists(job)).toBe(1);
  });

  it('still drops cached responses when the restore fails part-way', async () => {
    const key = `${keyPrefixes.gifts}${other}:/`;
    await User.collection.insertOne({ _id: other, username: 'o', email: 'o@example.com', password: 'x' });
    await redisClient.set(key, '{}');
    backupService.restoreBackup.mockRejectedValue(new Error('disk full while restoring gifts'));

    const res = await request(app).post('/api/database/restore/old.tar.gz').set('x-test-user', String(owner));

    expect(res.status).toBe(500);
    expect(await redisClient.exists(key)).toBe(0);
  });
});

