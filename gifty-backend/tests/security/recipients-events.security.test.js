/**
 * Cross-user authorization tests for /recipients and /events.
 *
 * Runs the real routers, the real `protect` middleware (real JWTs) and the
 * real errorHandler against the real test MongoDB. Uses its own database so
 * it can't race other suites that drop/clear `gifty-test`.
 */
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const request = require('supertest');

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const User = require('../../models/User');
const Recipient = require('../../models/Recipient');
const Event = require('../../models/Event');
const EventType = require('../../models/EventType');
const { Budget } = require('../../models/Budget');
const Tag = require('../../models/Tags');
const { generateToken } = require('../../utils/generateToken');
const recipientRoutes = require('../../routes/recipientRoutes');
const eventRoutes = require('../../routes/eventRoutes');
const errorHandler = require('../../middleware/errorHandler');

const MONGO_URI = `mongodb://localhost:27017/gifty-test-security-recipients-events-${process.pid}`;

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/recipients', recipientRoutes);
  app.use('/api/events', eventRoutes);
  app.use(errorHandler);
  return app;
};

describe('Recipients/Events cross-user authorization', () => {
  let app;
  let userA;
  let userB;
  let authA;
  let authB;
  let eventType;
  let customTypeB;

  const recipientBody = (overrides = {}) => ({
    firstName: 'Ada',
    lastName: 'Lovelace',
    relation: 'Friend',
    birthdate: '1990-12-10',
    ...overrides
  });

  const makeRecipient = (user, overrides = {}) =>
    Recipient.create({
      user: user._id,
      firstName: 'Bob',
      lastName: 'Owned',
      relation: 'Friend',
      relationship: 'friendship',
      birthdate: new Date('1985-05-05'),
      ...overrides
    });

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(MONGO_URI);
    app = buildApp();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Promise.all(
      Object.values(mongoose.connection.collections).map((c) => c.deleteMany({}))
    );
    [userA, userB] = await User.create([
      { username: 'alice-sec', firstName: 'Alice', lastName: 'A', email: 'alice-sec@example.com', password: 'Password123!' },
      { username: 'bob-sec', firstName: 'Bob', lastName: 'B', email: 'bob-sec@example.com', password: 'Password123!' }
    ]);
    authA = { Authorization: `Bearer ${generateToken(userA._id.toString())}` };
    authB = { Authorization: `Bearer ${generateToken(userB._id.toString())}` };
    eventType = await EventType.create({ name: 'Anniversary-sec', isCustom: false });
    customTypeB = await EventType.create({ name: 'B-private-sec', isCustom: true, createdBy: userB._id });
  });

  describe('POST /api/recipients', () => {
    it('ignores a client-supplied user and creates the recipient (and its budget/event) for the caller only', async () => {
      const res = await request(app)
        .post('/api/recipients')
        .set(authA)
        .send(recipientBody({ user: userB._id.toString(), isSystemAccount: true }));

      expect(res.status).toBe(201);
      expect(res.body.user.toString()).toBe(userA._id.toString());
      expect(res.body.isSystemAccount).toBe(false);

      const listB = await request(app).get('/api/recipients').set(authB);
      expect(listB.status).toBe(200);
      expect(listB.body).toHaveLength(0);
      expect(await Recipient.countDocuments({ user: userB._id })).toBe(0);
      expect(await Budget.countDocuments({ user: userB._id })).toBe(0);
      expect(await Event.countDocuments({ user: userB._id })).toBe(0);

      const listA = await request(app).get('/api/recipients').set(authA);
      expect(listA.body).toHaveLength(1);
    });
  });

  describe('new recipients get no automatic budget (money model decision 1)', () => {
    it('creates no Budget, so the recipient shows "No budget" in the summary', async () => {
      const res = await request(app).post('/api/recipients').set(authA).send(recipientBody());
      expect(res.status).toBe(201);
      expect(await Budget.countDocuments({ user: userA._id })).toBe(0);

      const moneyService = require('../../services/moneyService');
      const summary = await moneyService.getYearSummary(userA._id, new Date().getFullYear());
      expect(summary.recipients).toHaveLength(1);
      expect(summary.recipients[0]).toMatchObject({
        status: 'no_budget', left: null, budget: { exists: false, limit: null }
      });
      expect(summary.overall.allocated).toBe(0);
    });
  });

  describe('recipient tags', () => {
    it("links the caller's own tag, never another user's tag of the same name (POST)", async () => {
      const tagOfA = await Tag.create({ name: 'family', user: userA._id });
      const legacy = await Tag.collection.insertOne({ name: 'friends' });

      const res = await request(app)
        .post('/api/recipients')
        .set(authB)
        .send(recipientBody({ tags: ['Family', 'friends'] }));

      expect(res.status).toBe(201);
      const tagIds = res.body.tags.map((t) => t._id.toString());
      expect(tagIds).toHaveLength(2);
      expect(tagIds).not.toContain(tagOfA._id.toString());
      expect(tagIds).not.toContain(legacy.insertedId.toString());
      const linked = await Tag.find({ _id: { $in: tagIds } });
      expect(linked.every((t) => t.user && t.user.toString() === userB._id.toString())).toBe(true);
      // A's tag is untouched
      expect((await Tag.findById(tagOfA._id)).user.toString()).toBe(userA._id.toString());
    });

    it("links the caller's own tag, never another user's tag of the same name (PUT)", async () => {
      const tagOfA = await Tag.create({ name: 'family', user: userA._id });
      const ownTagB = await Tag.create({ name: 'work', user: userB._id });
      const mine = await makeRecipient(userB);

      const res = await request(app)
        .put(`/api/recipients/${mine._id}`)
        .set(authB)
        .send({ tags: ['family', { name: 'Work' }] });

      expect(res.status).toBe(200);
      const tagIds = res.body.tags.map((t) => t._id.toString());
      expect(tagIds).not.toContain(tagOfA._id.toString());
      expect(tagIds).toContain(ownTagB._id.toString());
      expect(await Tag.countDocuments({ name: 'family', user: userB._id })).toBe(1);
    });
  });

  describe('PUT /api/recipients/:id', () => {
    it('cannot move a recipient to another account or flag it as a system account', async () => {
      const mine = await makeRecipient(userA);

      const res = await request(app)
        .put(`/api/recipients/${mine._id}`)
        .set(authA)
        .send({ user: userB._id.toString(), isSystemAccount: true, firstName: 'Renamed' });

      expect(res.status).toBe(200);
      const fresh = await Recipient.findById(mine._id);
      expect(fresh.user.toString()).toBe(userA._id.toString());
      expect(fresh.isSystemAccount).toBe(false);
      expect(fresh.firstName).toBe('Renamed');
    });

    it('rejects a minimum price above the maximum price with 400', async () => {
      const mine = await makeRecipient(userA, { minimumPriceBudget: 10, maximumPriceBudget: 50 });

      const res = await request(app)
        .put(`/api/recipients/${mine._id}`)
        .set(authA)
        .send({ minimumPriceBudget: 100 });

      expect(res.status).toBe(400);
      const fresh = await Recipient.findById(mine._id);
      expect(fresh.minimumPriceBudget).toBe(10);
    });
  });

  describe("another user's recipient", () => {
    it('cannot be read (404)', async () => {
      const theirs = await makeRecipient(userB);
      const res = await request(app).get(`/api/recipients/${theirs._id}`).set(authA);
      expect(res.status).toBe(404);
    });

    it('cannot be updated (404, unchanged)', async () => {
      const theirs = await makeRecipient(userB);
      const res = await request(app)
        .put(`/api/recipients/${theirs._id}`)
        .set(authA)
        .send({ firstName: 'Hacked' });
      expect(res.status).toBe(404);
      expect((await Recipient.findById(theirs._id)).firstName).toBe('Bob');
    });

    it('cannot be deleted (404, still present)', async () => {
      const theirs = await makeRecipient(userB);
      const res = await request(app).delete(`/api/recipients/${theirs._id}`).set(authA);
      expect(res.status).toBe(404);
      expect(await Recipient.exists({ _id: theirs._id })).toBeTruthy();
    });
  });

  describe('POST /api/events', () => {
    const eventBody = (recipientId, typeId, overrides = {}) => ({
      name: 'Party',
      date: '2030-06-01',
      type: typeId.toString(),
      recipient: recipientId.toString(),
      recurring: { frequency: 'None' },
      ...overrides
    });

    it("rejects another user's recipient with 404 and creates nothing", async () => {
      const theirs = await makeRecipient(userB);
      const before = await Event.countDocuments({});

      const res = await request(app)
        .post('/api/events')
        .set(authA)
        .send(eventBody(theirs._id, eventType._id));

      expect(res.status).toBe(404);
      expect(await Event.countDocuments({})).toBe(before);
    });

    it("rejects another user's custom event type with 404", async () => {
      const mine = await makeRecipient(userA);
      const res = await request(app)
        .post('/api/events')
        .set(authA)
        .send(eventBody(mine._id, customTypeB._id));
      expect(res.status).toBe(404);
    });

    it('ignores client-supplied user / isSystemGenerated', async () => {
      const mine = await makeRecipient(userA);
      const res = await request(app)
        .post('/api/events')
        .set(authA)
        .send(eventBody(mine._id, eventType._id, { user: userB._id.toString(), isSystemGenerated: true }));
      expect(res.status).toBe(201);
      expect(res.body.user.toString()).toBe(userA._id.toString());
      expect(res.body.isSystemGenerated).toBe(false);
    });

    it('returns 404/400 for a malformed recipient id instead of 500', async () => {
      const res = await request(app)
        .post('/api/events')
        .set(authA)
        .send(eventBody('not-an-id', eventType._id));
      expect([400, 404]).toContain(res.status);
      expect(await Event.countDocuments({})).toBe(0);
    });
  });

  describe('PUT /api/events/:eventId', () => {
    let mine;
    let event;

    beforeEach(async () => {
      mine = await makeRecipient(userA);
      event = await Event.create({
        user: userA._id,
        recipient: mine._id,
        name: 'Original',
        date: new Date('2030-01-01'),
        type: eventType._id,
        recurring: { frequency: 'None' },
        reminder: { isSet: true, time: new Date('2029-12-31T10:00:00Z'), method: 'Email' }
      });
    });

    it('a partial body only changes the provided fields', async () => {
      const res = await request(app)
        .put(`/api/events/${event._id}`)
        .set(authA)
        .send({ name: 'Renamed' });

      expect(res.status).toBe(200);
      const fresh = await Event.findById(event._id);
      expect(fresh.name).toBe('Renamed');
      expect(fresh.date.toISOString()).toBe(new Date('2030-01-01').toISOString());
      expect(fresh.type.toString()).toBe(eventType._id.toString());
      expect(fresh.recipient.toString()).toBe(mine._id.toString());
      expect(fresh.reminder.isSet).toBe(true);
    });

    it("cannot re-point an event at another user's recipient (404)", async () => {
      const theirs = await makeRecipient(userB);
      const res = await request(app)
        .put(`/api/events/${event._id}`)
        .set(authA)
        .send({ recipient: theirs._id.toString() });
      expect(res.status).toBe(404);
      expect((await Event.findById(event._id)).recipient.toString()).toBe(mine._id.toString());
    });

    it("cannot update another user's event (404, not 401)", async () => {
      const res = await request(app)
        .put(`/api/events/${event._id}`)
        .set(authB)
        .send({ name: 'Hacked' });
      expect(res.status).toBe(404);
      expect((await Event.findById(event._id)).name).toBe('Original');
    });

    it("cannot delete another user's event (404, not 401)", async () => {
      const res = await request(app).delete(`/api/events/${event._id}`).set(authB);
      expect(res.status).toBe(404);
      expect(await Event.exists({ _id: event._id })).toBeTruthy();
    });
  });

  describe('invalid ids', () => {
    it.each([
      ['GET', '/api/recipients/not-an-id'],
      ['PUT', '/api/recipients/not-an-id'],
      ['DELETE', '/api/recipients/not-an-id'],
      ['PUT', '/api/events/not-an-id'],
      ['DELETE', '/api/events/not-an-id']
    ])('%s %s returns 404/400, not 500', async (method, url) => {
      const res = await request(app)[method.toLowerCase()](url).set(authA).send({ name: 'x' });
      expect([400, 404]).toContain(res.status);
    });
  });
});
