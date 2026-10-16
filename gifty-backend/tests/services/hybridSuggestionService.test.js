// tests/services/hybridSuggestionService.test.js
const hybridSuggestionService = require('../../services/hybridSuggestionService');

// Mock dependencies
jest.mock('../../models/GiftLibrary', () => ({
  find: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue([]), // Default to empty array for lean
  countDocuments: jest.fn().mockResolvedValue(0), // Default for countDocuments
  aggregate: jest.fn().mockResolvedValue([]), // Add aggregate for new implementation
  findOne: jest.fn().mockReturnThis(), // Add findOne
  select: jest.fn().mockReturnThis() // Add select for findOne chain
}));

jest.mock('../../services/openaiService');

// Mock data factory functions
const createMockProfile = (overrides = {}) => ({
  age: 25,
  gender: 'female',
  interests: ['reading', 'cooking', 'travel'],
  relationship: 'friend',
  occasion: 'birthday',
  budget: 50,
  ...overrides
});

const createMockGiftLibraryItem = (overrides = {}) => ({
  _id: 'mock-id-' + Math.random(),
  name: 'Mock Gift',
  description: 'A wonderful mock gift',
  priceRange: { min: 20, max: 40 },
  categories: ['books', 'education'],
  tags: ['practical', 'thoughtful'],
  demographics: {
    ageRange: [20, 35],
    gender: ['female', 'male'],
    interests: ['reading']
  },
  occasions: ['birthday'],
  popularityScore: 75,
  sourceUrl: 'https://example.com',
  status: 'active',
  matchScore: 0,
  source: 'discovered', // Add default source for discovered gifts
  ...overrides
});

describe('HybridSuggestionService', () => {
  describe('Service Properties', () => {
    it('should have expected service properties', () => {
      expect(hybridSuggestionService).toHaveProperty('discoveredGiftRatio');
    });

    it('should have correct default values', () => {
      expect(hybridSuggestionService.discoveredGiftRatio).toBe(0.7);
    });
  });

  describe('scoreGiftsForRecipient', () => {
    it('should score gifts based on recipient profile', () => {
      // Arrange
      const mockProfile = createMockProfile({
        age: 25,
        interests: ['reading', 'cooking'],
        occasion: 'birthday',
        budget: 50
      });
      
      const mockGifts = [
        createMockGiftLibraryItem({
          name: 'Cookbook',
          categories: ['cooking', 'books'],
          popularityScore: 60,
          demographics: { ageRange: [20, 35] },
          occasions: ['birthday'],
          priceRange: { min: 45, max: 55 }
        }),
        createMockGiftLibraryItem({
          name: 'Novel',
          categories: ['reading', 'entertainment'],
          popularityScore: 70,
          demographics: { ageRange: [18, 30] },
          occasions: ['birthday'],
          priceRange: { min: 15, max: 25 }
        })
      ];

      // Act
      const result = hybridSuggestionService.scoreGiftsForRecipient(mockGifts, mockProfile);

      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0]).toHaveProperty('matchScore');
      expect(result[1]).toHaveProperty('matchScore');
      
      // Both should have scores greater than base popularity
      expect(result[0].matchScore).toBeGreaterThan(0);
      expect(result[1].matchScore).toBeGreaterThan(0);
    });

    it('should handle gifts without demographics', () => {
      // Arrange
      const mockProfile = createMockProfile();
      const mockGifts = [
        createMockGiftLibraryItem({
          demographics: null,
          categories: ['general']
        })
      ];

      // Act
      const result = hybridSuggestionService.scoreGiftsForRecipient(mockGifts, mockProfile);

      // Assert
      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0]).toHaveProperty('matchScore');
    });

    it('should add interest matching bonus', () => {
      // Arrange
      const mockProfile = createMockProfile({ interests: ['cooking', 'reading'] });
      const mockGifts = [
        createMockGiftLibraryItem({
          name: 'Cookbook',
          categories: ['cooking', 'books'],
          popularityScore: 50
        }),
        createMockGiftLibraryItem({
          name: 'Sports Equipment',
          categories: ['sports'],
          popularityScore: 50
        })
      ];

      // Act
      const result = hybridSuggestionService.scoreGiftsForRecipient(mockGifts, mockProfile);

      // Assert
      expect(result[0].matchScore).toBeGreaterThan(result[1].matchScore);
      expect(result[0].name).toBe('Cookbook');
    });

    it('should add age matching bonus', () => {
      // Arrange
      const mockProfile = createMockProfile({ age: 25 });
      const mockGifts = [
        createMockGiftLibraryItem({
          name: 'Age Appropriate Gift',
          categories: ['general'],
          popularityScore: 50,
          demographics: { ageRange: [20, 30] }
        }),
        createMockGiftLibraryItem({
          name: 'Age Inappropriate Gift',
          categories: ['general'], 
          popularityScore: 50,
          demographics: { ageRange: [40, 50] }
        })
      ];

      // Act
      const result = hybridSuggestionService.scoreGiftsForRecipient(mockGifts, mockProfile);

      // Assert
      expect(result[0].matchScore).toBeGreaterThan(result[1].matchScore);
      expect(result[0].name).toBe('Age Appropriate Gift');
    });

    it('should add occasion matching bonus', () => {
      // Arrange
      const mockProfile = createMockProfile({ occasion: 'birthday' });
      const mockGifts = [
        createMockGiftLibraryItem({
          name: 'Birthday Gift',
          categories: ['general'],
          popularityScore: 50,
          occasions: ['birthday']
        }),
        createMockGiftLibraryItem({
          name: 'Christmas Gift',
          categories: ['general'],
          popularityScore: 50,
          occasions: ['christmas']
        })
      ];

      // Act
      const result = hybridSuggestionService.scoreGiftsForRecipient(mockGifts, mockProfile);

      // Assert
      expect(result[0].matchScore).toBeGreaterThan(result[1].matchScore);
      expect(result[0].name).toBe('Birthday Gift');
    });
  });

  describe('selectDiverseGifts', () => {
    // Selection uses a weighted shuffle for variety between runs; pin
    // Math.random so every candidate gets the same sort key and the
    // stable sort preserves score order, keeping these tests deterministic.
    let randomSpy;
    beforeEach(() => {
      randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    });
    afterEach(() => {
      randomSpy.mockRestore();
    });

    it('should return all gifts when count exceeds available gifts', () => {
      // Arrange
      const mockGifts = [
        createMockGiftLibraryItem({ name: 'Gift 1' }),
        createMockGiftLibraryItem({ name: 'Gift 2' })
      ];

      // Act
      const result = hybridSuggestionService.selectDiverseGifts(mockGifts, 5);

      // Assert
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0].name).toBe('Gift 1');
      expect(result[1].name).toBe('Gift 2');
    });

    it('should select diverse gifts based on categories', () => {
      // Arrange
      const mockGifts = [
        createMockGiftLibraryItem({
          name: 'Tech Item 1',
          categories: ['technology'],
          priceRange: { min: 100, max: 200 }
        }),
        createMockGiftLibraryItem({
          name: 'Tech Item 2',
          categories: ['technology'], 
          priceRange: { min: 20, max: 30 }
        }),
        createMockGiftLibraryItem({
          name: 'Book',
          categories: ['books'],
          priceRange: { min: 15, max: 25 }
        }),
        createMockGiftLibraryItem({
          name: 'Cooking Tool',
          categories: ['cooking'],
          priceRange: { min: 40, max: 60 }
        })
      ];

      // Act
      const result = hybridSuggestionService.selectDiverseGifts(mockGifts, 3);

      // Assert
      expect(result.length).toBe(3);
      expect(result[0].name).toBe('Tech Item 1'); // First (highest scoring)
      
      // Should have diversity in categories
      const categories = result.map(g => g.categories[0]);
      const uniqueCategories = [...new Set(categories)];
      expect(uniqueCategories.length).toBeGreaterThan(1);
    });

    it('should rotate picks via the weighted shuffle', () => {
      // Arrange: low-scored gift draws a much better shuffle key
      const mockGifts = [
        createMockGiftLibraryItem({ name: 'Top Gift', matchScore: 100 }),
        createMockGiftLibraryItem({ name: 'Runner Up', matchScore: 1 })
      ];
      randomSpy.mockReturnValueOnce(0.1).mockReturnValueOnce(0.99);

      // Act
      const result = hybridSuggestionService.selectDiverseGifts(mockGifts, 1);

      // Assert: 0.99^(1/1) beats 0.1^(1/100), so the runner-up wins this draw
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Runner Up');
    });

    it('should handle empty gift list', () => {
      // Arrange
      const mockGifts = [];

      // Act
      const result = hybridSuggestionService.selectDiverseGifts(mockGifts, 5);

      // Assert
      expect(result.length).toBe(0);
    });

    it('should handle gifts with missing or empty categories', () => {
      // Arrange
      const mockGifts = [
        createMockGiftLibraryItem({ 
          name: 'Gift 1', 
          categories: [] // Empty categories
        }),
        createMockGiftLibraryItem({ 
          name: 'Gift 2', 
          categories: undefined // Undefined categories
        }),
        createMockGiftLibraryItem({ 
          name: 'Gift 3', 
          categories: ['valid-category']
        })
      ];

      // Act
      const result = hybridSuggestionService.selectDiverseGifts(mockGifts, 2);

      // Assert
      expect(result).toBeDefined();
      expect(result.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getPriceRange', () => {
    it('should categorize price ranges correctly', () => {
      // Test budget range
      expect(hybridSuggestionService.getPriceRange({ min: 10, max: 20 })).toBe('budget');
      
      // Test moderate range
      expect(hybridSuggestionService.getPriceRange({ min: 30, max: 40 })).toBe('moderate');
      
      // Test premium range
      expect(hybridSuggestionService.getPriceRange({ min: 60, max: 80 })).toBe('premium');
      
      // Test luxury range
      expect(hybridSuggestionService.getPriceRange({ min: 150, max: 200 })).toBe('luxury');
    });

    it('should handle null or undefined price range', () => {
      expect(hybridSuggestionService.getPriceRange(null)).toBe('unknown');
      expect(hybridSuggestionService.getPriceRange(undefined)).toBe('unknown');
    });

    it('should handle edge cases for price boundaries', () => {
      expect(hybridSuggestionService.getPriceRange({ min: 24, max: 26 })).toBe('moderate'); // avg = 25, boundary is < 25
      expect(hybridSuggestionService.getPriceRange({ min: 49, max: 51 })).toBe('premium'); // avg = 50, boundary is < 50
      expect(hybridSuggestionService.getPriceRange({ min: 99, max: 101 })).toBe('luxury'); // avg = 100, boundary is < 100, so 100 = luxury
    });
  });

  describe('addSourceInformation', () => {
    it('should add source details to suggestions', () => {
      // Arrange
      const mockSuggestions = [
        {
          name: 'Gift 1',
          source: 'discovered',
          sourceUrl: 'https://example.com',
          popularityScore: 75
        },
        {
          name: 'Gift 2',
          source: 'ai_generated'
        }
      ];

      // Act
      const result = hybridSuggestionService.addSourceInformation(mockSuggestions);

      // Assert
      expect(result[0]).toHaveProperty('sourceDetails');
      expect(result[0].sourceDetails).toEqual({
        type: 'discovered',
        url: 'https://example.com',
        discoveryDate: null,
        isVerified: true,
        popularity: 75
      });
      
      expect(result[1].sourceDetails).toEqual({
        type: 'ai_generated',
        url: null,
        discoveryDate: null,
        isVerified: false,
        popularity: null
      });
    });

    it('should handle suggestions without source information', () => {
      // Arrange
      const mockSuggestions = [
        {
          name: 'Gift 1'
        }
      ];

      // Act
      const result = hybridSuggestionService.addSourceInformation(mockSuggestions);

      // Assert
      expect(result[0]).toHaveProperty('sourceDetails');
      expect(result[0].sourceDetails).toEqual({
        type: 'unknown',
        url: null,
        discoveryDate: null,
        isVerified: false,
        popularity: null
      });
    });
  });

  describe('combineAndRankSuggestions', () => {
    it('should combine and rank discovered and AI suggestions', () => {
      // Arrange
      const mockProfile = createMockProfile();
      const discoveredGifts = [
        createMockGiftLibraryItem({ name: 'Discovered Gift', matchScore: 80 })
      ];
      const aiSuggestions = [
        { name: 'AI Gift', matchScore: 70, source: 'ai_generated' }
      ];

      // Act
      const result = hybridSuggestionService.combineAndRankSuggestions(discoveredGifts, aiSuggestions, mockProfile);

      // Assert
      expect(result).toBeDefined();
      expect(result.length).toBe(2);
      expect(result[0].source).toBe('discovered');
      expect(result[1].source).toBe('ai_generated');
      // Discovered gift should rank higher due to source preference + score
      expect(result[0].name).toBe('Discovered Gift');
    });

    it('should handle empty arrays', () => {
      // Arrange
      const mockProfile = createMockProfile();
      const discoveredGifts = [];
      const aiSuggestions = [];

      // Act
      const result = hybridSuggestionService.combineAndRankSuggestions(discoveredGifts, aiSuggestions, mockProfile);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('generateTraditionalSuggestions', () => {
    const aiSuggestionService = require('../../services/openaiService');
    
    it('should call AI service for traditional suggestions', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const mockSuggestions = [{ name: 'AI Gift', description: 'Generated gift' }];
      
      aiSuggestionService.generateGiftSuggestions.mockResolvedValue(mockSuggestions);

      // Act
      const result = await hybridSuggestionService.generateTraditionalSuggestions(mockProfile, 3);

      // Assert
      expect(aiSuggestionService.generateGiftSuggestions).toHaveBeenCalledWith(mockProfile, { count: 3, ai: {}, avoid: [] });
      expect(result).toEqual(mockSuggestions);
    });

    it('should pass exclude names to the AI service as an avoid list', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      aiSuggestionService.generateGiftSuggestions.mockResolvedValue([]);

      // Act
      await hybridSuggestionService.generateTraditionalSuggestions(mockProfile, 3, {}, ['Old Gift']);

      // Assert
      expect(aiSuggestionService.generateGiftSuggestions).toHaveBeenCalledWith(mockProfile, { count: 3, ai: {}, avoid: ['Old Gift'] });
    });

    it('should handle AI service errors', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      
      aiSuggestionService.generateGiftSuggestions.mockRejectedValue(new Error('AI service error'));

      // Act & Assert
      await expect(hybridSuggestionService.generateTraditionalSuggestions(mockProfile, 3)).rejects.toThrow('AI service error');
    });
  });

  describe('isHybridSystemHealthy', () => {
    const GiftLibrary = require('../../models/GiftLibrary');
    
    it('should return healthy status when sufficient gifts exist', async () => {
      // Arrange
      GiftLibrary.aggregate
        .mockResolvedValueOnce([{ totalGifts: 150 }]) // Total gifts aggregate result
        .mockResolvedValueOnce([{ recentGifts: 5 }]);  // Recent gifts aggregate result
      
      GiftLibrary.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({ discoveryDate: new Date() })
        })
      });

      // Act
      const result = await hybridSuggestionService.isHybridSystemHealthy();

      // Assert
      expect(result.isHealthy).toBe(true);
      expect(result.totalGifts).toBe(150);
      expect(result.recentGifts).toBe(5);
      expect(result.lastDiscovery).toBeDefined();
    });

    it('should return unhealthy status when insufficient gifts exist', async () => {
      // Arrange
      GiftLibrary.aggregate
        .mockResolvedValueOnce([{ totalGifts: 50 }]) // Total gifts (below threshold)
        .mockResolvedValueOnce([{ recentGifts: 2 }]); // Recent gifts
      
      GiftLibrary.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue(null)
        })
      });

      // Act
      const result = await hybridSuggestionService.isHybridSystemHealthy();

      // Assert
      expect(result.isHealthy).toBe(false);
      expect(result.totalGifts).toBe(50);
      expect(result.recentGifts).toBe(2);
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      GiftLibrary.aggregate.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await hybridSuggestionService.isHybridSystemHealthy();

      // Assert
      expect(result.isHealthy).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('generatePersonalizedAISuggestions', () => {
    const aiSuggestionService = require('../../services/openaiService');
    
    it('should generate personalized AI suggestions with context', async () => {
      // Arrange
      const mockProfile = createMockProfile({ interests: ['reading', 'cooking'] });
      const existingGifts = [
        createMockGiftLibraryItem({ name: 'Cookbook', categories: ['cooking'] })
      ];
      const mockAISuggestions = [
        {
          name: 'Book Light',
          description: 'A reading light for book lovers',
          estimatedPrice: 25,
          categories: ['reading'],
          tags: ['practical'],
          confidenceScore: 85
        }
      ];

      aiSuggestionService.generateGiftSuggestions.mockResolvedValue(mockAISuggestions);

      // Act
      const result = await hybridSuggestionService.generatePersonalizedAISuggestions(mockProfile, 2, existingGifts);

      // Assert
      expect(aiSuggestionService.generateGiftSuggestions).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('source', 'ai_generated');
      expect(result[0]).toHaveProperty('matchScore');
    });

    it('should merge exclude names into the avoid context', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const existingGifts = [
        createMockGiftLibraryItem({ name: 'Cookbook' })
      ];
      aiSuggestionService.generateGiftSuggestions.mockClear();
      aiSuggestionService.generateGiftSuggestions.mockResolvedValue([]);

      // Act
      await hybridSuggestionService.generatePersonalizedAISuggestions(
        mockProfile, 2, existingGifts, {}, ['Previously Shown Gift', 'Cookbook']
      );

      // Assert
      const aiOptions = aiSuggestionService.generateGiftSuggestions.mock.calls[0][1];
      expect(aiOptions.avoid).toEqual(['Cookbook', 'Previously Shown Gift']); // deduplicated
    });

    it('should handle empty existing gifts', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const existingGifts = [];
      const mockAISuggestions = [{
        name: 'Generic Gift',
        description: 'A nice gift',
        estimatedPrice: 30,
        categories: ['general'],
        tags: ['helpful'],
        confidenceScore: 75
      }];

      aiSuggestionService.generateGiftSuggestions.mockResolvedValue(mockAISuggestions);

      // Act
      const result = await hybridSuggestionService.generatePersonalizedAISuggestions(mockProfile, 1, existingGifts);

      // Assert
      expect(result).toBeDefined();
      expect(result.length).toBe(1);
    });
  });

  describe('supplementWithAI', () => {
    const aiSuggestionService = require('../../services/openaiService');
    
    it('should supplement discovered gifts with AI suggestions', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const discoveredGifts = [createMockGiftLibraryItem()];
      const mockAISuggestions = [
        {
          name: 'AI Gift',
          description: 'AI generated gift',
          estimatedPrice: 30,
          categories: ['general'],
          tags: ['helpful'],
          confidenceScore: 75
        }
      ];

      aiSuggestionService.generateGiftSuggestions.mockResolvedValue(mockAISuggestions);

      // Act
      const result = await hybridSuggestionService.supplementWithAI(discoveredGifts, mockProfile, 3);

      // Assert
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(1); // Should have both discovered and AI gifts
    });
  });

  describe('getDiscoveredGifts', () => {
    const GiftLibrary = require('../../models/GiftLibrary');
    
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should find gifts based on recipient profile', async () => {
      // Arrange
      const mockProfile = createMockProfile({
        age: 25,
        gender: 'female',
        interests: ['reading', 'cooking'],
        occasion: 'birthday',
        budget: 50
      });
      
      const mockGifts = [
        createMockGiftLibraryItem({ name: 'Perfect Gift', popularityScore: 85 }),
        createMockGiftLibraryItem({ name: 'Good Gift', popularityScore: 70 }),
        createMockGiftLibraryItem({ name: 'Great Gift', popularityScore: 80 }),
        createMockGiftLibraryItem({ name: 'Nice Gift', popularityScore: 60 }),
        createMockGiftLibraryItem({ name: 'Cool Gift', popularityScore: 75 }),
        createMockGiftLibraryItem({ name: 'Super Gift', popularityScore: 90 }),
        createMockGiftLibraryItem({ name: 'Amazing Gift', popularityScore: 95 }),
        createMockGiftLibraryItem({ name: 'Fantastic Gift', popularityScore: 85 }),
        createMockGiftLibraryItem({ name: 'Wonderful Gift', popularityScore: 70 }),
        createMockGiftLibraryItem({ name: 'Excellent Gift', popularityScore: 88 }),
        createMockGiftLibraryItem({ name: 'Outstanding Gift', popularityScore: 92 })
      ];

      GiftLibrary.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockGifts) // Return enough gifts to skip broader search
          })
        })
      });

      // Act
      const result = await hybridSuggestionService.getDiscoveredGifts(mockProfile, 50);

      // Assert
      expect(GiftLibrary.find).toHaveBeenCalledWith({
        status: 'active',
        'priceRange.max': { $gt: 0 },
        'priceRange.min': { $lte: 50 },
        'demographics.ageRange.0': { $lte: 25 },
        'demographics.ageRange.1': { $gte: 25 },
        'demographics.gender': 'female',
        'demographics.interests': { $in: ['reading', 'cooking'] },
        occasions: 'birthday'
      }, '-feedbackHistory');
      expect(result).toBeDefined();
      expect(result.length).toBe(11); // Should return all gifts from first search
      expect(result[0]).toHaveProperty('matchScore');
    });

    it('should handle profile without budget', async () => {
      // Arrange
      const mockProfile = createMockProfile({ budget: null });
      const mockGifts = [createMockGiftLibraryItem()];

      GiftLibrary.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockGifts)
          })
        })
      });

      // Act
      const result = await hybridSuggestionService.getDiscoveredGifts(mockProfile, null);

      // Assert
      expect(GiftLibrary.find).toHaveBeenCalledWith({
        status: 'active',
        'priceRange.max': { $gt: 0 },
        'demographics.ageRange.0': { $lte: 25 },
        'demographics.ageRange.1': { $gte: 25 },
        'demographics.gender': 'female',
        'demographics.interests': { $in: ['reading', 'cooking', 'travel'] },
        occasions: 'birthday'
      }, '-feedbackHistory');
      expect(result).toBeDefined();
    });

    it('should perform broader search when few gifts found', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const initialGifts = [createMockGiftLibraryItem({ name: 'Initial Gift' })];
      const additionalGifts = [createMockGiftLibraryItem({ name: 'Additional Gift' })];

      GiftLibrary.find
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(initialGifts) // First call returns few gifts
            })
          })
        })
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(additionalGifts) // Second call for broader search
            })
          })
        });

      // Act
      const result = await hybridSuggestionService.getDiscoveredGifts(mockProfile, 50);

      // Assert
      expect(GiftLibrary.find).toHaveBeenCalledTimes(2);
      expect(result.length).toBe(2); // Should include both initial and additional gifts
    });
  });

  describe('generateHybridSuggestions', () => {
    const GiftLibrary = require('../../models/GiftLibrary');
    let aiSuggestionService; // Declare locally to be re-required after resetModules
    let localHybridSuggestionService; // Declare a local variable for the re-required service

    beforeEach(() => {
      jest.resetModules(); // Clear module cache
      // Re-require the service to get a fresh instance
      localHybridSuggestionService = require('../../services/hybridSuggestionService');
      // Re-require aiSuggestionService after resetModules
      aiSuggestionService = require('../../services/openaiService');
      
      jest.clearAllMocks(); // Clear any mocks from previous tests
      
      // Explicitly enable hybrid suggestions for these tests on the new instance
      
      // Spy on getDiscoveredGifts for this describe block on the new instance
      jest.spyOn(localHybridSuggestionService, 'getDiscoveredGifts');
      // Spy on aiSuggestionService.generateGiftSuggestions
      jest.spyOn(aiSuggestionService, 'generateGiftSuggestions');
    });

    it('should generate hybrid suggestions with discovered and AI gifts', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const mockDiscoveredGifts = [
        createMockGiftLibraryItem({ name: 'Discovered Gift 1', matchScore: 85 }),
        createMockGiftLibraryItem({ name: 'Discovered Gift 2', matchScore: 75 }),
        createMockGiftLibraryItem({ name: 'Discovered Gift 3', matchScore: 65 }),
        createMockGiftLibraryItem({ name: 'Discovered Gift 4', matchScore: 55 }),
        createMockGiftLibraryItem({ name: 'Discovered Gift 5', matchScore: 45 })
      ];
      
      // Mock multiple AI suggestions to match the expected count
      const mockAISuggestions = [
        {
          name: 'AI Gift 1',
          description: 'AI generated gift 1', 
          estimatedPrice: 30,
          categories: ['general'],
          confidenceScore: 70
        },
        {
          name: 'AI Gift 2',
          description: 'AI generated gift 2', 
          estimatedPrice: 25,
          categories: ['entertainment'],
          confidenceScore: 65
        },
        {
          name: 'AI Gift 3',
          description: 'AI generated gift 3', 
          estimatedPrice: 35,
          categories: ['lifestyle'],
          confidenceScore: 75
        }
      ];

      // Mock getDiscoveredGifts to return pre-scored discovered gifts
      localHybridSuggestionService.getDiscoveredGifts.mockResolvedValue(mockDiscoveredGifts);
      
      // Ensure AI service returns the expected number of suggestions
      aiSuggestionService.generateGiftSuggestions.mockResolvedValue(mockAISuggestions);

      // Act
      const result = await localHybridSuggestionService.generateHybridSuggestions(mockProfile, { count: 5, budget: mockProfile.budget });

      // Assert
      expect(result).toBeDefined();
      expect(result.length).toBeLessThanOrEqual(5);
      expect(result.some(gift => gift.source === 'discovered')).toBe(true);
      expect(result.some(gift => gift.source === 'ai_generated')).toBe(true);
      
      // More specific assertions
      const discoveredGifts = result.filter(gift => gift.source === 'discovered');
      const aiGifts = result.filter(gift => gift.source === 'ai_generated');
      expect(discoveredGifts.length).toBeGreaterThan(0);
      expect(aiGifts.length).toBeGreaterThan(0);
      expect(localHybridSuggestionService.getDiscoveredGifts).toHaveBeenCalledWith(mockProfile, mockProfile.budget);
    });

    it('should drop excluded names from the library pool and pass them to the AI avoid list', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const mockDiscoveredGifts = [
        createMockGiftLibraryItem({ name: 'Repeat Gift', matchScore: 95 }),
        createMockGiftLibraryItem({ name: 'Fresh Gift 1', matchScore: 85 }),
        createMockGiftLibraryItem({ name: 'Fresh Gift 2', matchScore: 75 }),
        createMockGiftLibraryItem({ name: 'Fresh Gift 3', matchScore: 65 }),
        createMockGiftLibraryItem({ name: 'Fresh Gift 4', matchScore: 55 }),
        createMockGiftLibraryItem({ name: 'Fresh Gift 5', matchScore: 45 })
      ];
      localHybridSuggestionService.getDiscoveredGifts.mockResolvedValue(mockDiscoveredGifts);
      aiSuggestionService.generateGiftSuggestions.mockResolvedValue([
        { name: 'AI Gift', description: 'AI generated', estimatedPrice: 30, categories: ['general'], confidenceScore: 70 }
      ]);

      // Act — exclusion match is case-insensitive
      const result = await localHybridSuggestionService.generateHybridSuggestions(mockProfile, {
        count: 5,
        excludeNames: ['repeat gift']
      });

      // Assert
      expect(result.every(gift => gift.name !== 'Repeat Gift')).toBe(true);
      const aiOptions = aiSuggestionService.generateGiftSuggestions.mock.calls[0][1];
      expect(aiOptions.avoid).toEqual(expect.arrayContaining(['repeat gift']));
    });

    it('should supplement with AI when insufficient discovered gifts', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const mockFewDiscoveredGifts = [
        createMockGiftLibraryItem({ name: 'Only Gift', matchScore: 50 })
      ];
      
      // Mock getDiscoveredGifts to return pre-scored discovered gifts
      localHybridSuggestionService.getDiscoveredGifts.mockResolvedValue(mockFewDiscoveredGifts);
      
      // Mock multiple AI suggestions to ensure we get more than 1 total result
      const mockAISuggestions = [
        {
          name: 'Supplemental AI Gift 1',
          description: 'AI supplement 1',
          estimatedPrice: 25,
          categories: ['general'],
          confidenceScore: 60
        },
        {
          name: 'Supplemental AI Gift 2',
          description: 'AI supplement 2',
          estimatedPrice: 30,
          categories: ['lifestyle'],
          confidenceScore: 65
        },
        {
          name: 'Supplemental AI Gift 3',
          description: 'AI supplement 3',
          estimatedPrice: 35,
          categories: ['entertainment'],
          confidenceScore: 70
        },
        {
          name: 'Supplemental AI Gift 4',
          description: 'AI supplement 4',
          estimatedPrice: 28,
          categories: ['books'],
          confidenceScore: 55
        }
      ];

      aiSuggestionService.generateGiftSuggestions.mockResolvedValue(mockAISuggestions);

      // Act
      const result = await localHybridSuggestionService.generateHybridSuggestions(mockProfile, { count: 5, budget: mockProfile.budget });

      // Assert
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(1);
      expect(result.length).toBeLessThanOrEqual(5);
      
      // Should have both discovered and AI gifts
      const discoveredGifts = result.filter(gift => gift.source === 'discovered');
      const aiGifts = result.filter(gift => gift.source === 'ai_generated');
      expect(discoveredGifts.length).toBeGreaterThan(0);
      expect(aiGifts.length).toBeGreaterThan(0);
      expect(localHybridSuggestionService.getDiscoveredGifts).toHaveBeenCalledWith(mockProfile, mockProfile.budget);
    });

    it('should add source information when requested', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const mockDiscoveredGifts = [
        createMockGiftLibraryItem({ 
          name: 'Source Gift', 
          matchScore: 80,
          sourceUrl: 'https://example.com',
          popularityScore: 90
        })
      ];

      // Mock getDiscoveredGifts to return pre-scored discovered gifts
      localHybridSuggestionService.getDiscoveredGifts.mockResolvedValue(mockDiscoveredGifts);

      // Act
      const result = await localHybridSuggestionService.generateHybridSuggestions(mockProfile, { 
        count: 3, 
        includeSources: true,
        budget: mockProfile.budget
      });

      // Assert
      expect(result).toBeDefined();
      expect(result[0]).toHaveProperty('sourceDetails');
      expect(result[0].sourceDetails).toHaveProperty('type');
      expect(result[0].sourceDetails).toHaveProperty('isVerified');
      expect(localHybridSuggestionService.getDiscoveredGifts).toHaveBeenCalledWith(mockProfile, mockProfile.budget);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const mockFallbackSuggestions = [
        { 
          name: 'Fallback Gift', 
          description: 'Emergency suggestion',
          priceRange: { min: 24, max: 36 }, // Default estimatedPrice 30 * 0.8 and 1.2
          categories: [],
          tags: [],
          source: 'ai_generated',
          matchScore: 50 // Default confidenceScore 50
        }
      ];
      
      GiftLibrary.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockRejectedValue(new Error('Database error'))
          })
        })
      });
      
      aiSuggestionService.generateGiftSuggestions.mockResolvedValue(mockFallbackSuggestions);

      // Act
      const result = await localHybridSuggestionService.generateHybridSuggestions(mockProfile, { count: 3 });

      // Assert (reranker annotates fallback suggestions with scores)
      expect(result).toEqual(
        mockFallbackSuggestions.map((s) => expect.objectContaining(s))
      );
    });
  });

  describe('when the AI itself fails', () => {
    const openaiService = require('../../services/openaiService');
    const { providerFailed } = require('../../utils/aiErrors');

    it('passes the typed error on and asks the AI only once', async () => {
      jest.clearAllMocks();
      openaiService.generateGiftSuggestions.mockRejectedValue(providerFailed(new Error('outage')));
      await expect(hybridSuggestionService.generateHybridSuggestions(createMockProfile(), { count: 5 }))
        .rejects.toMatchObject({ code: 'AI_PROVIDER_FAILED', statusCode: 502 });
      expect(openaiService.generateGiftSuggestions).toHaveBeenCalledTimes(1);
    });
  });
});
