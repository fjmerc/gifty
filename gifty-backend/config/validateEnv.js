const fs = require('fs');
const { getVersion } = require('./runtime');
const { validateInstanceDefaults } = require('./instanceDefaults');

const pick = (env, key) => env[`SMTP_${key}`] || env[`DEFAULT_EMAIL_${key}`] || '';

const getInstanceSmtp = (env = process.env) => {
  const host = pick(env, 'HOST');
  if (!host) return null;
  const user = pick(env, 'USER');
  const pass = pick(env, 'PASSWORD');
  const from = env.SMTP_FROM || env.DEFAULT_EMAIL_USER || '';
  const port = parseInt(pick(env, 'PORT') || '587', 10);
  const secure = pick(env, 'SECURE') === 'true'; // port 465 users set SMTP_SECURE=true
  return { host, port, secure, ...(user ? { auth: { user, pass } } : {}), from };
};

// Secrets set in the environment must be strong; unset ones are generated
// (64 hex characters) and kept in data/secrets.json
const ENV_SECRETS = ['JWT_SECRET', 'COOKIE_SECRET', 'SESSION_SECRET', 'ENCRYPTION_KEY'];
const MIN_SECRET_LENGTH = 32;

const validateEnv = (env = process.env) => {
  const errors = [];
  for (const key of ENV_SECRETS) {
    const value = env[key];
    if (value && value.length < MIN_SECRET_LENGTH) {
      errors.push(`${key} is too short (${value.length} characters); use at least ${MIN_SECRET_LENGTH}, e.g. the output of \`openssl rand -hex 32\`, or remove it from the environment to have one generated`);
    }
  }
  if (env.GIFTY_URL) {
    try {
      const u = new URL(env.GIFTY_URL);
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
    } catch {
      errors.push(`GIFTY_URL must be a full http(s) URL, e.g. http://192.168.1.10:3000 (got "${env.GIFTY_URL}")`);
    }
  }
  // TZ decides which year and month purchases count in; an invalid zone would
  // break every money endpoint, so refuse to boot with it
  if (env.TZ) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: env.TZ });
    } catch {
      errors.push(`TZ "${env.TZ}" is not a valid IANA time zone (e.g. America/New_York)`);
    }
  }
  errors.push(...validateInstanceDefaults(env));
  const smtp = getInstanceSmtp(env);
  if (smtp) {
    if (!smtp.from) errors.push('SMTP_HOST is set but SMTP_FROM is empty');
    if (smtp.auth && !smtp.auth.pass) errors.push('SMTP_USER is set but SMTP_PASSWORD is empty');
  }
  return errors;
};

const getFeatures = (env = process.env) => ({
  ai: Boolean(env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY || env.GEMINI_API_KEY),
  email: Boolean(getInstanceSmtp(env)),
  webSearch: Boolean(env.BRAVE_SEARCH_API_KEY)
});

const summaryLine = (env = process.env) => {
  const f = getFeatures(env);
  const on = (b) => (b ? 'on' : 'off');
  return `Gifty ${getVersion(env)} · AI: ${on(f.ai)} · Email: ${on(f.email)} · Search: ${on(f.webSearch)} · TZ: ${env.TZ || 'UTC'}`;
};

// Fail fast on an unwritable data volume instead of letting uploads and
// nightly backups fail silently later.
const checkWritableDirs = (dirs) => {
  const errors = [];
  for (const dir of dirs) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
    } catch (err) {
      errors.push(`${dir} is not writable by uid ${process.getuid ? process.getuid() : '?'} (${err.code}); fix its ownership, e.g. chown -R 1000:1000 on the host`);
    }
  }
  return errors;
};

module.exports = { validateEnv, getFeatures, getInstanceSmtp, summaryLine, checkWritableDirs };
