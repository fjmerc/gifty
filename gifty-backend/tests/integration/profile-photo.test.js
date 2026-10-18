// Your own profile photo through the real routes, JWT cookies, multer and
// MongoDB. Only files whose bytes are a PNG, JPEG, GIF or WebP image are
// kept: the declared type and the file name come from the client.
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gifty-profile-photo-'));
process.env.DATA_DIR = DATA_DIR;

const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const request = require('supertest');
const { teardownTestDB } = require('../utils/testSetup');
const { openSignup } = require('../utils/signupMode');
const { TEST_SETUP_CODE } = require('../utils/setupCode');


const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-profile-photo-${process.pid}`;

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));
jest.mock('../../middleware/rateLimitMiddleware', () => {
  const pass = new Proxy({}, { get: () => (req, res, next) => next() });
  return { authLimiters: pass, apiLimiters: pass };
});
jest.mock('../../services/holidayService', () => ({
  generateHolidayEvents: jest.fn().mockResolvedValue({ created: 0 }),
  updateUserHolidayEvents: jest.fn().mockResolvedValue({})
}));

const userRoutes = require('../../routes/userRoutes');
const errorHandler = require('../../middleware/errorHandler');
const User = require('../../models/User');

jest.setTimeout(30000);

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
// Smallest valid PNG (1x1)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
const NOT_AN_IMAGE = "That file isn't a PNG, JPEG, GIF or WebP image.";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/users', userRoutes);
app.use(errorHandler);

let seq = 0;
const signedIn = async () => {
  seq += 1;
  const agent = request.agent(app);
  const account = { username: `photo${seq}`, email: `photo${seq}@example.com`, password: 'Passw0rd!one', firstName: 'Pho', lastName: 'To', setupCode: TEST_SETUP_CODE };
  expect((await agent.post('/api/users/register').send(account)).status).toBe(201);
  return { agent, user: await User.findOne({ email: account.email }) };
};

const upload = (agent, buffer, filename, contentType) =>
  agent.post('/api/users/profile/picture').attach('profilePicture', buffer, { filename, contentType });

const storedFiles = () => (fs.existsSync(UPLOADS_DIR) ? fs.readdirSync(UPLOADS_DIR).sort() : []);

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
  // Several accounts sign up here without invites
  await openSignup();
});

afterAll(async () => {
  await teardownTestDB();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

describe('POST /api/users/profile/picture', () => {
  it('stores a real PNG', async () => {
    const { agent, user } = await signedIn();

    const res = await upload(agent, PNG, 'me.png', 'image/png');

    expect(res.status).toBe(200);
    const stored = (await User.findById(user._id)).profilePicture;
    expect(stored).toMatch(/^\/uploads\/[\w-]+\.png$/);
    expect(fs.existsSync(path.join(UPLOADS_DIR, path.basename(stored)))).toBe(true);
  });

  it('refuses a text file named .png, stores nothing and keeps the previous photo', async () => {
    const { agent, user } = await signedIn();
    await upload(agent, PNG, 'me.png', 'image/png');
    const previous = (await User.findById(user._id)).profilePicture;
    const before = storedFiles();

    const res = await upload(agent, Buffer.from('just some text, not a picture'), 'fake.png', 'image/png');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(NOT_AN_IMAGE);
    expect(storedFiles()).toEqual(before);
    expect((await User.findById(user._id)).profilePicture).toBe(previous);
    expect(fs.existsSync(path.join(UPLOADS_DIR, path.basename(previous)))).toBe(true);
  });

  it.each([
    ['JPEG', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]), 'me.jpg', 'image/jpeg'],
    ['GIF', Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1'), 'me.gif', 'image/gif'],
    ['WebP', Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x1a, 0, 0, 0]), Buffer.from('WEBPVP8L'), Buffer.alloc(8)]), 'me.webp', 'image/webp']
  ])('accepts a file that starts like a %s image', async (kind, buffer, filename, contentType) => {
    const { agent } = await signedIn();

    const res = await upload(agent, buffer, filename, contentType);

    expect(res.status).toBe(200);
  });
});
