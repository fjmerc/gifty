// A custom SMTP server must not be a way to probe the server's network:
// only mail ports, one answer for every connection failure from the test
// endpoint, and (owner option) no private, loopback or compose-service
// addresses. Real MongoDB; nodemailer and DNS are stubbed.
const crypto = require('crypto');
const dns = require('dns');
const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-smtp-destination-${process.pid}`;

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
let mockSendFailure = null;
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn(async () => {
      if (mockSendFailure) throw mockSendFailure;
      return { messageId: 'm1', response: '250 OK' };
    })
  }))
}));

const nodemailer = require('nodemailer');
const EmailConfig = require('../../models/EmailConfig');
const User = require('../../models/User');
const { apiLimiters } = require('../../middleware/rateLimitMiddleware');
const { encryptSecret } = require('../../utils/secretBox');
const errorHandler = require('../../middleware/errorHandler');

jest.setTimeout(30000);

const app = express();
app.use(express.json());
app.use('/api/email-config', require('../../routes/emailConfigRoutes'));
app.use(errorHandler);

const newUser = async () => String((await User.collection.insertOne({
  username: crypto.randomUUID(), email: `${crypto.randomUUID()}@example.com`, firstName: 'S', lastName: 'M', password: 'x'
})).insertedId);
const as = (req, userId) => req.set('x-test-user', userId);
const custom = (extra = {}) => ({ service: 'custom', host: 'smtp.example.com', port: 587, secure: false, username: 'me@example.com', password: 'smtp-pass-1', ...extra });
const save = (userId, body) => as(request(app).post('/api/email-config'), userId).send(body);
const runTest = (userId) => as(request(app).post('/api/email-config/test'), userId);
const smtpError = (code, message) => Object.assign(new Error(message), { code });

let lookup;
beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
});
beforeEach(() => {
  mockSendFailure = null;
  nodemailer.createTransport.mockClear();
  delete process.env.SMTP_BLOCK_PRIVATE_HOSTS;
  lookup = jest.spyOn(dns.promises, 'lookup').mockResolvedValue([{ address: '203.0.113.25', family: 4 }]);
});
afterEach(() => lookup.mockRestore());
afterAll(async () => {
  await teardownTestDB();
});

describe('SMTP ports', () => {
  it.each([25, 465, 587, 2525])('accepts mail port %i', async (port) => {
    expect((await save(await newUser(), custom({ port }))).status).toBe(201);
  });

  it.each([22, 80, 3306, 6379, 27017])('refuses port %i for a custom server', async (port) => {
    const userId = await newUser();
    const res = await save(userId, custom({ port }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/25, 465, 587 or 2525/);
    expect(await EmailConfig.countDocuments({ user: userId })).toBe(0);
  });

  it('never connects to another port saved before this rule', async () => {
    const userId = await newUser();
    await EmailConfig.collection.insertOne({
      user: new mongoose.Types.ObjectId(userId), service: 'custom', host: 'redis', port: 6379, secure: false,
      username: 'me@example.com', rawPassword: encryptSecret('p'), enabled: true
    });

    const res = await runTest(userId);

    expect(res.status).toBe(400);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
});

describe('the test endpoint', () => {
  it('is rate limited as an expensive operation', () => {
    const router = require('../../routes/emailConfigRoutes');
    const layer = router.stack.find((l) => l.route && l.route.path === '/test');
    expect(layer.route.stack.map((s) => s.handle)).toContain(apiLimiters.smtpTest);
  });

  it('gives one answer for every kind of connection failure', async () => {
    const userId = await newUser();
    await save(userId, custom());
    const answers = [];
    for (const failure of [
      smtpError('ECONNECTION', 'connect ECONNREFUSED 10.0.0.5:587'),
      smtpError('ETIMEDOUT', 'Connection timeout'),
      smtpError('ESOCKET', 'read ECONNRESET'),
      smtpError('EDNS', 'getaddrinfo ENOTFOUND smtp.example.com'),
      smtpError('EPROTOCOL', 'Invalid greeting. response=+OK redis')
    ]) {
      mockSendFailure = failure;
      const res = await runTest(userId);
      expect(res.status).toBe(400);
      answers.push(res.body.message);
    }
    expect(new Set(answers).size).toBe(1);
    expect(answers[0]).not.toMatch(/ECONN|timeout|refused|10\.0\.0\.5|redis/i);
  });

  it('still says when the server rejected the username or password', async () => {
    const userId = await newUser();
    await save(userId, custom());
    mockSendFailure = smtpError('EAUTH', 'Invalid login: 535 Authentication failed');
    const res = await runTest(userId);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/authentication failed/i);
  });
});

describe('SMTP_BLOCK_PRIVATE_HOSTS=true (owner option)', () => {
  beforeEach(() => { process.env.SMTP_BLOCK_PRIVATE_HOSTS = 'true'; });

  it.each([
    ['a compose service name', 'mongo', null],
    ['localhost', 'localhost', [{ address: '127.0.0.1', family: 4 }]],
    ['a LAN address', '192.168.1.20', null],
    ['a name that resolves to a private address', 'mail.internal.example', [{ address: '10.1.2.3', family: 4 }]],
    ['a name with one private address among public ones', 'mixed.example', [{ address: '203.0.113.9', family: 4 }, { address: '172.18.0.4', family: 4 }]],
    ['IPv6 loopback', '::1', null],
    ['an IPv6 unique-local address', 'fd00::25', null],
    ['an IPv4-mapped private address', '::ffff:10.0.0.1', null]
  ])('refuses %s', async (_, host, addresses) => {
    if (addresses) lookup.mockResolvedValue(addresses);
    const res = await save(await newUser(), custom({ host }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not allowed on this server/i);
  });

  it('accepts a public server and connects to the address it checked', async () => {
    const userId = await newUser();
    expect((await save(userId, custom({ host: 'smtp.example.com' }))).status).toBe(201);

    expect((await runTest(userId)).status).toBe(200);
    const config = nodemailer.createTransport.mock.calls[0][0];
    expect(config.host).toBe('203.0.113.25');
    expect(config.tls.servername).toBe('smtp.example.com');
  });

  it('checks again when sending: a name that now resolves privately is refused', async () => {
    const userId = await newUser();
    await save(userId, custom({ host: 'smtp.example.com' }));
    lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    const res = await runTest(userId);

    expect(res.status).toBe(400);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
});

describe('without the option (the default)', () => {
  it('allows a compose service or LAN server, for self-hosted mail relays', async () => {
    expect((await save(await newUser(), custom({ host: 'mailrelay' }))).status).toBe(201);
    expect((await save(await newUser(), custom({ host: '192.168.1.20' }))).status).toBe(201);
  });
});

// Port 587 upgrades with STARTTLS; without requireTLS a server (or anyone in
// between) that offers no STARTTLS would get the password in clear text
describe('Require encryption (STARTTLS)', () => {
  const transportConfig = () => nodemailer.createTransport.mock.calls[0][0];
  const setUp = async (extra = {}) => {
    const userId = await newUser();
    expect((await save(userId, custom(extra))).status).toBe(201);
    return userId;
  };

  it('is on by default for port 587 and passed to the transport; TLS is never ignored', async () => {
    const userId = await setUp({ port: 587 });
    expect((await EmailConfig.findOne({ user: userId }).lean()).requireTLS).toBe(true);
    expect((await runTest(userId)).status).toBe(200);
    expect(transportConfig().requireTLS).toBe(true);
    expect(transportConfig().ignoreTLS).toBeUndefined();
  });

  it.each([25, 2525])('is off by default for port %i (local relays)', async (port) => {
    const userId = await setUp({ port });
    expect((await EmailConfig.findOne({ user: userId }).lean()).requireTLS).toBe(false);
    await runTest(userId);
    expect(transportConfig().requireTLS).toBeFalsy();
    expect(transportConfig().ignoreTLS).toBeUndefined();
  });

  it('a row saved before this setting counts as on for 587', async () => {
    const userId = await newUser();
    await EmailConfig.collection.insertOne({
      user: new mongoose.Types.ObjectId(userId), service: 'custom', host: 'smtp.example.com', port: 587, secure: false,
      username: 'me@example.com', rawPassword: encryptSecret('p'), enabled: true
    });
    await runTest(userId);
    expect(transportConfig().requireTLS).toBe(true);
  });

  it('turning it off needs the mail password, like changing the server', async () => {
    const userId = await setUp({ port: 587 });
    const { password, ...withoutPassword } = custom({ port: 587 });

    const refused = await save(userId, { ...withoutPassword, requireTLS: false });
    expect(refused.status).toBe(400);
    expect(refused.body.errors[0].field).toBe('password');
    expect((await EmailConfig.findOne({ user: userId }).lean()).requireTLS).toBe(true);

    expect((await save(userId, { ...withoutPassword, requireTLS: false, password: 'smtp-pass-2' })).status).toBe(200);
    expect((await EmailConfig.findOne({ user: userId }).lean()).requireTLS).toBe(false);
  });

  it('turning it on needs no password', async () => {
    const userId = await setUp({ port: 2525 });
    const { password, ...withoutPassword } = custom({ port: 2525 });
    expect((await save(userId, { ...withoutPassword, requireTLS: true })).status).toBe(200);
    expect((await EmailConfig.findOne({ user: userId }).lean()).requireTLS).toBe(true);
  });
});
