const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ENCRYPTION_KEY encrypts secrets kept in the database (SMTP passwords);
// an existing secrets.json gets it added on the next start
const SECRET_KEYS = ['JWT_SECRET', 'SESSION_SECRET', 'COOKIE_SECRET', 'ENCRYPTION_KEY'];
const SECRETS_FILE = 'secrets.json';

// Self-hosters should not have to hand-generate secrets. Env values win;
// anything missing is generated once and persisted in the data volume.
const loadSecrets = ({ dataDir, env = process.env }) => {
  const file = path.join(dataDir, SECRETS_FILE);
  let stored = {};
  if (fs.existsSync(file)) {
    stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  const generated = [];
  for (const key of SECRET_KEYS) {
    if (env[key]) continue;
    if (!stored[key]) {
      stored[key] = crypto.randomBytes(32).toString('hex');
      generated.push(key);
    }
    env[key] = stored[key];
  }

  if (generated.length > 0) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      // Atomically: a crash mid-write must not leave a broken secrets file
      // (which would lose the keys and every encrypted mail password)
      const tmp = `${file}.tmp`;
      const fd = fs.openSync(tmp, 'w', 0o600);
      try {
        fs.writeSync(fd, JSON.stringify(stored, null, 2));
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.chmodSync(tmp, 0o600);
      fs.renameSync(tmp, file);
    } catch (err) {
      throw new Error(`Data directory ${dataDir} is not writable (${err.code}); cannot persist generated secrets`);
    }
  }

  const fromEnv = SECRET_KEYS.filter((k) => !stored[k]).length;
  const source = fromEnv === SECRET_KEYS.length ? 'env' : fromEnv === 0 ? 'file' : 'mixed';
  return { generated, source };
};

module.exports = { loadSecrets, SECRET_KEYS, SECRETS_FILE };
