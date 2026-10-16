// Each recipient's upcoming birthday event, through the real recipient routes
// and MongoDB, on a fresh install (event types seeded with new ids). Only auth
// is stubbed.
const realProcess = require('vm').runInThisContext('process');
const { setTimeZone } = require('../utils/timeZone');
const originalTZ = realProcess.env.TZ;
process.env.TZ = 'America/New_York';
realProcess.env.TZ = 'America/New_York';

const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-birthday-events-${process.pid}`;

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

const recipientRoutes = require('../../routes/recipientRoutes');
const errorHandler = require('../../middleware/errorHandler');
const Event = require('../../models/Event');
const EventType = require('../../models/EventType');
const Recipient = require('../../models/Recipient');
require('../../models/Tags');
const { seedEventTypes } = require('../../utils/dbInitializer');
const {
  LEGACY_BIRTHDAY_TYPE_ID, nextBirthday, ensureUpcomingBirthdays, repairLegacyBirthdayType
} = require('../../services/birthdayEventService');
const { todayAsDateOnly } = require('../../utils/dates');

jest.setTimeout(30000);

const app = express();
app.use(express.json());
app.use('/api/recipients', recipientRoutes);
app.use(errorHandler);

const user = new mongoose.Types.ObjectId();
const as = (req) => req.set('x-test-user', String(user));

// A calendar day `offset` days from today, as 'YYYY-MM-DD' in the given year
const dayFromToday = (offset, year) => {
  const today = todayAsDateOnly();
  const d = new Date(today.getTime() + offset * 86400000);
  return `${year ?? d.getUTCFullYear()}-${d.toISOString().slice(5, 10)}`;
};

let birthdayType;

const addRecipient = (body) => as(request(app).post('/api/recipients')).send({
  firstName: 'Ann', lastName: 'Lee', relation: 'Friend', relationship: 'friendship', ...body
});
const birthdayEvents = (recipientId) => Event.find({ recipient: recipientId }).sort('date').lean();

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
});

afterAll(async () => {
  await teardownTestDB();
  setTimeZone(originalTZ);
});

beforeEach(async () => {
  await Promise.all([Event, EventType, Recipient].map((M) => M.deleteMany({})));
  await seedEventTypes();
  birthdayType = await EventType.findOne({ name: 'Birthday' });
});

describe('nextBirthday', () => {
  it('is this year when the day is still ahead, else next year', () => {
    const from = new Date('2026-10-14T00:00:00Z');
    expect(nextBirthday(new Date('1990-12-01'), from).toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(nextBirthday(new Date('1990-10-14'), from).toISOString()).toBe('2026-10-14T00:00:00.000Z');
    expect(nextBirthday(new Date('1990-05-20'), from).toISOString()).toBe('2027-05-20T00:00:00.000Z');
  });

  it('puts a Feb 29 birthday on Feb 28 in common years', () => {
    expect(nextBirthday(new Date('2000-02-29'), new Date('2026-10-14T00:00:00Z')).toISOString())
      .toBe('2027-02-28T00:00:00.000Z');
    expect(nextBirthday(new Date('2000-02-29'), new Date('2027-10-14T00:00:00Z')).toISOString())
      .toBe('2028-02-29T00:00:00.000Z');
  });
});

describe('birthday event', () => {
  it('is created with the recipient, with the Birthday type of this install', async () => {
    const res = await addRecipient({ birthdate: dayFromToday(10, 1990) });
    expect(res.status).toBe(201);

    const events = await birthdayEvents(res.body._id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: "Ann's Birthday", isAutoBirthday: true });
    expect(String(events[0].type)).toBe(String(birthdayType._id));
    expect(events[0].date.toISOString().slice(0, 10)).toBe(dayFromToday(10));
    expect(events[0].isSystemGenerated).not.toBe(true);
  });

  it('follows a birthdate change and a rename', async () => {
    const { body: recipient } = await addRecipient({ birthdate: dayFromToday(10, 1990) });
    const [before] = await birthdayEvents(recipient._id);

    await as(request(app).put(`/api/recipients/${recipient._id}`)).send({ birthdate: dayFromToday(20, 1990) });
    await as(request(app).put(`/api/recipients/${recipient._id}`)).send({ firstName: 'Bea' });

    const events = await birthdayEvents(recipient._id);
    expect(events).toHaveLength(1);
    expect(String(events[0]._id)).toBe(String(before._id));
    expect(events[0].name).toBe("Bea's Birthday");
    expect(events[0].date.toISOString().slice(0, 10)).toBe(dayFromToday(20));
  });

  it('adopts a birthday event made before they were marked', async () => {
    const recipientId = new mongoose.Types.ObjectId();
    await Recipient.collection.insertOne({
      _id: recipientId, user, firstName: 'Ann', lastName: 'Lee', relation: 'Friend', relationship: 'friendship',
      birthdate: new Date(dayFromToday(10, 1990)), tags: []
    });
    const legacyId = new mongoose.Types.ObjectId();
    await Event.collection.insertOne({
      _id: legacyId, user, recipient: recipientId, name: "Ann's Birthday",
      date: new Date(dayFromToday(10)), type: new mongoose.Types.ObjectId(LEGACY_BIRTHDAY_TYPE_ID),
      recurring: { frequency: 'None', exceptions: [] }
    });

    await as(request(app).put(`/api/recipients/${recipientId}`)).send({ firstName: 'Bea', birthdate: dayFromToday(30, 1990) });

    const events = await birthdayEvents(recipientId);
    expect(events.map((e) => String(e._id))).toEqual([String(legacyId)]);
    expect(events[0]).toMatchObject({ name: "Bea's Birthday", isAutoBirthday: true });
    expect(String(events[0].type)).toBe(String(birthdayType._id));
  });

  it("never takes over an occurrence of the user's own recurring birthday event", async () => {
    const { body: recipient } = await addRecipient({ birthdate: dayFromToday(10, 1990) });
    await Event.deleteMany({ recipient: recipient._id });
    const occurrence = await Event.create({
      user, recipient: recipient._id, name: "Ann's Birthday", date: new Date(dayFromToday(10)),
      type: birthdayType._id, series: new mongoose.Types.ObjectId()
    });

    await as(request(app).put(`/api/recipients/${recipient._id}`)).send({ birthdate: dayFromToday(20, 1990) });

    const after = await Event.findById(occurrence._id);
    expect(after.isAutoBirthday).toBeUndefined();
    expect(after.date.toISOString().slice(0, 10)).toBe(dayFromToday(10));
    // The birthday moved off that day, so it gets its own event
    expect(await Event.countDocuments({ recipient: recipient._id, isAutoBirthday: true })).toBe(1);
  });

  it("adds none when the user's own birthday series already covers the day, under any name", async () => {
    const { body: recipient } = await addRecipient({ birthdate: dayFromToday(10, 1990) });
    await Event.deleteMany({ recipient: recipient._id });
    await Event.create({
      user, recipient: recipient._id, name: 'Birthday of Ann', date: new Date(dayFromToday(10)),
      type: birthdayType._id, series: new mongoose.Types.ObjectId()
    });

    const result = await ensureUpcomingBirthdays();

    expect(result.synced).toBe(0);
    expect(await Event.countDocuments({ recipient: recipient._id })).toBe(1);
  });

  it('leaves past birthdays alone and the monthly job adds the next one', async () => {
    const { body: recipient } = await addRecipient({ birthdate: dayFromToday(10, 1990) });
    const [upcoming] = await birthdayEvents(recipient._id);
    // Pretend it already happened
    const past = new Date(`${dayFromToday(-5)}T00:00:00Z`);
    await Event.updateOne({ _id: upcoming._id }, { $set: { date: past } });

    await Recipient.updateOne({ _id: recipient._id }, { $set: { firstName: 'Bea' } });
    const result = await ensureUpcomingBirthdays();

    expect(result.synced).toBe(1);
    const events = await birthdayEvents(recipient._id);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ name: "Ann's Birthday", date: past });
    expect(events[1].name).toBe("Bea's Birthday");
    expect(events[1].date.toISOString().slice(0, 10)).toBe(dayFromToday(10));

    expect((await ensureUpcomingBirthdays()).synced).toBe(0);
  });

  it('repairs events that carry the legacy Birthday type id', async () => {
    const id = new mongoose.Types.ObjectId();
    await Event.collection.insertOne({
      _id: id, user, recipient: new mongoose.Types.ObjectId(), name: "Ann's Birthday",
      date: new Date('2030-01-01'), type: new mongoose.Types.ObjectId(LEGACY_BIRTHDAY_TYPE_ID)
    });

    expect(await repairLegacyBirthdayType()).toBe(1);
    expect(String((await Event.findById(id)).type)).toBe(String(birthdayType._id));
  });
});
