const mongoose = require('mongoose');
const { setupTestDB, teardownTestDB } = require('../utils/testSetup');
const Vendor = require('../../models/Vendor');
const { assignOwnerlessVendors } = require('../../services/legacyOwnership');

describe('assignOwnerlessVendors', () => {
  beforeAll(setupTestDB);
  afterAll(teardownTestDB);
  beforeEach(async () => {
    await mongoose.connection.db.collection('users').deleteMany({});
    await mongoose.connection.db.collection('instance').deleteMany({});
    await Vendor.collection.deleteMany({});
  });

  it('gives ownerless vendors to the stored owner, not the oldest account', async () => {
    const users = mongoose.connection.db.collection('users');
    await users.insertOne({ username: 'old', email: 'old@example.com', password: 'x', firstName: 'O', lastName: 'L', role: 'admin', active: true });
    const owner = (await users.insertOne({ username: 'own', email: 'own@example.com', password: 'x', firstName: 'O', lastName: 'W', role: 'admin', active: true })).insertedId;
    await mongoose.connection.db.collection('instance').insertOne({ _id: 'settings', ownerId: owner });
    await Vendor.collection.insertOne({ name: 'Shop', user: null });
    expect(await assignOwnerlessVendors()).toBe(1);
    expect(String((await Vendor.collection.findOne({ name: 'Shop' })).user)).toBe(String(owner));
  });

  it('does nothing without accounts', async () => {
    await Vendor.collection.insertOne({ name: 'Shop', user: null });
    expect(await assignOwnerlessVendors()).toBe(0);
  });
});
