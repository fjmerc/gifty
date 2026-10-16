// The notification bell (list, read, snooze, delete, counts) and tag
// deletion, through the real routes and MongoDB. Only auth is stubbed.
const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-notifications-tags-${process.pid}`;

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

const notificationRoutes = require('../../routes/notificationRoutes');
const tagRoutes = require('../../routes/tagRoutes');
const errorHandler = require('../../middleware/errorHandler');
const Event = require('../../models/Event');
const Notification = require('../../models/Notification');
const Recipient = require('../../models/Recipient');
const Tag = require('../../models/Tags');
const User = require('../../models/User');

jest.setTimeout(30000);

const app = express();
app.use(express.json());
app.use('/api/notifications', notificationRoutes);
app.use('/api/tags', tagRoutes);
app.use(errorHandler);

let user;
const as = (req) => req.set('x-test-user', String(user._id));

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
});

afterAll(async () => {
  await teardownTestDB();
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  user = await User.create({ username: 'bell', email: 'bell@example.com', password: 'Passw0rd!x', firstName: 'B', lastName: 'L' });
});

describe('notifications', () => {
  it('can be read, snoozed and deleted, and the unread count follows', async () => {
    const recipient = await Recipient.create({
      user: user._id, firstName: 'Ann', lastName: 'Lee', relation: 'Friend', relationship: 'friendship', birthdate: new Date('1990-01-01')
    });
    const event = await Event.create({ user: user._id, recipient: recipient._id, name: 'Party', date: new Date('2030-01-01'), type: new mongoose.Types.ObjectId() });
    const notice = await Notification.create({ user: user._id, event: event._id, notificationType: 'info', notificationDate: new Date(Date.now() - 60000) });
    const unread = async () => (await as(request(app).get('/api/notifications/stats'))).body.unreadCount;

    const listed = await as(request(app).get('/api/notifications'));
    expect(listed.status).toBe(200);
    expect(listed.body.notifications.map((n) => n.event.name)).toEqual(['Party']);
    expect(await unread()).toBe(1);

    expect((await as(request(app).put(`/api/notifications/${notice._id}`)).send({ read: true })).status).toBe(200);
    expect(await unread()).toBe(0);

    const snoozed = await as(request(app).put(`/api/notifications/${notice._id}/snooze`)).send({ snoozeDuration: 30 });
    expect(snoozed.status).toBe(200);
    // Unread again, but not counted before the snooze ends. Its reminder
    // time stays as it was: the reminder job matches on it to send once.
    expect(snoozed.body.read).toBe(false);
    expect(new Date(snoozed.body.snoozedUntil).getTime()).toBeGreaterThan(Date.now() + 29 * 60000);
    expect(new Date(snoozed.body.notificationDate)).toEqual(notice.notificationDate);
    expect(await unread()).toBe(0);
    await Notification.updateOne({ _id: notice._id }, { $set: { snoozedUntil: new Date(Date.now() - 1000) } });
    expect(await unread()).toBe(1);

    expect((await as(request(app).delete(`/api/notifications/${notice._id}`))).status).toBe(204);
    expect(await Notification.countDocuments()).toBe(0);
  });
});

describe('deleting a tag', () => {
  it('takes it off the recipients that carry it', async () => {
    const books = await Tag.create({ user: user._id, name: 'books' });
    const tea = await Tag.create({ user: user._id, name: 'tea' });
    const recipient = await Recipient.create({
      user: user._id, firstName: 'Ann', lastName: 'Lee', relation: 'Friend', relationship: 'friendship',
      birthdate: new Date('1990-01-01'), tags: [books._id, tea._id]
    });
    await User.updateOne({ _id: user._id }, { $set: { tags: [books._id, tea._id] } });

    expect((await as(request(app).delete(`/api/tags/${books._id}`))).status).toBe(200);

    expect((await Recipient.findById(recipient._id)).tags.map(String)).toEqual([String(tea._id)]);
    expect((await User.findById(user._id)).tags.map(String)).not.toContain(String(books._id));
  });
});
