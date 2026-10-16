// tests/models/Gift.test.js
const mongoose = require('mongoose');
const Gift = require('../../models/Gift');
const { Budget, UserPreferences } = require('../../models/Budget');
const Event = require('../../models/Event');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Set higher timeout for database tests
jest.setTimeout(30000);

describe('Gift Model', () => {
  let testUser, testEvent, testRecipient, testBudget;

  // Connect to test database before all tests
  beforeAll(async () => {
    await setupTestDB();
  });

  // Set up test data before each test
  beforeEach(async () => {
    testUser = new mongoose.Types.ObjectId();
    testEvent = new mongoose.Types.ObjectId();
    testRecipient = new mongoose.Types.ObjectId();
    testBudget = new mongoose.Types.ObjectId();
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
    it('should create gift with all required fields', async () => {
      // Arrange
      const giftData = {
        user: testUser,
        event: testEvent,
        recipient: testRecipient,
        name: 'Test Gift',
        price: 50
      };

      // Act
      const gift = await Gift.create(giftData);

      // Assert
      expect(gift).toBeDefined();
      expect(gift.user).toEqual(testUser);
      expect(gift.event).toEqual(testEvent);
      expect(gift.recipient).toEqual(testRecipient);
      expect(gift.name).toBe('Test Gift');
      expect(gift.price).toBe(50);
      // Test default values
      expect(gift.status).toBe('suggestion');
      expect(gift.budgetStatus).toBeUndefined();
      expect(gift.category).toBe('Uncategorized');
      expect(gift.isAISuggested).toBe(false);
      expect(gift.favorite).toBe(false);
      expect(gift.tags).toEqual([]);
      expect(gift.whereToBuy).toEqual([]);
      expect(gift.createdAt).toBeDefined();
      expect(gift.updatedAt).toBeDefined();
    });

    it('should fail validation if required fields are missing', async () => {
      // Arrange
      const incompleteData = {
        user: testUser
        // Missing event, recipient, name, price
      };

      // Act & Assert
      await expect(Gift.create(incompleteData)).rejects.toThrow();
    });

    it('should fail validation if user field is missing', async () => {
      // Arrange
      const incompleteData = {
        event: testEvent,
        recipient: testRecipient,
        name: 'Test Gift',
        price: 50
      };

      // Act & Assert
      await expect(Gift.create(incompleteData)).rejects.toThrow();
    });

    it('should fail validation if event field is missing', async () => {
      // Arrange
      const incompleteData = {
        user: testUser,
        recipient: testRecipient,
        name: 'Test Gift',
        price: 50
      };

      // Act & Assert
      await expect(Gift.create(incompleteData)).rejects.toThrow();
    });

    it('should fail validation if recipient field is missing', async () => {
      // Arrange
      const incompleteData = {
        user: testUser,
        event: testEvent,
        name: 'Test Gift',
        price: 50
      };

      // Act & Assert
      await expect(Gift.create(incompleteData)).rejects.toThrow();
    });

    it('should fail validation if name field is missing', async () => {
      // Arrange
      const incompleteData = {
        user: testUser,
        event: testEvent,
        recipient: testRecipient,
        price: 50
      };

      // Act & Assert
      await expect(Gift.create(incompleteData)).rejects.toThrow();
    });

    it('should fail validation if price field is missing', async () => {
      // Arrange
      const incompleteData = {
        user: testUser,
        event: testEvent,
        recipient: testRecipient,
        name: 'Test Gift'
      };

      // Act & Assert
      await expect(Gift.create(incompleteData)).rejects.toThrow();
    });

    it('should validate status enum values', async () => {
      // Arrange
      const validStatuses = ['suggestion', 'saved', 'purchased', 'ignored'];

      for (const status of validStatuses) {
        const giftData = {
          user: testUser,
          event: testEvent,
          recipient: testRecipient,
          name: 'Test Gift',
          price: 50,
          status
        };

        // Act
        const gift = await Gift.create(giftData);

        // Assert
        expect(gift.status).toBe(status);

        // Clean up for next iteration
        await gift.deleteOne();
      }
    });

    it('should fail validation for invalid status enum value', async () => {
      // Arrange
      const giftData = {
        user: testUser,
        event: testEvent,
        recipient: testRecipient,
        name: 'Test Gift',
        price: 50,
        status: 'invalid_status'
      };

      // Act & Assert
      await expect(Gift.create(giftData)).rejects.toThrow();
    });

    it('should validate relevanceScore range (0-100)', async () => {
      // Test valid scores
      const validScores = [0, 50, 100];
      for (const score of validScores) {
        const giftData = {
          user: testUser,
          event: testEvent,
          recipient: testRecipient,
          name: 'Test Gift',
          price: 50,
          relevanceScore: score
        };

        const gift = await Gift.create(giftData);
        expect(gift.relevanceScore).toBe(score);
        await gift.deleteOne();
      }
    });

    it('should fail validation for relevanceScore below 0', async () => {
      // Arrange
      const giftData = {
        user: testUser,
        event: testEvent,
        recipient: testRecipient,
        name: 'Test Gift',
        price: 50,
        relevanceScore: -1
      };

      // Act & Assert
      await expect(Gift.create(giftData)).rejects.toThrow();
    });

    it('should fail validation for relevanceScore above 100', async () => {
      // Arrange
      const giftData = {
        user: testUser,
        event: testEvent,
        recipient: testRecipient,
        name: 'Test Gift',
        price: 50,
        relevanceScore: 101
      };

      // Act & Assert
      await expect(Gift.create(giftData)).rejects.toThrow();
    });

    it('should handle optional fields correctly', async () => {
      // Arrange
      const giftData = {
        user: testUser,
        event: testEvent,
        recipient: testRecipient,
        name: 'Test Gift',
        price: 50,
        description: 'A wonderful test gift',
        category: 'Electronics',
        tags: ['tech', 'gadget'],
        whereToBuy: ['Amazon', 'Best Buy'],
        priceRange: { min: 40, max: 60 },
        purchaseDate: new Date(),
        relevanceScore: 85,
        generatedAt: new Date(),
        isAISuggested: true,
        favorite: true
      };

      // Act
      const gift = await Gift.create(giftData);

      // Assert
      expect(gift.description).toBe('A wonderful test gift');
      expect(gift.category).toBe('Electronics');
      expect(gift.tags).toEqual(['tech', 'gadget']);
      expect(gift.whereToBuy).toEqual(['Amazon', 'Best Buy']);
      expect(gift.priceRange.min).toBe(40);
      expect(gift.priceRange.max).toBe(60);
      expect(gift.purchaseDate).toBeDefined();
      expect(gift.relevanceScore).toBe(85);
      expect(gift.generatedAt).toBeDefined();
      expect(gift.isAISuggested).toBe(true);
      expect(gift.favorite).toBe(true);
    });

    it('should handle nested priceRange object validation', async () => {
      // Arrange
      const giftData = {
        user: testUser,
        event: testEvent,
        recipient: testRecipient,
        name: 'Test Gift',
        price: 50,
        priceRange: {
          min: 30,
          max: 70
        }
      };

      // Act
      const gift = await Gift.create(giftData);

      // Assert
      expect(gift.priceRange).toBeDefined();
      expect(gift.priceRange.min).toBe(30);
      expect(gift.priceRange.max).toBe(70);
    });

    it('should handle empty arrays for tags and whereToBuy', async () => {
      // Arrange
      const giftData = {
        user: testUser,
        event: testEvent,
        recipient: testRecipient,
        name: 'Test Gift',
        price: 50,
        tags: [],
        whereToBuy: []
      };

      // Act
      const gift = await Gift.create(giftData);

      // Assert
      expect(gift.tags).toEqual([]);
      expect(gift.whereToBuy).toEqual([]);
    });
  });

  describe('Static Methods', () => {
    describe('findWithinBudget() Method', () => {
      let gift1, gift2, gift3, gift4;

      beforeEach(async () => {
        // Create test gifts with different prices and statuses
        gift1 = await Gift.create({
          user: testUser,
          event: testEvent,
          recipient: testRecipient,
          name: 'Cheap Gift',
          price: 25,
          status: 'suggestion'
        });

        gift2 = await Gift.create({
          user: testUser,
          event: testEvent,
          recipient: testRecipient,
          name: 'Medium Gift',
          price: 75,
          status: 'saved'
        });

        gift3 = await Gift.create({
          user: testUser,
          event: testEvent,
          recipient: testRecipient,
          name: 'Expensive Gift',
          price: 150,
          status: 'suggestion'
        });

        gift4 = await Gift.create({
          user: testUser,
          event: testEvent,
          recipient: testRecipient,
          name: 'Purchased Gift',
          price: 50,
          status: 'purchased' // Should be excluded
        });
      });

      it('should find gifts within budget price limit', async () => {
        // Act
        const results = await Gift.findWithinBudget(testUser, testRecipient, 100);

        // Assert
        expect(results).toHaveLength(2); // gift1 (25) and gift2 (75)
        expect(results.map(g => g.name)).toContain('Cheap Gift');
        expect(results.map(g => g.name)).toContain('Medium Gift');
        expect(results.map(g => g.name)).not.toContain('Expensive Gift'); // 150 > 100
        expect(results.map(g => g.name)).not.toContain('Purchased Gift'); // Excluded
      });

      it('should return gifts sorted by price in descending order', async () => {
        // Act
        const results = await Gift.findWithinBudget(testUser, testRecipient, 100);

        // Assert
        expect(results).toHaveLength(2);
        expect(results[0].price).toBe(75); // Medium Gift first
        expect(results[1].price).toBe(25); // Cheap Gift second
      });

      it('should exclude purchased gifts', async () => {
        // Act
        const results = await Gift.findWithinBudget(testUser, testRecipient, 200);

        // Assert
        expect(results).toHaveLength(3); // All except purchased
        expect(results.map(g => g.status)).not.toContain('purchased');
      });

      it('should return empty array when no gifts within budget', async () => {
        // Act
        const results = await Gift.findWithinBudget(testUser, testRecipient, 10);

        // Assert
        expect(results).toHaveLength(0);
      });
    });
  });
});
