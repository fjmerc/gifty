// Event workflows through the real router, controller and MongoDB: what a
// delete does to the event's gifts, reminders and recurring series. Only auth
// is stubbed.
const realProcess = require('vm').runInThisContext('process');
const { setTimeZone } = require('../utils/timeZone');
const originalTZ = realProcess.env.TZ;
// A zone with DST, so occurrence dates are checked across a clock change
process.env.TZ = 'America/New_York';
realProcess.env.TZ = 'America/New_York';

const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-event-workflows-${process.pid}`;

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

const eventRoutes = require('../../routes/eventRoutes');
const errorHandler = require('../../middleware/errorHandler');
const Event = require('../../models/Event');
const EventType = require('../../models/EventType');
const Gift = require('../../models/Gift');
const Notification = require('../../models/Notification');
const Recipient = require('../../models/Recipient');
const { generateRecurringEvents } = require('../../services/recurringEventService');

jest.setTimeout(30000);

const app = express();
app.use(express.json());
app.use('/api/events', eventRoutes);
app.use(errorHandler);

const oid = () => new mongoose.Types.ObjectId();
const user = oid();
const as = (req, id = user) => req.set('x-test-user', String(id));

let recipient;
let eventType;

const insertEvent = async (extra = {}) => {
  const doc = {
    _id: oid(), user, recipient: recipient._id, name: 'Party', date: new Date('2030-03-10'),
    type: eventType._id, recurring: { frequency: 'None', exceptions: [] }, ...extra
  };
  await Event.collection.insertOne(doc);
  return doc;
};

const insertGift = async (event, extra = {}) => {
  const doc = {
    _id: oid(), user, recipient: recipient._id, event: event._id, name: 'Book', price: 10,
    status: 'saved', createdAt: new Date(), ...extra
  };
  await Gift.collection.insertOne(doc);
  return doc;
};

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
});

afterAll(async () => {
  await teardownTestDB();
  setTimeZone(originalTZ);
});

beforeEach(async () => {
  await Promise.all([Event, EventType, Gift, Notification, Recipient].map((M) => M.deleteMany({})));
  recipient = {
    _id: oid(), user, firstName: 'Ann', lastName: 'Lee', relation: 'friend', relationship: 'friendship',
    birthdate: new Date('1990-05-20'), tags: []
  };
  await Recipient.collection.insertOne(recipient);
  eventType = await EventType.create({ name: 'Party type', isCustom: false });
});

describe('DELETE /api/events/:eventId', () => {
  it("deletes the event's unpurchased gifts and reminders with it", async () => {
    const event = await insertEvent();
    const other = await insertEvent({ name: 'Other' });
    await insertGift(event, { status: 'saved' });
    await insertGift(event, { status: 'suggestion' });
    await insertGift(event, { status: 'ignored' });
    const kept = await insertGift(other);
    await Notification.collection.insertOne({ _id: oid(), user, event: event._id, notificationType: 'Email' });

    const res = await as(request(app).delete(`/api/events/${event._id}`));

    expect(res.status).toBe(204);
    expect(await Event.exists({ _id: event._id })).toBeNull();
    expect((await Gift.find({})).map((g) => String(g._id))).toEqual([String(kept._id)]);
    expect(await Notification.countDocuments({ event: event._id })).toBe(0);
  });

  it('refuses while purchased gifts record spending against the event', async () => {
    const event = await insertEvent();
    await insertGift(event, { status: 'purchased', purchaseDate: new Date('2030-03-01') });
    await insertGift(event, { status: 'saved' });

    const res = await as(request(app).delete(`/api/events/${event._id}`));

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/1 purchased gift, which records your spending/);
    expect(await Event.exists({ _id: event._id })).not.toBeNull();
    expect(await Gift.countDocuments({ event: event._id })).toBe(2);
  });

  it("returns 404 for another user's event and deletes nothing", async () => {
    const event = await insertEvent({ user: oid() });
    await insertGift(event, { user: event.user });

    const res = await as(request(app).delete(`/api/events/${event._id}`));

    expect(res.status).toBe(404);
    expect(await Gift.countDocuments({})).toBe(1);
  });
});

describe('recurring series', () => {
  const createSeries = (extra = {}) => as(request(app).post('/api/events')).send({
    name: 'Book club', date: '2028-03-06', type: String(eventType._id), recipient: String(recipient._id),
    recurring: { frequency: 'Weekly', until: '2028-03-27', exceptions: [] },
    reminder: { isSet: true, time: '2028-03-05T14:00:00.000Z', method: 'Email' },
    ...extra
  });
  const occurrencesOf = (master) => Event.find({ series: master._id }).sort('date').lean();
  const isoDays = (events) => events.map((e) => e.date.toISOString().slice(0, 10));
  const update = (master, body) => as(request(app).put(`/api/events/${master._id}`)).send(body);

  it('creates the occurrences on their days, linked to the series, reminders moved along', async () => {
    const res = await createSeries();
    expect(res.status).toBe(201);

    const occurrences = await occurrencesOf(res.body);
    expect(isoDays(occurrences)).toEqual(['2028-03-13', '2028-03-20', '2028-03-27']);
    expect(occurrences.every((o) => o.name === 'Book club' && o.recurring.frequency === 'None')).toBe(true);
    // 9:00 AM the day before, in EDT after the clock change
    expect(occurrences[0].reminder.time.toISOString()).toBe('2028-03-12T13:00:00.000Z');
  });

  it('renames the future occurrences in place when the event is renamed', async () => {
    const master = (await createSeries()).body;
    const before = await occurrencesOf(master);

    const res = await update(master, { name: 'Reading group' });
    expect(res.status).toBe(200);

    const after = await occurrencesOf(master);
    expect(after.map((o) => String(o._id))).toEqual(before.map((o) => String(o._id)));
    expect(after.every((o) => o.name === 'Reading group')).toBe(true);
    expect(await Event.countDocuments({ name: 'Book club' })).toBe(0);
  });

  it('moves the series to the new day and keeps an occurrence that already has gifts', async () => {
    const master = (await createSeries()).body;
    const [first] = await occurrencesOf(master);
    await insertGift(first);

    await update(master, { date: '2028-03-07' });

    const after = await occurrencesOf(master);
    expect(isoDays(after)).toEqual(['2028-03-13', '2028-03-14', '2028-03-21']);
    expect(await Gift.countDocuments({ event: first._id })).toBe(1);
  });

  it('skips a day added as an exception', async () => {
    const master = (await createSeries()).body;

    await update(master, { recurring: { frequency: 'Weekly', until: '2028-03-27', exceptions: ['2028-03-20'] } });

    expect(isoDays(await occurrencesOf(master))).toEqual(['2028-03-13', '2028-03-27']);
  });

  it('removes the future occurrences when the event stops repeating, except those with gifts', async () => {
    const master = (await createSeries()).body;
    const [, second] = await occurrencesOf(master);
    await insertGift(second);

    await update(master, { recurring: { frequency: 'None', until: null, exceptions: [] } });

    expect((await occurrencesOf(master)).map((o) => String(o._id))).toEqual([String(second._id)]);
  });

  it('takes the series down with the event, unlinking occurrences that have gifts', async () => {
    const master = (await createSeries()).body;
    const [first] = await occurrencesOf(master);
    await insertGift(first);

    const res = await as(request(app).delete(`/api/events/${master._id}`));
    expect(res.status).toBe(204);

    expect((await Event.find({})).map((e) => String(e._id))).toEqual([String(first._id)]);
    expect((await Event.findById(first._id)).series).toBeUndefined();
  });

  it('keeps a deleted occurrence deleted when the series is synced again', async () => {
    const master = (await createSeries()).body;
    const [, second] = await occurrencesOf(master);

    expect((await as(request(app).delete(`/api/events/${second._id}`))).status).toBe(204);
    await generateRecurringEvents(String(user));

    expect(isoDays(await occurrencesOf(master))).toEqual(['2028-03-13', '2028-03-27']);
  });

  it('folds a second master on the same schedule into the first, one event per day', async () => {
    // A real old database had the same yearly birthday as two masters
    // (2024 and 2025) plus the old generator's occurrences of the first
    const first = oid();
    const second = oid();
    const yearly = { frequency: 'Yearly', until: new Date('2099-08-25'), exceptions: [] };
    await insertEvent({ _id: first, name: "Ann's Birthday", date: new Date('2024-08-25'), recurring: yearly });
    await insertEvent({ _id: second, name: "Ann's Birthday", date: new Date('2025-08-25'), recurring: yearly });
    for (const year of [2026, 2027, 2028, 2029]) {
      await insertEvent({ name: "Ann's Birthday", date: new Date(`${year}-08-25`) });
    }

    await generateRecurringEvents(String(user));

    const events = await Event.find({ name: "Ann's Birthday" }).sort('date').lean();
    const days = events.map((e) => e.date.toISOString().slice(0, 10));
    expect(days).toEqual(['2024-08-25', '2025-08-25', '2026-08-25', '2027-08-25', '2028-08-25', '2029-08-25']);
    expect(events.filter((e) => e.recurring.frequency === 'Yearly').map((e) => String(e._id))).toEqual([String(first)]);
    expect(events.filter((e) => String(e._id) !== String(first)).every((e) => String(e.series) === String(first))).toBe(true);

    // and stays that way
    await generateRecurringEvents(String(user));
    expect(await Event.countDocuments({ name: "Ann's Birthday" })).toBe(6);
  });

  it('leaves apart two series with the same name that never overlapped', async () => {
    const first = oid();
    const second = oid();
    await insertEvent({ _id: first, name: 'Lesson', date: new Date('2027-01-04'),
      recurring: { frequency: 'Weekly', until: new Date('2027-01-25'), exceptions: [] } });
    await insertEvent({ _id: second, name: 'Lesson', date: new Date('2027-06-07'),
      recurring: { frequency: 'Weekly', until: new Date('2027-06-28'), exceptions: [] } });

    await generateRecurringEvents(String(user));

    const days = (await Event.find({ name: 'Lesson' }).sort('date').lean()).map((e) => e.date.toISOString().slice(0, 10));
    expect(days).toEqual(['2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25', '2027-06-07', '2027-06-14', '2027-06-21', '2027-06-28']);
    expect(await Event.countDocuments({ name: 'Lesson', 'recurring.frequency': 'Weekly' })).toBe(2);
  });

  it('keeps an open-ended series open-ended when a duplicate is folded into it', async () => {
    const first = oid();
    await insertEvent({ _id: first, name: 'Club', date: new Date('2026-01-05'),
      recurring: { frequency: 'Weekly', until: null, exceptions: [] } });
    await insertEvent({ name: 'Club', date: new Date('2026-01-12'),
      recurring: { frequency: 'Weekly', until: new Date('2027-01-11'), exceptions: [] } });

    await generateRecurringEvents(String(user));

    expect((await Event.findById(first).lean()).recurring.until).toBeNull();
  });

  it("doesn't take a monthly master on the 28th for one clamped from the 31st", async () => {
    await insertEvent({ name: 'Rent', date: new Date('2027-01-31'),
      recurring: { frequency: 'Monthly', until: new Date('2027-06-30'), exceptions: [] } });
    await insertEvent({ name: 'Rent', date: new Date('2027-02-28'),
      recurring: { frequency: 'Monthly', until: new Date('2027-06-30'), exceptions: [] } });

    await generateRecurringEvents(String(user));

    expect(await Event.countDocuments({ name: 'Rent', 'recurring.frequency': 'Monthly' })).toBe(2);
  });

  it('adopts occurrences created before series links existed', async () => {
    const masterId = oid();
    await insertEvent({
      _id: masterId, name: 'Book club', date: new Date('2028-03-06'),
      recurring: { frequency: 'Weekly', until: new Date('2028-03-27'), exceptions: [] }
    });
    // Old generator: local-time arithmetic, so a DST shift moved later ones by an hour
    for (const date of ['2028-03-13T01:00:00Z', '2028-03-20T01:00:00Z', '2028-03-27T01:00:00Z']) {
      await insertEvent({ name: 'Book club', date: new Date(date) });
    }

    await update({ _id: masterId }, { name: 'Reading group' });

    expect(await Event.countDocuments({})).toBe(4);
    expect(await Event.countDocuments({ name: 'Reading group' })).toBe(4);
    expect((await occurrencesOf({ _id: masterId })).length).toBe(3);
  });

  it('adopts old occurrences an hour off their day (DST) without duplicating them', async () => {
    const masterId = oid();
    await insertEvent({
      _id: masterId, name: 'Book club', date: new Date('2028-03-06'),
      recurring: { frequency: 'Weekly', until: new Date('2028-03-27'), exceptions: [] }
    });
    // Old generator in New York after spring-forward: 7 PM local the evening before, as UTC
    const legacy = [];
    for (const date of ['2028-03-12T23:00:00Z', '2028-03-19T23:00:00Z', '2028-03-26T23:00:00Z']) {
      legacy.push(await insertEvent({ name: 'Book club', date: new Date(date) }));
    }
    await insertGift(legacy[0]);

    await generateRecurringEvents(String(user));

    expect(await Event.countDocuments({})).toBe(4);
    expect(isoDays(await occurrencesOf({ _id: masterId }))).toEqual(['2028-03-13', '2028-03-20', '2028-03-27']);
    expect(String((await Gift.findOne({})).event)).toBe(String(legacy[0]._id));
  });

  it('adopts old occurrences only once, never later one-off events', async () => {
    const master = (await createSeries()).body;
    const oneOff = await insertEvent({ name: 'Book club', date: new Date('2028-03-20') });

    await generateRecurringEvents(String(user));
    await update(master, { name: 'Reading group' });

    const after = await Event.findById(oneOff._id);
    expect(after.series).toBeUndefined();
    expect(after.name).toBe('Book club');
  });

  it("never takes over a recipient's automatic birthday event", async () => {
    const birthday = await insertEvent({ name: 'Book club', date: new Date('2028-03-13'), isAutoBirthday: true });

    await createSeries();
    await generateRecurringEvents(String(user));

    const after = await Event.findById(birthday._id);
    expect(after).not.toBeNull();
    expect(after.series).toBeUndefined();
  });

  it('keeps an occurrence edited on its own out of the series', async () => {
    const master = (await createSeries()).body;
    const [first] = await occurrencesOf(master);

    const res = await update(first, { date: '2028-03-14', name: 'Book club (moved)' });
    expect(res.status).toBe(200);
    await generateRecurringEvents(String(user));

    const moved = await Event.findById(first._id);
    expect(moved.date.toISOString().slice(0, 10)).toBe('2028-03-14');
    expect(moved.name).toBe('Book club (moved)');
    expect(moved.series).toBeUndefined();
    expect(isoDays(await occurrencesOf(master))).toEqual(['2028-03-20', '2028-03-27']);
  });

  it('does not fill in past days when a running series moves to another weekday', async () => {
    const day = (offset) => {
      const d = new Date();
      return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + offset)).toISOString().slice(0, 10);
    };
    const master = (await createSeries({
      date: day(-21), recurring: { frequency: 'Weekly', until: day(14), exceptions: [] }, reminder: { isSet: false }
    })).body;
    const today = new Date(`${day(0)}T00:00:00Z`);
    const pastBefore = (await occurrencesOf(master)).filter((o) => o.date < today).length;

    await update(master, { date: day(-20) });

    const past = (await Event.find({ date: { $lt: today } })).filter((e) => String(e._id) !== String(master._id));
    expect(past.length).toBe(pastBefore);
  });

  it('leaves past occurrences as they were', async () => {
    const day = (offset) => {
      const d = new Date();
      return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + offset)).toISOString().slice(0, 10);
    };
    const master = (await createSeries({
      date: day(-21), recurring: { frequency: 'Weekly', until: day(14), exceptions: [] }, reminder: { isSet: false }
    })).body;
    const past = (await occurrencesOf(master)).filter((o) => o.date < new Date(`${day(0)}T00:00:00Z`));
    expect(past.length).toBe(2);

    await update(master, { name: 'Renamed' });

    for (const o of past) {
      expect((await Event.findById(o._id)).name).toBe('Book club');
    }
  });
});
