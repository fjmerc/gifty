// Recipient photo upload through the real router, multer and MongoDB: the
// file must land in the data volume's uploads directory (the one /uploads
// serves), whatever the working directory is. Only auth is stubbed.
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gifty-photo-'));
process.env.DATA_DIR = DATA_DIR;

const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-recipient-photo-${process.pid}`;

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
// Rate limits have their own tests; this suite uploads more than an hour's budget
jest.mock('../../middleware/rateLimitMiddleware', () => {
  const pass = new Proxy({}, { get: () => (req, res, next) => next() });
  return { authLimiters: pass, apiLimiters: pass };
});
jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const recipientRoutes = require('../../routes/recipientRoutes');
const errorHandler = require('../../middleware/errorHandler');
const Recipient = require('../../models/Recipient');
require('../../models/Tags');

jest.setTimeout(30000);

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
// Smallest valid PNG (1x1)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

const app = express();
app.use(express.json());
app.use('/api/recipients', recipientRoutes);
app.use(errorHandler);

const userId = new mongoose.Types.ObjectId();
const asUser = (req, id = userId) => req.set('x-test-user', String(id));

const insertRecipient = async (extra = {}) => {
  const doc = {
    _id: new mongoose.Types.ObjectId(), user: userId, firstName: 'Ann', lastName: 'Lee',
    relation: 'friend', relationship: 'friendship', birthdate: new Date('1990-01-01'), tags: [], ...extra
  };
  await Recipient.collection.insertOne(doc);
  return doc;
};

const upload = (id, buffer, filename, contentType) => asUser(
  request(app).post(`/api/recipients/${id}/upload-profile-picture`)
).attach('profilePicture', buffer, { filename, contentType });

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
});

afterAll(async () => {
  await teardownTestDB();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

afterEach(async () => {
  await Recipient.deleteMany({});
});

describe('POST /api/recipients/:id/upload-profile-picture', () => {
  it('stores the photo in the data volume and serves it at /uploads/<file>', async () => {
    const recipient = await insertRecipient();

    const res = await upload(recipient._id, PNG, 'me.png', 'image/png');

    expect(res.status).toBe(200);
    const stored = (await Recipient.findById(recipient._id)).profilePicture;
    expect(stored).toMatch(/^\/uploads\/[\w-]+\.png$/);
    expect(fs.existsSync(path.join(UPLOADS_DIR, path.basename(stored)))).toBe(true);
  });

  it('never uses the uploaded file name on disk', async () => {
    const recipient = await insertRecipient();

    const res = await upload(recipient._id, PNG, '../../evil name.png', 'image/png');

    expect(res.status).toBe(200);
    const stored = (await Recipient.findById(recipient._id)).profilePicture;
    expect(stored).not.toMatch(/evil/);
  });

  it('removes the previous photo when a new one replaces it', async () => {
    const recipient = await insertRecipient();
    await upload(recipient._id, PNG, 'one.png', 'image/png');
    const first = (await Recipient.findById(recipient._id)).profilePicture;

    await upload(recipient._id, PNG, 'two.png', 'image/png');

    const second = (await Recipient.findById(recipient._id)).profilePicture;
    expect(second).not.toBe(first);
    expect(fs.existsSync(path.join(UPLOADS_DIR, path.basename(first)))).toBe(false);
    expect(fs.existsSync(path.join(UPLOADS_DIR, path.basename(second)))).toBe(true);
  });

  it('keeps a replaced photo that another recipient still points at', async () => {
    const recipient = await insertRecipient();
    await upload(recipient._id, PNG, 'one.png', 'image/png');
    const shared = (await Recipient.findById(recipient._id)).profilePicture;
    // e.g. a restored backup that carried someone else's photo path
    await insertRecipient({ user: new mongoose.Types.ObjectId(), profilePicture: shared });

    await upload(recipient._id, PNG, 'two.png', 'image/png');

    expect(fs.existsSync(path.join(UPLOADS_DIR, path.basename(shared)))).toBe(true);
  });

  it('never deletes a file whose name the server did not generate', async () => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOADS_DIR, 'keep.png'), PNG);
    const recipient = await insertRecipient({ profilePicture: '/uploads/keep.png' });

    await upload(recipient._id, PNG, 'two.png', 'image/png');

    expect(fs.existsSync(path.join(UPLOADS_DIR, 'keep.png'))).toBe(true);
  });

  it('rejects a file that is not an image with 400', async () => {
    const recipient = await insertRecipient();

    const res = await upload(recipient._id, Buffer.from('hello'), 'notes.txt', 'text/plain');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/JPG, PNG, GIF, or WebP/);
    expect((await Recipient.findById(recipient._id)).profilePicture).toBeFalsy();
  });

  it('refuses a text file named .png, stores nothing and keeps the previous photo', async () => {
    const recipient = await insertRecipient();
    await upload(recipient._id, PNG, 'one.png', 'image/png');
    const previous = (await Recipient.findById(recipient._id)).profilePicture;
    const before = fs.readdirSync(UPLOADS_DIR).sort();

    const res = await upload(recipient._id, Buffer.from('just some text, not a picture'), 'fake.png', 'image/png');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("That file isn't a PNG, JPEG, GIF or WebP image.");
    expect(fs.readdirSync(UPLOADS_DIR).sort()).toEqual(before);
    expect((await Recipient.findById(recipient._id)).profilePicture).toBe(previous);
    expect(fs.existsSync(path.join(UPLOADS_DIR, path.basename(previous)))).toBe(true);
  });

  it("returns 404 for another user's recipient and keeps no file", async () => {
    const recipient = await insertRecipient({ user: new mongoose.Types.ObjectId() });
    const before = fs.existsSync(UPLOADS_DIR) ? fs.readdirSync(UPLOADS_DIR).length : 0;

    const res = await upload(recipient._id, PNG, 'me.png', 'image/png');

    expect(res.status).toBe(404);
    expect(fs.readdirSync(UPLOADS_DIR).length).toBe(before);
  });
});
