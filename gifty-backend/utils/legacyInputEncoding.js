// Until 2026-10 a global middleware HTML-encoded every top-level string in
// request bodies, queries and params before it reached the database
// ("O'Brien" was stored as "O&#39;Brien"). These helpers reproduce that
// encoding exactly, for the login fallback and the one-off text repair.

// The removed middleware's sanitizeString, verbatim in effect.
const legacyEncode = (value) => {
  if (!value) return value;
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .replace(/data:/gi, '');
};

// Exact inverse of the encoding step (the stripping is lossy and cannot be
// undone). &amp; is decoded last: a user who typed "&lt;" was stored as
// "&amp;lt;", which must come back as "&lt;", not "<". Not idempotent, so
// it must run at most once per stored value.
const decodeLegacyEntities = (value) => value
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');

module.exports = { legacyEncode, decodeLegacyEntities };
