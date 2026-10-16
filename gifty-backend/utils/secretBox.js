// Secrets the app must read back (SMTP passwords) are kept encrypted with
// AES-256-GCM under ENCRYPTION_KEY (generated into data/secrets.json, see
// config/secrets.js). Stored form: enc:v1:<iv>:<tag>:<ciphertext>, base64.
// The prefix lets the startup migration tell encrypted rows from old
// plaintext ones without needing the key.
const crypto = require('crypto');

const PREFIX = 'enc:v1:';

class SecretUnreadableError extends Error {
  constructor() {
    super('The stored secret cannot be decrypted with this server\'s ENCRYPTION_KEY');
    this.name = 'SecretUnreadableError';
  }
}

// An env-provided key is any string of 32+ characters, not necessarily hex:
// derive the 256-bit key from it
const keyFrom = (key = process.env.ENCRYPTION_KEY) => {
  if (!key) throw new Error('ENCRYPTION_KEY is not set');
  return crypto.createHash('sha256').update(String(key)).digest();
};

const isEncrypted = (value) => typeof value === 'string' && value.startsWith(PREFIX);

const encryptSecret = (plain, key) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFrom(key), iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
};

// Plain text in, plain text out (rows from before encryption, until the
// startup migration has run); throws SecretUnreadableError for a value
// encrypted under another key or damaged
const decryptSecret = (value, key) => {
  if (!isEncrypted(value)) return value;
  try {
    const [iv, tag, ct] = value.slice(PREFIX.length).split(':').map((part) => Buffer.from(part, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFrom(key), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (err) {
    throw new SecretUnreadableError();
  }
};

module.exports = { encryptSecret, decryptSecret, isEncrypted, SecretUnreadableError, PREFIX };
