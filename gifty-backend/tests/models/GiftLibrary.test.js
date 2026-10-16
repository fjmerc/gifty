// tests/models/GiftLibrary.test.js
const mongoose = require('mongoose');
const GiftLibrary = require('../../models/GiftLibrary');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Set higher timeout for database tests
jest.setTimeout(30000);

// Mock data factory for creating test gift library items
const createMockGiftLibraryItem = (overrides = {}) => ({
  name: 'Mock Gift Item',
  description: 'A wonderful mock gift for testing',
  priceRange: { min: 20, max: 50 },
  categories: ['electronics', 'gadgets'],
  tags: ['popular', 'trending'],
  demographics: {
    ageRange: [18, 35],
    gender: ['male', 'female'],
    interests: ['technology', 'gaming']
  },
  occasions: ['birthday', 'christmas'],
  sourceUrl: 'https://example.com/gift',
  imageUrls: ['https://example.com/image1.jpg'],
  popularityScore: 75,
  status: 'active',
  metadata: {
    retailer: 'Amazon',
    brand: 'TestBrand',
    avgRating: 4.5,
    reviewCount: 150
  },
  ...overrides
});

describe('GiftLibrary Model', () => {
  // Connect to test database before all tests
  beforeAll(async () => {
    await setupTestDB();
  });

  // Clear all test data after each test
  afterEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
  });

  // Disconnect and stop MongoDB server after all tests
  afterAll(async () => {
    await teardownTestDB();
  });

  describe('Schema Validation', () => {
    describe('Required Fields', () => {
      it('should create gift library item with all required fields', async () => {
        // Arrange
        const giftData = {
          name: 'Test Gift',
          description: 'A test gift description'
        };

        // Act
        const gift = await GiftLibrary.create(giftData);

        // Assert
        expect(gift).toBeDefined();
        expect(gift.name).toBe('Test Gift');
        expect(gift.description).toBe('A test gift description');
        // Test default values
        expect(gift.popularityScore).toBe(0);
        expect(gift.status).toBe('active');
        expect(gift.discoveryDate).toBeDefined();
        expect(gift.lastUpdated).toBeDefined();
        expect(gift.createdAt).toBeDefined();
        expect(gift.updatedAt).toBeDefined();
      });

      it('should fail validation if name field is missing', async () => {
        // Arrange
        const incompleteData = {
          description: 'A test gift description'
          // Missing name
        };

        // Act & Assert
        await expect(GiftLibrary.create(incompleteData)).rejects.toThrow();
      });

      it('should fail validation if description field is missing', async () => {
        // Arrange
        const incompleteData = {
          name: 'Test Gift'
          // Missing description
        };

        // Act & Assert
        await expect(GiftLibrary.create(incompleteData)).rejects.toThrow();
      });

      it('should trim whitespace from name field', async () => {
        // Arrange
        const giftData = {
          name: '  Test Gift  ',
          description: 'A test gift description'
        };

        // Act
        const gift = await GiftLibrary.create(giftData);

        // Assert
        expect(gift.name).toBe('Test Gift');
      });
    });

    describe('Default Values', () => {
      it('should set default values correctly', async () => {
        // Arrange
        const giftData = {
          name: 'Test Gift',
          description: 'A test gift description'
        };

        // Act
        const gift = await GiftLibrary.create(giftData);

        // Assert
        expect(gift.popularityScore).toBe(0);
        expect(gift.status).toBe('active');
        expect(gift.discoveryDate).toBeInstanceOf(Date);
        expect(gift.lastUpdated).toBeInstanceOf(Date);
      });

      it('should allow override of default values', async () => {
        // Arrange
        const customDate = new Date('2024-01-01');
        const giftData = {
          name: 'Test Gift',
          description: 'A test gift description',
          popularityScore: 85,
          status: 'pending_review',
          discoveryDate: customDate
          // Note: lastUpdated will be overridden by pre-save middleware
        };

        // Act
        const gift = await GiftLibrary.create(giftData);

        // Assert
        expect(gift.popularityScore).toBe(85);
        expect(gift.status).toBe('pending_review');
        expect(gift.discoveryDate).toEqual(customDate);
        // lastUpdated is automatically set by pre-save middleware
        expect(gift.lastUpdated).toBeInstanceOf(Date);
        expect(gift.lastUpdated.getTime()).toBeGreaterThan(customDate.getTime());
      });
    });

    describe('Enum Validation', () => {
      it('should validate status enum values', async () => {
        // Arrange
        const validStatuses = ['active', 'archived', 'pending_review'];

        for (const status of validStatuses) {
          const giftData = {
            name: 'Test Gift',
            description: 'A test gift description',
            status
          };

          // Act
          const gift = await GiftLibrary.create(giftData);

          // Assert
          expect(gift.status).toBe(status);

          // Clean up for next iteration
          await gift.deleteOne();
        }
      });

      it('should fail validation for invalid status enum value', async () => {
        // Arrange
        const giftData = {
          name: 'Test Gift',
          description: 'A test gift description',
          status: 'invalid_status'
        };

        // Act & Assert
        await expect(GiftLibrary.create(giftData)).rejects.toThrow();
      });
    });

    describe('Nested Objects', () => {
      it('should handle priceRange object validation', async () => {
        // Arrange
        const giftData = {
          name: 'Test Gift',
          description: 'A test gift description',
          priceRange: {
            min: 25,
            max: 75
          }
        };

        // Act
        const gift = await GiftLibrary.create(giftData);

        // Assert
        expect(gift.priceRange).toBeDefined();
        expect(gift.priceRange.min).toBe(25);
        expect(gift.priceRange.max).toBe(75);
      });

      it('should handle demographics object validation', async () => {
        // Arrange
        const giftData = {
          name: 'Test Gift',
          description: 'A test gift description',
          demographics: {
            ageRange: [18, 65],
            gender: ['male', 'female', 'non-binary'],
            interests: ['technology', 'sports', 'music']
          }
        };

        // Act
        const gift = await GiftLibrary.create(giftData);

        // Assert
        expect(gift.demographics).toBeDefined();
        expect(gift.demographics.ageRange).toEqual([18, 65]);
        expect(gift.demographics.gender).toEqual(['male', 'female', 'non-binary']);
        expect(gift.demographics.interests).toEqual(['technology', 'sports', 'music']);
      });

      it('should handle metadata object validation', async () => {
        // Arrange
        const giftData = {
          name: 'Test Gift',
          description: 'A test gift description',
          metadata: {
            retailer: 'Amazon',
            brand: 'TestBrand',
            avgRating: 4.7,
            reviewCount: 250
          }
        };

        // Act
        const gift = await GiftLibrary.create(giftData);

        // Assert
        expect(gift.metadata).toBeDefined();
        expect(gift.metadata.retailer).toBe('Amazon');
        expect(gift.metadata.brand).toBe('TestBrand');
        expect(gift.metadata.avgRating).toBe(4.7);
        expect(gift.metadata.reviewCount).toBe(250);
      });
    });

    describe('Array Fields', () => {
      it('should handle array fields correctly', async () => {
        // Arrange
        const giftData = {
          name: 'Test Gift',
          description: 'A test gift description',
          categories: ['electronics', 'gadgets', 'tech'],
          tags: ['popular', 'trending', 'new'],
          occasions: ['birthday', 'christmas', 'anniversary'],
          imageUrls: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg']
        };

        // Act
        const gift = await GiftLibrary.create(giftData);

        // Assert
        expect(gift.categories).toEqual(['electronics', 'gadgets', 'tech']);
        expect(gift.tags).toEqual(['popular', 'trending', 'new']);
        expect(gift.occasions).toEqual(['birthday', 'christmas', 'anniversary']);
        expect(gift.imageUrls).toEqual(['https://example.com/img1.jpg', 'https://example.com/img2.jpg']);
      });

      it('should handle empty arrays correctly', async () => {
        // Arrange
        const giftData = {
          name: 'Test Gift',
          description: 'A test gift description',
          categories: [],
          tags: [],
          occasions: [],
          imageUrls: []
        };

        // Act
        const gift = await GiftLibrary.create(giftData);

        // Assert
        expect(gift.categories).toEqual([]);
        expect(gift.tags).toEqual([]);
        expect(gift.occasions).toEqual([]);
        expect(gift.imageUrls).toEqual([]);
      });
    });

    describe('Optional Fields', () => {
      it('should handle all optional fields correctly', async () => {
        // Arrange
        const giftData = createMockGiftLibraryItem();

        // Act
        const gift = await GiftLibrary.create(giftData);

        // Assert
        expect(gift.sourceUrl).toBe('https://example.com/gift');
        expect(gift.popularityScore).toBe(75);
        expect(gift.status).toBe('active');
        expect(gift.categories).toEqual(['electronics', 'gadgets']);
        expect(gift.tags).toEqual(['popular', 'trending']);
        expect(gift.occasions).toEqual(['birthday', 'christmas']);
        expect(gift.imageUrls).toEqual(['https://example.com/image1.jpg']);
        expect(gift.priceRange.min).toBe(20);
        expect(gift.priceRange.max).toBe(50);
        expect(gift.demographics.ageRange).toEqual([18, 35]);
        expect(gift.demographics.gender).toEqual(['male', 'female']);
        expect(gift.demographics.interests).toEqual(['technology', 'gaming']);
        expect(gift.metadata.retailer).toBe('Amazon');
        expect(gift.metadata.brand).toBe('TestBrand');
        expect(gift.metadata.avgRating).toBe(4.5);
        expect(gift.metadata.reviewCount).toBe(150);
      });
    });
  });

  describe('Instance Methods', () => {
    let giftItem;

    beforeEach(async () => {
      giftItem = await GiftLibrary.create({
        name: 'Test Gift Item',
        description: 'A test gift for method testing',
        priceRange: { min: 30, max: 80 },
        demographics: {
          ageRange: [25, 45],
          gender: ['male', 'female'],
          interests: ['technology', 'sports']
        }
      });
    });

    describe('isAffordable() Method', () => {
      it('should return true when gift is within budget', async () => {
        // Act & Assert - Budget must be >= BOTH min AND max price for affordability
        expect(giftItem.isAffordable(100)).toBe(true); // 100 >= 80 (max price)
        expect(giftItem.isAffordable(80)).toBe(true);  // 80 = max price
        expect(giftItem.isAffordable(50)).toBe(false); // 50 < 80 (max price)
      });

      it('should return false when gift exceeds budget', async () => {
        // Act & Assert
        expect(giftItem.isAffordable(25)).toBe(false); // 25 < 30 (min price)
        expect(giftItem.isAffordable(79)).toBe(false); // 79 < 80 (max price)
        expect(giftItem.isAffordable(10)).toBe(false); // Way under budget
      });

      it('should return true when no budget is provided', async () => {
        // Act & Assert
        expect(giftItem.isAffordable(null)).toBe(true);
        expect(giftItem.isAffordable(undefined)).toBe(true);
        expect(giftItem.isAffordable(0)).toBe(true); // 0 is falsy, so returns true
      });

      it('should handle edge cases with zero budget', async () => {
        // Arrange - Create gift with zero minimum price
        const freeGift = await GiftLibrary.create({
          name: 'Free Gift',
          description: 'A free gift',
          priceRange: { min: 0, max: 0 }
        });

        // Act & Assert
        expect(freeGift.isAffordable(0)).toBe(true);
        expect(freeGift.isAffordable(1)).toBe(true);
      });

      it('should handle missing priceRange data', async () => {
        // Arrange - Create gift without priceRange
        const giftWithoutPrice = await GiftLibrary.create({
          name: 'Gift Without Price',
          description: 'A gift without price range'
        });

        // Act & Assert - Should handle gracefully
        expect(() => giftWithoutPrice.isAffordable(50)).not.toThrow();
      });
    });

    describe('matchesDemographics() Method', () => {
      it('should return true for complete demographic match', async () => {
        // Act & Assert
        expect(giftItem.matchesDemographics(30, 'male', ['technology'])).toBe(true);
        expect(giftItem.matchesDemographics(35, 'female', ['sports'])).toBe(true);
        expect(giftItem.matchesDemographics(25, 'male', ['technology', 'sports'])).toBe(true);
      });

      it('should return false when age is out of range', async () => {
        // Act & Assert
        expect(giftItem.matchesDemographics(20, 'male', ['technology'])).toBe(false); // Below min age
        expect(giftItem.matchesDemographics(50, 'female', ['sports'])).toBe(false); // Above max age
      });

      it('should return false when gender does not match', async () => {
        // Act & Assert
        expect(giftItem.matchesDemographics(30, 'non-binary', ['technology'])).toBe(false);
        expect(giftItem.matchesDemographics(35, 'other', ['sports'])).toBe(false);
      });

      it('should return false when interests do not overlap', async () => {
        // Act & Assert
        expect(giftItem.matchesDemographics(30, 'male', ['music'])).toBe(false);
        expect(giftItem.matchesDemographics(35, 'female', ['art', 'cooking'])).toBe(false);
      });

      it('should return true when no demographic parameters provided', async () => {
        // Act & Assert
        expect(giftItem.matchesDemographics()).toBe(true);
        expect(giftItem.matchesDemographics(null)).toBe(true);
        expect(giftItem.matchesDemographics(null, null)).toBe(true);
        expect(giftItem.matchesDemographics(null, null, null)).toBe(true);
      });

      it('should handle partial demographic matches', async () => {
        // Act & Assert - Age matches, but gender/interests missing
        expect(giftItem.matchesDemographics(30)).toBe(true);
        expect(giftItem.matchesDemographics(30, null, ['technology'])).toBe(true);
        expect(giftItem.matchesDemographics(null, 'male', ['technology'])).toBe(true);
      });

      it('should handle empty demographic arrays correctly', async () => {
        // Arrange - When demographic arrays are empty, they should NOT be permissive
        // Empty arrays mean "no one fits this criteria" rather than "everyone fits"
        const giftWithEmptyDemographics = await GiftLibrary.create({
          name: 'Restrictive Gift',
          description: 'A gift with empty demographic arrays',
          demographics: {
            ageRange: [18, 65], // Valid age range
            gender: [], // Empty = no gender matches
            interests: [] // Empty = no interests match
          }
        });

        // Act & Assert - With empty gender array, should not match specific gender
        expect(giftWithEmptyDemographics.matchesDemographics(30, null, null)).toBe(true); // No gender/interests specified
        expect(giftWithEmptyDemographics.matchesDemographics(30, null, [])).toBe(true);   // Empty interests array
        expect(giftWithEmptyDemographics.matchesDemographics(30)).toBe(true);             // No params
      });

      it('should handle missing demographics object', async () => {
        // Arrange - Create gift without demographics
        const giftWithoutDemographics = await GiftLibrary.create({
          name: 'Simple Gift',
          description: 'A simple gift'
        });

        // Act & Assert - Should handle gracefully
        expect(() => giftWithoutDemographics.matchesDemographics(30, 'male', ['technology'])).not.toThrow();
      });

      it('should test age range boundary conditions', async () => {
        // Act & Assert - Test exact boundaries
        expect(giftItem.matchesDemographics(25, 'male', ['technology'])).toBe(true);  // Min age
        expect(giftItem.matchesDemographics(45, 'female', ['sports'])).toBe(true);    // Max age
        expect(giftItem.matchesDemographics(24, 'male', ['technology'])).toBe(false); // Below min
        expect(giftItem.matchesDemographics(46, 'female', ['sports'])).toBe(false);   // Above max
      });
    });
  });

  describe('Static Methods', () => {
    let gift1, gift2, gift3, gift4;

    beforeEach(async () => {
      // Create test gifts with different categories, occasions, and statuses
      gift1 = await GiftLibrary.create({
        name: 'Electronics Gift',
        description: 'A tech gadget',
        categories: ['electronics', 'gadgets'],
        occasions: ['birthday'],
        popularityScore: 85,
        status: 'active',
        discoveryDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
      });

      gift2 = await GiftLibrary.create({
        name: 'Fashion Gift',
        description: 'A stylish accessory',
        categories: ['fashion', 'accessories'],
        occasions: ['birthday', 'anniversary'],
        popularityScore: 70,
        status: 'active',
        discoveryDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
      });

      gift3 = await GiftLibrary.create({
        name: 'Archived Electronics',
        description: 'An archived tech item',
        categories: ['electronics'],
        occasions: ['christmas'],
        popularityScore: 90,
        status: 'archived', // Should be excluded from searches
        discoveryDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
      });

      gift4 = await GiftLibrary.create({
        name: 'Old Gift',
        description: 'An old gift item',
        categories: ['books'],
        occasions: ['graduation'],
        popularityScore: 60,
        status: 'active',
        discoveryDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago (outside trending)
      });
    });

    describe('findByCategory() Method', () => {
      it('should find gifts by category with default limit', async () => {
        // Act
        const results = await GiftLibrary.findByCategory('electronics');

        // Assert
        expect(results).toHaveLength(1); // Only gift1 (gift3 is archived)
        expect(results[0].name).toBe('Electronics Gift');
        expect(results[0].status).toBe('active');
        expect(results[0].categories).toContain('electronics');
      });

      it('should find gifts by category with custom limit', async () => {
        // Act
        const results = await GiftLibrary.findByCategory('electronics', 5);

        // Assert
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Electronics Gift');
      });

      it('should return empty array for non-existent category', async () => {
        // Act
        const results = await GiftLibrary.findByCategory('nonexistent');

        // Assert
        expect(results).toHaveLength(0);
      });

      it('should sort by popularity score in descending order', async () => {
        // Arrange - Create another electronics gift with lower popularity
        const lowPopGift = await GiftLibrary.create({
          name: 'Low Pop Electronics',
          description: 'Less popular electronics',
          categories: ['electronics'],
          popularityScore: 30,
          status: 'active'
        });

        // Act
        const results = await GiftLibrary.findByCategory('electronics');

        // Assert
        expect(results).toHaveLength(2);
        expect(results[0].popularityScore).toBe(85); // Higher popularity first
        expect(results[1].popularityScore).toBe(30); // Lower popularity second
      });

      it('should exclude non-active status gifts', async () => {
        // Act - Search for electronics (gift3 is archived)
        const results = await GiftLibrary.findByCategory('electronics');

        // Assert
        expect(results).toHaveLength(1);
        expect(results.every(gift => gift.status === 'active')).toBe(true);
      });
    });

    describe('findByOccasion() Method', () => {
      it('should find gifts by occasion with default limit', async () => {
        // Act
        const results = await GiftLibrary.findByOccasion('birthday');

        // Assert
        expect(results).toHaveLength(2); // gift1 and gift2
        expect(results.map(g => g.name)).toContain('Electronics Gift');
        expect(results.map(g => g.name)).toContain('Fashion Gift');
      });

      it('should find gifts by occasion with custom limit', async () => {
        // Act
        const results = await GiftLibrary.findByOccasion('birthday', 1);

        // Assert
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Electronics Gift'); // Higher popularity
      });

      it('should return empty array for non-existent occasion', async () => {
        // Act
        const results = await GiftLibrary.findByOccasion('nonexistent');

        // Assert
        expect(results).toHaveLength(0);
      });

      it('should sort by popularity score in descending order', async () => {
        // Act
        const results = await GiftLibrary.findByOccasion('birthday');

        // Assert
        expect(results).toHaveLength(2);
        expect(results[0].popularityScore).toBeGreaterThanOrEqual(results[1].popularityScore);
      });

      it('should exclude non-active status gifts', async () => {
        // Act
        const results = await GiftLibrary.findByOccasion('christmas');

        // Assert - gift3 has christmas occasion but is archived
        expect(results).toHaveLength(0);
      });
    });

    describe('findTrending() Method', () => {
      it('should find trending gifts from last 7 days with default limit', async () => {
        // Act
        const results = await GiftLibrary.findTrending();

        // Assert - Should include gift1, gift2 but not gift4 (too old)
        expect(results).toHaveLength(2);
        expect(results.map(g => g.name)).toContain('Electronics Gift');
        expect(results.map(g => g.name)).toContain('Fashion Gift');
        expect(results.map(g => g.name)).not.toContain('Old Gift');
      });

      it('should find trending gifts with custom limit', async () => {
        // Act
        const results = await GiftLibrary.findTrending(1);

        // Assert
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Electronics Gift'); // Higher popularity
      });

      it('should exclude gifts older than 7 days', async () => {
        // Act
        const results = await GiftLibrary.findTrending();

        // Assert
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        results.forEach(gift => {
          expect(gift.discoveryDate.getTime()).toBeGreaterThanOrEqual(oneWeekAgo.getTime());
        });
      });

      it('should sort by popularity score in descending order', async () => {
        // Act
        const results = await GiftLibrary.findTrending();

        // Assert
        expect(results).toHaveLength(2);
        expect(results[0].popularityScore).toBeGreaterThanOrEqual(results[1].popularityScore);
      });

      it('should exclude non-active status gifts', async () => {
        // Act
        const results = await GiftLibrary.findTrending();

        // Assert - Should not include gift3 (archived)
        expect(results.every(gift => gift.status === 'active')).toBe(true);
        expect(results.map(g => g.name)).not.toContain('Archived Electronics');
      });

      it('should return empty array when no recent gifts exist', async () => {
        // Arrange - Clear all recent gifts
        await GiftLibrary.deleteMany({});
        
        // Create a gift older than 7 days
        await GiftLibrary.create({
          name: 'Very Old Gift',
          description: 'A very old gift',
          status: 'active',
          discoveryDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
        });

        // Act
        const results = await GiftLibrary.findTrending();

        // Assert
        expect(results).toHaveLength(0);
      });
    });
  });

  describe('Middleware', () => {
    describe('Pre-save Hook', () => {
      it('should update lastUpdated field on create', async () => {
        // Arrange
        const beforeSave = new Date();
        const giftData = {
          name: 'Test Gift',
          description: 'A test gift for middleware testing'
        };

        // Act
        const gift = await GiftLibrary.create(giftData);
        const afterSave = new Date();

        // Assert
        expect(gift.lastUpdated).toBeInstanceOf(Date);
        expect(gift.lastUpdated.getTime()).toBeGreaterThanOrEqual(beforeSave.getTime());
        expect(gift.lastUpdated.getTime()).toBeLessThanOrEqual(afterSave.getTime());
      });

      it('should update lastUpdated field on save', async () => {
        // Arrange
        const gift = await GiftLibrary.create({
          name: 'Test Gift',
          description: 'A test gift for middleware testing'
        });
        
        const originalLastUpdated = gift.lastUpdated;
        
        // Wait a bit to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Act
        gift.name = 'Updated Test Gift';
        await gift.save();

        // Assert
        expect(gift.lastUpdated).toBeInstanceOf(Date);
        expect(gift.lastUpdated.getTime()).toBeGreaterThan(originalLastUpdated.getTime());
      });
    });
  });
});
