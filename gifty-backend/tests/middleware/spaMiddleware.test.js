const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { mountSpa } = require('../../middleware/spaMiddleware');

describe('mountSpa', () => {
  let dir;
  let app;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gifty-spa-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<html>gifty</html>');
    fs.mkdirSync(path.join(dir, 'static', 'js'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'static', 'js', 'main.abc123.js'), 'console.log(1)');
    app = express();
    app.get('/api/ok', (req, res) => res.json({ ok: true }));
    app.use('/api/*', (req, res) => res.status(404).json({ message: 'Not found' }));
    expect(mountSpa(app, dir)).toBe(true);
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('unknown /api path returns JSON 404, not HTML', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('client-side route returns index.html with no-cache', async () => {
    const res = await request(app).get('/recipients/123');
    expect(res.status).toBe(200);
    expect(res.text).toContain('gifty');
    expect(res.headers['cache-control']).toMatch(/no-cache/);
  });

  it('hashed static asset is cached immutably', async () => {
    const res = await request(app).get('/static/js/main.abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/immutable/);
  });

  it('returns false and mounts nothing without index.html', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'gifty-empty-'));
    expect(mountSpa(express(), empty)).toBe(false);
    fs.rmSync(empty, { recursive: true, force: true });
  });
});
