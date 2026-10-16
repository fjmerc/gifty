const mongoose = require('mongoose');
const { setupTestDB, teardownTestDB } = require('../utils/testSetup');
const { HttpError, findOwned, assertOwnedRefs, pickFields } = require('../../utils/ownership');

// A tiny owned model so the helper is tested independently of app models
const Thing = mongoose.models.OwnershipThing || mongoose.model('OwnershipThing', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: String
}));

describe('ownership helpers', () => {
  const alice = new mongoose.Types.ObjectId();
  const bob = new mongoose.Types.ObjectId();
  let alicesThing;

  beforeAll(async () => {
    await setupTestDB();
    await Thing.deleteMany({});
    alicesThing = await Thing.create({ user: alice, name: 'a' });
  });
  afterAll(teardownTestDB);

  describe('findOwned', () => {
    it("returns the owner's document", async () => {
      const doc = await findOwned(Thing, alicesThing._id, alice);
      expect(doc.name).toBe('a');
    });

    it("404s for another user's document (indistinguishable from missing)", async () => {
      await expect(findOwned(Thing, alicesThing._id, bob)).rejects.toMatchObject({ statusCode: 404 });
      await expect(findOwned(Thing, new mongoose.Types.ObjectId(), alice)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('404s (not 500) for a malformed id', async () => {
      await expect(findOwned(Thing, 'not-an-id', alice)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('uses the given label in the message', async () => {
      await expect(findOwned(Thing, 'x', alice, { label: 'Recipient' })).rejects.toThrow('Recipient not found');
    });
  });

  describe('assertOwnedRefs', () => {
    it('passes when every referenced id is owned or absent', async () => {
      await expect(assertOwnedRefs(alice, [[Thing, alicesThing._id, 'Thing'], [Thing, undefined, 'Other']])).resolves.toBeUndefined();
    });

    it("404s when any referenced id belongs to someone else", async () => {
      await expect(assertOwnedRefs(bob, [[Thing, alicesThing._id, 'Recipient']])).rejects.toMatchObject({ statusCode: 404, message: 'Recipient not found' });
    });
  });

  describe('pickFields', () => {
    it('keeps only allowed keys and drops undefined', () => {
      expect(pickFields({ name: 'x', user: 'evil', price: undefined, budget: 'b' }, ['name', 'price']))
        .toEqual({ name: 'x' });
    });

    it('never lets user/_id through even if listed by mistake', () => {
      expect(pickFields({ user: 'evil', _id: 'x', name: 'n' }, ['user', '_id', 'name'])).toEqual({ name: 'n' });
    });
  });

  it('HttpError carries a status code', () => {
    const e = new HttpError(403, 'nope');
    expect(e).toBeInstanceOf(Error);
    expect(e.statusCode).toBe(403);
  });
});
