// The instance time zone decides which year and month a purchase belongs to.
// Node's local time follows process.env.TZ (also when changed at runtime), so
// local-time Date construction and Mongo's `timezone` option agree.
const getTimeZone = () =>
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

// 'YYYY-MM-DD' → 12:00 on that calendar day in the instance time zone. Noon
// survives DST changes and browser/server offset differences. Returns null
// for any other value or an impossible date such as 2031-02-30.
const parseDateOnly = (value) => {
  if (typeof value !== 'string') return null;
  const match = DATE_ONLY.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
};

const yearInTimeZone = (date) =>
  Number(new Intl.DateTimeFormat('en-US', { timeZone: getTimeZone(), year: 'numeric' }).format(new Date(date)));

// Today in the instance time zone, as the UTC-midnight value that calendar-day
// fields (event dates, birthdates) are stored as.
const todayAsDateOnly = (now = new Date()) =>
  new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

module.exports = { getTimeZone, parseDateOnly, yearInTimeZone, todayAsDateOnly };
