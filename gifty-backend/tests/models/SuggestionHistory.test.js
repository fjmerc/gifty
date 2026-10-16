// tests/models/SuggestionHistory.test.js
const mongoose = require('mongoose');
const SuggestionHistory = require('../../models/SuggestionHistory');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Mock related models since we're only testing SuggestionHistory functionality
jest.mock('../../models/User');
jest.mock('../../models/Recipient');
jest.mock('../../models/Gift');

// Set higher timeout for database tests
jest.setTimeout(30000);

describe('SuggestionHistory Model', () => {
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
    it('should create a new suggestion history with all required fields', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const giftId = new mongoose.Types.ObjectId();
      
      const suggestionData = {
        user: userId,
        recipient: recipientId,
        gift: giftId
      };

      // Act
      const suggestion = await SuggestionHistory.create(suggestionData);

      // Assert
      expect(suggestion).toBeDefined();
      expect(suggestion.user).toEqual(userId);
      expect(suggestion.recipient).toEqual(recipientId);
      expect(suggestion.gift).toEqual(giftId);
      expect(suggestion.shownAt).toBeInstanceOf(Date);
      expect(suggestion.interacted).toBe(false);
      expect(suggestion.interactionType).toBe('none');
      expect(suggestion.similarityScore).toBe(0);
      expect(suggestion.relevanceScore).toBe(50);
      expect(suggestion.cooldownPeriod).toBe(30);
    });

    it('should fail validation if user field is missing', async () => {
      // Arrange
      const suggestionData = {
        recipient: new mongoose.Types.ObjectId(),
        gift: new mongoose.Types.ObjectId()
      };

      // Act & Assert
      await expect(SuggestionHistory.create(suggestionData)).rejects.toThrow();
    });

    it('should fail validation if recipient field is missing', async () => {
      // Arrange
      const suggestionData = {
        user: new mongoose.Types.ObjectId(),
        gift: new mongoose.Types.ObjectId()
      };

      // Act & Assert
      await expect(SuggestionHistory.create(suggestionData)).rejects.toThrow();
    });

    it('should fail validation if gift field is missing', async () => {
      // Arrange
      const suggestionData = {
        user: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId()
      };

      // Act & Assert
      await expect(SuggestionHistory.create(suggestionData)).rejects.toThrow();
    });

    it('should validate enum values for interactionType', async () => {
      // Arrange
      const suggestionData = {
        user: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        gift: new mongoose.Types.ObjectId(),
        interactionType: 'invalid_type'
      };

      // Act & Assert
      await expect(SuggestionHistory.create(suggestionData)).rejects.toThrow();
    });

    it('should accept valid enum values for interactionType', async () => {
      // Arrange
      const validTypes = ['viewed', 'saved', 'purchased', 'ignored', 'none'];
      const baseData = {
        user: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        gift: new mongoose.Types.ObjectId()
      };

      // Act & Assert
      for (const type of validTypes) {
        const suggestion = await SuggestionHistory.create({
          ...baseData,
          gift: new mongoose.Types.ObjectId(), // Use different gift ID to avoid unique constraint
          interactionType: type
        });
        expect(suggestion.interactionType).toBe(type);
      }
    });

    it('should validate similarityScore range (0-1)', async () => {
      // Arrange
      const suggestionData = {
        user: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        gift: new mongoose.Types.ObjectId(),
        similarityScore: 1.5 // Invalid: greater than 1
      };

      // Act & Assert
      await expect(SuggestionHistory.create(suggestionData)).rejects.toThrow();
    });

    it('should validate relevanceScore range (0-100)', async () => {
      // Arrange
      const suggestionData = {
        user: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        gift: new mongoose.Types.ObjectId(),
        relevanceScore: 150 // Invalid: greater than 100
      };

      // Act & Assert
      await expect(SuggestionHistory.create(suggestionData)).rejects.toThrow();
    });

    it('should validate cooldownPeriod range (1-365)', async () => {
      // Arrange
      const suggestionData = {
        user: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        gift: new mongoose.Types.ObjectId(),
        cooldownPeriod: 0 // Invalid: less than 1
      };

      // Act & Assert
      await expect(SuggestionHistory.create(suggestionData)).rejects.toThrow();
    });
  });

  describe('Instance Methods', () => {
    it('should correctly identify when suggestion is in cooldown', async () => {
      // Arrange
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const suggestion = await SuggestionHistory.create({
        user: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        gift: new mongoose.Types.ObjectId(),
        shownAt: yesterday,
        cooldownPeriod: 30
      });

      // Act
      const isInCooldown = suggestion.isInCooldown();

      // Assert
      expect(isInCooldown).toBe(true);
    });

    it('should correctly identify when suggestion is not in cooldown', async () => {
      // Arrange
      const longAgo = new Date();
      longAgo.setDate(longAgo.getDate() - 40); // 40 days ago
      
      const suggestion = await SuggestionHistory.create({
        user: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        gift: new mongoose.Types.ObjectId(),
        shownAt: longAgo,
        cooldownPeriod: 30
      });

      // Act
      const isInCooldown = suggestion.isInCooldown();

      // Assert
      expect(isInCooldown).toBe(false);
    });

    it('counts cooldown days correctly when the window crosses a DST change', () => {
      // Europe/Berlin falls back on 2026-10-25, inside this 30-day window
      const savedTz = process.env.TZ;
      process.env.TZ = 'Europe/Berlin';
      jest.useFakeTimers({ now: new Date('2026-10-13T12:00:00Z') });
      try {
        const suggestion = new SuggestionHistory({
          user: new mongoose.Types.ObjectId(),
          recipient: new mongoose.Types.ObjectId(),
          gift: new mongoose.Types.ObjectId(),
          shownAt: new Date('2026-10-12T12:00:00Z'),
          cooldownPeriod: 30
        });
        expect(suggestion.cooldownDaysRemaining()).toBe(29);
        expect(suggestion.isInCooldown()).toBe(true);
      } finally {
        jest.useRealTimers();
        if (savedTz === undefined) delete process.env.TZ;
        else process.env.TZ = savedTz;
      }
    });

    it('should calculate correct cooldown days remaining', async () => {
      // Arrange
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      const suggestion = await SuggestionHistory.create({
        user: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        gift: new mongoose.Types.ObjectId(),
        shownAt: oneDayAgo,
        cooldownPeriod: 30
      });

      // Act
      const daysRemaining = suggestion.cooldownDaysRemaining();

      // Assert
      expect(daysRemaining).toBe(29); // 30 - 1 = 29
    });

    it('should return 0 cooldown days when cooldown period has expired', async () => {
      // Arrange
      const longAgo = new Date();
      longAgo.setDate(longAgo.getDate() - 40); // 40 days ago
      
      const suggestion = await SuggestionHistory.create({
        user: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        gift: new mongoose.Types.ObjectId(),
        shownAt: longAgo,
        cooldownPeriod: 30
      });

      // Act
      const daysRemaining = suggestion.cooldownDaysRemaining();

      // Assert
      expect(daysRemaining).toBe(0);
    });

    it('should handle edge case when cooldown ends exactly today', async () => {
      // Arrange
      const exactlyThirtyDaysAgo = new Date();
      exactlyThirtyDaysAgo.setDate(exactlyThirtyDaysAgo.getDate() - 30);
      
      const suggestion = await SuggestionHistory.create({
        user: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        gift: new mongoose.Types.ObjectId(),
        shownAt: exactlyThirtyDaysAgo,
        cooldownPeriod: 30
      });

      // Act
      const isInCooldown = suggestion.isInCooldown();
      const daysRemaining = suggestion.cooldownDaysRemaining();

      // Assert
      expect(isInCooldown).toBe(false);
      expect(daysRemaining).toBe(0);
    });
  });

  describe('Static Methods', () => {
    describe('recordSuggestion', () => {
      it('should create a new suggestion record with complete data', async () => {
        // Arrange
        const userId = new mongoose.Types.ObjectId();
        const recipientId = new mongoose.Types.ObjectId();
        const giftId = new mongoose.Types.ObjectId();
        
        const suggestionData = {
          user: userId,
          recipient: recipientId,
          gift: giftId,
          similarityScore: 0.8,
          relevanceScore: 85,
          giftName: 'Test Gift',
          giftCategory: 'electronics',
          giftTags: ['tech', 'gadget'],
          giftPrice: 99.99,
          cooldownPeriod: 45
        };

        // Act
        const result = await SuggestionHistory.recordSuggestion(suggestionData);

        // Assert
        expect(result).toBeDefined();
        expect(result.user).toEqual(userId);
        expect(result.recipient).toEqual(recipientId);
        expect(result.gift).toEqual(giftId);
        expect(result.similarityScore).toBe(0.8);
        expect(result.relevanceScore).toBe(85);
        expect(result.giftMetadata.name).toBe('Test Gift');
        expect(result.giftMetadata.category).toBe('electronics');
        expect(result.giftMetadata.tags).toEqual(['tech', 'gadget']);
        expect(result.giftMetadata.price).toBe(99.99);
        expect(result.cooldownPeriod).toBe(45);
      });

      it('should create a new suggestion record with minimal data', async () => {
        // Arrange
        const suggestionData = {
          user: new mongoose.Types.ObjectId(),
          recipient: new mongoose.Types.ObjectId(),
          gift: new mongoose.Types.ObjectId()
        };

        // Act
        const result = await SuggestionHistory.recordSuggestion(suggestionData);

        // Assert
        expect(result).toBeDefined();
        expect(result.similarityScore).toBe(0);
        expect(result.relevanceScore).toBe(50);
        expect(result.cooldownPeriod).toBe(30);
        expect(result.giftMetadata.tags).toEqual([]);
      });

      it('should update existing suggestion record with new timestamp', async () => {
        // Arrange
        const userId = new mongoose.Types.ObjectId();
        const recipientId = new mongoose.Types.ObjectId();
        const giftId = new mongoose.Types.ObjectId();
        
        // Create initial record
        const initialData = {
          user: userId,
          recipient: recipientId,
          gift: giftId,
          similarityScore: 0.5
        };
        
        const initialRecord = await SuggestionHistory.recordSuggestion(initialData);
        const originalTimestamp = initialRecord.shownAt;
        
        // Wait a bit to ensure timestamp difference
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Act - record same suggestion again with updated data
        const updateData = {
          user: userId,
          recipient: recipientId,
          gift: giftId,
          similarityScore: 0.9,
          relevanceScore: 95
        };
        
        const updatedRecord = await SuggestionHistory.recordSuggestion(updateData);

        // Assert
        expect(updatedRecord._id).toEqual(initialRecord._id); // Same document
        expect(updatedRecord.shownAt.getTime()).toBeGreaterThan(originalTimestamp.getTime());
        expect(updatedRecord.similarityScore).toBe(0.9);
        expect(updatedRecord.relevanceScore).toBe(95);
      });

      it('should handle errors during suggestion recording', async () => {
        // Arrange - invalid data (missing required fields)
        const invalidData = {
          user: 'invalid_id', // Invalid ObjectId
          recipient: new mongoose.Types.ObjectId(),
          gift: new mongoose.Types.ObjectId()
        };

        // Act & Assert
        await expect(SuggestionHistory.recordSuggestion(invalidData)).rejects.toThrow();
      });
    });

    describe('updateInteraction', () => {
      it('should update interaction for existing suggestion', async () => {
        // Arrange
        const userId = new mongoose.Types.ObjectId();
        const recipientId = new mongoose.Types.ObjectId();
        const giftId = new mongoose.Types.ObjectId();
        
        // Create initial suggestion
        await SuggestionHistory.create({
          user: userId,
          recipient: recipientId,
          gift: giftId
        });

        // Act
        const result = await SuggestionHistory.updateInteraction(userId, recipientId, giftId, 'viewed');

        // Assert
        expect(result).toBeDefined();
        expect(result.interacted).toBe(true);
        expect(result.interactionType).toBe('viewed');
      });

      it('should return null for non-existent suggestion', async () => {
        // Arrange
        const userId = new mongoose.Types.ObjectId();
        const recipientId = new mongoose.Types.ObjectId();
        const giftId = new mongoose.Types.ObjectId();

        // Act
        const result = await SuggestionHistory.updateInteraction(userId, recipientId, giftId, 'viewed');

        // Assert
        expect(result).toBeNull();
      });

      it('should handle errors gracefully and return null', async () => {
        // Arrange - invalid ObjectId
        const invalidId = 'invalid_id';

        // Act
        const result = await SuggestionHistory.updateInteraction(invalidId, new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), 'viewed');

        // Assert
        expect(result).toBeNull();
      });
    });

    describe('findSimilarInCooldown', () => {
      it('should find similar suggestions based on category match', async () => {
        // Arrange
        const userId = new mongoose.Types.ObjectId();
        const recipientId = new mongoose.Types.ObjectId();
        
        // Create suggestion with electronics category
        await SuggestionHistory.create({
          user: userId,
          recipient: recipientId,
          gift: new mongoose.Types.ObjectId(),
          shownAt: new Date(), // Recent, still in cooldown
          cooldownPeriod: 30,
          giftMetadata: {
            category: 'electronics',
            tags: ['tech', 'gadget'],
            price: 100
          }
        });

        const giftData = {
          category: 'Electronics', // Different case - category match
          tags: ['tech', 'smartphone'], // 1 overlapping tag (not enough for tag overlap)
          estimatedPrice: 105 // Within 20% of 100 - price match
        };

        // Act
        const similar = await SuggestionHistory.findSimilarInCooldown(userId, recipientId, giftData);

        // Assert
        expect(similar).toHaveLength(1);
        expect(similar[0].giftMetadata.category).toBe('electronics');
      });

      it('should find similar suggestions based on tag overlap', async () => {
        // Arrange
        const userId = new mongoose.Types.ObjectId();
        const recipientId = new mongoose.Types.ObjectId();
        
        // Create suggestion with overlapping tags
        await SuggestionHistory.create({
          user: userId,
          recipient: recipientId,
          gift: new mongoose.Types.ObjectId(),
          shownAt: new Date(),
          cooldownPeriod: 30,
          giftMetadata: {
            category: 'books',
            tags: ['fiction', 'mystery', 'thriller'],
            price: 15
          }
        });

        const giftData = {
          category: 'Books', // Same category (case insensitive) - category match
          tags: ['Mystery', 'Thriller', 'crime'], // 2 overlapping tags (case insensitive) - tag overlap
          estimatedPrice: 30 // Different price (100% difference, outside 20%)
        };

        // Act
        const similar = await SuggestionHistory.findSimilarInCooldown(userId, recipientId, giftData);

        // Assert
        expect(similar).toHaveLength(1);
        expect(similar[0].giftMetadata.tags).toContain('mystery');
        expect(similar[0].giftMetadata.tags).toContain('thriller');
      });

      it('should find similar suggestions based on price similarity', async () => {
        // Arrange
        const userId = new mongoose.Types.ObjectId();
        const recipientId = new mongoose.Types.ObjectId();
        
        // Create suggestion with similar price
        await SuggestionHistory.create({
          user: userId,
          recipient: recipientId,
          gift: new mongoose.Types.ObjectId(),
          shownAt: new Date(),
          cooldownPeriod: 30,
          giftMetadata: {
            category: 'clothing',
            tags: ['shirt', 'cotton'],
            price: 50
          }
        });

        const giftData = {
          category: 'Clothing', // Same category
          tags: ['pants', 'denim'], // Different tags
          price: 55 // Within 20% of 50 (10% difference)
        };

        // Act
        const similar = await SuggestionHistory.findSimilarInCooldown(userId, recipientId, giftData);

        // Assert
        expect(similar).toHaveLength(1);
        expect(similar[0].giftMetadata.price).toBe(50);
      });

      it('should require at least 2 similarity factors to match', async () => {
        // Arrange
        const userId = new mongoose.Types.ObjectId();
        const recipientId = new mongoose.Types.ObjectId();
        
        // Create suggestion with only 1 matching factor (category)
        await SuggestionHistory.create({
          user: userId,
          recipient: recipientId,
          gift: new mongoose.Types.ObjectId(),
          shownAt: new Date(),
          cooldownPeriod: 30,
          giftMetadata: {
            category: 'electronics',
            tags: ['computer', 'desktop'],
            price: 1000
          }
        });

        const giftData = {
          category: 'electronics', // Match
          tags: ['phone', 'mobile'], // No overlap
          estimatedPrice: 200 // Too different (80% difference)
        };

        // Act
        const similar = await SuggestionHistory.findSimilarInCooldown(userId, recipientId, giftData);

        // Assert
        expect(similar).toHaveLength(0);
      });

      it('should exclude suggestions that are no longer in cooldown', async () => {
        // Arrange
        const userId = new mongoose.Types.ObjectId();
        const recipientId = new mongoose.Types.ObjectId();
        
        // Create old suggestion (outside cooldown)
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 40); // 40 days ago, outside 30-day cooldown
        
        await SuggestionHistory.create({
          user: userId,
          recipient: recipientId,
          gift: new mongoose.Types.ObjectId(),
          shownAt: oldDate,
          cooldownPeriod: 30,
          giftMetadata: {
            category: 'electronics',
            tags: ['tech', 'gadget'],
            price: 100
          }
        });

        const giftData = {
          category: 'electronics',
          tags: ['tech', 'device'],
          estimatedPrice: 95
        };

        // Act
        const similar = await SuggestionHistory.findSimilarInCooldown(userId, recipientId, giftData);

        // Assert
        expect(similar).toHaveLength(0);
      });

      it('should handle missing or undefined gift data gracefully', async () => {
        // Arrange
        const userId = new mongoose.Types.ObjectId();
        const recipientId = new mongoose.Types.ObjectId();
        
        const giftData = {
          // Missing category, tags, and price
        };

        // Act
        const similar = await SuggestionHistory.findSimilarInCooldown(userId, recipientId, giftData);

        // Assert
        expect(similar).toHaveLength(0);
      });

      it('should handle multiple similarity factors matching', async () => {
        // Arrange
        const userId = new mongoose.Types.ObjectId();
        const recipientId = new mongoose.Types.ObjectId();
        
        // Create suggestion with all factors matching
        await SuggestionHistory.create({
          user: userId,
          recipient: recipientId,
          gift: new mongoose.Types.ObjectId(),
          shownAt: new Date(),
          cooldownPeriod: 30,
          giftMetadata: {
            category: 'books',
            tags: ['fiction', 'mystery', 'bestseller'],
            price: 25
          }
        });

        const giftData = {
          category: 'books', // Category match
          tags: ['Fiction', 'Mystery', 'crime'], // Tag overlap (2+ tags)
          estimatedPrice: 24 // Price similarity (4% difference)
        };

        // Act
        const similar = await SuggestionHistory.findSimilarInCooldown(userId, recipientId, giftData);

        // Assert
        expect(similar).toHaveLength(1);
        // All three factors should match
        const suggestion = similar[0];
        expect(suggestion.giftMetadata.category).toBe('books');
        expect(suggestion.giftMetadata.tags).toEqual(expect.arrayContaining(['fiction', 'mystery']));
        expect(suggestion.giftMetadata.price).toBe(25);
      });

      it('should return empty array when no suggestions exist', async () => {
        // Arrange
        const userId = new mongoose.Types.ObjectId();
        const recipientId = new mongoose.Types.ObjectId();
        
        const giftData = {
          category: 'electronics',
          tags: ['tech'],
          estimatedPrice: 100
        };

        // Act
        const similar = await SuggestionHistory.findSimilarInCooldown(userId, recipientId, giftData);

        // Assert
        expect(similar).toHaveLength(0);
      });

      it('should handle errors gracefully and return empty array', async () => {
        // Arrange - invalid user ID
        const invalidUserId = 'invalid_id';
        const recipientId = new mongoose.Types.ObjectId();
        
        const giftData = {
          category: 'electronics',
          tags: ['tech'],
          estimatedPrice: 100
        };

        // Act
        const similar = await SuggestionHistory.findSimilarInCooldown(invalidUserId, recipientId, giftData);

        // Assert
        expect(similar).toHaveLength(0);
      });

      it('should only consider suggestions for the specific user and recipient', async () => {
        // Arrange
        const userId1 = new mongoose.Types.ObjectId();
        const userId2 = new mongoose.Types.ObjectId();
        const recipientId1 = new mongoose.Types.ObjectId();
        const recipientId2 = new mongoose.Types.ObjectId();
        
        // Create similar suggestion for different user
        await SuggestionHistory.create({
          user: userId2, // Different user
          recipient: recipientId1,
          gift: new mongoose.Types.ObjectId(),
          shownAt: new Date(),
          cooldownPeriod: 30,
          giftMetadata: {
            category: 'electronics',
            tags: ['tech', 'gadget'],
            price: 100
          }
        });
        
        // Create similar suggestion for different recipient
        await SuggestionHistory.create({
          user: userId1,
          recipient: recipientId2, // Different recipient
          gift: new mongoose.Types.ObjectId(),
          shownAt: new Date(),
          cooldownPeriod: 30,
          giftMetadata: {
            category: 'electronics',
            tags: ['tech', 'gadget'],
            price: 100
          }
        });

        const giftData = {
          category: 'electronics',
          tags: ['tech', 'device'],
          estimatedPrice: 95
        };

        // Act
        const similar = await SuggestionHistory.findSimilarInCooldown(userId1, recipientId1, giftData);

        // Assert
        expect(similar).toHaveLength(0); // Should not find suggestions for other users/recipients
      });
    });
  });
});
