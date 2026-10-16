const { validateEnv, getFeatures, getInstanceSmtp, summaryLine } = require('../../config/validateEnv');

describe('validateEnv', () => {
  it('accepts an empty config', () => {
    expect(validateEnv({})).toEqual([]);
  });

  it('rejects a malformed GIFTY_URL', () => {
    expect(validateEnv({ GIFTY_URL: 'gifts.example.com' })[0]).toMatch(/GIFTY_URL/);
  });

  it('rejects half-configured SMTP', () => {
    expect(validateEnv({ SMTP_HOST: 'smtp.example.com' }).join()).toMatch(/SMTP_FROM/);
    expect(validateEnv({ SMTP_HOST: 'h', SMTP_FROM: 'a@b.c', SMTP_USER: 'u' }).join()).toMatch(/SMTP_PASSWORD/);
  });

  it('rejects a TZ that is not a valid IANA time zone', () => {
    expect(validateEnv({ TZ: 'Mars/Olympus' })).toEqual(['TZ "Mars/Olympus" is not a valid IANA time zone (e.g. America/New_York)']);
  });

  it('accepts valid IANA time zones', () => {
    expect(validateEnv({ TZ: 'America/Los_Angeles' })).toEqual([]);
    expect(validateEnv({ TZ: 'UTC' })).toEqual([]);
  });

  it('accepts deprecated DEFAULT_EMAIL_* aliases', () => {
    const env = { DEFAULT_EMAIL_HOST: 'smtp.example.com', DEFAULT_EMAIL_USER: 'u@example.com', DEFAULT_EMAIL_PASSWORD: 'p' };
    expect(validateEnv(env)).toEqual([]);
    expect(getInstanceSmtp(env)).toEqual({
      host: 'smtp.example.com', port: 587, secure: false,
      auth: { user: 'u@example.com', pass: 'p' }, from: 'u@example.com'
    });
  });
});

describe('getFeatures', () => {
  it('reports ai when any provider key is set', () => {
    expect(getFeatures({}).ai).toBe(false);
    expect(getFeatures({ OPENAI_API_KEY: 'x' }).ai).toBe(true);
    expect(getFeatures({ ANTHROPIC_API_KEY: 'x' }).ai).toBe(true);
    expect(getFeatures({ GEMINI_API_KEY: 'x' }).ai).toBe(true);
  });

  it('reports email and webSearch', () => {
    const f = getFeatures({ SMTP_HOST: 'h', SMTP_FROM: 'a@b.c', BRAVE_SEARCH_API_KEY: 'k' });
    expect(f).toEqual({ ai: false, email: true, webSearch: true });
  });
});

describe('summaryLine', () => {
  it('lists feature states and timezone', () => {
    expect(summaryLine({ GIFTY_VERSION: '0.9.0', OPENAI_API_KEY: 'x', TZ: 'Europe/Madrid' }))
      .toBe('Gifty 0.9.0 · AI: on · Email: off · Search: off · TZ: Europe/Madrid');
  });
});

describe('checkWritableDirs', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { checkWritableDirs } = require('../../config/validateEnv');

  it('creates missing dirs and reports nothing when all are writable', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gifty-w-'));
    expect(checkWritableDirs([base, path.join(base, 'uploads')])).toEqual([]);
    expect(fs.existsSync(path.join(base, 'uploads'))).toBe(true);
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('names each dir the app user cannot write to', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gifty-w-'));
    const locked = path.join(base, 'backups');
    fs.mkdirSync(locked);
    fs.chmodSync(locked, 0o500);
    const errors = checkWritableDirs([base, locked]);
    fs.chmodSync(locked, 0o700);
    fs.rmSync(base, { recursive: true, force: true });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/backups is not writable/);
  });
});

describe('secrets provided in the environment', () => {
  const strong = 'a'.repeat(32);

  it.each(['JWT_SECRET', 'COOKIE_SECRET', 'SESSION_SECRET', 'ENCRYPTION_KEY'])('refuses a %s shorter than 32 characters', (key) => {
    const errors = validateEnv({ [key]: 'changeme' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(new RegExp(`${key} is too short \\(8 characters\\)`));
    expect(errors[0]).toMatch(/at least 32/);
    // The value itself never appears in the message
    expect(errors[0]).not.toMatch(/changeme/);
  });

  it('accepts 32 characters or more, and unset secrets (they are generated)', () => {
    expect(validateEnv({ JWT_SECRET: strong, COOKIE_SECRET: strong, SESSION_SECRET: strong, ENCRYPTION_KEY: strong })).toEqual([]);
    expect(validateEnv({})).toEqual([]);
  });
});

describe('instance defaults', () => {
  it('accepts a holiday country and a supported currency, in any case', () => {
    expect(validateEnv({ DEFAULT_COUNTRY: 'de', DEFAULT_CURRENCY: 'eur' })).toEqual([]);
  });

  it('refuses a country without a holiday list, naming the ones there are', () => {
    const [error] = validateEnv({ DEFAULT_COUNTRY: 'FR' });
    expect(error).toMatch(/DEFAULT_COUNTRY "FR"/);
    expect(error).toMatch(/US, DE/);
  });

  it('refuses a currency the app does not offer', () => {
    const [error] = validateEnv({ DEFAULT_CURRENCY: 'CHF' });
    expect(error).toMatch(/DEFAULT_CURRENCY "CHF"/);
    expect(error).toMatch(/USD, EUR, GBP, JPY, CNY/);
  });
});
