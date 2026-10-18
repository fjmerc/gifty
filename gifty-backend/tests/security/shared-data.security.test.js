/**
 * Authorization tests for data shared between accounts: tags, vendors,
 * event types and the gift library. Runs against the real test MongoDB,
 * the real routers, real JWTs and the real `protect` middleware.
 */
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const mongoose = require('mongoose');
const { teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Isolated database: other suites share `gifty-test` and clear it mid-run
const MONGO_URI = `mongodb://localhost:27017/gifty-test-shared-data-${process.pid}`;

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const User = require('../../models/User');
const Tag = require('../../models/Tags');
const Vendor = require('../../models/Vendor');
const EventType = require('../../models/EventType');
const GiftLibrary = require('../../models/GiftLibrary');
const { generateToken } = require('../../utils/generateToken');
const errorHandler = require('../../middleware/errorHandler');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/tags', require('../../routes/tagRoutes'));
  app.use('/api/vendors', require('../../routes/vendorRoutes'));
  app.use('/api/eventTypes', require('../../routes/eventTypeRoutes'));
  app.use('/api/gift-library', require('../../routes/giftLibraryRoutes'));
  app.use(errorHandler);
  return app;
};

const makeUser = (suffix) => User.create({
  username: `user-${suffix}`,
  email: `${suffix}@example.com`,
  password: 'Password123!',
  firstName: 'Test',
  lastName: suffix
});

describe('Shared data authorization', () => {
  let app;
  let userA; // created first: the instance owner
  let userB;
  let authA;
  let authB;

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(MONGO_URI);
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    app = buildApp();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    await clearDatabase();
    userA = await makeUser('a');
    userB = await makeUser('b');
    // As at boot: the oldest account becomes the owner and an admin
    await require('../../services/instanceSettings').ensureInstanceSettings();
    authA = `Bearer ${generateToken(userA._id.toString())}`;
    authB = `Bearer ${generateToken(userB._id.toString())}`;
  });

  describe('Tags', () => {
    const createTag = async (auth, name) => {
      const res = await request(app).post('/api/tags').set('Authorization', auth).send({ name });
      expect(res.status).toBe(200);
      return res.body;
    };

    it("B cannot rename A's tag (404) and the tag is unchanged", async () => {
      const tag = await createTag(authA, 'family');

      const res = await request(app)
        .put(`/api/tags/${tag._id}`)
        .set('Authorization', authB)
        .send({ name: 'hijacked' });

      expect(res.status).toBe(404);
      const stored = await Tag.findById(tag._id).lean();
      expect(stored.name).toBe('family');
    });

    it("B cannot delete A's tag (404) and the tag still exists", async () => {
      const tag = await createTag(authA, 'friends');

      const res = await request(app).delete(`/api/tags/${tag._id}`).set('Authorization', authB);

      expect(res.status).toBe(404);
      expect(await Tag.exists({ _id: tag._id })).toBeTruthy();
    });

    it('legacy un-owned tags cannot be renamed or deleted via the API', async () => {
      const { insertedId } = await Tag.collection.insertOne({ name: 'legacy' });

      const put = await request(app)
        .put(`/api/tags/${insertedId}`)
        .set('Authorization', authA)
        .send({ name: 'changed' });
      const del = await request(app).delete(`/api/tags/${insertedId}`).set('Authorization', authA);

      expect(put.status).toBe(404);
      expect(del.status).toBe(404);
      const stored = await Tag.findById(insertedId).lean();
      expect(stored.name).toBe('legacy');
    });

    it('A can rename and delete their own tag', async () => {
      const tag = await createTag(authA, 'mine');

      const put = await request(app)
        .put(`/api/tags/${tag._id}`)
        .set('Authorization', authA)
        .send({ name: 'renamed' });
      expect(put.status).toBe(200);
      expect(put.body.name).toBe('renamed');

      const del = await request(app).delete(`/api/tags/${tag._id}`).set('Authorization', authA);
      expect(del.status).toBe(200);
      expect(del.body).toEqual({ message: 'Tag deleted' });
      expect(await Tag.exists({ _id: tag._id })).toBeFalsy();
    });

    it("listing shows own tags and only the legacy tags B's own recipients use", async () => {
      await createTag(authA, 'a-only');
      await createTag(authB, 'b-only');
      const { insertedId: usedByB } = await Tag.collection.insertOne({ name: 'legacy-used-by-b' });
      await Tag.collection.insertOne({ name: "legacy-someone-elses: Mom's surgery" });
      await mongoose.connection.db.collection('recipients').insertOne({ user: userB._id, firstName: 'R', tags: [usedByB] });

      const res = await request(app).get('/api/tags').set('Authorization', authB);

      expect(res.status).toBe(200);
      const names = res.body.map((t) => t.name).sort();
      // un-owned legacy tags were created by real users; their names must not leak to everyone
      expect(names).toEqual(['b-only', 'legacy-used-by-b']);
    });

    it('two users can each own a tag with the same name', async () => {
      const a = await createTag(authA, 'same');
      const b = await createTag(authB, 'same');

      expect(String(a._id)).not.toBe(String(b._id));
      expect(String(b.user)).toBe(String(userB._id));
    });
  });

  describe('Vendors', () => {
    const createVendor = async (auth, vendorName) => {
      const res = await request(app)
        .post('/api/vendors')
        .set('Authorization', auth)
        .send({ vendorName, vendorDetails: 'details' });
      expect(res.status).toBe(201);
      return res.body;
    };

    it("B cannot update A's vendor (404) and the vendor is unchanged", async () => {
      const vendor = await createVendor(authA, 'A Store');

      const res = await request(app)
        .put(`/api/vendors/${vendor._id}`)
        .set('Authorization', authB)
        .send({ vendorName: 'hijacked' });

      expect(res.status).toBe(404);
      const stored = await Vendor.findById(vendor._id).lean();
      expect(stored.vendorName).toBe('A Store');
    });

    it("B cannot delete A's vendor (404) and the vendor still exists", async () => {
      const vendor = await createVendor(authA, 'A Store');

      const res = await request(app).delete(`/api/vendors/${vendor._id}`).set('Authorization', authB);

      expect(res.status).toBe(404);
      expect(await Vendor.exists({ _id: vendor._id })).toBeTruthy();
    });

    it('legacy un-owned vendors cannot be modified via the API', async () => {
      const { insertedId } = await Vendor.collection.insertOne({
        vendorName: 'Legacy', vendorDetails: 'old'
      });

      const put = await request(app)
        .put(`/api/vendors/${insertedId}`)
        .set('Authorization', authA)
        .send({ vendorName: 'changed' });
      const del = await request(app).delete(`/api/vendors/${insertedId}`).set('Authorization', authA);

      expect(put.status).toBe(404);
      expect(del.status).toBe(404);
      expect((await Vendor.findById(insertedId).lean()).vendorName).toBe('Legacy');
    });

    it('A can update and delete their own vendor', async () => {
      const vendor = await createVendor(authA, 'Mine');

      const put = await request(app)
        .put(`/api/vendors/${vendor._id}`)
        .set('Authorization', authA)
        .send({ vendorName: 'Renamed' });
      expect(put.status).toBe(200);
      expect(put.body.vendorName).toBe('Renamed');

      const del = await request(app).delete(`/api/vendors/${vendor._id}`).set('Authorization', authA);
      expect(del.status).toBe(204);
      expect(await Vendor.exists({ _id: vendor._id })).toBeFalsy();
    });

    // Un-owned legacy vendors are handed to the instance owner at upgrade
    // (services/legacyOwnership.js); the list never shows them to others
    it('listing shows only the caller\'s own vendors', async () => {
      await createVendor(authA, 'A Store');
      await createVendor(authB, 'B Store');
      await Vendor.collection.insertOne({ vendorName: 'Legacy', vendorDetails: 'old' });

      const res = await request(app).get('/api/vendors').set('Authorization', authB);

      expect(res.status).toBe(200);
      expect(res.body.map((v) => v.vendorName)).toEqual(['B Store']);
    });
  });

  describe('Event types', () => {
    it("GET does not include another user's custom event type", async () => {
      await EventType.create({ name: 'Birthday', isCustom: false });
      await EventType.create({ name: 'A Custom', isCustom: true, createdBy: userA._id });
      await EventType.create({ name: 'B Custom', isCustom: true, createdBy: userB._id });

      const res = await request(app).get('/api/eventTypes').set('Authorization', authB);

      expect(res.status).toBe(200);
      expect(res.body.map((t) => t.name).sort()).toEqual(['B Custom', 'Birthday']);
    });

    it("GET ?isCustom=true does not include another user's custom event type", async () => {
      await EventType.create({ name: 'A Custom', isCustom: true, createdBy: userA._id });
      await EventType.create({ name: 'B Custom', isCustom: true, createdBy: userB._id });

      const res = await request(app).get('/api/eventTypes?isCustom=true').set('Authorization', authB);

      expect(res.status).toBe(200);
      expect(res.body.map((t) => t.name)).toEqual(['B Custom']);
    });

    it("B cannot update or delete A's custom event type (404)", async () => {
      const type = await EventType.create({ name: 'A Custom', isCustom: true, createdBy: userA._id });

      const put = await request(app)
        .put(`/api/eventTypes/${type._id}`)
        .set('Authorization', authB)
        .send({ name: 'hijacked' });
      const del = await request(app).delete(`/api/eventTypes/${type._id}`).set('Authorization', authB);

      expect(put.status).toBe(404);
      expect(del.status).toBe(404);
      expect((await EventType.findById(type._id).lean()).name).toBe('A Custom');
    });

    it('a user cannot create a system (shared) event type via the API', async () => {
      const res = await request(app)
        .post('/api/eventTypes')
        .set('Authorization', authB)
        .send({ name: 'Sneaky', isCustom: false });

      expect(res.status).toBe(201);
      const stored = await EventType.findOne({ name: 'Sneaky' }).lean();
      expect(stored.isCustom).toBe(true);
      expect(String(stored.createdBy)).toBe(String(userB._id));

      const asA = await request(app).get('/api/eventTypes').set('Authorization', authA);
      expect(asA.body.map((t) => t.name)).not.toContain('Sneaky');
    });
  });

  describe('Gift library delete', () => {
    const makeGift = () => GiftLibrary.create({ name: 'Shared Gift', description: 'everyone sees this' });

    it('a non-owner DELETE is rejected with 403 and the item still exists', async () => {
      const gift = await makeGift();

      const res = await request(app)
        .delete(`/api/gift-library/gifts/${gift._id}`)
        .set('Authorization', authB);

      expect(res.status).toBe(403);
      expect(await GiftLibrary.exists({ _id: gift._id })).toBeTruthy();
    });

    it('the instance owner can delete a library item', async () => {
      const gift = await makeGift();

      const res = await request(app)
        .delete(`/api/gift-library/gifts/${gift._id}`)
        .set('Authorization', authA);

      expect(res.status).toBe(200);
      expect(await GiftLibrary.exists({ _id: gift._id })).toBeFalsy();
    });
  });

  // The library is shared; each account's reactions to it are not
  describe('Gift library reads and feedback', () => {
    const libraryGift = (extra = {}) => GiftLibrary.create({
      name: 'Shared Gift', description: 'everyone sees this', status: 'active', popularityScore: 10, ...extra
    });

    it("explore and trending never return other accounts' feedback", async () => {
      await libraryGift({ reactions: [{ user: new mongoose.Types.ObjectId(), action: 'liked' }], description: 'SecretNote? no: shown' });
      await GiftLibrary.collection.updateOne({}, { $set: { feedbackHistory: [{ feedback: 'SecretNote' }] } });

      const explore = await request(app).get('/api/gift-library/explore').set('Authorization', authA);
      const trending = await request(app).get('/api/gift-library/trending').set('Authorization', authA);

      expect(explore.status).toBe(200);
      expect(explore.body.gifts).toHaveLength(1);
      expect(trending.body.trendingGifts).toHaveLength(1);
      const body = JSON.stringify(explore.body) + JSON.stringify(trending.body);
      expect(body).not.toMatch(/feedbackHistory|reactions/);
    });

    it("one account's repeated feedback counts once, and the answer carries no one's history", async () => {
      const gift = await libraryGift();
      const send = (action) => request(app).post('/api/gift-library/feedback')
        .set('Authorization', authA).send({ giftId: String(gift._id), action });

      await send('liked');
      await send('liked');
      const last = await send('liked');

      expect(last.status).toBe(200);
      expect(JSON.stringify(last.body)).not.toMatch(/feedbackHistory/);
      expect((await GiftLibrary.findById(gift._id).lean()).popularityScore).toBe(12);
    });

    it('simultaneous reactions from one account still count once', async () => {
      const gift = await libraryGift();
      await Promise.all(Array.from({ length: 6 }, () => request(app).post('/api/gift-library/feedback')
        .set('Authorization', authA).send({ giftId: String(gift._id), action: 'liked' })));

      const stored = await GiftLibrary.findById(gift._id).select('+reactions').lean();
      expect(stored.reactions).toHaveLength(1);
      expect(stored.popularityScore).toBe(12);
    });

    it("a changed reaction replaces the account's earlier one", async () => {
      const gift = await libraryGift();
      const send = (action) => request(app).post('/api/gift-library/feedback')
        .set('Authorization', authA).send({ giftId: String(gift._id), action });

      await send('purchased');
      await send('liked');

      const stored = await GiftLibrary.findById(gift._id).select('+reactions').lean();
      expect(stored.popularityScore).toBe(12);
      expect(stored.reactions).toHaveLength(1);
    });

    it('explore refuses an unbounded page size', async () => {
      const res = await request(app).get('/api/gift-library/explore?limit=100000').set('Authorization', authA);
      expect(res.status).toBe(400);
      const neg = await request(app).get('/api/gift-library/explore?page=-1').set('Authorization', authA);
      expect(neg.status).toBe(400);
    });
  });
});
