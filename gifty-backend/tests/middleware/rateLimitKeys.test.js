// Who a rate limit counts: AI limits per account, failed logins per IP and
// per email, IPv6 clients per /64, and successful sign-ups not at all.
const express = require('express');
const request = require('supertest');

jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const logger = require('../../utils/logger');
const { authLimiters, createLimiter, keyByUser, warnIfProxyHeadersIgnored, resetProxyWarning } = require('../../middleware/rateLimitMiddleware');

describe('createLimiter', () => {
  it('uses the keyGenerator it is given (AI limits count each account, not the shared address)', async () => {
    const limiter = createLimiter({ max: 1, keyGenerator: keyByUser });
    const app = express();
    app.use((req, res, next) => { req.user = { _id: req.headers['x-user'] }; next(); });
    app.post('/ai', limiter, (req, res) => res.json({ ok: true }));

    expect((await request(app).post('/ai').set('x-user', 'a')).status).toBe(200);
    expect((await request(app).post('/ai').set('x-user', 'a')).status).toBe(429);
    // Same address, other account: its own budget
    expect((await request(app).post('/ai').set('x-user', 'b')).status).toBe(200);
  });

  it('counts IPv6 clients per /64 network', async () => {
    const limiter = createLimiter({ max: 2 });
    const app = express();
    app.set('trust proxy', true);
    app.get('/x', limiter, (req, res) => res.json({ ok: true }));
    const from = (ip) => request(app).get('/x').set('X-Forwarded-For', ip);

    expect((await from('2001:db8:1:2::1')).status).toBe(200);
    expect((await from('2001:db8:1:2::2')).status).toBe(200);
    expect((await from('2001:db8:1:2:ffff::9')).status).toBe(429);
    expect((await from('2001:db8:1:3::1')).status).toBe(200);
  });
});

describe('failed logins per email', () => {
  const app = express();
  app.use(express.json());
  app.post('/login', authLimiters.loginPerEmail, (req, res) => (req.body.ok
    ? res.json({ ok: true })
    : res.status(401).json({ message: 'Invalid email or password' })));

  // (Spelling variants are normalised by the route's validation first; see below)
  it('stops the eleventh failed attempt for one email within 15 minutes', async () => {
    const statuses = [];
    for (let i = 0; i < 11; i += 1) {
      const email = 'victim@example.com';
      statuses.push((await request(app).post('/login').send({ email, ok: false })).status);
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(statuses[10]).toBe(429);
    // Another account is not affected
    expect((await request(app).post('/login').send({ email: 'other@example.com', ok: false })).status).toBe(401);
  });

  it('does not count successful logins', async () => {
    for (let i = 0; i < 12; i += 1) {
      expect((await request(app).post('/login').send({ email: 'happy@example.com', ok: true })).status).toBe(200);
    }
  });

  it('is mounted on the login route after the per-IP limit', () => {
    const router = require('../../routes/userRoutes');
    const layer = router.stack.find((l) => l.route && l.route.path === '/login');
    const handles = layer.route.stack.map((s) => s.handle);
    expect(handles.indexOf(authLimiters.login)).toBeGreaterThanOrEqual(0);
    expect(handles.indexOf(authLimiters.loginPerEmail)).toBeGreaterThan(handles.indexOf(authLimiters.login));
  });
});

// One address can't fill memory with counters for made-up emails: the
// per-IP limit stops it first, before an email counter is created
describe('login limits in route order', () => {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  const router = require('../../routes/userRoutes');
  const layer = router.stack.find((l) => l.route && l.route.path === '/login');
  const limiters = layer.route.stack.map((s) => s.handle)
    .filter((h) => h === authLimiters.login || h === authLimiters.loginPerEmail);
  app.post('/login', ...limiters, (req, res) => res.status(401).json({ message: 'Invalid email or password' }));

  it('refuses requests over the per-IP limit before they create email counters', async () => {
    const from = (email) => request(app).post('/login').set('X-Forwarded-For', '198.51.100.7').send({ email, password: 'x' });
    for (let i = 0; i < 5; i += 1) expect((await from(`random${i}@example.com`)).status).toBe(401);

    expect((await from('random-new@example.com')).status).toBe(429);
    const keys = (await Promise.all([
      authLimiters.loginPerEmail.getKey('email:random-new@example.com|net:198.51.100.0/24')
    ])).filter(Boolean);
    expect(keys).toEqual([]);
  });
});

describe('registration limit', () => {
  it('does not count successful sign-ups (a household registering together)', async () => {
    const app = express();
    app.post('/register', authLimiters.register, (req, res) => res.status(201).json({ ok: true }));
    for (let i = 0; i < 6; i += 1) expect((await request(app).post('/register')).status).toBe(201);
  });
});

describe('X-Forwarded-For without TRUST_PROXY', () => {
  const app = express();
  app.use(warnIfProxyHeadersIgnored);
  app.get('/x', (req, res) => res.json({ ok: true }));
  const saved = process.env.TRUST_PROXY;
  beforeEach(() => { resetProxyWarning(); logger.warn.mockClear(); });
  afterAll(() => { process.env.TRUST_PROXY = saved; });

  it('warns once that every client looks like the proxy', async () => {
    delete process.env.TRUST_PROXY;
    await request(app).get('/x').set('X-Forwarded-For', '203.0.113.9');
    await request(app).get('/x').set('X-Forwarded-For', '203.0.113.10');

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toMatch(/TRUST_PROXY/);
  });

  it('stays quiet without the header, or when TRUST_PROXY is set', async () => {
    delete process.env.TRUST_PROXY;
    await request(app).get('/x');
    process.env.TRUST_PROXY = '172.18.0.0/16';
    await request(app).get('/x').set('X-Forwarded-For', '203.0.113.9');

    expect(logger.warn).not.toHaveBeenCalled();
  });
});

// The per-email count must use exactly the email the login looks up, so
// spelling variants of one account share one counter
describe('per-email login counter and email spelling', () => {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  const router = require('../../routes/userRoutes');
  const layer = router.stack.find((l) => l.route && l.route.path === '/login');
  // The route as mounted, without the per-IP limit (tested above) and with
  // the controller replaced by a failed login
  const handles = layer.route.stack.map((s) => s.handle);
  const chain = handles.slice(0, -1).filter((h) => h !== authLimiters.login);
  app.post('/login', ...chain, (req, res) => res.status(401).json({ message: 'Invalid email or password' }));

  it('counts case, whitespace and Gmail-dot variants of one address together', async () => {
    const variants = ['Spelled.Out@Gmail.com ', ' spelledout@gmail.com', 'SPELLED.OUT@GMAIL.COM', 's.p.e.l.l.e.d.out@gmail.com', 'spelledout@googlemail.com'];
    const statuses = [];
    for (let i = 0; i < 11; i += 1) {
      statuses.push((await request(app).post('/login').set('X-Forwarded-For', '192.0.2.50')
        .send({ email: variants[i % variants.length], password: 'Wrong-pass1' })).status);
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(statuses[10]).toBe(429);
  });
});

// Someone who knows a member's email must not be able to lock them out:
// failures count per email and source network; only a high account-wide
// backstop counts across networks
describe('per-email login counter and the source network', () => {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  const router = require('../../routes/userRoutes');
  const layer = router.stack.find((l) => l.route && l.route.path === '/login');
  const chain = layer.route.stack.map((s) => s.handle).slice(0, -1).filter((h) => h !== authLimiters.login);
  app.post('/login', ...chain, (req, res) => {
    if (req.body.password === 'Right-pass1') return res.json({ ok: true });
    // As loginUser does for an existing account
    res.locals.loginAccountId = `id-of-${req.body.email}`;
    return res.status(401).json({ message: 'Invalid email or password' });
  });
  const login = (ip, email, password) => request(app).post('/login').set('X-Forwarded-For', ip).send({ email, password });

  it('blocks the guessing network for that email, not the owner on another network', async () => {
    for (let i = 0; i < 10; i += 1) expect((await login('203.0.113.5', 'member@example.com', 'Wrong-pass1')).status).toBe(401);

    expect((await login('203.0.113.77', 'member@example.com', 'Right-pass1')).status).toBe(429); // same /24
    expect((await login('198.51.100.9', 'member@example.com', 'Right-pass1')).status).toBe(200);
  });

  // No account-wide block (strangers could trigger it); many failures are logged
  it('does not block an account failing from many networks, but warns once in the log', async () => {
    logger.warn.mockClear();
    for (let i = 0; i < 101; i += 1) {
      expect((await login(`10.${Math.floor(i / 9)}.${i % 9}.1`, 'target@example.com', 'Wrong-pass1')).status).toBe(401);
    }
    expect((await login('172.16.200.1', 'target@example.com', 'Right-pass1')).status).toBe(200);

    const warnings = logger.warn.mock.calls.map((c) => String(c[0])).filter((m) => /failed logins/.test(m));
    expect(warnings).toEqual(['account id-of-target@example.com: 100 failed logins in the last hour from 100 networks']);
  });

  it('has no account-wide limiter on the login route any more', () => {
    expect(authLimiters.loginAccountBackstop).toBeUndefined();
  });
});

// Uploads and SMTP tests are expensive: limited per account, each route
// with its own budget so one doesn't use up another
describe('expensive operations', () => {
  const { apiLimiters } = require('../../middleware/rateLimitMiddleware');
  const handlesOf = (router, path, method) => router.stack
    .find((l) => l.route && l.route.path === path && l.route.methods[method]).route.stack.map((s) => s.handle);

  it('limits recipient photo uploads, after sign-in and before the file is read', () => {
    const handles = handlesOf(require('../../routes/recipientRoutes'), '/:id/upload-profile-picture', 'post');
    expect(handles[1]).toBe(apiLimiters.recipientPhoto);
  });

  it('counts each account on its own: the eleventh upload in an hour is refused, another account carries on', async () => {
    const app = express();
    app.use((req, res, next) => { req.user = { _id: req.headers['x-user'] }; next(); });
    app.post('/upload', apiLimiters.recipientPhoto, (req, res) => res.json({ ok: true }));
    for (let i = 0; i < 10; i += 1) expect((await request(app).post('/upload').set('x-user', 'mum')).status).toBe(200);
    expect((await request(app).post('/upload').set('x-user', 'mum')).status).toBe(429);
    expect((await request(app).post('/upload').set('x-user', 'dad')).status).toBe(200);
  });
});
