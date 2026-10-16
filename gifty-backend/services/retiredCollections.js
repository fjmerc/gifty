// Collections of features that no longer exist. Older installs may still
// have them: archives made before the removal hold them too.
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const RETIRED_COLLECTIONS = new Set(['reviews']);

const existingRetired = async (db) => (await db.listCollections({}, { nameOnly: true }).toArray())
  .map((c) => c.name)
  .filter((name) => RETIRED_COLLECTIONS.has(name));

// One account's documents in the retired collections, deleted with the account
const deleteUserRetiredDocuments = async (userId) => {
  const db = mongoose.connection.db;
  for (const name of await existingRetired(db)) {
    await db.collection(name).deleteMany({ user: userId });
  }
};

// Empty ones go; ones that still hold documents stay until their accounts
// are deleted (nothing reads them)
const dropEmptyRetiredCollections = async () => {
  const db = mongoose.connection.db;
  const dropped = [];
  for (const name of await existingRetired(db)) {
    if (await db.collection(name).countDocuments({}, { limit: 1 }) === 0) {
      await db.collection(name).drop();
      dropped.push(name);
    }
  }
  if (dropped.length) logger.info(`Dropped empty collections of removed features: ${dropped.join(', ')}`);
  return dropped;
};

module.exports = { RETIRED_COLLECTIONS, deleteUserRetiredDocuments, dropEmptyRetiredCollections };
