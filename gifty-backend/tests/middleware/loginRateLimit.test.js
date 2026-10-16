// A household often shares one IP. Logging in successfully must not use up
// the 5 attempts the login limit allows per 15 minutes; failed ones do.
const express = require('express');
const request = require('supertest');

jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const { authLimiters } = require('../../middleware/rateLimitMiddleware');

const app = express();
app.use(express.json());
app.post('/login', authLimiters.login, (req, res) => (req.body.ok
  ? res.json({ ok: true })
  : res.status(401).json({ message: 'Invalid email or password' })));

describe('login rate limit', () => {
  it('does not count successful logins', async () => {
    for (let i = 0; i < 8; i += 1) {
      const res = await request(app).post('/login').send({ ok: true });
      expect(res.status).toBe(200);
    }
  });

  it('stops a sixth failed attempt', async () => {
    const statuses = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await request(app).post('/login').send({ ok: false })).status);
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });
});
