// A recipient's fallback picture: their initials, drawn in the browser so
// no name is sent to an outside avatar service.

// Same hues and order as before (so nobody's colour family changes), each
// dark enough for white initials at 4.5:1 (teal, orange, amber and green
// were 2.9-3.7:1)
const COLOURS = ['#0f766e', '#2563eb', '#7c3aed', '#db2777', '#c2410c', '#a16207', '#15803d', '#475569'];
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (text) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

const initial = (name) => (name ? Array.from(String(name).trim())[0] || '' : '').toUpperCase();

/**
 * @param {string} firstName
 * @param {string} lastName
 * @returns {string} An SVG data URI with the initials on a colour chosen by name
 */
export function initialsAvatar(firstName, lastName) {
  const initials = `${initial(firstName)}${initial(lastName)}` || '?';
  const key = `${firstName || ''} ${lastName || ''}`;
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  const colour = COLOURS[hash % COLOURS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">`
    + `<rect width="128" height="128" fill="${colour}"/>`
    + `<text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="sans-serif" font-size="52" fill="#fff">${escape(initials)}</text>`
    + '</svg>';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
