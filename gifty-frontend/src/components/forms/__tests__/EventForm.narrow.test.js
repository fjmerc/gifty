// The Add Event form at 320 px: the Frequency / Recur Until pair (and
// Recipient / Event Type) sat side by side, clipping Recur Until and
// truncating the selects. jsdom has no layout, so this reads the
// stylesheet; the real check is a browser at 320 px.
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../css/EventForm.module.css'), 'utf8');
const rule = (selector, source = css) => {
  const start = source.indexOf(`${selector} {`);
  return start === -1 ? '' : source.slice(start, source.indexOf('}', start));
};
const narrowBlocks = () => [...css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)\s*{([\s\S]*?)\n}/g)]
  .filter(([, width]) => Number(width) >= 320)
  .map(([, , body]) => body);

test('the two-column rows become one column on a narrow screen', () => {
  const stacked = narrowBlocks().some((body) => /grid-template-columns:\s*1fr\s*;/.test(rule('.two-column', body)));
  expect(stacked).toBe(true);
});

test('fields can shrink to their column instead of overflowing it', () => {
  expect(rule('.form-group')).toMatch(/min-width:\s*0/);
  const fields = rule('.form-group input,\n.form-group select');
  expect(fields).toMatch(/min-width:\s*0/);
  expect(fields).toMatch(/max-width:\s*100%/);
  expect(fields).toMatch(/box-sizing:\s*border-box/);
});
