// Boot drops the legacy tags.name_1 index. Mongoose builds the model's
// indexes in the background as soon as it connects; touching the tags
// indexes while that build runs failed the whole boot on a real database
// ("a background operation is currently running for collection gifty.tags").
jest.mock('../../models/Tags', () => ({
  init: jest.fn(),
  syncIndexes: jest.fn().mockResolvedValue([]),
  collection: { indexes: jest.fn(), dropIndex: jest.fn().mockResolvedValue({}) }
}));
jest.mock('../../utils/logger', () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const Tag = require('../../models/Tags');
const logger = require('../../utils/logger');
const { dropLegacyTagNameIndex } = require('../../migrations/dropLegacyTagNameIndex');

beforeEach(() => {
  jest.clearAllMocks();
  Tag.collection.indexes.mockResolvedValue([{ name: '_id_' }, { name: 'name_1' }]);
});

it("waits for Mongoose's own index build before touching the tags indexes", async () => {
  let finishBuild;
  Tag.init.mockReturnValue(new Promise((resolve) => { finishBuild = resolve; }));

  const run = dropLegacyTagNameIndex();
  await new Promise((r) => setImmediate(r));
  expect(Tag.collection.dropIndex).not.toHaveBeenCalled();

  finishBuild();
  await run;
  expect(Tag.collection.dropIndex).toHaveBeenCalledWith('name_1');
  expect(Tag.syncIndexes).toHaveBeenCalled();
});

it('carries on when that build failed, and says so', async () => {
  Tag.init.mockRejectedValue(new Error('E11000 duplicate key'));

  await dropLegacyTagNameIndex();

  expect(Tag.collection.dropIndex).toHaveBeenCalledWith('name_1');
  expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('E11000 duplicate key'));
});
