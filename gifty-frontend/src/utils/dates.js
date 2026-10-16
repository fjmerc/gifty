// Two kinds of dates reach the browser:
//  - date-only fields (event dates, birthdates, budget start/end) stored as
//    UTC midnight: show their stored calendar day (UTC fields), never the
//    local day before;
//  - instants (purchaseDate, createdAt): show the local calendar day.
const DASH = '—';
const pad = (n) => String(n).padStart(2, '0');
const DATE_ONLY_PREFIX = /^\d{4}-\d{2}-\d{2}/;

const toValidDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function todayLocalISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function localDateISO(value) {
  const d = toValidDate(value);
  return d ? todayLocalISO(d) : '';
}

export function dateOnlyISO(value) {
  if (typeof value === 'string' && DATE_ONLY_PREFIX.test(value)) {
    const day = value.slice(0, 10);
    return toValidDate(day) ? day : '';
  }
  const d = toValidDate(value);
  if (!d) return '';
  if (typeof value === 'string') {
    // Non-ISO strings ('1/5/2024') parse as local midnight: read local fields.
    return todayLocalISO(d);
  }
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function formatDateOnly(value, locale) {
  const iso = dateOnlyISO(value);
  if (!iso) return DASH;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale);
}

// A date-only value's calendar day as a local-midnight Date, for comparing
// with local "today" and grouping by local month. Invalid Date if unparseable.
export function eventDay(value) {
  const iso = dateOnlyISO(value);
  if (!iso) return new Date(NaN);
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatInstantDate(value, locale) {
  const d = toValidDate(value);
  return d ? d.toLocaleDateString(locale) : DASH;
}
