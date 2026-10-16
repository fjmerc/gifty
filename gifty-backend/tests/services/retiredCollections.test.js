// Collections of removed features (gift reviews): an empty one is dropped
// when stored data is upgraded, one that still holds documents is kept
// (they are deleted with their accounts). Real MongoDB.
const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');

jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const { dropEmptyRetiredCollections } = require('../../services/retiredCollections');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-retired-${process.pid}`;
const exists = async (name) => (await mongoose.connection.db.listCollections({ name }).toArray()).length === 1;

beforeAll(() => mongoose.connect(TEST_DB_URI));
afterAll(() => teardownTestDB());

describe('retired collections', () => {
  it('drops an empty reviews collection', async () => {
    await mongoose.connection.db.createCollection('reviews');
    expect(await dropEmptyRetiredCollections()).toEqual(['reviews']);
    expect(await exists('reviews')).toBe(false);
  });

  it('keeps a reviews collection that still holds documents', async () => {
    await mongoose.connection.db.collection('reviews').insertOne({ user: new mongoose.Types.ObjectId(), rating: 3 });
    expect(await dropEmptyRetiredCollections()).toEqual([]);
    expect(await exists('reviews')).toBe(true);
  });

  it('does nothing when there is no reviews collection', async () => {
    await mongoose.connection.db.collection('reviews').drop();
    expect(await dropEmptyRetiredCollections()).toEqual([]);
  });
});
