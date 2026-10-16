const Tag = require('../models/Tags');
const logger = require('../utils/logger');

/**
 * Tags used to be unique by name across the whole instance (index name_1).
 * They are now unique per user ({user, name}), and the old index makes one
 * user's tag name block everyone else's. Idempotent: safe to run on every boot.
 */
const dropLegacyTagNameIndex = async () => {
  // Mongoose builds the model's indexes in the background once connected:
  // index commands on tags fail while that runs, so let it finish first
  try {
    await Tag.init();
  } catch (error) {
    logger.warn(`Tag index build failed (continuing): ${error.message}`);
  }
  const indexes = await Tag.collection.indexes().catch((err) => {
    if (err.codeName === 'NamespaceNotFound') return [];
    throw err;
  });
  if (indexes.some((i) => i.name === 'name_1')) {
    await Tag.collection.dropIndex('name_1');
    logger.info('Dropped legacy global unique index tags.name_1');
  }
  await Tag.syncIndexes();
};

module.exports = { dropLegacyTagNameIndex };
