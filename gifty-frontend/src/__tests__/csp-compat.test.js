// The server's Content-Security-Policy allows scripts only from the app's
// own files (script-src 'self'): the page template must not carry inline
// scripts, and the build must not inline webpack's runtime chunk.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');

test('public/index.html has no inline script', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  expect(scripts.length).toBeGreaterThan(0);
  for (const [, attrs, body] of scripts) {
    expect(attrs).toMatch(/\bsrc=/);
    expect(body.trim()).toBe('');
  }
  expect(html).not.toMatch(/\son[a-z]+\s*=/i); // no inline event handlers
});

test('the theme script still runs before the page paints (in <head>, not deferred)', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  expect(head).toMatch(/<script src="%PUBLIC_URL%\/theme-init\.js"><\/script>/);
  expect(fs.existsSync(path.join(root, 'public', 'theme-init.js'))).toBe(true);
});

test('the build does not inline the webpack runtime chunk', () => {
  const overrides = require(path.join(root, 'config-overrides.js'));
  const InlineChunkHtmlPlugin = function InlineChunkHtmlPlugin() {};
  const config = {
    module: { rules: [] },
    resolve: {},
    plugins: [new InlineChunkHtmlPlugin(), { constructor: { name: 'Other' } }],
    optimization: {},
  };
  const result = overrides.webpack(config, 'production');
  expect(result.plugins.some((p) => p && p.constructor && p.constructor.name === 'InlineChunkHtmlPlugin')).toBe(false);
});
