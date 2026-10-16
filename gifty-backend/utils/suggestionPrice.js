const { roundMoney } = require('./money');

// One amount written as text: "12.50", "€ 35", "29,99" (decimal comma),
// "1,299.99" (thousands commas), "1.299,99" (thousands dots). More than one number ("€40-60"), a minus
// sign or anything unclear is no amount, never digits glued together.
const textAmount = (text) => {
  const tokens = text.match(/\d[\d.,]*/g) || [];
  if (tokens.length !== 1) return NaN;
  if (/-\s*$/.test(text.slice(0, text.indexOf(tokens[0])))) return NaN; // negative
  let token = tokens[0].replace(/[.,]$/, '');
  if (/^\d+,\d{1,2}$/.test(token)) token = token.replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(token)) token = token.replace(/,/g, '');
  else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(token)) token = token.replace(/\./g, '').replace(',', '.');
  else if (/^\d+\.\d{3}$/.test(token)) return NaN; // "2.500": 2.5 or 2500? unclear
  return /^\d+(\.\d+)?$/.test(token) ? parseFloat(token) : NaN;
};

// An amount the model wrote: a number, or a string with one clear amount.
// Anything else (words, ranges, negatives, NaN) is no amount at all.
const toAmount = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : textAmount(String(value));
  return Number.isFinite(number) && number >= 0 ? roundMoney(number) : null;
};

/**
 * The price of an AI suggestion: the model's estimatedPrice, else the middle
 * of its price range, else null (the suggestion is then dropped). There is
 * no constant default price.
 * @returns {{ estimatedPrice: Number|null, priceRange: {min, max}|undefined }}
 */
const readSuggestionPrice = (estimatedPrice, rangeMin, rangeMax) => {
  const min = toAmount(rangeMin);
  const max = toAmount(rangeMax);
  let price = toAmount(estimatedPrice);
  // 0 next to a real range is a missing estimate, not a free gift
  if (price === 0 && ((min !== null && min > 0) || (max !== null && max > 0))) price = null;
  if (price === null) {
    if (min !== null && max !== null) price = roundMoney((min + max) / 2);
    else price = min ?? max;
  }
  const priceRange = min !== null || max !== null
    ? { min: min ?? price, max: max ?? price }
    : (price !== null ? { min: price, max: price } : undefined);
  return { estimatedPrice: price, priceRange };
};

module.exports = { toAmount, readSuggestionPrice };
