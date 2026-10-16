describe('CSP directives (real helmet)', () => {
  const express = require('express');
  const request = require('supertest');

  const buildApp = (env) => {
    let app;
    jest.isolateModules(() => {
      const saved = process.env;
      process.env = { ...saved, ...env };
      const configure = require('../../middleware/securityHeadersMiddleware');
      app = express();
      configure(app);
      app.get('/', (req, res) => res.send('ok'));
      process.env = saved;
    });
    return app;
  };

  it('omits upgrade-insecure-requests for a plain-http production install', async () => {
    const res = await request(buildApp({ NODE_ENV: 'production', GIFTY_URL: 'http://192.168.1.10:3000' })).get('/');
    expect(res.headers['content-security-policy']).not.toMatch(/upgrade-insecure-requests/);
  });

  it('includes upgrade-insecure-requests when GIFTY_URL is https', async () => {
    const res = await request(buildApp({ NODE_ENV: 'production', GIFTY_URL: 'https://gifts.example.com' })).get('/');
    expect(res.headers['content-security-policy']).toMatch(/upgrade-insecure-requests/);
  });

  it('allows external https product images and same-origin connects only', async () => {
    const res = await request(buildApp({ NODE_ENV: 'production' })).get('/');
    const csp = res.headers['content-security-policy'];
    expect(csp).toMatch(/img-src 'self' data: blob: https:/);
    expect(csp).toMatch(/connect-src 'self'(;|$)/);
  });

  it('loads styles and fonts only from the app itself (Quicksand is self-hosted)', async () => {
    const csp = (await request(buildApp({ NODE_ENV: 'production' })).get('/')).headers['content-security-policy'];
    expect(csp).toMatch(/style-src 'self' 'unsafe-inline'(;|$)/);
    expect(csp).toMatch(/font-src 'self' data:(;|$)/);
  });

  it('allows the data: notification sound via media-src', async () => {
    const csp = (await request(buildApp({ NODE_ENV: 'production' })).get('/')).headers['content-security-policy'];
    expect(csp).toMatch(/media-src 'self' data:(;|$)/);
  });

  // Scripts only from the app's own files: no inline script, no eval
  it.each(['production', 'development'])('runs scripts only from the app itself (%s)', async (NODE_ENV) => {
    const csp = (await request(buildApp({ NODE_ENV })).get('/')).headers['content-security-policy'];
    expect(csp).toMatch(/script-src 'self'(;|$)/);
    expect(csp).not.toMatch(/unsafe-eval/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });
});
