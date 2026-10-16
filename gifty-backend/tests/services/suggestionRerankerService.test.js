// tests/services/suggestionRerankerService.test.js
// Pure-function tests for the suggestion re-ranker. No DB, no network.

describe('suggestionRerankerService', () => {
  let reranker;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.AI_RERANKER_ENABLED;
    reranker = require('../../services/suggestionRerankerService');
  });

  const makeCandidate = (overrides = {}) => ({
    name: 'Some Gift',
    description: 'A gift',
    category: 'Other',
    tags: [],
    estimatedPrice: 50,
    relevanceScore: 60,
    ...overrides,
  });

  describe('rerank', () => {
    it('returns empty array for empty input', () => {
      expect(reranker.rerank([], { finalCount: 5 })).toEqual([]);
    });

    it('returns input unchanged when fewer candidates than finalCount', () => {
      const c = [makeCandidate({ name: 'A' }), makeCandidate({ name: 'B' })];
      const result = reranker.rerank(c, { finalCount: 5 });
      expect(result).toHaveLength(2);
      expect(result.every((r) => typeof r.rerankScore === 'number')).toBe(true);
    });

    it('respects finalCount when more candidates available', () => {
      const c = Array.from({ length: 10 }, (_, i) =>
        makeCandidate({ name: `Gift ${i}`, category: `Cat${i}` })
      );
      const result = reranker.rerank(c, { finalCount: 4 });
      expect(result).toHaveLength(4);
    });

    it('prefers candidates within budget', () => {
      const c = [
        makeCandidate({ name: 'Cheap', estimatedPrice: 10, relevanceScore: 60 }),
        makeCandidate({ name: 'InBudget', estimatedPrice: 50, relevanceScore: 60 }),
        makeCandidate({ name: 'WayOver', estimatedPrice: 500, relevanceScore: 60 }),
      ];
      const result = reranker.rerank(c, {
        recipient: { minimumPriceBudget: 30, maximumPriceBudget: 75 },
        finalCount: 1,
      });
      expect(result[0].name).toBe('InBudget');
    });

    it('penalizes candidates similar to negative feedback', () => {
      const c = [
        makeCandidate({ name: 'Similar Mug', category: 'Home', tags: ['mug', 'ceramic'], relevanceScore: 70 }),
        makeCandidate({ name: 'Different Item', category: 'Books', tags: ['reading'], relevanceScore: 60 }),
      ];
      const result = reranker.rerank(c, {
        negativeFeedback: [{ name: 'Old Mug', category: 'Home', tags: ['mug', 'ceramic'] }],
        finalCount: 1,
      });
      expect(result[0].name).toBe('Different Item');
    });

    it('boosts candidates matching recipient preferences', () => {
      const c = [
        makeCandidate({ name: 'Outdoor Item', category: 'Outdoor', tags: ['hiking'], relevanceScore: 60 }),
        makeCandidate({ name: 'Random Item', category: 'Random', tags: ['random'], relevanceScore: 60 }),
      ];
      const result = reranker.rerank(c, {
        recipientPreferences: {
          categoryPreferences: [{ category: 'Outdoor', count: 5, averageRating: 4.5 }],
          tagPreferences: [{ tag: 'hiking', count: 3, averageRating: 4.5 }],
        },
        finalCount: 1,
      });
      expect(result[0].name).toBe('Outdoor Item');
    });

    it('enforces category diversity via MMR when scores are competitive', () => {
      // AI typically returns candidates with similar relevance scores
      // when it's enthusiastic about several picks. In that regime,
      // MMR should diversify across categories rather than stack the
      // top 3 with same-category items.
      const c = [
        makeCandidate({ name: 'A', category: 'Outdoor', tags: ['hiking'], relevanceScore: 75 }),
        makeCandidate({ name: 'B', category: 'Outdoor', tags: ['hiking'], relevanceScore: 73 }),
        makeCandidate({ name: 'C', category: 'Outdoor', tags: ['hiking'], relevanceScore: 71 }),
        makeCandidate({ name: 'D', category: 'Books', tags: ['reading'], relevanceScore: 70 }),
        makeCandidate({ name: 'E', category: 'Fitness', tags: ['workout'], relevanceScore: 68 }),
      ];
      const result = reranker.rerank(c, { finalCount: 3 });
      const cats = new Set(result.map((r) => r.category));
      expect(cats.size).toBeGreaterThanOrEqual(2);
    });

    it('rewards personalization keywords', () => {
      const c = [
        makeCandidate({ name: 'Generic Frame', description: 'a plain photo frame', relevanceScore: 60 }),
        makeCandidate({ name: 'Custom Frame', description: 'personalized engraved photo frame', relevanceScore: 60 }),
      ];
      const result = reranker.rerank(c, { finalCount: 1 });
      expect(result[0].name).toBe('Custom Frame');
    });

    it('skips scoring but still trims to finalCount when disabled', () => {
      process.env.AI_RERANKER_ENABLED = 'false';
      jest.resetModules();
      const disabled = require('../../services/suggestionRerankerService');
      const c = [makeCandidate({ name: 'A' }), makeCandidate({ name: 'B' }), makeCandidate({ name: 'C' })];
      const result = disabled.rerank(c, { finalCount: 1 });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('A'); // model order preserved
      expect(result[0]).not.toHaveProperty('rerankScore'); // no scoring
    });

    it('attaches rerankScore and breakdown to each result', () => {
      const c = [makeCandidate()];
      const result = reranker.rerank(c, { finalCount: 1 });
      expect(result[0]).toHaveProperty('rerankScore');
      expect(result[0]).toHaveProperty('rerankBreakdown');
      expect(result[0].rerankBreakdown).toHaveProperty('modelRelevance');
    });
  });

  describe('candidateSimilarity', () => {
    it('returns higher similarity for same category and tags', () => {
      const a = { name: 'A', category: 'Outdoor', tags: ['hiking'], estimatedPrice: 50 };
      const b = { name: 'B', category: 'Outdoor', tags: ['hiking'], estimatedPrice: 50 };
      const c = { name: 'C', category: 'Books', tags: ['reading'], estimatedPrice: 200 };
      expect(reranker.candidateSimilarity(a, b)).toBeGreaterThan(reranker.candidateSimilarity(a, c));
    });
  });
});
