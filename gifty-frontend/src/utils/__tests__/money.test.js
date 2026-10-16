import {
  toCents,
  formatMoney,
  formatLeft,
  formatUnallocated,
  formatLeftToSpend,
  budgetLeftLabel,
  sumMoney,
  wouldExceed
} from '../money';

describe('toCents', () => {
  test('rounds to whole cents without float drift', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1.005)).toBe(101);
    expect(toCents(34.999)).toBe(3500);
    expect(toCents('12.34')).toBe(1234);
  });

  test('keeps the sign and never returns -0', () => {
    expect(toCents(-5.02)).toBe(-502);
    expect(Object.is(toCents(-0.001), 0)).toBe(true);
  });

  test('handles exponent-form numbers and garbage', () => {
    expect(toCents(1e-7)).toBe(0);
    expect(toCents(1e21)).toBe(1e23);
    expect(Number.isNaN(toCents('abc'))).toBe(true);
    expect(Number.isNaN(toCents(undefined))).toBe(true);
  });
});

describe('formatMoney', () => {
  test('formats with the currency and its own decimals', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50');
    expect(formatMoney(10, 'EUR')).toBe('€10.00');
    expect(formatMoney(1234.56, 'JPY')).toBe('¥1,235');
  });

  test('null, undefined, empty and non-finite render as a dash, not $0.00', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoney('')).toBe('—');
    expect(formatMoney(NaN)).toBe('—');
    expect(formatMoney(Infinity)).toBe('—');
  });

  test('zero is a real amount', () => {
    expect(formatMoney(0)).toBe('$0.00');
  });

  test('never renders -$0.00', () => {
    expect(formatMoney(-0)).toBe('$0.00');
    expect(formatMoney(-0.004)).toBe('$0.00');
    expect(formatMoney(-0.4, 'JPY')).toBe('¥0');
  });

  test('negative amounts keep their sign', () => {
    expect(formatMoney(-5)).toBe('-$5.00');
  });

  test('an invalid currency code falls back to USD', () => {
    expect(formatMoney(5, 'INVALID')).toBe('$5.00');
  });
});

describe('formatLeft', () => {
  test('positive and zero are "left"', () => {
    expect(formatLeft(30)).toBe('$30.00 left');
    expect(formatLeft(0)).toBe('$0.00 left');
    expect(formatLeft(5.02, 'EUR')).toBe('€5.02 left');
  });

  test('negative is "Over by" and never clamped', () => {
    expect(formatLeft(-5)).toBe('Over by $5.00');
    expect(formatLeft(-0.01)).toBe('Over by $0.01');
  });

  test('missing is a dash', () => {
    expect(formatLeft(null)).toBe('—');
    expect(formatLeft(undefined)).toBe('—');
  });
});

describe('formatUnallocated and formatLeftToSpend', () => {
  test('positive values are plain amounts', () => {
    expect(formatUnallocated(400)).toBe('$400.00');
    expect(formatLeftToSpend(670)).toBe('$670.00');
  });

  test('negative values are spelled out, unclamped', () => {
    expect(formatUnallocated(-50)).toBe('Over-allocated by $50.00');
    expect(formatLeftToSpend(-20)).toBe('Over by $20.00');
  });

  test('null is a dash', () => {
    expect(formatUnallocated(null)).toBe('—');
    expect(formatLeftToSpend(null)).toBe('—');
  });
});

describe('budgetLeftLabel', () => {
  test('no entry or no_budget is the word "No budget"', () => {
    expect(budgetLeftLabel(null)).toBe('No budget');
    expect(budgetLeftLabel(undefined)).toBe('No budget');
    expect(budgetLeftLabel({ status: 'no_budget', left: null })).toBe('No budget');
  });

  test('unlimited is the word "Unlimited"', () => {
    expect(budgetLeftLabel({ status: 'unlimited', left: null })).toBe('Unlimited');
  });

  test('limited budgets show left or over', () => {
    expect(budgetLeftLabel({ status: 'within', left: 60 })).toBe('$60.00 left');
    expect(budgetLeftLabel({ status: 'over', left: -5 }, 'USD')).toBe('Over by $5.00');
  });
});

describe('sumMoney', () => {
  test('sums in whole cents', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney([9.99, 34.99, 5.02])).toBe(50);
  });

  test('skips non-finite values and treats null as zero', () => {
    expect(sumMoney([null, 'invalid', 25.75, undefined])).toBe(25.75);
    expect(sumMoney([])).toBe(0);
  });
});

describe('wouldExceed', () => {
  test('compares in cents', () => {
    expect(wouldExceed(5.02, 5.02)).toBe(false);
    expect(wouldExceed(5.03, 5.02)).toBe(true);
    expect(wouldExceed(150, 100)).toBe(true);
  });

  test('no limit never exceeds', () => {
    expect(wouldExceed(1000, null)).toBe(false);
    expect(wouldExceed(1000, undefined)).toBe(false);
  });

  test('a non-number price never exceeds', () => {
    expect(wouldExceed('', 10)).toBe(false);
    expect(wouldExceed('abc', 10)).toBe(false);
  });

  test('an already-counted price is not counted twice', () => {
    // Editing a purchased $60 gift to $70 with $40 left (Spent already includes the $60)
    expect(wouldExceed(70, 40, 60)).toBe(false);
    expect(wouldExceed(110, 40, 60)).toBe(true);
  });
});
