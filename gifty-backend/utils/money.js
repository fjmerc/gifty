// Whole-cent money arithmetic. Every sum and comparison of money runs on
// integer cents; amounts leave the server in major units with ≤ 2 decimals.

// Integer cents. Scaling through the decimal string avoids binary drift:
// 1.005 * 100 is 100.49999…, but Number('1.005e2') is exactly 100.5.
const toCents = (value) => {
  const n = Number(value);
  if (value === null || value === '' || !Number.isFinite(n)) return NaN;
  const abs = Math.abs(n);
  const text = String(abs);
  const scaled = text.includes('e') ? abs * 100 : Number(`${text}e2`);
  const cents = Math.round(scaled);
  return n < 0 && cents !== 0 ? -cents : cents;
};

const fromCents = (cents) => (cents === 0 ? 0 : cents / 100);

// Mongoose setter: 34.999 → 35. Empty and non-numeric values pass through so
// `required` and the Number cast can still reject them.
const roundMoney = (value) => {
  if (value === null || value === undefined || value === '') return value;
  const cents = toCents(value);
  return Number.isNaN(cents) ? value : fromCents(cents);
};

const formatMoney = (amount, currency = 'USD') => {
  const cents = toCents(amount);
  const value = Number.isNaN(cents) ? 0 : fromCents(cents);
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch (error) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }
};

module.exports = { toCents, fromCents, roundMoney, formatMoney };
