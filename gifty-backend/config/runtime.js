const path = require('path');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const BACKUP_DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(DATA_DIR, 'backups');
const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR || path.join(__dirname, '..', 'public'));

// HTTPS-only behaviour (Secure cookies, upgrade-insecure-requests) must follow
// how users actually reach the instance, not NODE_ENV: most self-hosted
// installs run production builds over plain HTTP on a LAN.
const isHttps = (env = process.env) => /^https:\/\//i.test(env.GIFTY_URL || '');

// The address users open, for links in emails (README: GIFTY_URL)
const getPublicUrl = (env = process.env) => (env.GIFTY_URL || 'http://localhost:3000').replace(/\/+$/, '');

const getVersion = (env = process.env) => env.GIFTY_VERSION || require('../package.json').version;

// Off by default: trusting X-Forwarded-For from arbitrary peers lets clients
// spoof their IP and dodge rate limits. Behind a reverse proxy, set
// TRUST_PROXY to the proxy's address/CIDR (or hop count) so rate limits see
// real client IPs instead of collapsing onto the proxy's.
const getTrustProxy = (env = process.env) => {
  const value = (env.TRUST_PROXY || '').trim();
  if (value === '' || value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  return value;
};

module.exports = { DATA_DIR, UPLOADS_DIR, BACKUP_DIR, PUBLIC_DIR, isHttps, getPublicUrl, getVersion, getTrustProxy };
