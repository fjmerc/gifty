const { toCents, fromCents, roundMoney, formatMoney } = require('../../utils/money');

describe('utils/money', () => {
  describe('toCents', () => {
    it('adds 0.1 and 0.2 to exactly 30 cents', () => {
      expect(toCents(0.1) + toCents(0.2)).toBe(30);
      expect(toCents(0.1 + 0.2)).toBe(30);
    });

    it('rounds half a cent up without binary drift', () => {
      expect(toCents(1.005)).toBe(101);
      expect(toCents(34.995)).toBe(3500);
      expect(toCents('9.99')).toBe(999);
      expect(toCents(34.99)).toBe(3499);
    });

    it('rounds negatives symmetrically and never returns -0', () => {
      expect(toCents(-1.005)).toBe(-101);
      expect(Object.is(toCents(-0.001), 0)).toBe(true);
    });

    it('handles exponent-form numbers', () => {
      expect(toCents(1e-7)).toBe(0);
      expect(toCents(1e21)).toBe(1e23);
    });

    it('returns NaN for anything that is not a finite number', () => {
      expect(toCents('abc')).toBeNaN();
      expect(toCents(undefined)).toBeNaN();
      expect(toCents(Infinity)).toBeNaN();
    });
  });

  describe('fromCents', () => {
    it('converts integer cents to major units', () => {
      expect(fromCents(30)).toBe(0.3);
      expect(fromCents(-501)).toBe(-5.01);
      expect(Object.is(fromCents(-0), 0)).toBe(true);
    });
  });

  describe('roundMoney', () => {
    it('rounds to whole cents', () => {
      expect(roundMoney(34.999)).toBe(35);
      expect(roundMoney('12.345')).toBe(12.35);
      expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    });

    it('passes empty and non-numeric values through for the validators', () => {
      expect(roundMoney(null)).toBeNull();
      expect(roundMoney(undefined)).toBeUndefined();
      expect(roundMoney('')).toBe('');
      expect(roundMoney('abc')).toBe('abc');
    });
  });

  describe('formatMoney', () => {
    it('formats in the given currency', () => {
      expect(formatMoney(1234.5)).toBe('$1,234.50');
      expect(formatMoney(5, 'EUR')).toBe('€5.00');
    });

    it('falls back to USD for an unknown currency and never prints -$0.00', () => {
      expect(formatMoney(5, 'not-a-currency')).toBe('$5.00');
      expect(formatMoney(-0.001)).toBe('$0.00');
    });
  });
});
