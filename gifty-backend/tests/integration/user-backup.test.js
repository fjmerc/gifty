// A user's own backup file (Settings → Backup / Restore), through the real
// settings routes and MongoDB. Only auth is stubbed. Restoring must put back
// a working set of data: every gift, event and budget pointing at restored
// recipients and events, on this server or another one.
// Restore keeps a copy of the user's data on disk while it works
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), `gifty-test-user-backup-${process.pid}`);
const realProcess = require('vm').runInThisContext('process');
const originalTZ = realProcess.env.TZ;
process.env.TZ = 'UTC';
realProcess.env.TZ = 'UTC';

const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-user-backup-${process.pid}`;

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
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const settingsRoutes = require('../../routes/settingsRoutes');
const errorHandler = require('../../middleware/errorHandler');
const { Budget, OverallBudget } = require('../../models/Budget');
const Event = require('../../models/Event');
const EventType = require('../../models/EventType');
const Gift = require('../../models/Gift');
const Notification = require('../../models/Notification');
const Recipient = require('../../models/Recipient');
const Tag = require('../../models/Tags');
const User = require('../../models/User');
const { seedEventTypes } = require('../../utils/dbInitializer');
const { LEGACY_BIRTHDAY_TYPE_ID } = require('../../services/birthdayEventService');

jest.setTimeout(30000);

const app = express();
app.use(express.json());
app.use('/api/settings', settingsRoutes);
app.use(errorHandler);

const oid = () => new mongoose.Types.ObjectId();
const userA = oid();
const userB = oid();
const as = (req, user = userA) => req.set('x-test-user', String(user));

const download = async (user = userA) => {
  const res = await as(request(app).get('/api/settings/backup'), user);
  expect(res.status).toBe(200);
  return res.body;
};
const upload = (backup, user = userA) => as(request(app).post('/api/settings/restore'), user)
  .attach('backup', Buffer.from(JSON.stringify(backup)), { filename: 'backup.json', contentType: 'application/json' });

let types;

// Ann with a tag; a party with a purchased and a saved gift and a reminder
// notice; a weekly club series; a custom event type; budgets; preferences
const seedUser = async (user = userA) => {
  const tag = await Tag.create({ user, name: 'Books' });
  const custom = await EventType.create({ name: 'Name day', isCustom: true, createdBy: user });
  const ann = await Recipient.create({
    user, firstName: 'Ann', lastName: "O'Brien", relation: 'Friend', relationship: 'friendship',
    birthdate: new Date('1990-03-15'), tags: [tag._id]
  });
  const party = await Event.create({ user, recipient: ann._id, name: 'Party', date: new Date('2026-06-01'), type: types.Birthday });
  const nameDay = await Event.create({ user, recipient: ann._id, name: 'Name day', date: new Date('2026-07-26'), type: custom._id });
  const club = await Event.create({
    user, recipient: ann._id, name: 'Club', date: new Date('2027-01-04'), type: types.Graduation,
    recurring: { frequency: 'Weekly', until: new Date('2027-01-18'), exceptions: [] }, seriesLinked: true
  });
  for (const date of ['2027-01-11', '2027-01-18']) {
    await Event.create({ user, recipient: ann._id, name: 'Club', date: new Date(date), type: types.Graduation, series: club._id });
  }
  const bought = await Gift.create({
    user, recipient: ann._id, event: party._id, name: 'Scarf', price: 40, status: 'purchased', purchaseDate: new Date('2026-05-20')
  });
  await Gift.create({ user, recipient: ann._id, event: nameDay._id, name: 'Mug idea', price: 12, status: 'saved' });
  await Budget.create({ user, recipient: ann._id, year: 2026, maximumAmount: 100 });
  await OverallBudget.create({ user, year: 2026, amount: 500 });
  await Notification.create({ user, event: party._id, notificationType: 'info', notificationDate: new Date('2026-05-31') });
  await User.collection.updateOne({ _id: user }, { $set: { 'preferences.theme': 'dark' } });
  return { tag, custom, ann, party, nameDay, club, bought };
};

// Every reference of the user's data points at one of the user's documents
const expectLinked = async (user) => {
  const recipients = new Set((await Recipient.find({ user }).lean()).map((r) => String(r._id)));
  const events = await Event.find({ user }).lean();
  const eventIds = new Set(events.map((e) => String(e._id)));
  for (const event of events) {
    expect(recipients.has(String(event.recipient))).toBe(true);
    expect(await EventType.exists({ _id: event.type })).toBeTruthy();
    if (event.series) expect(eventIds.has(String(event.series))).toBe(true);
  }
  for (const gift of await Gift.find({ user }).lean()) {
    expect(recipients.has(String(gift.recipient))).toBe(true);
    expect(eventIds.has(String(gift.event))).toBe(true);
  }
  for (const budget of await Budget.find({ user }).lean()) expect(recipients.has(String(budget.recipient))).toBe(true);
  for (const recipient of await Recipient.find({ user }).lean()) {
    for (const tag of recipient.tags) expect(await Tag.exists({ _id: tag, user })).toBeTruthy();
  }
};

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
});

afterEach(() => jest.restoreAllMocks());

afterAll(async () => {
  await teardownTestDB();
  process.env.TZ = originalTZ;
  realProcess.env.TZ = originalTZ;
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  await Promise.all([Budget, OverallBudget, EventType, Tag].map((M) => M.syncIndexes()));
  await seedEventTypes();
  types = Object.fromEntries((await EventType.find({ createdBy: null }).lean()).map((t) => [t.name, t._id]));
  for (const _id of [userA, userB]) {
    await User.collection.insertOne({ _id, username: `u${_id}`, email: `${_id}@example.com`, password: 'secret-hash' });
  }
});

describe('backup file', () => {
  it('carries a format number, names for types and tags, and no account secrets', async () => {
    await seedUser();
    const backup = await download();

    expect(backup.metadata.format).toBe(2);
    expect(backup.data.tags.map((t) => t.name)).toEqual(['Books']);
    expect(backup.data.eventTypes.map((t) => t.name).sort()).toEqual(['Birthday', 'Graduation', 'Name day']);
    expect(backup.data.overallBudgets).toHaveLength(1);
    expect(backup.data.preferences.theme).toBe('dark');
    expect(backup.data.user).toBeUndefined();
    expect(JSON.stringify(backup)).not.toContain('secret-hash');
  });
});

describe('mail settings in a personal backup or export', () => {
  it('leaves the SMTP password out entirely (it is entered again after a restore)', async () => {
    await seedUser();
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'k'.repeat(64);
    const { encryptSecret } = require('../../utils/secretBox');
    await mongoose.connection.db.collection('emailconfigs').insertOne({
      user: userA, service: 'gmail', username: 'me@gmail.com', rawPassword: encryptSecret('smtp-plain-secret')
    });

    const backup = JSON.stringify(await download());
    const exported = await as(request(app).post('/api/settings/export')).send({ format: 'json', dataTypes: ['recipients', 'gifts', 'events', 'budgets'] });
    expect(exported.status).toBe(200);

    for (const body of [backup, JSON.stringify(exported.body)]) {
      expect(body).not.toContain('smtp-plain-secret');
      expect(body).not.toContain('enc:v1:');
      expect(body).not.toMatch(/rawPassword|emailConfig/i);
    }
    await mongoose.connection.db.collection('emailconfigs').deleteMany({ user: userA });
  });
});

describe('restoring your own backup', () => {
  it('puts everything back, linked together', async () => {
    const { ann, bought } = await seedUser();
    const backup = await download();
    await Gift.deleteOne({ _id: bought._id });
    await Recipient.updateOne({ _id: ann._id }, { $set: { firstName: 'Changed' } });
    await User.collection.updateOne({ _id: userA }, { $set: { 'preferences.theme': 'light' } });

    const res = await upload(backup);

    expect(res.status).toBe(200);
    expect(res.body.restoredData).toEqual({ recipients: 1, events: 5, gifts: 2, budgets: 1, overallBudgets: 1 });
    await expectLinked(userA);
    expect((await Recipient.findOne({ user: userA })).firstName).toBe('Ann');
    expect(await Gift.findOne({ user: userA, name: 'Scarf' })).toMatchObject({ status: 'purchased', price: 40 });
    expect(await Event.countDocuments({ user: userA, name: 'Club' })).toBe(3);
    // Reminder notices pointed at the replaced events
    expect(await Notification.countDocuments({ user: userA })).toBe(0);
    expect((await User.findById(userA).lean()).preferences.theme).toBe('dark');
    // No duplicate tags or custom types
    expect(await Tag.countDocuments({ user: userA })).toBe(1);
    expect(await EventType.countDocuments({ createdBy: userA })).toBe(1);
  });

  it('restores a backup that still carries gift reviews and ignores them', async () => {
    await seedUser();
    await mongoose.connection.db.collection('reviews').insertOne({ user: userA, gift: oid(), rating: 4 });
    const backup = await download();
    expect(backup.data).not.toHaveProperty('reviews');
    await mongoose.connection.db.collection('reviews').drop();
    backup.data.reviews = [{ _id: String(oid()), gift: String(oid()), rating: 4, reviewText: 'Lovely' }];

    const res = await upload(backup);

    expect(res.status).toBe(200);
    expect(res.body.restoredData).toEqual({ recipients: 1, events: 5, gifts: 2, budgets: 1, overallBudgets: 1 });
    expect(await mongoose.connection.db.listCollections({ name: 'reviews' }).toArray()).toHaveLength(0);
  });

  it("restores into another account as that account's own data", async () => {
    await seedUser(userA);
    const backup = await download(userA);

    const res = await upload(backup, userB);

    expect(res.status).toBe(200);
    await expectLinked(userB);
    expect(await Recipient.countDocuments({ user: userB })).toBe(1);
    expect(await Tag.exists({ user: userB, name: 'Books' })).toBeTruthy();
    expect(await EventType.exists({ createdBy: userB, name: 'Name day' })).toBeTruthy();
    // The original account is untouched
    expect(await Gift.countDocuments({ user: userA })).toBe(2);
  });

  it('matches event types by name on a server where their ids differ', async () => {
    await seedUser();
    const backup = await download();
    // Another install seeded the same types under other ids
    const elsewhere = new Map(backup.data.eventTypes.map((t) => [t._id, String(oid())]));
    backup.data.eventTypes.forEach((t) => { t._id = elsewhere.get(t._id); });
    backup.data.events.forEach((e) => { e.type = elsewhere.get(String(e.type)); });

    const res = await upload(backup, userB);

    expect(res.status).toBe(200);
    await expectLinked(userB);
    const party = await Event.findOne({ user: userB, name: 'Party' });
    expect(String(party.type)).toBe(String(types.Birthday));
  });

  it('refuses a file with an invalid item and leaves your data as it was', async () => {
    await seedUser();
    const backup = await download();
    backup.data.gifts[0].price = 'lots';

    const res = await upload(backup);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/gift "Scarf"/i);
    expect(await Gift.countDocuments({ user: userA })).toBe(2);
    expect(await Notification.countDocuments({ user: userA })).toBe(1);
  });

  const inProduction = async (run) => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      return await run();
    } finally {
      process.env.NODE_ENV = env;
    }
  };

  it('puts your data back when the restore fails part-way', async () => {
    await seedUser(userB);
    await seedUser(userA);
    const backup = await download(userA);
    backup.data.tags.push({ _id: String(oid()), name: 'Garden' });
    backup.data.recipients[0].tags.push(backup.data.tags[1]._id);
    const before = (await Gift.find({ user: userB }).lean()).map((g) => String(g._id)).sort();
    jest.spyOn(Gift, 'insertMany').mockRejectedValueOnce(new Error('connection lost'));

    // The message reaches the user on a production server too
    const res = await inProduction(() => upload(backup, userB));

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/left as it was/);
    expect(res.body.message).not.toMatch(/connection lost/);
    expect((await Gift.find({ user: userB }).lean()).map((g) => String(g._id)).sort()).toEqual(before);
    expect(await Budget.countDocuments({ user: userB })).toBe(1);
    expect(await Notification.countDocuments({ user: userB })).toBe(1);
    // Tags made for the restore are taken away again
    expect(await Tag.exists({ user: userB, name: 'Garden' })).toBeNull();
  });

  it('keeps putting data back when one part of the rollback fails, and says where the copy is', async () => {
    await seedUser();
    const backup = await download();
    jest.spyOn(Gift, 'insertMany').mockRejectedValueOnce(new Error('connection lost'));
    jest.spyOn(Budget.collection, 'insertMany').mockRejectedValueOnce(new Error('still down'));

    const res = await inProduction(() => upload(backup));

    expect(res.status).toBe(500);
    expect(await Gift.countDocuments({ user: userA })).toBe(2);
    expect(await Notification.countDocuments({ user: userA })).toBe(1);
    const [, file] = res.body.message.match(/saved as (restore-snapshots\/\S+\.json) in the server's data folder/) || [];
    expect(file).toBeDefined();
    // Neither the driver's error nor the server's paths reach the user
    expect(res.body.message).not.toMatch(/connection lost|still down/);
    expect(res.body.message).not.toContain(process.env.DATA_DIR);
    const copy = JSON.parse(require('fs').readFileSync(require('path').join(process.env.DATA_DIR, file), 'utf8'));
    expect(copy.budgets).toHaveLength(1);
  });

  it('refuses two budgets for the same recipient and year before touching anything', async () => {
    await seedUser();
    const backup = await download();
    backup.data.budgets.push({ ...backup.data.budgets[0], _id: String(oid()) });

    const res = await upload(backup);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/two budgets .*2026/i);
    expect(await Notification.countDocuments({ user: userA })).toBe(1);
  });

  it('runs the same checks as saving does (a budget minimum above its maximum)', async () => {
    await seedUser();
    const backup = await download();
    backup.data.budgets[0].minimumAmount = 500;

    const res = await upload(backup);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Minimum amount cannot be greater/);
  });

  it('skips preferences this server would refuse, and says so', async () => {
    await seedUser();
    const backup = await download();
    Object.assign(backup.data.preferences, { theme: 'neon', aiProvider: 'nobody', holidaySettings: 'x' });

    const res = await upload(backup);

    expect(res.status).toBe(200);
    expect(res.body.warnings.join(' ')).toMatch(/theme.*aiProvider.*holidaySettings|preferences/);
    const prefs = (await User.findById(userA).lean()).preferences;
    expect(prefs.theme).toBe('dark');
    expect(prefs.aiProvider).toBeUndefined();
  });

  it('refuses a file whose lists hold something other than items', async () => {
    const res = await upload({ metadata: { format: 2 }, data: { gifts: [null] } });
    expect(res.status).toBe(400);
  });

  it('refuses a backup made by a newer version', async () => {
    const res = await upload({ metadata: { format: 3 }, data: {} });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/newer version/);
  });
});

describe('restoring a backup from before the 2026-10 upgrades', () => {
  // The old format: new ids on import were never re-linked, text was stored
  // HTML-encoded, money fields were counters, and no names travelled
  const legacyBackup = () => {
    const recipient = String(oid());
    const party = String(oid());
    const unknownType = String(oid());
    const club = String(oid());
    return {
      metadata: { version: '1.0.0', timestamp: '2025-06-01T00:00:00.000Z', userId: String(userA) },
      data: {
        user: { firstName: 'A', preferences: { theme: 'dark' } },
        settings: { theme: 'light', notifications: true },
        recipients: [{
          _id: recipient, user: String(userA), firstName: 'Sean', lastName: 'O&amp;#39;Brien', relation: 'Friend',
          relationship: 'friendship', birthdate: '1990-03-15T00:00:00.000Z', interests: ['Rock &amp; roll'],
          address: { city: 'St. John&#39;s' }, tags: [String(oid())], giftStatus: 'inactive'
        }],
        events: [
          { _id: party, user: String(userA), recipient, name: 'Sean&#39;s Birthday', date: '2026-03-15T00:00:00.000Z', type: LEGACY_BIRTHDAY_TYPE_ID },
          { _id: String(oid()), user: String(userA), recipient, name: 'Mystery', date: '2026-08-01T00:00:00.000Z', type: unknownType },
          {
            _id: club, user: String(userA), recipient, name: 'Club', date: '2027-01-04T00:00:00.000Z', type: unknownType,
            recurring: { frequency: 'Weekly', until: '2027-01-18T00:00:00.000Z', exceptions: [] }
          }
        ],
        gifts: [
          {
            _id: String(oid()), user: String(userA), recipient, event: party, name: 'Book', price: 19.999, status: 'purchased',
            budget: String(oid()), budgetStatus: 'within', createdAt: '2025-05-01T00:00:00.000Z', updatedAt: '2025-05-02T00:00:00.000Z'
          },
          { _id: String(oid()), user: String(userA), recipient, event: party, name: 'Pen', price: 5, status: 'saved', purchaseDate: '2025-05-03T00:00:00.000Z' }
        ],
        budgets: [{ _id: String(oid()), user: String(userA), recipient, year: 2026, maximumAmount: 100, spentAmount: 77, remainingAmount: 23 }]
      }
    };
  };

  it('fixes the data as it comes in', async () => {
    const res = await upload(legacyBackup());

    expect(res.status).toBe(200);
    expect(res.body.legacy).toBe(true);
    await expectLinked(userA);

    const sean = await Recipient.findOne({ user: userA }).lean();
    expect(sean.lastName).toBe("O'Brien");
    expect(sean.interests).toEqual(['Rock & roll']);
    // The old filter only encoded top-level text: nested text is as typed
    expect(sean.address.city).toBe('St. John&#39;s');
    // The tag did not travel with the old format
    expect(sean.tags).toEqual([]);

    const book = await Gift.collection.findOne({ user: userA, name: 'Book' });
    expect(book.price).toBe(20);
    expect(book.purchaseDate).toEqual(new Date('2025-05-02T00:00:00.000Z'));
    expect(book.budget).toBeUndefined();
    expect(book.budgetStatus).toBeUndefined();
    expect((await Gift.collection.findOne({ user: userA, name: 'Pen' })).purchaseDate).toBeUndefined();
    const budget = await Budget.collection.findOne({ user: userA });
    expect(budget.spentAmount).toBeUndefined();

    const birthday = await Event.findOne({ user: userA, name: "Sean's Birthday" });
    expect(String(birthday.type)).toBe(String(types.Birthday));
    const imported = await EventType.findOne({ createdBy: userA, name: 'Imported' });
    expect(String((await Event.findOne({ user: userA, name: 'Mystery' })).type)).toBe(String(imported._id));
    expect(res.body.fixes).toMatchObject({ pricesRounded: 1, purchaseDatesAdded: 1, eventsWithImportedType: 2 });
  });

  it('builds the occurrences of recurring events', async () => {
    await upload(legacyBackup());
    const days = (await Event.find({ user: userA, name: 'Club' }).sort('date').lean()).map((e) => e.date.toISOString().slice(0, 10));
    expect(days).toEqual(['2027-01-04', '2027-01-11', '2027-01-18']);
  });
});

describe('checking a backup file', () => {
  it('describes the file without logging the request', async () => {
    await seedUser();
    const backup = await download();
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    const res = await as(request(app).post('/api/settings/validate-backup'))
      .set('Cookie', 'token=secret-session-token')
      .attach('backup', Buffer.from(JSON.stringify(backup)), { filename: 'backup.json', contentType: 'application/json' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isValid: true, backupInfo: { format: 2, legacy: false, counts: { recipients: 1, gifts: 2 } } });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  const check = (buffer) => as(request(app).post('/api/settings/validate-backup'))
    .attach('backup', buffer, { filename: 'backup.json', contentType: 'application/json' });

  it('accepts a backup saved with a byte order mark (e.g. by Notepad)', async () => {
    await seedUser();
    const backup = await download();

    const res = await check(Buffer.from('\uFEFF' + JSON.stringify(backup)));

    expect(res.status).toBe(200);
    expect(res.body.backupInfo.counts.gifts).toBe(2);
  });

  it('says an export is not a backup', async () => {
    const res = await check(Buffer.from(JSON.stringify({ gifts: [{ Name: 'Scarf' }] })));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not a Gifty backup.*Create Backup/);
  });
});

describe('tags in a backup', () => {
  it('keeps tags no recipient uses yet', async () => {
    await seedUser();
    await Tag.create({ user: userA, name: 'Unused' });
    const backup = await download();

    expect((await upload(backup, userB)).status).toBe(200);

    expect((await Tag.find({ user: userB }).lean()).map((t) => t.name).sort()).toEqual(['Books', 'Unused']);
  });
});
