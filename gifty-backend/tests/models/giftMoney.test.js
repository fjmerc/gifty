// Gift prices are whole cents (spec: "Whole cents everywhere"), on the real DB.
const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');
const Gift = require('../../models/Gift');
require('../../models/Event'); // the legacy pre-save hook (removed in Task 3) looks these up
require('../../models/Budget');

const MONGO_URI = `mongodb://localhost:27017/gifty-test-gift-money-${process.pid}`;
const oid = () => new mongoose.Types.ObjectId();
const base = () => ({ user: oid(), event: oid(), recipient: oid(), name: 'Gift' });

describe('Gift price is stored in whole cents', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(MONGO_URI);
    await Gift.init();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  it('rounds the price to cents on save', async () => {
    const gift = await Gift.create({ ...base(), price: 34.999 });
    expect(gift.price).toBe(35);
    const raw = await Gift.collection.findOne({ _id: gift._id });
    expect(raw.price).toBe(35);
  });

  it('stores 0.1 + 0.2 as 0.3', async () => {
    const gift = await Gift.create({ ...base(), price: 0.1 + 0.2 });
    expect((await Gift.collection.findOne({ _id: gift._id })).price).toBe(0.3);
  });

  it('rounds on findOneAndUpdate too', async () => {
    const gift = await Gift.create({ ...base(), price: 10 });
    const updated = await Gift.findOneAndUpdate({ _id: gift._id }, { $set: { price: 12.345 } }, { new: true });
    expect(updated.price).toBe(12.35);
  });

  it('allows a free gift (price 0)', async () => {
    const gift = await Gift.create({ ...base(), price: 0 });
    expect(gift.price).toBe(0);
  });

  it('rejects a negative price', async () => {
    await expect(Gift.create({ ...base(), price: -1 })).rejects.toThrow(/Price cannot be negative/);
  });

  it('has the {user, status, purchaseDate} index used by the money service', async () => {
    const indexes = await Gift.collection.indexes();
    const index = indexes.find((i) => i.name === 'user_status_purchase_date');
    expect(index && index.key).toEqual({ user: 1, status: 1, purchaseDate: 1 });
  });
});
