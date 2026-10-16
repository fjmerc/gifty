// Prices the model writes as text are read only when they are one clear
// amount; anything ambiguous is no amount (the range midpoint is used, or
// the suggestion is dropped) rather than digits glued together.
const { toAmount, readSuggestionPrice } = require('../../utils/suggestionPrice');

describe('reading an amount the model wrote', () => {
  it.each([
    ['€40-60', null],
    ['12.50-15.00', null],
    ['-5', null],
    [-5, null],
    ['29,99', 29.99],
    ['€ 35', 35],
    ['12.50', 12.5],
    ['1,299.99', 1299.99],
    ['about thirty', null],
    ['1.299,99', 1299.99],
    ['€ 2.500,00', 2500],
    ['2.500', null],
    ['1.299', null],
    [42, 42]
  ])('%p -> %p', (input, expected) => {
    expect(toAmount(input)).toBe(expected);
  });

  it('a range written as text falls back to nothing, not 4060', () => {
    expect(readSuggestionPrice('€40-60', undefined, undefined).estimatedPrice).toBeNull();
    expect(readSuggestionPrice('€40-60', 40, 60).estimatedPrice).toBe(50);
  });

  it('an estimate of 0 with a real range is no estimate: the range middle is used', () => {
    expect(readSuggestionPrice(0, 20, 40).estimatedPrice).toBe(30);
  });

  it('an estimate of 0 with no range stays a free gift', () => {
    expect(readSuggestionPrice(0, undefined, undefined).estimatedPrice).toBe(0);
  });
});
