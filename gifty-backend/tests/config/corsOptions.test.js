const { corsOptionsDelegate } = require('../../config/corsOptions');

const decide = (origin, host, env = {}) => {
  const saved = process.env;
  process.env = { ...saved, NODE_ENV: 'production', GIFTY_URL: '', ...env };
  let result;
  corsOptionsDelegate(
    { header: (n) => (n.toLowerCase() === 'origin' ? origin : undefined), get: (n) => (n.toLowerCase() === 'host' ? host : undefined) },
    (err, opts) => { result = { err, opts }; }
  );
  process.env = saved;
  return result;
};

describe('corsOptionsDelegate', () => {
  it('allows a same-origin request on an unlisted LAN host in production', () => {
    const r = decide('http://192.168.1.50:3000', '192.168.1.50:3000');
    expect(r.err).toBeNull();
    expect(r.opts.origin).toBe(true);
  });

  it('allows a same-origin request on a public domain', () => {
    const r = decide('https://gifts.example.com', 'gifts.example.com');
    expect(r.opts.origin).toBe(true);
  });

  it('allows the configured GIFTY_URL origin even if Host differs (proxy rewrite)', () => {
    const r = decide('https://gifts.example.com', 'gifty:3000', { GIFTY_URL: 'https://gifts.example.com' });
    expect(r.opts.origin).toBe(true);
  });

  it('rejects a foreign origin with an error so the request never reaches a route', () => {
    const r = decide('https://evil.example', 'gifts.example.com');
    expect(r.err).toBeInstanceOf(Error);
  });

  it('rejects another app on the same host but a different port (same-site, cross-origin)', () => {
    const r = decide('http://192.168.1.50:8080', '192.168.1.50:3000');
    expect(r.err).toBeInstanceOf(Error);
  });

  it('rejects a null origin (sandboxed iframe / file://)', () => {
    const r = decide('null', 'gifts.example.com');
    expect(r.err).toBeInstanceOf(Error);
  });

  it('allows requests without an Origin header', () => {
    const r = decide(undefined, 'gifts.example.com');
    expect(r.opts.origin).toBe(true);
  });

  it('allows the dev frontend on localhost:3000 in development', () => {
    const r = decide('http://localhost:3000', 'localhost:5000', { NODE_ENV: 'development' });
    expect(r.opts.origin).toBe(true);
  });
});
