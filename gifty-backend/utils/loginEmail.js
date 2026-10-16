// The email a login looks the account up by: the body's email after the
// login validation (express-validator normalizeEmail) has run. The per-email
// failed-login limit keys on this same value, so spelling variants of one
// address (case, spaces, Gmail dots) share one counter.
const loginLookupEmail = (req) => (typeof req.body?.email === 'string' ? req.body.email : '');

module.exports = { loginLookupEmail };
