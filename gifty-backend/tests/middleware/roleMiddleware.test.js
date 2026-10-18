const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { setupTestDB, teardownTestDB } = require('../utils/testSetup');
const User = require('../../models/User');
const { requireAdmin, requireOwner } = require('../../middleware/roleMiddleware');

describe('roleMiddleware', () => {
  let owner; let admin; let member;
  const appAs = (user) => {
    const app = express();
    app.use((req, res, next) => { req.user = user; next(); });
    app.post('/admin', requireAdmin, (req, res) => res.json({ ok: true }));
    app.post('/owner', requireOwner, (req, res) => res.json({ ok: true }));
    return app;
  };
  const make = (name, role) => User.create({ username: name, email: `${name}@example.com`, password: 'Passw0rd!', firstName: name, lastName: 'L', role });

  beforeAll(async () => {
    await setupTestDB();
    await mongoose.connection.db.collection('users').deleteMany({});
    await mongoose.connection.db.collection('instance').deleteMany({});
    owner = await make('owner', 'admin');
    admin = await make('admin', 'admin');
    member = await make('member', 'member');
    await mongoose.connection.db.collection('instance').insertOne({ _id: 'settings', ownerId: owner._id });
  });
  afterAll(teardownTestDB);

  it.each([
    ['owner', () => owner, 200, 200],
    ['admin', () => admin, 200, 403],
    ['member', () => member, 403, 403]
  ])('%s: admin route %s, owner route %s', async (_, who, adminStatus, ownerStatus) => {
    await request(appAs(who())).post('/admin').expect(adminStatus);
    await request(appAs(who())).post('/owner').expect(ownerStatus);
  });

  it('answers with codes', async () => {
    expect((await request(appAs(member)).post('/admin')).body.code).toBe('ADMIN_ONLY');
    expect((await request(appAs(admin)).post('/owner')).body.code).toBe('OWNER_ONLY');
  });

  it('rejects unauthenticated requests with 401', async () => {
    await request(appAs(undefined)).post('/admin').expect(401);
    await request(appAs(undefined)).post('/owner').expect(401);
  });
});
