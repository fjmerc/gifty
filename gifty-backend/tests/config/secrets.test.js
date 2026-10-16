const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadSecrets, SECRETS_FILE } = require('../../config/secrets');

describe('loadSecrets', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gifty-secrets-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('generates, persists with 0600, and reuses secrets', () => {
    const env1 = {};
    const r1 = loadSecrets({ dataDir: dir, env: env1 });
    expect(r1.generated.sort()).toEqual(['COOKIE_SECRET', 'ENCRYPTION_KEY', 'JWT_SECRET', 'SESSION_SECRET']);
    expect(env1.JWT_SECRET).toMatch(/^[0-9a-f]{64}$/);
    const file = path.join(dir, SECRETS_FILE);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);

    const env2 = {};
    const r2 = loadSecrets({ dataDir: dir, env: env2 });
    expect(r2.generated).toEqual([]);
    expect(env2.JWT_SECRET).toBe(env1.JWT_SECRET);
    expect(env2.SESSION_SECRET).toBe(env1.SESSION_SECRET);
  });

  it('env values win and are not written to disk', () => {
    const env = { JWT_SECRET: 'from-env' };
    loadSecrets({ dataDir: dir, env });
    expect(env.JWT_SECRET).toBe('from-env');
    const stored = JSON.parse(fs.readFileSync(path.join(dir, SECRETS_FILE), 'utf8'));
    expect(stored.JWT_SECRET).toBeUndefined();
    expect(stored.SESSION_SECRET).toMatch(/^[0-9a-f]{64}$/);
  });

  it('adds ENCRYPTION_KEY to an existing secrets file without touching the others', () => {
    const file = path.join(dir, SECRETS_FILE);
    const existing = { JWT_SECRET: 'a'.repeat(64), SESSION_SECRET: 'b'.repeat(64), COOKIE_SECRET: 'c'.repeat(64) };
    fs.writeFileSync(file, JSON.stringify(existing), { mode: 0o600 });

    const env = {};
    const result = loadSecrets({ dataDir: dir, env });

    expect(result.generated).toEqual(['ENCRYPTION_KEY']);
    const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(stored).toEqual({ ...existing, ENCRYPTION_KEY: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(env.JWT_SECRET).toBe(existing.JWT_SECRET);
    expect(env.ENCRYPTION_KEY).toBe(stored.ENCRYPTION_KEY);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  // A crash mid-write must never leave a half-written secrets file
  it('writes the file atomically: a 0600 temp file renamed into place, nothing left behind', () => {
    const file = path.join(dir, SECRETS_FILE);
    const existing = { JWT_SECRET: 'a'.repeat(64), SESSION_SECRET: 'b'.repeat(64), COOKIE_SECRET: 'c'.repeat(64) };
    fs.writeFileSync(file, JSON.stringify(existing), { mode: 0o600 });
    const rename = jest.spyOn(fs, 'renameSync');
    const fsync = jest.spyOn(fs, 'fsyncSync');

    loadSecrets({ dataDir: dir, env: {} });

    expect(rename).toHaveBeenCalledWith(`${file}.tmp`, file);
    expect(fsync).toHaveBeenCalled();
    rename.mockRestore();
    fsync.mockRestore();
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
    const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(stored).toEqual({ ...existing, ENCRYPTION_KEY: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it('throws a clear error when the data dir is not writable', () => {
    fs.chmodSync(dir, 0o500);
    expect(() => loadSecrets({ dataDir: dir, env: {} })).toThrow(/not writable/);
    fs.chmodSync(dir, 0o700);
  });
});
