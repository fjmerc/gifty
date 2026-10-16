// The words of a gift name: lowercase, punctuation stripped ("Pour-Over" is
// "pour" and "over"), letters of any script kept
const words = (name) => String(name || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * Name similarity between two gifts, 0 to 1, judged on whole words only (a
 * saved "Ring" is not inside "Bouldering"):
 * - the same words: 1
 * - every word of the shorter name inside the longer one: 0.8, but only when
 *   the shorter name is specific enough (2+ words, or one word of 5+ letters),
 *   so "Lock" does not swallow "Bike Lock Holder"
 * - otherwise the share of words they have in common
 */
function nameSimilarity(a, b) {
  const w1 = [...new Set(words(a))];
  const w2 = [...new Set(words(b))];
  if (w1.length === 0 || w2.length === 0) return 0;
  const [shorter, longer] = w1.length <= w2.length ? [w1, w2] : [w2, w1];
  const longerSet = new Set(longer);
  const common = shorter.filter((word) => longerSet.has(word)).length;
  if (common === shorter.length && shorter.length === longer.length) return 1;
  const specific = shorter.length >= 2 || shorter.join('').length >= 5;
  if (common === shorter.length && specific) return 0.8;
  return common / longer.length;
}

// True when `name` is the same as, or similar to, any of `names`
const isSimilarToAny = (name, names, threshold = 0.8) =>
  names.some((other) => nameSimilarity(name, other) >= threshold);

module.exports = { nameSimilarity, isSimilarToAny };
