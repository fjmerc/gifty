/**
 * Phase 1 review follow-ups: remaining 401s, the purchase endpoint's
 * malformed-id 500, feedback timeline/sentiment scoping, and the legacy
 * global unique index on tag names. Real routers, models, JWTs and Mongo.
 */
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const mongoose = require('mongoose');
const { teardownTestDB, clearDatabase } = require('../utils/testSetup');

const MONGO_URI = `mongodb://localhost:27017/gifty-test-p1-followups-${process.pid}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const User = require('../../models/User');
const Tag = require('../../models/Tags');
const { generateToken } = require('../../utils/generateToken');
const errorHandler = require('../../middleware/errorHandler');
const feedbackService = require('../../services/feedbackService');
const { dropLegacyTagNameIndex } = require('../../migrations/dropLegacyTagNameIndex');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/notifications', require('../../routes/notificationRoutes'));
  app.use('/api/gifts', require('../../routes/giftRoutes'));
  app.use('/api/tags', require('../../routes/tagRoutes'));
  app.use(errorHandler);
  return app;
};

const makeUser = (suffix) => User.create({
  username: `user-${suffix}`, email: `${suffix}@example.com`, password: 'Password123!', firstName: 'T', lastName: suffix
});

describe('Phase 1 follow-ups', () => {
  let app; let userA; let userB; let authA; let authB;

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(MONGO_URI);
    app = buildApp();
  });
  afterAll(teardownTestDB);
  beforeEach(async () => {
    await clearDatabase();
    userA = await makeUser('a');
    userB = await makeUser('b');
    authA = `Bearer ${generateToken(userA._id.toString())}`;
    authB = `Bearer ${generateToken(userB._id.toString())}`;
  });

  describe("another user's notification is a 404, never a 401 (401 logs the UI out)", () => {
    let notificationId;
    beforeEach(async () => {
      ({ insertedId: notificationId } = await mongoose.connection.db.collection('notifications').insertOne({
        user: userA._id, event: new mongoose.Types.ObjectId(), notificationType: 'reminder', notificationDate: new Date(), message: 'm', read: false
      }));
    });

    it.each([
      ['put', (id) => `/api/notifications/${id}`],
      ['put', (id) => `/api/notifications/${id}/snooze`],
      ['delete', (id) => `/api/notifications/${id}`]
    ])('%s %s', async (method, path) => {
      const res = await request(app)[method](path(notificationId)).set('Authorization', authB).send({ read: true, snoozeDuration: 60 });
      expect(res.status).toBe(404);
      expect(await mongoose.connection.db.collection('notifications').countDocuments({ _id: notificationId })).toBe(1);
    });
  });

  it('POST /api/gifts/:id/purchase with a malformed id is a 404 without internals', async () => {
    const res = await request(app).post('/api/gifts/not-an-id/purchase').set('Authorization', authA).send({});
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/Cast to ObjectId/);
  });

  it("feedback timeline and sentiment only include the caller's own feedback", async () => {
    const recipient = new mongoose.Types.ObjectId();
    const logs = mongoose.connection.db.collection('feedbacklogs');
    await logs.insertMany([
      { user: userA._id, recipient, gift: new mongoose.Types.ObjectId(), action: 'favorited', comment: 'mine', timestamp: new Date() },
      { user: userB._id, recipient, gift: new mongoose.Types.ObjectId(), action: 'ignored', comment: 'SECRET-B', timestamp: new Date() }
    ]);
    const timeline = await feedbackService.getRecipientFeedbackTimeline(String(recipient), {}, userA._id);
    expect(JSON.stringify(timeline)).not.toMatch(/SECRET-B/);
    expect(JSON.stringify(timeline)).toMatch(/mine|favorited/);
    const sentiment = await feedbackService.getRecipientFeedbackSentiment(String(recipient), {}, userA._id);
    expect(JSON.stringify(sentiment)).not.toMatch(/SECRET-B/);
  });

  it('drops the legacy global unique tag-name index so two users can own the same tag name', async () => {
    await Tag.collection.dropIndexes().catch(() => {});
    await Tag.collection.createIndex({ name: 1 }, { unique: true, name: 'name_1' });

    await dropLegacyTagNameIndex();
    await dropLegacyTagNameIndex(); // idempotent

    const names = (await Tag.collection.indexes()).map((i) => i.name);
    expect(names).not.toContain('name_1');
    expect(names).toContain('user_1_name_1');
    expect((await request(app).post('/api/tags').set('Authorization', authA).send({ name: 'family' })).status).toBe(200);
    expect((await request(app).post('/api/tags').set('Authorization', authB).send({ name: 'family' })).status).toBe(200);
  });
});
