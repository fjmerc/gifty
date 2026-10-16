// tests/services/feedbackService.test.js
const mongoose = require('mongoose');
const feedbackService = require('../../services/feedbackService');
const Gift = require('../../models/Gift');
const FeedbackLog = require('../../models/FeedbackLog');
const SuggestionHistory = require('../../models/SuggestionHistory');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Mock all dependencies
jest.mock('../../models/Gift');
jest.mock('../../models/FeedbackLog');
jest.mock('../../models/SuggestionHistory');
jest.mock('../../services/trendAnalysisService');
// Mock the suggestion cache: it transitively requires config/redis, which
// opens real ioredis connections at require time and keeps jest from exiting.
jest.mock('../../services/suggestionCacheService', () => ({
  invalidateForRecipient: jest.fn().mockResolvedValue(1)
}));

// Mock data factory functions
const createMockGift = (overrides = {}) => {
  return {
    _id: new mongoose.Types.ObjectId(),
    user: new mongoose.Types.ObjectId(),
    recipient: new mongoose.Types.ObjectId(),
    name: 'Smart Watch',
    description: 'A smart watch with fitness tracking',
    category: 'Electronics',
    tags: ['tech', 'fitness', 'watch'],
    price: 75,
    estimatedPrice: 75,
    status: 'suggestion',
    isAISuggested: true,
    relevanceScore: 85,
    favorite: false,
    purchaseDate: null,
    save: jest.fn().mockResolvedValue(true),
    ...overrides
  };
};

const createMockFeedbackLog = (overrides = {}) => {
  return {
    _id: new mongoose.Types.ObjectId(),
    gift: new mongoose.Types.ObjectId(),
    user: new mongoose.Types.ObjectId(),
    recipient: new mongoose.Types.ObjectId(),
    action: 'saved',
    explicitRating: 4,
    category: 'Electronics',
    tags: ['tech', 'fitness'],
    relevanceScore: 85,
    timestamp: new Date('2024-01-15'),
    comment: 'Great suggestion!',
    ...overrides
  };
};

const createMockUser = (overrides = {}) => {
  return {
    _id: new mongoose.Types.ObjectId(),
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    ...overrides
  };
};

const createMockRecipient = (overrides = {}) => {
  return {
    _id: new mongoose.Types.ObjectId(),
    firstName: 'Jane',
    lastName: 'Smith',
    ...overrides
  };
};

// Mock aggregation result factories
const createMockUserStatsResults = () => ({
  actionCounts: [
    { _id: 'purchased', count: 5 },
    { _id: 'saved', count: 10 },
    { _id: 'ignored', count: 3 },
    { _id: 'favorited', count: 2 }
  ],
  ratings: [
    {
      _id: null,
      averageRating: 4.2,
      count: 12,
      minRating: 2,
      maxRating: 5
    }
  ],
  categoryDistribution: [
    { _id: 'Electronics', count: 8 },
    { _id: 'Books', count: 5 },
    { _id: 'Home', count: 3 }
  ],
  tagDistribution: [
    { _id: 'tech', count: 6 },
    { _id: 'books', count: 4 },
    { _id: 'fitness', count: 3 }
  ]
});

const createMockRecipientSummaryResults = () => ({
  topCategories: [
    { _id: 'Electronics', count: 8 },
    { _id: 'Books', count: 5 }
  ],
  topTags: [
    { _id: 'tech', count: 6 },
    { _id: 'books', count: 4 }
  ],
  negativeCategories: [
    { _id: 'Clothing', count: 2 }
  ],
  negativeTags: [
    { _id: 'fashion', count: 2 }
  ],
  ratings: [
    {
      _id: null,
      averageRating: 4.5,
      count: 10,
      minRating: 3,
      maxRating: 5
    }
  ],
  monthlyTrends: [
    {
      _id: { year: 2024, month: 1 },
      count: 15,
      positiveCount: 12
    }
  ]
});

// Set higher timeout for service tests
jest.setTimeout(30000);

describe('Feedback Service', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  afterEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  // Section 1: Core Feedback Tracking Tests
  describe('trackFeedback', () => {
    it('should track feedback for AI suggested gift without changing its status', async () => {
      // Arrange
      const mockGift = createMockGift({
        isAISuggested: true,
        status: 'suggestion'
      });
      const mockFeedbackLog = createMockFeedbackLog();
      
      const feedback = {
        giftId: mockGift._id.toString(),
        action: 'saved',
        explicitRating: 4,
        userId: new mongoose.Types.ObjectId().toString(),
        comment: 'Great suggestion!'
      };

      // Mock Gift.findOne (scoped to the caller)
      Gift.findOne = jest.fn().mockResolvedValue(mockGift);
      
      // Mock FeedbackLog.create
      FeedbackLog.create = jest.fn().mockResolvedValue(mockFeedbackLog);
      
      // Mock updateSuggestionHistory method
      const updateSuggestionHistorySpy = jest.spyOn(feedbackService, 'updateSuggestionHistory')
        .mockResolvedValue(true);
      
      // Mock success metrics methods
      const updateCategorySuccessSpy = jest.spyOn(feedbackService, 'updateCategorySuccess')
        .mockResolvedValue(true);
      const updateTagSuccessSpy = jest.spyOn(feedbackService, 'updateTagSuccess')
        .mockResolvedValue(true);

      // Act
      const result = await feedbackService.trackFeedback(feedback);

      // Assert
      expect(Gift.findOne).toHaveBeenCalledWith({ _id: feedback.giftId, user: feedback.userId });
      // Feedback records the signal only; saving goes through the gift endpoints
      expect(mockGift.save).not.toHaveBeenCalled();
      expect(mockGift.status).toBe('suggestion');
      
      expect(FeedbackLog.create).toHaveBeenCalledWith({
        gift: feedback.giftId,
        user: feedback.userId,
        recipient: mockGift.recipient,
        action: feedback.action,
        explicitRating: feedback.explicitRating,
        category: mockGift.category,
        tags: mockGift.tags,
        relevanceScore: mockGift.relevanceScore,
        timestamp: expect.any(Date),
        comment: feedback.comment
      });
      
      expect(updateSuggestionHistorySpy).toHaveBeenCalledWith(
        feedback.userId,
        mockGift.recipient,
        feedback.giftId,
        feedback.action
      );
      
      expect(updateCategorySuccessSpy).toHaveBeenCalledWith(mockGift.category, feedback.action);
      expect(updateTagSuccessSpy).toHaveBeenCalledWith(mockGift.tags, feedback.action);
      
      expect(result).toEqual({
        success: true,
        gift: {
          id: mockGift._id,
          name: mockGift.name,
          status: mockGift.status
        }
      });

      // Restore spies
      updateSuggestionHistorySpy.mockRestore();
      updateCategorySuccessSpy.mockRestore();
      updateTagSuccessSpy.mockRestore();
    });

    it('should record purchased feedback without marking the gift purchased (budget bypass)', async () => {
      // Arrange
      const mockGift = createMockGift({
        isAISuggested: true,
        status: 'suggestion'
      });
      
      const feedback = {
        giftId: mockGift._id.toString(),
        action: 'purchased',
        userId: new mongoose.Types.ObjectId().toString()
      };

      Gift.findOne = jest.fn().mockResolvedValue(mockGift);
      FeedbackLog.create = jest.fn().mockResolvedValue(createMockFeedbackLog());
      
      // Mock other methods
      const updateSuggestionHistorySpy = jest.spyOn(feedbackService, 'updateSuggestionHistory').mockResolvedValue(true);
      const updateCategorySuccessSpy = jest.spyOn(feedbackService, 'updateCategorySuccess').mockResolvedValue(true);
      const updateTagSuccessSpy = jest.spyOn(feedbackService, 'updateTagSuccess').mockResolvedValue(true);

      // Act
      const result = await feedbackService.trackFeedback(feedback);

      // Assert
      expect(mockGift.status).toBe('suggestion');
      expect(mockGift.purchaseDate).toBeNull();
      expect(mockGift.save).not.toHaveBeenCalled();
      expect(FeedbackLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'purchased' }));
      expect(result.success).toBe(true);
      
      // Restore spies
      updateSuggestionHistorySpy.mockRestore();
      updateCategorySuccessSpy.mockRestore();
      updateTagSuccessSpy.mockRestore();
    });

    it('should handle favorited action correctly', async () => {
      // Arrange
      const mockGift = createMockGift({
        isAISuggested: true,
        favorite: false
      });
      
      const feedback = {
        giftId: mockGift._id.toString(),
        action: 'favorited',
        userId: new mongoose.Types.ObjectId().toString()
      };

      Gift.findOne = jest.fn().mockResolvedValue(mockGift);
      FeedbackLog.create = jest.fn().mockResolvedValue(createMockFeedbackLog());
      
      // Mock other methods
      const updateSuggestionHistorySpy = jest.spyOn(feedbackService, 'updateSuggestionHistory').mockResolvedValue(true);
      const updateCategorySuccessSpy = jest.spyOn(feedbackService, 'updateCategorySuccess').mockResolvedValue(true);
      const updateTagSuccessSpy = jest.spyOn(feedbackService, 'updateTagSuccess').mockResolvedValue(true);

      // Act
      const result = await feedbackService.trackFeedback(feedback);

      // Assert
      expect(mockGift.favorite).toBe(true);
      expect(mockGift.save).toHaveBeenCalled();
      expect(result.success).toBe(true);
      
      // Restore spies
      updateSuggestionHistorySpy.mockRestore();
      updateCategorySuccessSpy.mockRestore();
      updateTagSuccessSpy.mockRestore();
    });

    it('should hide an unpurchased gift on ignored feedback', async () => {
      const mockGift = createMockGift({ isAISuggested: false, status: 'suggestion' });
      Gift.findOne = jest.fn().mockResolvedValue(mockGift);

      const result = await feedbackService.trackFeedback({
        giftId: mockGift._id.toString(), action: 'ignored', userId: new mongoose.Types.ObjectId().toString()
      });

      expect(mockGift.status).toBe('ignored');
      expect(mockGift.save).toHaveBeenCalled();
      expect(result.gift.status).toBe('ignored');
    });

    it('should never change the status of a purchased gift', async () => {
      const mockGift = createMockGift({ isAISuggested: false, status: 'purchased' });
      Gift.findOne = jest.fn().mockResolvedValue(mockGift);

      const result = await feedbackService.trackFeedback({
        giftId: mockGift._id.toString(), action: 'ignored', userId: new mongoose.Types.ObjectId().toString()
      });

      expect(mockGift.status).toBe('purchased');
      expect(mockGift.save).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should skip detailed tracking for non-AI suggested gifts', async () => {
      // Arrange
      const mockGift = createMockGift({
        isAISuggested: false,
        status: 'suggestion'
      });
      
      const feedback = {
        giftId: mockGift._id.toString(),
        action: 'saved',
        userId: new mongoose.Types.ObjectId().toString()
      };

      Gift.findOne = jest.fn().mockResolvedValue(mockGift);
      FeedbackLog.create = jest.fn();
      
      // Mock other methods - these should NOT be called
      const updateSuggestionHistorySpy = jest.spyOn(feedbackService, 'updateSuggestionHistory');
      const updateCategorySuccessSpy = jest.spyOn(feedbackService, 'updateCategorySuccess');
      const updateTagSuccessSpy = jest.spyOn(feedbackService, 'updateTagSuccess');

      // Act
      const result = await feedbackService.trackFeedback(feedback);

      // Assert
      expect(mockGift.save).not.toHaveBeenCalled();
      expect(mockGift.status).toBe('suggestion');
      
      // These should NOT be called for non-AI suggestions
      expect(FeedbackLog.create).not.toHaveBeenCalled();
      expect(updateSuggestionHistorySpy).not.toHaveBeenCalled();
      expect(updateCategorySuccessSpy).not.toHaveBeenCalled();
      expect(updateTagSuccessSpy).not.toHaveBeenCalled();
      
      expect(result.success).toBe(true);
    });

    it('should handle gift not found error', async () => {
      // Arrange
      const feedback = {
        giftId: new mongoose.Types.ObjectId().toString(),
        action: 'saved',
        userId: new mongoose.Types.ObjectId().toString()
      };

      Gift.findOne = jest.fn().mockResolvedValue(null);

      // Act
      const result = await feedbackService.trackFeedback(feedback);

      // Assert
      expect(Gift.findOne).toHaveBeenCalledWith({ _id: feedback.giftId, user: feedback.userId });
      expect(result).toEqual({
        success: false,
        error: 'Gift not found'
      });
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      const feedback = {
        giftId: new mongoose.Types.ObjectId().toString(),
        action: 'saved',
        userId: new mongoose.Types.ObjectId().toString()
      };

      const errorMessage = 'Database connection error';
      Gift.findOne = jest.fn().mockRejectedValue(new Error(errorMessage));

      // Act
      const result = await feedbackService.trackFeedback(feedback);

      // Assert
      expect(result).toEqual({
        success: false,
        error: errorMessage
      });
    });
  });

  // Section 2: User Feedback Statistics Tests
  describe('getUserFeedbackStats', () => {
    it('should successfully retrieve user feedback statistics with default date range', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId().toString();
      const mockResults = createMockUserStatsResults();
      
      // Mock FeedbackLog.aggregate for different aggregations
      FeedbackLog.aggregate = jest.fn()
        .mockResolvedValueOnce(mockResults.actionCounts) // Action counts
        .mockResolvedValueOnce(mockResults.ratings) // Ratings
        .mockResolvedValueOnce(mockResults.categoryDistribution) // Categories
        .mockResolvedValueOnce(mockResults.tagDistribution); // Tags
      
      // Mock FeedbackLog.countDocuments for total feedback
      FeedbackLog.countDocuments = jest.fn().mockResolvedValue(20);

      // Act
      const result = await feedbackService.getUserFeedbackStats(userId);

      // Assert
      expect(FeedbackLog.aggregate).toHaveBeenCalledTimes(4);
      expect(FeedbackLog.countDocuments).toHaveBeenCalled();
      
      // Verify the structure of the result
      expect(result).toHaveProperty('actionCounts');
      expect(result).toHaveProperty('ratings');
      expect(result).toHaveProperty('categories');
      expect(result).toHaveProperty('tags');
      expect(result).toHaveProperty('totalFeedback', 20);
      expect(result).toHaveProperty('engagement');
      
      // Verify action counts formatting
      expect(result.actionCounts).toEqual({
        purchased: 5,
        saved: 10,
        ignored: 3,
        favorited: 2
      });
      
      // Verify ratings
      expect(result.ratings).toEqual({
        average: 4.2,
        count: 12,
        min: 2,
        max: 5
      });
      
      // Verify engagement calculations
      expect(result.engagement.positiveRate).toBe(0.85); // (5+10+2)/20
      expect(result.engagement.savedRate).toBe(0.5); // 10/20
      expect(result.engagement.purchasedRate).toBe(0.25); // 5/20
      expect(result.engagement.ignoredRate).toBe(0.15); // 3/20
    });

    it('should apply date range filter when provided', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId().toString();
      const dateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };
      
      const mockResults = createMockUserStatsResults();
      
      FeedbackLog.aggregate = jest.fn()
        .mockResolvedValueOnce(mockResults.actionCounts)
        .mockResolvedValueOnce(mockResults.ratings)
        .mockResolvedValueOnce(mockResults.categoryDistribution)
        .mockResolvedValueOnce(mockResults.tagDistribution);
      
      FeedbackLog.countDocuments = jest.fn().mockResolvedValue(15);

      // Act
      const result = await feedbackService.getUserFeedbackStats(userId, dateRange);

      // Assert
      expect(FeedbackLog.aggregate).toHaveBeenCalledTimes(4);
      
      // Check that all aggregate calls include the date range in match condition
      FeedbackLog.aggregate.mock.calls.forEach(call => {
        const pipeline = call[0];
        const matchStage = pipeline.find(stage => stage.$match);
        expect(matchStage.$match).toHaveProperty('user');
        expect(matchStage.$match).toHaveProperty('timestamp');
        expect(matchStage.$match.timestamp).toHaveProperty('$gte', dateRange.startDate);
        expect(matchStage.$match.timestamp).toHaveProperty('$lte', dateRange.endDate);
      });
      
      expect(result.totalFeedback).toBe(15);
    });

    it('should handle empty ratings gracefully', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId().toString();
      
      FeedbackLog.aggregate = jest.fn()
        .mockResolvedValueOnce([]) // No action counts
        .mockResolvedValueOnce([]) // No ratings
        .mockResolvedValueOnce([]) // No categories
        .mockResolvedValueOnce([]); // No tags
      
      FeedbackLog.countDocuments = jest.fn().mockResolvedValue(0);

      // Act
      const result = await feedbackService.getUserFeedbackStats(userId);

      // Assert
      expect(result.actionCounts).toEqual({});
      expect(result.ratings).toEqual({
        average: 0,
        count: 0,
        min: 0,
        max: 0
      });
      expect(result.categories).toEqual([]);
      expect(result.tags).toEqual([]);
      expect(result.totalFeedback).toBe(0);
      expect(result.engagement.positiveRate).toBe(0);
    });

    it('should handle database errors', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId().toString();
      const errorMessage = 'Database aggregation error';
      
      FeedbackLog.aggregate = jest.fn().mockRejectedValue(new Error(errorMessage));

      // Act & Assert
      await expect(feedbackService.getUserFeedbackStats(userId))
        .rejects.toThrow(errorMessage);
    });
  });

  // Section 3: Recipient Feedback Summary Tests
  describe('getRecipientFeedbackSummary', () => {
    it('should successfully retrieve recipient feedback summary', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId().toString();
      const mockResults = createMockRecipientSummaryResults();
      
      // Mock FeedbackLog.aggregate for different aggregations (no monthly trends for default date range)
      FeedbackLog.aggregate = jest.fn()
        .mockResolvedValueOnce(mockResults.topCategories) // Top categories
        .mockResolvedValueOnce(mockResults.topTags) // Top tags
        .mockResolvedValueOnce(mockResults.negativeCategories) // Negative categories
        .mockResolvedValueOnce(mockResults.negativeTags) // Negative tags
        .mockResolvedValueOnce(mockResults.ratings); // Ratings
      
      // Mock FeedbackLog.countDocuments for total feedback
      FeedbackLog.countDocuments = jest.fn().mockResolvedValue(25);

      // Act
      const result = await feedbackService.getRecipientFeedbackSummary(recipientId);

      // Assert
      expect(FeedbackLog.aggregate).toHaveBeenCalledTimes(5);
      expect(FeedbackLog.countDocuments).toHaveBeenCalled();
      
      // Verify the structure of the result
      expect(result).toHaveProperty('topCategories');
      expect(result).toHaveProperty('topTags');
      expect(result).toHaveProperty('negativeCategories');
      expect(result).toHaveProperty('negativeTags');
      expect(result).toHaveProperty('ratings');
      expect(result).toHaveProperty('totalFeedback', 25);
      expect(result).toHaveProperty('monthlyTrends');
      
      // Verify array formats
      expect(result.topCategories).toEqual([
        { category: 'Electronics', count: 8 },
        { category: 'Books', count: 5 }
      ]);
      
      expect(result.topTags).toEqual([
        { tag: 'tech', count: 6 },
        { tag: 'books', count: 4 }
      ]);
      
      expect(result.ratings).toEqual({
        average: 4.5,
        count: 10,
        min: 3,
        max: 5
      });
      
      // Monthly trends should be empty for default date range
      expect(result.monthlyTrends).toEqual([]);
    });

    it('should apply date range filter and calculate monthly trends', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId().toString();
      const dateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-03-31') // 3 months to trigger monthly trends
      };
      
      const mockResults = createMockRecipientSummaryResults();
      
      FeedbackLog.aggregate = jest.fn()
        .mockResolvedValueOnce(mockResults.topCategories)
        .mockResolvedValueOnce(mockResults.topTags)
        .mockResolvedValueOnce(mockResults.negativeCategories)
        .mockResolvedValueOnce(mockResults.negativeTags)
        .mockResolvedValueOnce(mockResults.ratings)
        .mockResolvedValueOnce(mockResults.monthlyTrends);
      
      FeedbackLog.countDocuments = jest.fn().mockResolvedValue(25);

      // Act
      const result = await feedbackService.getRecipientFeedbackSummary(recipientId, dateRange);

      // Assert
      expect(FeedbackLog.aggregate).toHaveBeenCalledTimes(6);
      
      // Verify monthly trends are calculated and formatted
      expect(result.monthlyTrends).toEqual([
        {
          year: 2024,
          month: 1,
          count: 15,
          positiveCount: 12,
          positiveRate: 0.8
        }
      ]);
    });

    it('should handle empty results gracefully', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId().toString();
      
      FeedbackLog.aggregate = jest.fn().mockResolvedValue([]);
      FeedbackLog.countDocuments = jest.fn().mockResolvedValue(0);

      // Act
      const result = await feedbackService.getRecipientFeedbackSummary(recipientId);

      // Assert
      expect(result.topCategories).toEqual([]);
      expect(result.topTags).toEqual([]);
      expect(result.negativeCategories).toEqual([]);
      expect(result.negativeTags).toEqual([]);
      expect(result.totalFeedback).toBe(0);
      expect(result.ratings).toEqual({
        average: 0,
        count: 0,
        min: 0,
        max: 0
      });
      expect(result.monthlyTrends).toEqual([]);
    });

    it('should handle database errors', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId().toString();
      const errorMessage = 'Database aggregation error';
      
      FeedbackLog.aggregate = jest.fn().mockRejectedValue(new Error(errorMessage));

      // Act & Assert
      await expect(feedbackService.getRecipientFeedbackSummary(recipientId))
        .rejects.toThrow(errorMessage);
    });
  });

  // Section 4: Category and Tag Success Metrics Tests
  describe('updateCategorySuccess', () => {
    it('should successfully update category success metrics', async () => {
      // Arrange
      const category = 'Electronics';
      const action = 'purchased';

      // Act
      const result = await feedbackService.updateCategorySuccess(category, action);

      // Assert
      expect(result).toBe(true);
    });

    it('should handle empty category gracefully', async () => {
      // Arrange
      const category = null;
      const action = 'purchased';

      // Act
      const result = await feedbackService.updateCategorySuccess(category, action);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should handle errors gracefully without throwing', async () => {
      // Arrange - simulate an error scenario but since this is a background task, it shouldn't throw
      const category = 'Electronics';
      const action = 'purchased';
      
      // Mock console.error to prevent noise in test output
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Act
      const result = await feedbackService.updateCategorySuccess(category, action);

      // Assert
      expect(result).toBe(true);
      
      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });

  describe('updateTagSuccess', () => {
    it('should successfully update tag success metrics', async () => {
      // Arrange
      const tags = ['tech', 'fitness', 'smart'];
      const action = 'purchased';

      // Act
      const result = await feedbackService.updateTagSuccess(tags, action);

      // Assert
      expect(result).toBe(true);
    });

    it('should handle empty tags array gracefully', async () => {
      // Arrange
      const tags = [];
      const action = 'purchased';

      // Act
      const result = await feedbackService.updateTagSuccess(tags, action);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should handle null tags gracefully', async () => {
      // Arrange
      const tags = null;
      const action = 'purchased';

      // Act
      const result = await feedbackService.updateTagSuccess(tags, action);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should handle non-array tags gracefully', async () => {
      // Arrange
      const tags = 'tech';
      const action = 'purchased';

      // Act
      const result = await feedbackService.updateTagSuccess(tags, action);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should handle errors gracefully without throwing', async () => {
      // Arrange
      const tags = ['tech', 'fitness'];
      const action = 'purchased';
      
      // Mock console.error to prevent noise in test output
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Act
      const result = await feedbackService.updateTagSuccess(tags, action);

      // Assert
      expect(result).toBe(true);
      
      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });

  // Section 5: Feedback Logs Retrieval Tests
  describe('getUserFeedbackHistory', () => {
    it('should successfully retrieve user feedback history', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId().toString();
      const mockLogs = [
        createMockFeedbackLog({ user: userId, action: 'purchased' }),
        createMockFeedbackLog({ user: userId, action: 'saved' })
      ];
      
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockLogs)
      };
      
      FeedbackLog.find = jest.fn().mockReturnValue(mockQuery);
      FeedbackLog.countDocuments = jest.fn().mockResolvedValue(75);

      // Act
      const result = await feedbackService.getUserFeedbackHistory(userId);

      // Assert
      expect(FeedbackLog.find).toHaveBeenCalledWith({ user: userId });
      expect(FeedbackLog.countDocuments).toHaveBeenCalledWith({ user: userId });
      expect(mockQuery.sort).toHaveBeenCalledWith({ timestamp: -1 });
      expect(mockQuery.skip).toHaveBeenCalledWith(0);
      expect(mockQuery.limit).toHaveBeenCalledWith(50);
      
      expect(result).toHaveProperty('logs', mockLogs);
      expect(result).toHaveProperty('totalLogs', 75);
      expect(result).toHaveProperty('totalPages', 2);
      expect(result).toHaveProperty('currentPage', 1);
    });

    it('should apply user-specific filters correctly', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId().toString();
      const filters = {
        action: 'saved',
        category: 'Books',
        recipientId: new mongoose.Types.ObjectId(),
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        sortBy: 'explicitRating',
        sortOrder: 'desc'
      };
      
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      };
      
      FeedbackLog.find = jest.fn().mockReturnValue(mockQuery);
      FeedbackLog.countDocuments = jest.fn().mockResolvedValue(0);

      // Act
      const result = await feedbackService.getUserFeedbackHistory(userId, filters, 25, 3);

      // Assert
      const expectedQuery = {
        user: userId,
        action: filters.action,
        category: filters.category,
        recipient: filters.recipientId,
        timestamp: {
          $gte: filters.startDate,
          $lte: filters.endDate
        }
      };
      
      expect(FeedbackLog.find).toHaveBeenCalledWith(expectedQuery);
      expect(mockQuery.sort).toHaveBeenCalledWith({ explicitRating: -1 });
      expect(mockQuery.skip).toHaveBeenCalledWith(50); // (page-1) * limit = (3-1) * 25
      expect(mockQuery.limit).toHaveBeenCalledWith(25);
    });

    it('should handle database errors', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId().toString();
      const errorMessage = 'Database query error';
      FeedbackLog.countDocuments = jest.fn().mockRejectedValue(new Error(errorMessage));

      // Act & Assert
      await expect(feedbackService.getUserFeedbackHistory(userId))
        .rejects.toThrow(errorMessage);
    });
  });

  // Section 7: Timeline and Sentiment Analysis Tests
  describe('getRecipientFeedbackTimeline', () => {
    it('should successfully retrieve recipient feedback timeline', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId().toString();
      const mockEvents = [
        {
          _id: new mongoose.Types.ObjectId(),
          timestamp: new Date('2024-01-15'),
          action: 'purchased',
          category: 'Electronics',
          tags: ['tech', 'smart'],
          explicitRating: 5,
          comment: 'Great product!',
          gift: {
            _id: new mongoose.Types.ObjectId(),
            name: 'Smart Watch',
            category: 'Electronics',
            tags: ['tech', 'fitness'],
            estimatedPrice: 200,
            status: 'purchased'
          }
        }
      ];
      
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockEvents)
      };
      
      FeedbackLog.find = jest.fn().mockReturnValue(mockQuery);

      // Act
      const result = await feedbackService.getRecipientFeedbackTimeline(recipientId);

      // Assert
      expect(FeedbackLog.find).toHaveBeenCalledWith({
        recipient: new mongoose.Types.ObjectId(recipientId)
      });
      expect(mockQuery.sort).toHaveBeenCalledWith({ timestamp: 1 });
      expect(mockQuery.populate).toHaveBeenCalledWith('gift', 'name description category tags estimatedPrice status');
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('date');
      expect(result[0]).toHaveProperty('action', 'purchased');
      expect(result[0]).toHaveProperty('giftName', 'Smart Watch');
      expect(result[0]).toHaveProperty('category', 'Electronics');
      expect(result[0]).toHaveProperty('rating', 5);
      expect(result[0]).toHaveProperty('comment', 'Great product!');
    });

    it('should apply date range filter when provided', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId().toString();
      const dateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };
      
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      };
      
      FeedbackLog.find = jest.fn().mockReturnValue(mockQuery);

      // Act
      const result = await feedbackService.getRecipientFeedbackTimeline(recipientId, dateRange);

      // Assert
      const expectedQuery = {
        recipient: new mongoose.Types.ObjectId(recipientId),
        timestamp: {
          $gte: dateRange.startDate,
          $lte: dateRange.endDate
        }
      };
      
      expect(FeedbackLog.find).toHaveBeenCalledWith(expectedQuery);
    });

    it('should throw error when recipient ID is not provided', async () => {
      // Act & Assert
      await expect(feedbackService.getRecipientFeedbackTimeline())
        .rejects.toThrow('Recipient ID is required');
    });

    it('should handle database errors', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId().toString();
      const errorMessage = 'Database query error';
      
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockRejectedValue(new Error(errorMessage))
      };
      
      FeedbackLog.find = jest.fn().mockReturnValue(mockQuery);

      // Act & Assert
      await expect(feedbackService.getRecipientFeedbackTimeline(recipientId))
        .rejects.toThrow(errorMessage);
    });
  });

  describe('getRecipientFeedbackSentiment', () => {
    it('should successfully get recipient feedback sentiment', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId().toString();
      const mockSentimentResult = {
        sentimentScore: 0.8,
        sentimentText: 'Positive',
        positiveCount: 15,
        negativeCount: 3,
        neutralCount: 5
      };
      
      // Mock the trendAnalysisService
      const trendAnalysisService = require('../../services/trendAnalysisService');
      trendAnalysisService.getRecipientFeedbackSentiment = jest.fn().mockResolvedValue(mockSentimentResult);

      // Act
      const result = await feedbackService.getRecipientFeedbackSentiment(recipientId);

      // Assert
      expect(trendAnalysisService.getRecipientFeedbackSentiment).toHaveBeenCalledWith(recipientId, {}, undefined);
      expect(result).toEqual(mockSentimentResult);
    });

    it('should pass date range to trendAnalysisService', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId().toString();
      const dateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };
      
      const trendAnalysisService = require('../../services/trendAnalysisService');
      trendAnalysisService.getRecipientFeedbackSentiment = jest.fn().mockResolvedValue({});

      // Act
      const result = await feedbackService.getRecipientFeedbackSentiment(recipientId, dateRange);

      // Assert
      expect(trendAnalysisService.getRecipientFeedbackSentiment).toHaveBeenCalledWith(recipientId, dateRange, undefined);
    });

    it('should throw error when recipient ID is not provided', async () => {
      // Act & Assert
      await expect(feedbackService.getRecipientFeedbackSentiment())
        .rejects.toThrow('Recipient ID is required');
    });

    it('should handle errors from trendAnalysisService', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId().toString();
      const errorMessage = 'Sentiment analysis error';
      
      const trendAnalysisService = require('../../services/trendAnalysisService');
      trendAnalysisService.getRecipientFeedbackSentiment = jest.fn().mockRejectedValue(new Error(errorMessage));

      // Act & Assert
      await expect(feedbackService.getRecipientFeedbackSentiment(recipientId))
        .rejects.toThrow(errorMessage);
    });
  });

  // Section 8: Suggestion History Update Tests
  describe('updateSuggestionHistory', () => {
    it('should successfully update existing suggestion history', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId().toString();
      const recipientId = new mongoose.Types.ObjectId().toString();
      const giftId = new mongoose.Types.ObjectId().toString();
      const interactionType = 'purchased';
      
      const mockHistoryRecord = {
        _id: new mongoose.Types.ObjectId(),
        user: userId,
        recipient: recipientId,
        gift: giftId
      };
      
      const mockUpdatedRecord = { ...mockHistoryRecord, lastInteraction: interactionType };
      
      SuggestionHistory.findOne = jest.fn().mockResolvedValue(mockHistoryRecord);
      SuggestionHistory.updateInteraction = jest.fn().mockResolvedValue(mockUpdatedRecord);

      // Act
      const result = await feedbackService.updateSuggestionHistory(userId, recipientId, giftId, interactionType);

      // Assert
      expect(SuggestionHistory.findOne).toHaveBeenCalledWith({
        user: userId,
        recipient: recipientId,
        gift: giftId
      });
      
      expect(SuggestionHistory.updateInteraction).toHaveBeenCalledWith(
        userId,
        recipientId,
        giftId,
        interactionType
      );
      
      expect(result).toEqual(mockUpdatedRecord);
    });

    it('should create new suggestion history when record does not exist', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId().toString();
      const recipientId = new mongoose.Types.ObjectId().toString();
      const giftId = new mongoose.Types.ObjectId().toString();
      const interactionType = 'saved';
      
      const mockGift = createMockGift({
        _id: giftId,
        name: 'Test Gift',
        category: 'Electronics',
        tags: ['tech'],
        price: 100,
        relevanceScore: 80
      });
      
      const mockNewRecord = {
        _id: new mongoose.Types.ObjectId(),
        user: userId,
        recipient: recipientId,
        gift: giftId
      };
      
      SuggestionHistory.findOne = jest.fn().mockResolvedValue(null);
      Gift.findById = jest.fn().mockResolvedValue(mockGift);
      SuggestionHistory.recordSuggestion = jest.fn().mockResolvedValue(mockNewRecord);
      SuggestionHistory.updateInteraction = jest.fn().mockResolvedValue(mockNewRecord);

      // Act
      const result = await feedbackService.updateSuggestionHistory(userId, recipientId, giftId, interactionType);

      // Assert
      expect(SuggestionHistory.findOne).toHaveBeenCalled();
      expect(Gift.findById).toHaveBeenCalledWith(giftId);
      expect(SuggestionHistory.recordSuggestion).toHaveBeenCalledWith({
        user: userId,
        recipient: recipientId,
        gift: giftId,
        similarityScore: 0,
        relevanceScore: mockGift.relevanceScore,
        giftName: mockGift.name,
        giftCategory: mockGift.category,
        giftTags: mockGift.tags,
        giftPrice: mockGift.price || mockGift.estimatedPrice
      });
      
      expect(SuggestionHistory.updateInteraction).toHaveBeenCalledWith(
        userId,
        recipientId,
        giftId,
        interactionType
      );
      
      expect(result).toEqual(mockNewRecord);
    });

    it('should handle gift not found when creating new record', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId().toString();
      const recipientId = new mongoose.Types.ObjectId().toString();
      const giftId = new mongoose.Types.ObjectId().toString();
      const interactionType = 'saved';
      
      SuggestionHistory.findOne = jest.fn().mockResolvedValue(null);
      Gift.findById = jest.fn().mockResolvedValue(null);

      // Act
      const result = await feedbackService.updateSuggestionHistory(userId, recipientId, giftId, interactionType);

      // Assert
      expect(SuggestionHistory.findOne).toHaveBeenCalled();
      expect(Gift.findById).toHaveBeenCalledWith(giftId);
      expect(result).toBe(null);
    });

    it('should handle errors gracefully and return null', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId().toString();
      const recipientId = new mongoose.Types.ObjectId().toString();
      const giftId = new mongoose.Types.ObjectId().toString();
      const interactionType = 'saved';
      
      const errorMessage = 'Database error';
      SuggestionHistory.findOne = jest.fn().mockRejectedValue(new Error(errorMessage));
      
      // Mock console.error to prevent noise in test output
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Act
      const result = await feedbackService.updateSuggestionHistory(userId, recipientId, giftId, interactionType);

      // Assert
      expect(result).toBeNull();
      
      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });
});
