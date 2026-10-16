// The one place the frontend formats money. Every amount comes from the API
// already computed; the browser only formats it (and sums a list footer in
// whole cents). Labels: Budget · Allocated · Unallocated · Spent · Left to spend.

const DASH = '—';

// Integer cents. Scaling through the decimal string avoids 1.005 * 100 =
// 100.49999…; exponent-form numbers (1e-7, 1e21) fall back to multiplication.
export function toCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  const abs = Math.abs(n);
  const s = String(abs);
  const scaled = s.includes('e') ? abs * 100 : Number(`${s}e2`);
  const cents = Math.round(scaled);
  return n < 0 && cents !== 0 ? -cents : cents;
}

const formatterFor = (currency) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' });
  } catch (e) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  }
};

const isMissing = (value) => value === null || value === undefined || value === '';

export function formatMoney(amount, currency = 'USD') {
  if (isMissing(amount)) return DASH;
  const n = Number(amount);
  if (!Number.isFinite(n)) return DASH;
  const formatter = formatterFor(currency);
  const digits = formatter.resolvedOptions().maximumFractionDigits;
  // Anything that rounds to zero at the currency's precision is zero: never "-$0.00"
  const value = Math.abs(n) < 0.5 / 10 ** digits ? 0 : n;
  return formatter.format(value);
}

export function formatLeft(left, currency) {
  if (isMissing(left)) return DASH;
  const cents = toCents(left);
  if (Number.isNaN(cents)) return DASH;
  if (cents >= 0) return `${formatMoney(left, currency)} left`;
  return `Over by ${formatMoney(-Number(left), currency)}`;
}

export function formatUnallocated(value, currency) {
  if (isMissing(value)) return DASH;
  const cents = toCents(value);
  if (Number.isNaN(cents)) return DASH;
  if (cents >= 0) return formatMoney(value, currency);
  return `Over-allocated by ${formatMoney(-Number(value), currency)}`;
}

export function formatLeftToSpend(value, currency) {
  if (isMissing(value)) return DASH;
  const cents = toCents(value);
  if (Number.isNaN(cents)) return DASH;
  if (cents >= 0) return formatMoney(value, currency);
  return `Over by ${formatMoney(-Number(value), currency)}`;
}

// `entry` is a /budgets/all recipientBudgets[i] or a /budgets/recipient view
export function budgetLeftLabel(entry, currency) {
  if (!entry || entry.status === 'no_budget') return 'No budget';
  if (entry.status === 'unlimited') return 'Unlimited';
  return formatLeft(entry.left, currency);
}

export function sumMoney(amounts) {
  let cents = 0;
  for (const amount of amounts || []) {
    const c = toCents(amount);
    if (Number.isFinite(c)) cents += c;
  }
  return cents === 0 ? 0 : cents / 100;
}

// Would buying at `price` go past `left`? `alreadyCounted` is this gift's
// price when it is already purchased (so already inside Spent).
export function wouldExceed(price, left, alreadyCounted = 0) {
  if (isMissing(left)) return false;
  if (isMissing(price)) return false;
  const priceCents = toCents(price);
  const leftCents = toCents(left);
  if (!Number.isFinite(priceCents) || !Number.isFinite(leftCents)) return false;
  const counted = toCents(alreadyCounted || 0);
  return priceCents - (Number.isFinite(counted) ? counted : 0) > leftCents;
}
