// SMTP passwords are kept encrypted (AES-256-GCM, ENCRYPTION_KEY) and only
// decrypted to send mail. Existing plaintext rows are encrypted at startup,
// safely if that is interrupted and re-run. A database restored on a
// server with a different key asks for the password again instead of
// failing. Real MongoDB; nodemailer is stubbed.
const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-smtp-encryption-${process.pid}`;
const KEY_A = crypto.randomBytes(32).toString('hex');
const KEY_B = crypto.randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEY = KEY_A;

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));
jest.mock('../../middleware/authMiddleware', () => {
  const { Types } = require('mongoose');
  return {
    protect: (req, res, next) => {
      req.user = { _id: new Types.ObjectId(req.headers['x-test-user']) };
      next();
    }
  };
});
jest.mock('../../middleware/rateLimitMiddleware', () => {
  const pass = new Proxy({}, { get: () => (req, res, next) => next() });
  return { authLimiters: pass, apiLimiters: pass };
});
const sent = [];
jest.mock('nodemailer', () => ({
  createTransport: jest.fn((config) => ({
    sendMail: jest.fn(async () => {
      sent.push(config.auth && config.auth.pass);
      return { messageId: 'm1', response: '250 OK' };
    })
  }))
}));

const EmailConfig = require('../../models/EmailConfig');
const User = require('../../models/User');
const { encryptStoredSmtpPasswords } = require('../../services/smtpPasswordMigration');
const { decryptSecret } = require('../../utils/secretBox');
const errorHandler = require('../../middleware/errorHandler');

jest.setTimeout(30000);

const app = express();
app.use(express.json());
app.use('/api/email-config', require('../../routes/emailConfigRoutes'));
app.use(errorHandler);

const SMTP_PASSWORD = 'app-pass-word-1234';
const newUser = async () => {
  const user = await User.collection.insertOne({ username: `u${Date.now()}${Math.random()}`, email: `${crypto.randomUUID()}@example.com`, firstName: 'S', lastName: 'M', password: 'x' });
  return String(user.insertedId);
};
const as = (req, userId) => req.set('x-test-user', userId);
const saveConfig = (userId, password = SMTP_PASSWORD) => as(request(app).post('/api/email-config'), userId)
  .send({ service: 'gmail', username: 'me@gmail.com', password });
const stored = async (userId) => EmailConfig.collection.findOne({ user: new mongoose.Types.ObjectId(userId) });

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
});
beforeEach(() => {
  process.env.ENCRYPTION_KEY = KEY_A;
  sent.length = 0;
});
afterAll(async () => {
  await teardownTestDB();
});

describe('SMTP password at rest', () => {
  it('is stored encrypted, never returned, and used decrypted to send', async () => {
    const userId = await newUser();
    expect((await saveConfig(userId)).status).toBe(201);

    const doc = await stored(userId);
    expect(doc.rawPassword).toMatch(/^enc:v1:[^:]+:[^:]+:[^:]+$/);
    expect(JSON.stringify(doc)).not.toContain(SMTP_PASSWORD);
    expect(doc.password).toBeUndefined(); // the unused bcrypt copy is gone

    const got = await as(request(app).get('/api/email-config'), userId);
    expect(got.status).toBe(200);
    expect(got.body.rawPassword).toBeUndefined();
    expect(got.body.password).toBeUndefined();
    expect(got.body.passwordNeedsReentry).toBe(false);

    const test = await as(request(app).post('/api/email-config/test'), userId);
    expect(test.status).toBe(200);
    expect(sent).toEqual([SMTP_PASSWORD]);
  });

  it('a new password replaces the old one, encrypted afresh', async () => {
    const userId = await newUser();
    await saveConfig(userId);
    const first = (await stored(userId)).rawPassword;
    await saveConfig(userId, 'another-pass-5678');
    const second = (await stored(userId)).rawPassword;

    expect(second).not.toBe(first);
    expect(decryptSecret(second)).toBe('another-pass-5678');
  });
});

describe('saving without a new password', () => {
  it('keeps the saved one (the form leaves the field blank to keep it)', async () => {
    const userId = await newUser();
    await saveConfig(userId);
    const before = (await stored(userId)).rawPassword;

    const res = await as(request(app).post('/api/email-config'), userId).send({ service: 'gmail', username: 'me@gmail.com', fromName: 'Me' });

    expect(res.status).toBe(200);
    expect((await stored(userId)).rawPassword).toBe(before);
    expect((await stored(userId)).fromName).toBe('Me');
  });

  it('still needs one for a new configuration', async () => {
    const userId = await newUser();
    const res = await as(request(app).post('/api/email-config'), userId).send({ service: 'gmail', username: 'me@gmail.com' });
    expect(res.status).toBe(400);
  });
});

describe('startup migration of plaintext passwords', () => {
  const insertLegacy = async (fields) => {
    const userId = await newUser();
    await EmailConfig.collection.insertOne({ user: new mongoose.Types.ObjectId(userId), service: 'gmail', username: 'me@gmail.com', enabled: true, ...fields });
    return userId;
  };

  it('encrypts plaintext rows, drops the bcrypt copy, and a second run changes nothing', async () => {
    const plain = await insertLegacy({ rawPassword: 'legacy-plain-1', password: '$2a$10$abcdefghijklmnopqrstuuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0' });
    const hashOnly = await insertLegacy({ password: '$2a$10$abcdefghijklmnopqrstuuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0' });

    const first = await encryptStoredSmtpPasswords();
    expect(first.encrypted).toBeGreaterThanOrEqual(1);
    const once = await stored(plain);
    expect(once.rawPassword).toMatch(/^enc:v1:/);
    expect(decryptSecret(once.rawPassword)).toBe('legacy-plain-1');
    expect(once.password).toBeUndefined();
    expect((await stored(hashOnly)).password).toBeUndefined();

    const second = await encryptStoredSmtpPasswords();
    expect(second.encrypted).toBe(0);
    expect((await stored(plain)).rawPassword).toBe(once.rawPassword);
  });

  it('finishes a run that stopped part-way, leaving rows it already did as they are', async () => {
    const done = await insertLegacy({ rawPassword: 'already-done-1' });
    await encryptStoredSmtpPasswords();
    const doneValue = (await stored(done)).rawPassword;
    const pending = await insertLegacy({ rawPassword: 'still-plain-2' });

    await encryptStoredSmtpPasswords();

    expect((await stored(done)).rawPassword).toBe(doneValue);
    expect(decryptSecret((await stored(pending)).rawPassword)).toBe('still-plain-2');
  });

  it('never needs the key for rows that are already encrypted (a restore from another server)', async () => {
    const userId = await newUser();
    await saveConfig(userId);
    const before = (await stored(userId)).rawPassword;
    process.env.ENCRYPTION_KEY = KEY_B;

    await expect(encryptStoredSmtpPasswords()).resolves.toEqual(expect.objectContaining({ encrypted: 0 }));
    expect((await stored(userId)).rawPassword).toBe(before);
  });
});

describe('a password encrypted with another key', () => {
  it('asks for the password again instead of failing', async () => {
    const userId = await newUser();
    await saveConfig(userId);
    process.env.ENCRYPTION_KEY = KEY_B;

    const test = await as(request(app).post('/api/email-config/test'), userId);
    expect(test.status).toBe(400);
    expect(test.body.message).toMatch(/re-enter your mail password/i);
    expect(sent).toEqual([]);

    const got = await as(request(app).get('/api/email-config'), userId);
    expect(got.status).toBe(200);
    expect(got.body.passwordNeedsReentry).toBe(true);

    // Re-entering it works under this server's key
    expect((await saveConfig(userId)).status).toBe(200);
    expect((await as(request(app).post('/api/email-config/test'), userId)).status).toBe(200);
  });

  it('a row that only ever had the old hashed copy asks for the password too, and records that as the last test', async () => {
    const userId = await newUser();
    await EmailConfig.collection.insertOne({
      user: new mongoose.Types.ObjectId(userId), service: 'gmail', username: 'me@gmail.com', enabled: true,
      password: '$2a$10$abcdefghijklmnopqrstuuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0'
    });

    const test = await as(request(app).post('/api/email-config/test'), userId);

    expect(test.status).toBe(400);
    expect(test.body.message).toMatch(/re-enter your mail password/i);
    const doc = await stored(userId);
    expect(doc.lastTestResult).toEqual({ success: false, message: expect.stringMatching(/re-enter your mail password/i) });
    expect(doc.lastTested).toBeInstanceOf(Date);
  });

  it('a reminder email fails cleanly too', async () => {
    const userId = await newUser();
    await saveConfig(userId);
    process.env.ENCRYPTION_KEY = KEY_B;
    const { sendEmail } = require('../../services/emailService');

    const result = await sendEmail(userId, 'friend@example.com', 'Reminder', 'text');

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/re-enter your mail password/i);
  });
});

// A borrowed session must not be able to point the saved mail password at
// a server it controls: changing where mail goes needs the password again
describe('changing the mail server or account', () => {
  const nodemailer = require('nodemailer');
  const custom = { service: 'custom', host: 'smtp.old.example.com', port: 587, secure: false, username: 'me@old.example.com' };
  const setUp = async () => {
    const userId = await newUser();
    expect((await as(request(app).post('/api/email-config'), userId).send({ ...custom, password: SMTP_PASSWORD })).status).toBe(201);
    return userId;
  };
  const testSend = async (userId) => {
    nodemailer.createTransport.mockClear();
    const res = await as(request(app).post('/api/email-config/test'), userId);
    return { res, config: nodemailer.createTransport.mock.calls[0] && nodemailer.createTransport.mock.calls[0][0] };
  };

  it.each([
    ['host', { host: 'smtp.attacker.example' }],
    ['port', { port: 2525 }],
    ['secure', { secure: true }],
    ['username', { username: 'attacker@example.com' }],
    ['service', { service: 'gmail' }]
  ])('refuses a new %s without the password, saves nothing, and the test still goes to the old server', async (_, change) => {
    const userId = await setUp();
    const before = await stored(userId);

    const res = await as(request(app).post('/api/email-config'), userId).send({ ...custom, ...change });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ field: 'password', message: expect.stringMatching(/mail password again/i) }]);
    const after = await stored(userId);
    expect(after.host).toBe(before.host);
    expect(after.username).toBe(before.username);
    expect(after.service).toBe(before.service);
    const { config } = await testSend(userId);
    expect(config.host).toBe('smtp.old.example.com');
    expect(config.auth.user).toBe('me@old.example.com');
  });

  it('accepts a new server together with the password', async () => {
    const userId = await setUp();
    const res = await as(request(app).post('/api/email-config'), userId)
      .send({ ...custom, host: 'smtp.new.example.com', password: 'new-pass-9999' });

    expect(res.status).toBe(200);
    const { config } = await testSend(userId);
    expect(config.host).toBe('smtp.new.example.com');
    expect(config.auth.pass).toBe('new-pass-9999');
  });

  it('changes only the sender name or the on/off switch without the password', async () => {
    const userId = await setUp();
    const res = await as(request(app).post('/api/email-config'), userId)
      .send({ ...custom, fromName: 'Family reminders', enabled: false });

    expect(res.status).toBe(200);
    const after = await stored(userId);
    expect(after.fromName).toBe('Family reminders');
    expect(after.enabled).toBe(false);
  });

  // secure is stored the way Mongoose casts it; the check must read it the same way
  it.each([['false', 200], [0, 200], ['0', 200], ['true', 400], [1, 400]])('reads secure %p as Mongoose would (%i without the password)', async (secure, status) => {
    const userId = await setUp(); // stored secure: false
    const res = await as(request(app).post('/api/email-config'), userId).send({ ...custom, secure, fromName: 'X' });
    expect(res.status).toBe(status);
    expect((await stored(userId)).secure).toBe(false);
  });

  it('refuses a secure value that is not a yes or no', async () => {
    const userId = await setUp();
    const res = await as(request(app).post('/api/email-config'), userId).send({ ...custom, secure: 'banana', password: 'p-1234' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/secure/i);
  });

  it('treats the same server sent back as the form sends it (port as text) as unchanged', async () => {
    const userId = await setUp();
    const res = await as(request(app).post('/api/email-config'), userId).send({ ...custom, port: '587', host: ' smtp.old.example.com ' });
    expect(res.status).toBe(200);
  });
});

