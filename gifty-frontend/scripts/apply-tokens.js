#!/usr/bin/env node
/*
 * Rewrites hard-coded colors, font sizes, radii and shadows in src/ into the
 * design tokens defined in src/index.css, using scripts/token-map.json.
 *
 *   node scripts/apply-tokens.js            dry run: print what would change
 *   node scripts/apply-tokens.js --write    apply the changes
 *   node scripts/apply-tokens.js --check    fail if a var(--x) used in src/ is
 *                                           not defined, or the dark theme
 *                                           misses a light color/shadow token
 *   add --report to list every value left untouched (the one-offs)
 *
 * Idempotent: values already written as var(--...) are not touched again.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const TOKENS_FILE = path.join(SRC, 'index.css');
const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'token-map.json'), 'utf8'));

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');
const CHECK = args.has('--check');
const REPORT = args.has('--report');

const COLOR_PROPS = new Set(['color', 'fill', 'stroke', 'caret-color', 'text-decoration-color']);
const BACKGROUND_PROPS = new Set(['background', 'background-color', 'background-image', 'accent-color']);
const SHADOW_PROPS = new Set(['box-shadow', 'text-shadow']);
const RADIUS_PROPS = /^border(-(top|bottom)-(left|right))?-radius$/;

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const NAMED_RE = /(?<![\w-])(white|black|gr[ae]y|red|green|blue|orange|yellow|gold|silver|navy|teal|lightgr[ae]y|darkgr[ae]y)(?![\w-])/gi;
const RGBA_RE = /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)/g;

const unmapped = {};
function note(kind, value, where) {
  const key = `${kind}  ${value}`;
  (unmapped[key] = unmapped[key] || []).push(where);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === '__mocks__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function normHex(h) {
  let x = h.toLowerCase().slice(1);
  if (x.length === 3 || x.length === 4) x = x.split('').map((c) => c + c).join('');
  return `#${x}`;
}
function normRgba(s) {
  return s.replace(/\s+/g, '').toLowerCase();
}

function propClass(prop) {
  if (COLOR_PROPS.has(prop)) return 'color';
  if (BACKGROUND_PROPS.has(prop)) return 'background';
  if (prop.startsWith('border') || prop.startsWith('outline') || prop === 'column-rule') return 'border';
  return null;
}

function lookupColor(key, cls) {
  if (!Object.prototype.hasOwnProperty.call(MAP.colors, key)) return undefined; // unknown
  const spec = MAP.colors[key];
  if (spec === null || typeof spec === 'string') return spec;
  if (Object.prototype.hasOwnProperty.call(spec, cls)) return spec[cls];
  return Object.prototype.hasOwnProperty.call(spec, 'default') ? spec.default : null;
}

function replaceColors(value, cls, where) {
  const sub = (raw, key) => {
    const token = lookupColor(key, cls);
    if (token) return `var(--color-${token})`;
    note(token === null ? 'one-off color' : 'unmapped color', `${key} (${cls})`, where);
    return raw;
  };
  return value
    .replace(RGBA_RE, (m) => sub(m, normRgba(m)))
    .replace(HEX_RE, (m) => sub(m, normHex(m)))
    .replace(NAMED_RE, (m) => {
      const hex = MAP.namedColors[m.toLowerCase()];
      if (hex) return sub(m, hex);
      note('named color', `${m} (${cls})`, where);
      return m;
    });
}

const TEAL = new Set(MAP.shadowTealRgb);
function shadowToken(value) {
  const v = value.trim();
  const m = v.match(/^0(?:px)?\s+(\d+)px\s+(\d+)px\s+rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
  if (!m) return null;
  const [, y, blur, r, g, b, a] = m;
  const yN = Number(y);
  if (yN === 0 || Number(blur) === 0) return null;
  const rgb = `${r},${g},${b}`;
  const black = rgb === '0,0,0';
  if (!(black && Number(a) <= 0.2) && !TEAL.has(rgb)) return null;
  if (yN <= 2) return 'rest';
  if (yN <= 6) return 'raised';
  return 'overlay';
}

function splitImportant(value) {
  const m = value.match(/^(.*?)(\s*!important)?\s*$/s);
  return [m[1], m[2] || ''];
}

function transformDecl(prop, rawValue, where) {
  const [value, important] = splitImportant(rawValue);
  if (/var\(--/.test(value) && !/#|rgba?\(/.test(value)) return rawValue;

  const compact = value.replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ').trim();
  const whole = MAP.wholeValues[prop];
  if (whole && whole[compact.toLowerCase()]) return whole[compact.toLowerCase()] + important;

  if (SHADOW_PROPS.has(prop)) {
    if (prop === 'box-shadow') {
      const t = shadowToken(value);
      if (t) return `var(--shadow-${t})${important}`;
      if (!/^(none|inherit|initial|unset)$/.test(compact)) note('one-off shadow', compact, where);
    }
    return rawValue;
  }
  if (RADIUS_PROPS.test(prop)) {
    const t = MAP.radii[compact];
    if (t) return `var(--radius-${t})${important}`;
    if (!/^(0|inherit)$|^var\(/.test(compact)) note('one-off radius', compact, where);
    return rawValue;
  }
  if (prop === 'font-size') {
    const t = MAP.fontSizes[compact];
    if (t) return `var(--text-${t})${important}`;
    if (!/^(inherit|var\()/.test(compact)) note('one-off font-size', compact, where);
    return rawValue;
  }
  const cls = propClass(prop);
  if (!cls) return rawValue;
  if (/url\(/.test(value)) return rawValue; // data URIs keep their literal colors
  return replaceColors(value, cls, where) + important;
}

function transformCss(text, file) {
  let changes = 0;
  // Strip nothing: comments are skipped by only touching known property names.
  const out = text.replace(
    /(^|[;{\s])([a-zA-Z-]+)(\s*:\s*)([^;{}]+?)(\s*)(?=;|\})/g,
    (all, lead, prop, colon, value, trail, offset) => {
      const p = prop.toLowerCase();
      const known = propClass(p) || SHADOW_PROPS.has(p) || RADIUS_PROPS.test(p) || p === 'font-size';
      if (!known) return all;
      const line = text.slice(0, offset).split('\n').length;
      const next = transformDecl(p, value, `${path.relative(ROOT, file)}:${line}`);
      if (next !== value) changes += 1;
      return lead + prop + colon + next + trail;
    },
  );
  return { out, changes };
}

// --- JS: style={{ ... }} objects and listed extra objects ------------------
const JS_PROP = {
  color: 'color',
  fill: 'color',
  stroke: 'color',
  background: 'background',
  backgroundColor: 'background',
};
function jsClass(key) {
  if (JS_PROP[key]) return JS_PROP[key];
  if (/^(border|outline)/.test(key)) return 'border';
  return null;
}

function balancedEnd(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function rewriteJsObject(chunk, where) {
  let changes = 0;
  const out = chunk.replace(
    /([A-Za-z]+)(\s*:\s*)((?:[^,{}\n]*?))(?=\s*[,}\n])/g,
    (all, key, colon, value) => {
      const cls = jsClass(key);
      if (!cls || !/['"]/.test(value)) return all;
      const next = value.replace(/(['"])(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))\1/g, (q, quote, color) => {
        const k = color.startsWith('#') ? normHex(color) : normRgba(color);
        const token = lookupColor(k, cls);
        if (token) {
          changes += 1;
          return `${quote}var(--color-${token})${quote}`;
        }
        note(token === null ? 'one-off color (js)' : 'unmapped color (js)', `${k} (${cls})`, where);
        return q;
      });
      return key + colon + next;
    },
  );
  return { out, changes };
}

function transformJs(text, file) {
  const rel = path.relative(ROOT, file);
  if (MAP.js.skipFiles.includes(rel)) return { out: text, changes: 0 };
  const spans = [];
  const re = /style=\{\{/g;
  let m;
  while ((m = re.exec(text))) {
    const open = m.index + 'style={'.length;
    spans.push([open, balancedEnd(text, open)]);
  }
  for (const extra of MAP.js.extraObjects.filter((e) => e.file === rel)) {
    const idx = text.indexOf(extra.marker);
    if (idx >= 0) {
      const open = idx + extra.marker.length - 1;
      spans.push([open, balancedEnd(text, open)]);
    }
  }
  if (!spans.length) return { out: text, changes: 0 };
  spans.sort((a, b) => b[0] - a[0]); // rewrite from the end so offsets stay valid
  let out = text;
  let changes = 0;
  for (const [start, end] of spans) {
    if (end < 0) continue;
    const line = text.slice(0, start).split('\n').length;
    const r = rewriteJsObject(out.slice(start, end + 1), `${rel}:${line}`);
    out = out.slice(0, start) + r.out + out.slice(end + 1);
    changes += r.changes;
  }
  return { out, changes };
}

// --- check mode ------------------------------------------------------------
function definedTokens(css, selector) {
  const start = css.indexOf(selector);
  if (start < 0) return new Set();
  const block = css.slice(css.indexOf('{', start), balancedEnd(css, css.indexOf('{', start)));
  return new Set([...block.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((x) => x[1]));
}

function check(files) {
  const css = fs.readFileSync(TOKENS_FILE, 'utf8');
  const light = definedTokens(css, ':root {');
  const dark = definedTokens(css, ':root[data-theme="dark"]');
  const problems = [];
  for (const t of light) {
    if (/^--(color|shadow)-/.test(t) && !dark.has(t)) problems.push(`dark theme misses ${t}`);
  }
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const [, name, fallback] of text.matchAll(/var\((--[a-zA-Z0-9-]+)\s*(,)?/g)) {
      if (!light.has(name) && !fallback) problems.push(`${path.relative(ROOT, f)}: ${name} is not defined`);
    }
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`token check OK: ${light.size} tokens, ${files.length} files scanned`);
}

// --- main ------------------------------------------------------------------
const files = walk(SRC).filter((f) => /\.(css|js|jsx)$/.test(f) && !/\.test\.jsx?$/.test(f));
if (CHECK) {
  check(files);
  process.exit(0);
}

let total = 0;
for (const file of files) {
  if (file === TOKENS_FILE) continue;
  const text = fs.readFileSync(file, 'utf8');
  const { out, changes } = file.endsWith('.css') ? transformCss(text, file) : transformJs(text, file);
  if (changes) {
    total += changes;
    console.log(`${String(changes).padStart(4)}  ${path.relative(ROOT, file)}`);
    if (WRITE) fs.writeFileSync(file, out);
  }
}
console.log(`${WRITE ? 'rewrote' : 'would rewrite'} ${total} declarations`);
if (REPORT) {
  console.log('\nLeft as is:');
  for (const [k, where] of Object.entries(unmapped).sort()) {
    console.log(`${String(where.length).padStart(4)}  ${k}   e.g. ${where.slice(0, 2).join(', ')}`);
  }
}
