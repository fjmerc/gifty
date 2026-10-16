// Request input must not carry MongoDB operators: object keys starting with
// $ or containing a dot are removed from req.body and req.query, at any
// depth, in place. Arrays and ordinary nested objects are kept (the app's
// own filters and axios array params rely on them). Values nested deeper
// than MAX_DEPTH are removed too, unchecked input never passes. Route
// params are path segments, always strings, so need nothing. Mounted after
// the body parser and before every router (server.js).
const MAX_DEPTH = 20;

const unsafeKey = (key) => key.startsWith('$') || key.includes('.');
const isContainer = (value) => value !== null && typeof value === 'object';

// Cleans the children of a container at `depth`; a child container that
// would sit deeper than MAX_DEPTH is removed
const strip = (value, depth = 0) => {
  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i -= 1) {
      if (!isContainer(value[i])) continue;
      if (depth + 1 > MAX_DEPTH) value.splice(i, 1);
      else strip(value[i], depth + 1);
    }
    return;
  }
  for (const key of Object.keys(value)) {
    if (unsafeKey(key)) {
      delete value[key];
    } else if (isContainer(value[key])) {
      if (depth + 1 > MAX_DEPTH) delete value[key];
      else strip(value[key], depth + 1);
    }
  }
};

const stripMongoOperators = (req, res, next) => {
  if (isContainer(req.body)) strip(req.body);
  if (isContainer(req.query)) strip(req.query);
  next();
};

module.exports = { stripMongoOperators, MAX_DEPTH };
