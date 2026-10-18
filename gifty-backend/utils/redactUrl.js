// Invite and reset links carry their token in the path. Anything that logs a
// URL passes it through here first, so a log never holds a usable link.
const TOKEN_PATH = /(\/(?:api\/invites|api\/password-reset|invite|reset)\/)[^/?#]+/;

const redactUrl = (url) => (typeof url === 'string' ? url.replace(TOKEN_PATH, '$1[redacted]') : url);

module.exports = { redactUrl };
