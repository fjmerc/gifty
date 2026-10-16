const mongoose = require('mongoose');

/**
 * An error with an HTTP status; errorHandler responds with err.statusCode.
 */
class HttpError extends Error {
  // expose: the message is meant for the user even on a server error, which
  // production otherwise answers with a generic message
  constructor(statusCode, message, { expose = false } = {}) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.expose = expose;
  }
}

const notFound = (label) => new HttpError(404, `${label} not found`);

/**
 * Load a document only if it belongs to userId. Anything else — another
 * user's document, a missing one, or a malformed id — is the same 404, so
 * ids from other accounts can't even be probed for existence.
 */
const findOwned = async (Model, id, userId, { label = Model.modelName, select, populate } = {}) => {
  if (!mongoose.isValidObjectId(id)) throw notFound(label);
  let query = Model.findOne({ _id: id, user: userId });
  if (select) query = query.select(select);
  if (populate) query = query.populate(populate);
  const doc = await query;
  if (!doc) throw notFound(label);
  return doc;
};

/**
 * Verify that every referenced id (e.g. a gift's recipient and event) belongs
 * to userId. Entries are [Model, id, label]; empty ids are skipped.
 */
const assertOwnedRefs = async (userId, refs) => {
  for (const [Model, id, label] of refs) {
    if (id === undefined || id === null || id === '') continue;
    if (!mongoose.isValidObjectId(id) || !(await Model.exists({ _id: id, user: userId }))) {
      throw notFound(label || Model.modelName);
    }
  }
};

// Ownership and identity are always set by the server, never by the client
const NEVER_FROM_CLIENT = new Set(['user', '_id', '__v', 'createdAt', 'updatedAt']);

/**
 * Copy only the allowed, defined keys from a request body.
 */
const pickFields = (body, allowed) => {
  const out = {};
  for (const key of allowed) {
    if (NEVER_FROM_CLIENT.has(key)) continue;
    if (body && body[key] !== undefined) out[key] = body[key];
  }
  return out;
};

module.exports = { HttpError, findOwned, assertOwnedRefs, pickFields };
