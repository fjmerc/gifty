// Deleting a recipient you have bought gifts for archives them instead, so
// the spending history stays whole. Real recipient routes and MongoDB; only
// auth is stubbed.
const realProcess = require('vm').runInThisContext('process');
const originalTZ = realProcess.env.TZ;
process.env.TZ = 'UTC';
realProcess.env.TZ = 'UTC';

const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-recipient-archive-${process.pid}`;

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
const { Budget } = require('../../models/Budget');
const Event = require('../../models/Event');
const EventType = require('../../models/EventType');
const Gift = require('../../models/Gift');
const Notification = require('../../models/Notification');
const Recipient = require('../../models/Recipient');
require('../../models/Tags');
const { seedEventTypes } = require('../../utils/dbInitializer');
const { ensureUpcomingBirthdays } = require('../../services/birthdayEventService');
const { getYearSummary } = require('../../services/moneyService');

jest.setTimeout(30000);

const app = express();
app.use(express.json());
app.use('/api/recipients', recipientRoutes);
app.use(errorHandler);

const user = new mongoose.Types.ObjectId();
const other = new mongoose.Types.ObjectId();
const as = (req, who = user) => req.set('x-test-user', String(who));

const YEAR = 2026;
let type;

const makeRecipient = (firstName, owner = user) => Recipient.create({
  user: owner, firstName, lastName: 'Lee', relation: 'Friend', relationship: 'friendship',
  birthdate: new Date('1990-03-15')
});
const makeEvent = (recipient, extra = {}) => Event.create({
  user: recipient.user, recipient: recipient._id, name: `${recipient.firstName}'s party`,
  date: new Date('2026-06-01'), type: type._id, ...extra
});
const makeGift = (recipient, event, status, price = 40) => Gift.create({
  user: recipient.user, recipient: recipient._id, event: event._id, name: `${status} gift`, price, status,
  ...(status === 'purchased' ? { purchaseDate: new Date('2026-05-20') } : {})
});
const notify = (event) => Notification.create({
  user: event.user, event: event._id, notificationType: 'info', notificationDate: new Date(event.date.getTime() - 86400000)
});

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
});

afterAll(async () => {
  await teardownTestDB();
  process.env.TZ = originalTZ;
  realProcess.env.TZ = originalTZ;
});

beforeEach(async () => {
  await Promise.all([Budget, Event, EventType, Gift, Notification, Recipient].map((M) => M.deleteMany({})));
  await seedEventTypes();
  type = await EventType.findOne({ name: 'Birthday' });
});

describe('deleting a recipient', () => {
  it('removes everything when nothing was bought for them', async () => {
    const ann = await makeRecipient('Ann');
    const party = await makeEvent(ann);
    await makeGift(ann, party, 'saved');
    await notify(party);
    await Budget.create({ user, recipient: ann._id, year: YEAR, maximumAmount: 100 });

    const res = await as(request(app).delete(`/api/recipients/${ann._id}`));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ archived: false });
    expect(await Recipient.exists({ _id: ann._id })).toBeNull();
    expect(await Event.countDocuments({ recipient: ann._id })).toBe(0);
    expect(await Gift.countDocuments({ recipient: ann._id })).toBe(0);
    expect(await Notification.countDocuments({ event: party._id })).toBe(0);
    expect(await Budget.countDocuments({ recipient: ann._id })).toBe(0);
  });

  it('archives them when gifts were bought, keeping purchases and the events they belong to', async () => {
    const ann = await makeRecipient('Ann');
    const party = await makeEvent(ann, { reminder: { isSet: true, time: new Date('2026-05-31T09:00:00Z'), method: 'Email' } });
    const later = await makeEvent(ann, { name: 'Graduation', date: new Date('2026-09-01') });
    const bought = await makeGift(ann, party, 'purchased');
    await makeGift(ann, party, 'saved');
    await makeGift(ann, later, 'suggestion');
    await notify(party);
    await notify(later);

    const res = await as(request(app).delete(`/api/recipients/${ann._id}`));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ archived: true, purchasedGifts: 1 });
    const stored = await Recipient.findById(ann._id).lean();
    expect(stored.archived).toBe(true);
    expect(stored.archivedAt).toBeInstanceOf(Date);
    expect((await Gift.find({ recipient: ann._id }).lean()).map((g) => String(g._id))).toEqual([String(bought._id)]);
    const events = await Event.find({ recipient: ann._id }).lean();
    expect(events.map((e) => String(e._id))).toEqual([String(party._id)]);
    expect(events[0].reminder.isSet).toBe(false);
    expect(await Notification.countDocuments({ event: { $in: [party._id, later._id] } })).toBe(0);
  });

  it('stops a kept recurring event from producing more occurrences', async () => {
    const ann = await makeRecipient('Ann');
    const yearly = await makeEvent(ann, { recurring: { frequency: 'Yearly', until: new Date('2030-06-01'), exceptions: [] } });
    await makeGift(ann, yearly, 'purchased');

    await as(request(app).delete(`/api/recipients/${ann._id}`));

    const kept = await Event.findById(yearly._id).lean();
    expect(kept.recurring.frequency).toBe('None');
  });

  it("archives instead of deleting when one of their events holds someone else's purchase", async () => {
    const ann = await makeRecipient('Ann');
    const bea = await makeRecipient('Bea');
    const christmas = await makeEvent(ann, { name: 'Christmas' });
    const forBea = await makeGift(bea, christmas, 'purchased');
    const beaIdea = await makeGift(bea, await makeEvent(ann, { name: 'Picnic', date: new Date('2026-07-01') }), 'saved');

    const res = await as(request(app).delete(`/api/recipients/${ann._id}`));

    expect(res.body).toMatchObject({ archived: true, purchasedGifts: 0 });
    expect((await Recipient.findById(ann._id)).archived).toBe(true);
    expect(await Event.exists({ _id: christmas._id })).toBeTruthy();
    expect(await Gift.exists({ _id: forBea._id })).toBeTruthy();
    // Ideas on their removed events go with them, whoever they were for
    expect(await Gift.exists({ _id: beaIdea._id })).toBeNull();
  });

  it("refuses a permanent delete while their events hold someone else's purchases", async () => {
    const ann = await makeRecipient('Ann');
    const bea = await makeRecipient('Bea');
    const christmas = await makeEvent(ann, { name: 'Christmas' });
    await makeGift(ann, christmas, 'purchased');
    await makeGift(bea, christmas, 'purchased');

    const res = await as(request(app).delete(`/api/recipients/${ann._id}?permanent=true`));

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/other recipients/);
    expect(await Recipient.exists({ _id: ann._id })).toBeTruthy();
    expect(await Gift.countDocuments({ event: christmas._id })).toBe(2);
  });

  it('refuses the holidays system account', async () => {
    const holidays = await Recipient.create({
      user, firstName: 'Gifty', lastName: 'Holidays', relation: 'System', relationship: 'acquaintance',
      birthdate: new Date('2000-01-01'), isSystemAccount: true
    });
    const res = await as(request(app).delete(`/api/recipients/${holidays._id}`));
    expect(res.status).toBe(400);
    expect(await Recipient.exists({ _id: holidays._id })).toBeTruthy();
  });
});

describe('an archived recipient', () => {
  const archive = async (firstName = 'Ann') => {
    const recipient = await makeRecipient(firstName);
    const party = await makeEvent(recipient);
    const gift = await makeGift(recipient, party, 'purchased');
    await as(request(app).delete(`/api/recipients/${recipient._id}`));
    return { recipient, party, gift };
  };

  it('leaves the recipient list and pickers but is listed under archived', async () => {
    const { recipient } = await archive();
    const bea = await makeRecipient('Bea');

    const list = await as(request(app).get('/api/recipients'));
    expect(list.body.map((r) => r.firstName)).toEqual(['Bea']);
    const pickers = await as(request(app).get('/api/recipients/all-including-system'));
    expect(pickers.body.map((r) => r.firstName)).toEqual(['Bea']);
    const archived = await as(request(app).get('/api/recipients?archived=true'));
    expect(archived.body.map((r) => r._id)).toEqual([String(recipient._id)]);
    expect(archived.body[0]).toMatchObject({ archived: true, purchasedGiftCount: 1 });

    const nav = await as(request(app).get(`/api/recipients/${bea._id}/navigation`));
    expect(nav.body).toEqual({ prevId: null, nextId: null });
    const fromArchived = await as(request(app).get(`/api/recipients/${recipient._id}/navigation`));
    expect(fromArchived.body).toEqual({ prevId: null, nextId: null });
    // Purchase History links still open their profile
    const profile = await as(request(app).get(`/api/recipients/${recipient._id}`));
    expect(profile.status).toBe(200);
    expect(profile.body.archived).toBe(true);
  });

  it('counts purchased gifts on the active list too, so the delete dialog can say what happens', async () => {
    const ann = await makeRecipient('Ann');
    const party = await makeEvent(ann);
    await makeGift(ann, party, 'purchased');
    await makeGift(ann, party, 'purchased');
    await makeGift(ann, party, 'saved');
    await makeRecipient('Bea');

    const list = await as(request(app).get('/api/recipients'));
    const counts = Object.fromEntries(list.body.map((r) => [r.firstName, r.purchasedGiftCount]));
    expect(counts).toEqual({ Ann: 2, Bea: 0 });
  });

  it('gets no new birthday events', async () => {
    const { recipient } = await archive();
    await Event.deleteMany({ isAutoBirthday: true });

    await ensureUpcomingBirthdays();
    const edit = await as(request(app).put(`/api/recipients/${recipient._id}`)).send({ firstName: 'Anna' });

    expect(edit.status).toBe(200);
    expect(await Event.countDocuments({ recipient: recipient._id, isAutoBirthday: true })).toBe(0);
  });

  it('keeps its spending in the year summary, so the rows add up to the total', async () => {
    const { recipient } = await archive();
    const bea = await makeRecipient('Bea');
    await makeGift(bea, await makeEvent(bea), 'purchased', 25);
    // archived with neither spending nor a budget this year: no row
    const old = await makeRecipient('Cal');
    await makeGift(old, await makeEvent(old), 'purchased', 10).then((g) =>
      Gift.updateOne({ _id: g._id }, { $set: { purchaseDate: new Date('2024-05-20') } }));
    await as(request(app).delete(`/api/recipients/${old._id}`));

    const summary = await getYearSummary(user, YEAR);

    expect(summary.overall.spent).toBe(65);
    const rows = Object.fromEntries(summary.recipients.map((r) => [r.name, r]));
    expect(Object.keys(rows).sort()).toEqual(['Ann Lee', 'Bea Lee']);
    expect(rows['Ann Lee']).toMatchObject({ recipientId: String(recipient._id), spent: 40, archived: true });
    expect(rows['Bea Lee'].archived).toBe(false);
    expect(summary.recipients.reduce((sum, r) => sum + r.spent, 0)).toBe(summary.overall.spent);
  });

  it('comes back with restore, birthday event included', async () => {
    const { recipient } = await archive();

    const res = await as(request(app).post(`/api/recipients/${recipient._id}/restore`));

    expect(res.status).toBe(200);
    expect(res.body.archived).toBe(false);
    const list = await as(request(app).get('/api/recipients'));
    expect(list.body.map((r) => r._id)).toEqual([String(recipient._id)]);
    expect(await Event.countDocuments({ recipient: recipient._id, isAutoBirthday: true })).toBe(1);
  });

  it('is removed with all its history by a permanent delete', async () => {
    const { recipient, party, gift } = await archive();

    const res = await as(request(app).delete(`/api/recipients/${recipient._id}?permanent=true`));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ archived: false });
    expect(await Recipient.exists({ _id: recipient._id })).toBeNull();
    expect(await Gift.exists({ _id: gift._id })).toBeNull();
    expect(await Event.exists({ _id: party._id })).toBeNull();
  });

  it('restore answers with tags filled in, and is harmless on an active recipient', async () => {
    const tag = await require('../../models/Tags').create({ user, name: 'Books' });
    const bea = await makeRecipient('Bea');
    await Recipient.updateOne({ _id: bea._id }, { $set: { tags: [tag._id] } });

    const res = await as(request(app).post(`/api/recipients/${bea._id}/restore`));

    expect(res.status).toBe(200);
    expect(res.body.archived).toBe(false);
    expect(res.body.tags).toEqual([expect.objectContaining({ name: 'Books' })]);
  });

  it('cannot be archived or un-archived through an ordinary edit', async () => {
    const bea = await makeRecipient('Bea');
    await as(request(app).put(`/api/recipients/${bea._id}`)).send({ archived: true, archivedAt: new Date() });
    expect((await Recipient.findById(bea._id)).archived).toBe(false);
  });

  it("can't be restored or deleted by another user", async () => {
    const { recipient } = await archive();

    expect((await as(request(app).post(`/api/recipients/${recipient._id}/restore`), other)).status).toBe(404);
    expect((await as(request(app).delete(`/api/recipients/${recipient._id}?permanent=true`), other)).status).toBe(404);
    expect((await as(request(app).get('/api/recipients?archived=true'), other)).body).toEqual([]);
    expect((await Recipient.findById(recipient._id)).archived).toBe(true);
  });
});
