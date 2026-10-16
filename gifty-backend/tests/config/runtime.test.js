const path = require('path');

describe('config/runtime', () => {
  const load = (env) => {
    jest.resetModules();
    const saved = process.env;
    process.env = { ...saved, ...env };
    const mod = require('../../config/runtime');
    process.env = saved;
    return mod;
  };

  it('derives uploads and backups from DATA_DIR', () => {
    const rt = load({ DATA_DIR: '/tmp/gifty-data', BACKUP_DIR: '' });
    expect(rt.DATA_DIR).toBe('/tmp/gifty-data');
    expect(rt.UPLOADS_DIR).toBe('/tmp/gifty-data/uploads');
    expect(rt.BACKUP_DIR).toBe('/tmp/gifty-data/backups');
  });

  it('defaults DATA_DIR to gifty-backend/data outside the container', () => {
    const rt = load({ DATA_DIR: '' });
    expect(rt.DATA_DIR).toBe(path.resolve(__dirname, '../../data'));
  });

  it('isHttps is true only for https GIFTY_URL', () => {
    const { isHttps } = load({});
    expect(isHttps({ GIFTY_URL: 'https://gifts.example.com' })).toBe(true);
    expect(isHttps({ GIFTY_URL: 'http://192.168.1.10:3000', NODE_ENV: 'production' })).toBe(false);
    expect(isHttps({ NODE_ENV: 'production' })).toBe(false);
  });

  it('getVersion prefers GIFTY_VERSION', () => {
    const { getVersion } = load({});
    expect(getVersion({ GIFTY_VERSION: '1.2.3' })).toBe('1.2.3');
    expect(getVersion({})).toBe(require('../../package.json').version);
  });
});

describe('getTrustProxy', () => {
  const { getTrustProxy } = require('../../config/runtime');

  it('is off by default so clients cannot spoof X-Forwarded-For', () => {
    expect(getTrustProxy({})).toBe(false);
  });

  it('accepts a hop count', () => {
    expect(getTrustProxy({ TRUST_PROXY: '1' })).toBe(1);
  });

  it('accepts true/false', () => {
    expect(getTrustProxy({ TRUST_PROXY: 'true' })).toBe(true);
    expect(getTrustProxy({ TRUST_PROXY: 'false' })).toBe(false);
  });

  it('passes addresses/CIDRs/presets through', () => {
    expect(getTrustProxy({ TRUST_PROXY: '172.18.0.0/16, loopback' })).toBe('172.18.0.0/16, loopback');
  });
});
