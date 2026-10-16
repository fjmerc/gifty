const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');
const User = require('../../models/User');
const { requireInstanceOwner } = require('../../middleware/instanceOwnerMiddleware');

describe('requireInstanceOwner', () => {
  let owner;
  let other;
  const appAs = (user) => {
    const app = express();
    app.use((req, res, next) => { req.user = user; next(); });
    app.post('/danger', requireInstanceOwner, (req, res) => res.json({ ok: true }));
    return app;
  };

  beforeAll(async () => {
    await setupTestDB();
    await mongoose.connection.db.collection('users').deleteMany({});
    owner = await User.create({ username: 'owner', email: 'owner@example.com', password: 'Passw0rd!', firstName: 'O', lastName: 'W' });
    other = await User.create({ username: 'other', email: 'other@example.com', password: 'Passw0rd!', firstName: 'X', lastName: 'Y' });
  });
  afterAll(teardownTestDB);

  it('lets the first account (instance owner) through', async () => {
    await request(appAs(owner)).post('/danger').expect(200);
  });

  it('rejects any later account with 403', async () => {
    const res = await request(appAs(other)).post('/danger').expect(403);
    expect(res.body.code).toBe('OWNER_ONLY');
  });

  it('rejects unauthenticated requests with 401', async () => {
    await request(appAs(undefined)).post('/danger').expect(401);
  });

  it('ignores createdAt (forged or missing on legacy users) and uses insertion order', async () => {
    const users = mongoose.connection.db.collection('users');
    const legacy = await users.insertOne({ username: 'late', email: 'late@example.com', password: 'x' });
    await users.updateOne({ _id: other._id }, { $set: { createdAt: new Date('1970-01-01') } });
    await request(appAs({ _id: legacy.insertedId })).post('/danger').expect(403);
    await request(appAs(other)).post('/danger').expect(403);
    await request(appAs(owner)).post('/danger').expect(200);
  });
});
