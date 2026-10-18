const express = require('express');
const request = require('supertest');

// Who may read /detailed is tested with real auth in tests/security/health.security.test.js
jest.mock('../../middleware/authMiddleware', () => ({ protect: (req, res, next) => next() }));
jest.mock('../../middleware/roleMiddleware', () => ({ requireAdmin: (req, res, next) => next(), requireOwner: (req, res, next) => next() }));
jest.mock('../../config/redis', () => ({ redisClient: { ping: jest.fn() } }));
jest.mock('../../queues', () => ({ cleanupQueue: {} }));
jest.mock('mongoose', () => ({ connection: { readyState: 1 } }));

const { redisClient } = require('../../config/redis');

const app = () => {
  const a = express();
  a.use('/api/health', require('../../routes/healthRoutes'));
  return a;
};

describe('GET /api/health', () => {
  it('reports ok with version when mongo and redis are up', async () => {
    redisClient.ping.mockResolvedValue('PONG');
    const res = await request(app()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', mongo: 'up', redis: 'up' });
    expect(typeof res.body.version).toBe('string');
  });

  it('returns 503 when redis is down', async () => {
    redisClient.ping.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await request(app()).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', redis: 'down' });
  });
});
