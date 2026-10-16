// "Already chosen" repeats are judged on whole words, never on letters inside
// another word: a saved "Ring" must not knock out a "Bouldering Crash Pad".
const { isSimilarToAny } = require('../../utils/giftSimilarity');

describe('gift name similarity', () => {
  it.each([
    ['Ring', 'Bouldering Crash Pad'],
    ['Lock', 'Clock'],
    ['Book', 'Cookbook'],
    ['Art', 'Smart watch'],
    ['Pen', 'Pendant']
  ])('keeps "%s" apart from "%s"', (chosen, suggested) => {
    expect(isSimilarToAny(suggested, [chosen])).toBe(false);
  });

  it('treats the exact name as a repeat, whatever the case and punctuation', () => {
    expect(isSimilarToAny('hario v60 pour-over kit!', ['Hario V60 Pour-Over Kit'])).toBe(true);
  });

  it('treats a longer name containing every word of a 2-word name as a repeat', () => {
    expect(isSimilarToAny('Hario V60 Pour-Over Kit', ['Hario V60'])).toBe(true);
  });

  it('does not let a short one-word name swallow longer names', () => {
    expect(isSimilarToAny('Bike Lock Holder', ['Lock'])).toBe(false);
  });

  it('a one-word name of 5+ letters inside a longer name is a repeat', () => {
    expect(isSimilarToAny('Personalised Chessboard', ['Chessboard'])).toBe(true);
  });
});
