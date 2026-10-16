// Vendors from before accounts were separated have no owner. They belonged
// to the household that ran the app then, so upgrading gives them to the
// instance owner (the oldest account) instead of showing them to everyone.
// Real MongoDB.
const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');

jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const Vendor = require('../../models/Vendor');
const User = require('../../models/User');
const { assignOwnerlessVendors } = require('../../services/legacyOwnership');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-legacy-ownership-${process.pid}`;

describe('vendors without an owner', () => {
  beforeAll(async () => {
    await mongoose.connect(TEST_DB_URI);
    await mongoose.connection.db.dropDatabase();
  });
  afterAll(async () => { await teardownTestDB(); });
  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  });

  const user = (username) => User.collection.insertOne({ username, email: `${username}@example.com`, password: 'x' })
    .then((r) => r.insertedId);

  it('go to the oldest account; owned vendors stay where they are', async () => {
    const owner = await user('owner');
    const later = await user('later');
    await Vendor.collection.insertMany([
      { vendorName: 'Legacy 1' }, { vendorName: 'Legacy 2', user: null }, { vendorName: 'Later own', user: later }
    ]);

    expect(await assignOwnerlessVendors()).toBe(2);

    const byName = Object.fromEntries((await Vendor.collection.find().toArray()).map((v) => [v.vendorName, String(v.user)]));
    expect(byName).toEqual({ 'Legacy 1': String(owner), 'Legacy 2': String(owner), 'Later own': String(later) });
    expect(await assignOwnerlessVendors()).toBe(0);
  });

  it('are left alone on an instance with no account yet', async () => {
    await Vendor.collection.insertOne({ vendorName: 'Legacy' });
    expect(await assignOwnerlessVendors()).toBe(0);
    expect((await Vendor.collection.findOne({})).user).toBeUndefined();
  });
});
