// The filter after the AI call drops suggestions far over budget. It must
// judge them by the same price guide the AI was given (what is left of the
// budget), not the recipient's stored per-gift fields. Real MongoDB.
const mongoose = require('mongoose');

jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const Recipient = require('../../models/Recipient');
const { filterIgnoredSuggestions } = require('../../utils/suggestionUtilsEnhanced');

const MONGO_URI = `mongodb://localhost:27017/gifty-test-filter-guide-${process.pid}`;
const idea = (name, estimatedPrice) => ({ name, description: name, estimatedPrice, category: 'Misc', tags: [] });

describe('the suggestion filter and the price guide', () => {
  const user = new mongoose.Types.ObjectId();
  let recipient;
  const names = (list) => list.map((s) => s.name).sort();
  const filter = (suggestions, priceGuide) =>
    filterIgnoredSuggestions(suggestions, user, recipient._id, { minimumSuggestions: 0, priceGuide });

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(MONGO_URI);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
    recipient = await Recipient.create({
      user, firstName: 'Paul', lastName: 'B', relation: 'Father', relationship: 'family',
      birthdate: new Date('1958-09-02'), minimumPriceBudget: 20, maximumPriceBudget: 50
    });
  });

  it('keeps ideas within what is left even when the stored range is lower', async () => {
    const kept = await filter([idea('Saddle', 100), idea('Pump', 35)], { min: 0, max: 110, currency: 'EUR' });
    expect(names(kept)).toEqual(['Pump', 'Saddle']);
  });

  // Price is no longer a reason to drop: the controller flags these over
  // budget instead, so a nearly used-up budget does not empty the list
  it('keeps ideas over what is left (they are flagged, not dropped)', async () => {
    await Recipient.updateOne({ _id: recipient._id }, { $unset: { minimumPriceBudget: 1 }, $set: { maximumPriceBudget: 150 } });
    const kept = await filter([idea('E-bike', 200), idea('Pump', 35)], { min: 0, max: 30, currency: 'EUR' });
    expect(names(kept).sort()).toEqual(['E-bike', 'Pump']);
  });

  it('applies no price limit when the guide has none', async () => {
    const kept = await filter([idea('E-bike', 2000)], { min: 0, max: null, currency: 'EUR' });
    expect(names(kept)).toEqual(['E-bike']);
  });
});
