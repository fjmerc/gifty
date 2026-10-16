// Library gifts in hybrid suggestions, on a real library: most scraped items
// have no price (0-0) and would become free gifts, names carry list
// numbering ("22. Gift Basket"), and the broader query ignored age (a
// 34-year-old got a 12th-birthday set). Real MongoDB; the AI is stubbed.
const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');

jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../services/openaiService', () => ({
  generateGiftSuggestions: jest.fn().mockResolvedValue([])
}));

const GiftLibrary = require('../../models/GiftLibrary');
const hybrid = require('../../services/hybridSuggestionService');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-hybrid-library-${process.pid}`;
const adult = { age: 34, gender: 'female', interests: ['cooking'], occasion: 'Birthday', budget: 100 };

const item = (name, overrides = {}) => ({
  name,
  description: `${name} description`,
  priceRange: { min: 20, max: 40 },
  categories: ['cooking'],
  tags: ['cooking'],
  demographics: { ageRange: [18, 80], gender: ['female'], interests: ['cooking'] },
  occasions: ['Birthday'],
  status: 'active',
  popularityScore: 50,
  ...overrides
});

beforeAll(() => mongoose.connect(TEST_DB_URI));
beforeEach(() => GiftLibrary.deleteMany({}));
afterAll(() => teardownTestDB());

describe('library gifts offered by hybrid suggestions', () => {
  it('never offers a library gift without a positive price', async () => {
    await GiftLibrary.insertMany([
      item('Unpriced pan', { priceRange: { min: 0, max: 0 } }),
      item('No price at all', { priceRange: undefined }),
      item('Unpriced, broad match', { priceRange: { min: 0, max: 0 }, demographics: undefined }),
      item('Up to 30', { priceRange: { min: 0, max: 30 } }),
      item('Knife set')
    ]);

    const names = (await hybrid.getDiscoveredGifts(adult, 100)).map((g) => g.name);

    expect(names.sort()).toEqual(['Knife set', 'Up to 30']);
  });

  it('shows names without list numbering', async () => {
    await GiftLibrary.insertMany([
      item('22. Gift Basket'),
      item('3) Spice rack'),
      item('  7. Apron'),
      item('2024 Cookbook of the year')
    ]);

    const names = (await hybrid.getDiscoveredGifts(adult, 100)).map((g) => g.name);

    expect(names.sort()).toEqual(['2024 Cookbook of the year', 'Apron', 'Gift Basket', 'Spice rack']);
  });

  it('respects age in the broader search too, but keeps gifts with no age range', async () => {
    await GiftLibrary.insertMany([
      // Only the broader query (categories/tags) can find these
      item('12th Birthday Gift Set for Girls', { demographics: { ageRange: [10, 14], interests: [] } }),
      item('Grown-up cooking class', { demographics: { ageRange: [25, 60], interests: [] } }),
      item('Cooking timer', { demographics: undefined })
    ]);

    const names = (await hybrid.getDiscoveredGifts(adult, 100)).map((g) => g.name);

    expect(names.sort()).toEqual(['Cooking timer', 'Grown-up cooking class']);
  });

  it('a generation on such a library offers only priced gifts with clean names', async () => {
    await GiftLibrary.insertMany([
      ...Array.from({ length: 6 }, (_, i) => item(`${i + 1}. Free thing ${i}`, { priceRange: { min: 0, max: 0 } })),
      item('1. Knife set'),
      item('2. Dutch oven', { priceRange: { min: 60, max: 90 } }),
      item('3. Salt block', { priceRange: { min: 15, max: 25 } })
    ]);

    const suggestions = await hybrid.generateHybridSuggestions(adult, { count: 5, budget: 100 });

    expect(suggestions.length).toBeGreaterThan(0);
    suggestions.forEach((s) => {
      expect(s.name).not.toMatch(/^\s*\d+[.)]/);
      expect(s.estimatedPrice).toBeGreaterThan(0);
    });
  });
});
