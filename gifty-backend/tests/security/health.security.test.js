// The detailed health check shows server internals (memory, Redis, process,
// queues): only the instance owner may read it. The compact /api/health the
// Docker healthcheck uses stays public. Real auth and MongoDB.
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const mongoose = require('mongoose');

jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const User = require('../../models/User');
const { generateToken } = require('../../utils/generateToken');
const { redisClient, publisherClient, subscriberClient } = require('../../config/redis');
const queues = require('../../queues');

const MONGO_URI = `mongodb://localhost:27017/gifty-test-health-sec-${process.pid}`;

describe('health endpoints', () => {
  let app;
  let ownerAuth;
  let otherAuth;

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(MONGO_URI);
    await mongoose.connection.db.dropDatabase();
    const owner = await User.create({ username: 'owner', email: 'owner@example.com', password: 'Passw0rd!x', firstName: 'O', lastName: 'W' });
    const other = await User.create({ username: 'other', email: 'other@example.com', password: 'Passw0rd!x', firstName: 'O', lastName: 'T' });
    ownerAuth = `Bearer ${generateToken(owner._id.toString())}`;
    otherAuth = `Bearer ${generateToken(other._id.toString())}`;
    app = express();
    app.use(cookieParser());
    app.use('/api/health', require('../../routes/healthRoutes'));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await Promise.all([redisClient, publisherClient, subscriberClient].map((c) => c.quit().catch(() => {})));
    await Promise.all(Object.values(queues).map((q) => q.close().catch(() => {})));
  });

  it('the compact check stays public', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  it('the detailed check needs a login', async () => {
    const res = await request(app).get('/api/health/detailed');
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toMatch(/memory|redis|processId/i);
  });

  it('the detailed check is for the instance owner only', async () => {
    expect((await request(app).get('/api/health/detailed').set('Authorization', otherAuth)).status).toBe(403);
    const owner = await request(app).get('/api/health/detailed').set('Authorization', ownerAuth);
    expect(owner.status).toBe(200);
    expect(owner.body.components).toBeDefined();
  });
});
