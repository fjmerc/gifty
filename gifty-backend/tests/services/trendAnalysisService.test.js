// tests/services/trendAnalysisService.test.js
const mongoose = require('mongoose');
const trendAnalysisService = require('../../services/trendAnalysisService');
const FeedbackLog = require('../../models/FeedbackLog');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Mock all dependencies
jest.mock('../../models/FeedbackLog');

// Mock data factory functions
const createMockFeedbackLogs = (count = 10, overrides = {}) => {
  return Array(count).fill().map((_, index) => ({
    _id: new mongoose.Types.ObjectId(),
    gift: new mongoose.Types.ObjectId(),
    user: new mongoose.Types.ObjectId(),
    recipient: new mongoose.Types.ObjectId(),
    action: ['purchased', 'saved', 'ignored', 'viewed', 'favorited'][index % 5],
    explicitRating: (index % 5) + 1,
    category: ['Electronics', 'Books', 'Home & Garden', 'Clothing', 'Outdoor'][index % 5],
    tags: [
      ['electronics', 'tech', 'gadget'],
      ['reading', 'books', 'education'],
      ['home', 'gardening', 'decoration'],
      ['fashion', 'clothes', 'style'],
      ['outdoor', 'hiking', 'adventure']
    ][index % 5],
    relevanceScore: 50 + (index * 5),
    timestamp: new Date(2024, 0, index + 1),
    comment: `Test comment ${index + 1}`,
    ...overrides
  }));
};

// Create mock aggregation results for specific methods
// What the pipeline returns after its $project: the name, no _id
const createMockCategorySuccessResults = () => [
  {
    category: 'Electronics',
    actions: [
      { action: 'purchased', count: 5 },
      { action: 'saved', count: 3 },
      { action: 'ignored', count: 2 }
    ],
    totalInteractions: 10
  },
  {
    category: 'Books',
    actions: [
      { action: 'purchased', count: 8 },
      { action: 'saved', count: 4 },
      { action: 'ignored', count: 1 }
    ],
    totalInteractions: 13
  }
];

const createMockTagEffectivenessResults = () => [
  {
    tag: 'tech',
    actions: [
      { action: 'purchased', count: 6 },
      { action: 'saved', count: 3 },
      { action: 'ignored', count: 1 }
    ],
    totalInteractions: 10
  },
  {
    tag: 'books',
    actions: [
      { action: 'purchased', count: 9 },
      { action: 'saved', count: 2 },
      { action: 'ignored', count: 1 }
    ],
    totalInteractions: 12
  }
];

const createMockRecipientPreferencesResults = () => ({
  categoryResults: [
    {
      _id: 'Electronics',
      count: 8,
      averageRating: 4.2
    },
    {
      _id: 'Books',
      count: 12,
      averageRating: 4.8
    }
  ],
  tagResults: [
    {
      _id: 'tech',
      count: 6,
      averageRating: 4.0
    },
    {
      _id: 'reading',
      count: 10,
      averageRating: 4.5
    }
  ]
});

const createMockGlobalMetricsResults = () => [
  { _id: 'purchased', count: 25 },
  { _id: 'saved', count: 15 },
  { _id: 'ignored', count: 10 },
  { _id: 'viewed', count: 45 },
  { _id: 'favorited', count: 5 }
];

const createMockTimeBasedTrendsResults = () => [
  {
    _id: {
      year: 2024,
      month: 1,
      day: 15
    },
    total: 12,
    purchased: 5,
    saved: 3,
    ignored: 1,
    favorited: 2,
    viewed: 1,
    averageRating: 4.2
  },
  {
    _id: {
      year: 2024,
      month: 1,
      day: 16
    },
    total: 15,
    purchased: 7,
    saved: 4,
    ignored: 2,
    favorited: 1,
    viewed: 1,
    averageRating: 4.0
  }
];

const createMockFeedbackTimeline = (count = 10, recipientId = null) => {
  const recipient = recipientId || new mongoose.Types.ObjectId();
  
  return Array(count).fill().map((_, index) => ({
    _id: new mongoose.Types.ObjectId(),
    timestamp: new Date(2024, 0, index + 1),
    action: ['purchased', 'saved', 'ignored', 'viewed', 'favorited'][index % 5],
    explicitRating: (index % 5) + 1,
    recipient,
    gift: {
      _id: new mongoose.Types.ObjectId(),
      name: `Gift ${index + 1}`,
      category: ['Electronics', 'Books', 'Home & Garden', 'Clothing', 'Outdoor'][index % 5],
      tags: [
        ['electronics', 'tech', 'gadget'],
        ['reading', 'books', 'education'],
        ['home', 'gardening', 'decoration'],
        ['fashion', 'clothes', 'style'],
        ['outdoor', 'hiking', 'adventure']
      ][index % 5],
      estimatedPrice: 50 + (index * 10)
    },
    category: ['Electronics', 'Books', 'Home & Garden', 'Clothing', 'Outdoor'][index % 5],
    tags: [
      ['electronics', 'tech', 'gadget'],
      ['reading', 'books', 'education'],
      ['home', 'gardening', 'decoration'],
      ['fashion', 'clothes', 'style'],
      ['outdoor', 'hiking', 'adventure']
    ][index % 5],
    comment: `Test comment ${index + 1}`
  }));
};

const createMockFeedbackSentimentResults = () => ({
  actionDistribution: [
    { _id: 'purchased', count: 25 },
    { _id: 'saved', count: 15 },
    { _id: 'ignored', count: 10 },
    { _id: 'viewed', count: 45 },
    { _id: 'favorited', count: 5 }
  ],
  ratingDistribution: [
    { _id: 1, count: 5 },
    { _id: 2, count: 10 },
    { _id: 3, count: 15 },
    { _id: 4, count: 25 },
    { _id: 5, count: 45 }
  ],
  ratingTrend: [
    {
      _id: {
        year: 2024,
        month: 1
      },
      averageRating: 4.2,
      count: 28
    },
    {
      _id: {
        year: 2024,
        month: 2
      },
      averageRating: 4.0,
      count: 32
    }
  ],
  topPositiveTags: [
    { _id: 'tech', count: 15 },
    { _id: 'books', count: 12 },
    { _id: 'outdoor', count: 10 }
  ],
  topNegativeTags: [
    { _id: 'fashion', count: 8 },
    { _id: 'decoration', count: 5 },
    { _id: 'gadget', count: 3 }
  ]
});

// Set higher timeout for service tests
jest.setTimeout(30000);

describe('Trend Analysis Service', () => {
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

  // Section 1: Category Success Analysis Tests
  describe('analyzeCategorySuccess', () => {
    it('should successfully analyze category success rates', async () => {
      // Arrange
      FeedbackLog.aggregate = jest.fn().mockResolvedValue(createMockCategorySuccessResults());
      
      // Act
      const result = await trendAnalysisService.analyzeCategorySuccess();
      
      // Assert
      expect(FeedbackLog.aggregate).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      
      // Verify the structure of the result
      expect(result[0]).toHaveProperty('category');
      expect(result[0]).toHaveProperty('totalInteractions');
      expect(result[0]).toHaveProperty('purchaseRate');
      expect(result[0]).toHaveProperty('saveRate');
      expect(result[0]).toHaveProperty('ignoreRate');
      expect(result[0]).toHaveProperty('successRate');
      
      // Verify the calculations for the first result
      expect(result[0].category).toBe('Electronics');
      expect(result[0].totalInteractions).toBe(10);
      expect(result[0].purchaseRate).toBe(0.5); // 5/10
      expect(result[0].saveRate).toBe(0.3); // 3/10
      expect(result[0].ignoreRate).toBe(0.2); // 2/10
      expect(result[0].successRate).toBe(0.65); // 0.5 + (0.3 * 0.5)

      // Verify the calculations for the second result
      expect(result[1].category).toBe('Books');
      expect(result[1].totalInteractions).toBe(13);
      expect(result[1].purchaseRate).toBe(8/13);
      expect(result[1].saveRate).toBe(4/13);
      expect(result[1].ignoreRate).toBe(1/13);
      expect(result[1].successRate).toBeCloseTo(8/13 + (4/13 * 0.5), 5);
    });

    it('should use date range when provided', async () => {
      // Arrange
      FeedbackLog.aggregate = jest.fn().mockResolvedValue(createMockCategorySuccessResults());
      
      const dateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };
      
      // Act
      const result = await trendAnalysisService.analyzeCategorySuccess(dateRange);
      
      // Assert
      expect(FeedbackLog.aggregate).toHaveBeenCalled();
      
      // Check that the aggregate pipeline includes date range conditions
      const aggregatePipeline = FeedbackLog.aggregate.mock.calls[0][0];
      const matchStage = aggregatePipeline.find(stage => stage.$match);
      
      expect(matchStage.$match).toHaveProperty('timestamp');
      expect(matchStage.$match.timestamp).toHaveProperty('$gte', dateRange.startDate);
      expect(matchStage.$match.timestamp).toHaveProperty('$lte', dateRange.endDate);
    });

    it('should handle error during aggregation', async () => {
      // Arrange
      const errorMessage = 'Aggregation error';
      FeedbackLog.aggregate = jest.fn().mockRejectedValue(new Error(errorMessage));
      
      // Act & Assert
      await expect(trendAnalysisService.analyzeCategorySuccess())
        .rejects.toThrow(errorMessage);
    });

    it('should handle empty results', async () => {
      // Arrange
      FeedbackLog.aggregate = jest.fn().mockResolvedValue([]);
      
      // Act
      const result = await trendAnalysisService.analyzeCategorySuccess();
      
      // Assert
      expect(FeedbackLog.aggregate).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  // Section 2: Tag Effectiveness Analysis Tests
  describe('analyzeTagEffectiveness', () => {
    it('should successfully analyze tag effectiveness', async () => {
      // Arrange
      FeedbackLog.aggregate = jest.fn().mockResolvedValue(createMockTagEffectivenessResults());
      
      // Act
      const result = await trendAnalysisService.analyzeTagEffectiveness();
      
      // Assert
      expect(FeedbackLog.aggregate).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      
      // Verify the structure of the result
      expect(result[0]).toHaveProperty('tag');
      expect(result[0]).toHaveProperty('totalInteractions');
      expect(result[0]).toHaveProperty('purchaseRate');
      expect(result[0]).toHaveProperty('saveRate');
      expect(result[0]).toHaveProperty('ignoreRate');
      expect(result[0]).toHaveProperty('successRate');
      
      // Verify the calculations for the first result
      expect(result[0].tag).toBe('tech');
      expect(result[0].totalInteractions).toBe(10);
      expect(result[0].purchaseRate).toBe(0.6); // 6/10
      expect(result[0].saveRate).toBe(0.3); // 3/10
      expect(result[0].ignoreRate).toBe(0.1); // 1/10
      expect(result[0].successRate).toBe(0.75); // 0.6 + (0.3 * 0.5)

      // Verify the calculations for the second result
      expect(result[1].tag).toBe('books');
      expect(result[1].totalInteractions).toBe(12);
      expect(result[1].purchaseRate).toBe(9/12);
      expect(result[1].saveRate).toBe(2/12);
      expect(result[1].ignoreRate).toBe(1/12);
      expect(result[1].successRate).toBeCloseTo(9/12 + (2/12 * 0.5), 5);
    });

    it('should use date range when provided', async () => {
      // Arrange
      FeedbackLog.aggregate = jest.fn().mockResolvedValue(createMockTagEffectivenessResults());
      
      const dateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };
      
      // Act
      const result = await trendAnalysisService.analyzeTagEffectiveness(dateRange);
      
      // Assert
      expect(FeedbackLog.aggregate).toHaveBeenCalled();
      
      // Check that the aggregate pipeline includes date range conditions
      const aggregatePipeline = FeedbackLog.aggregate.mock.calls[0][0];
      const matchStage = aggregatePipeline.find(stage => stage.$match);
      
      expect(matchStage.$match).toHaveProperty('timestamp');
      expect(matchStage.$match.timestamp).toHaveProperty('$gte', dateRange.startDate);
      expect(matchStage.$match.timestamp).toHaveProperty('$lte', dateRange.endDate);
      
      // Also verify that the match condition includes tags filter
      expect(matchStage.$match).toHaveProperty('tags');
      expect(matchStage.$match.tags).toHaveProperty('$exists', true);
      expect(matchStage.$match.tags).toHaveProperty('$ne', []);
    });

    it('should handle error during aggregation', async () => {
      // Arrange
      const errorMessage = 'Aggregation error';
      FeedbackLog.aggregate = jest.fn().mockRejectedValue(new Error(errorMessage));
      
      // Act & Assert
      await expect(trendAnalysisService.analyzeTagEffectiveness())
        .rejects.toThrow(errorMessage);
    });

    it('should handle empty results', async () => {
      // Arrange
      FeedbackLog.aggregate = jest.fn().mockResolvedValue([]);
      
      // Act
      const result = await trendAnalysisService.analyzeTagEffectiveness();
      
      // Assert
      expect(FeedbackLog.aggregate).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  // Section 3: Recipient Preferences Analysis Tests
  describe('analyzeRecipientPreferences', () => {
    it('should successfully analyze recipient preferences', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const mockResults = createMockRecipientPreferencesResults();
      
      // Set up aggregate mock to return different values for each call
      FeedbackLog.aggregate = jest.fn()
        .mockImplementationOnce(() => Promise.resolve(mockResults.categoryResults))
        .mockImplementationOnce(() => Promise.resolve(mockResults.tagResults));
      
      // Act
      const result = await trendAnalysisService.analyzeRecipientPreferences(recipientId);
      
      // Assert
      expect(FeedbackLog.aggregate).toHaveBeenCalledTimes(2);
      
      // Verify first aggregate call is for categories
      const firstCall = FeedbackLog.aggregate.mock.calls[0][0];
      const firstMatchStage = firstCall.find(stage => stage.$match);
      expect(firstMatchStage.$match).toHaveProperty('recipient');
      expect(firstMatchStage.$match.recipient).toEqual(new mongoose.Types.ObjectId(recipientId));
      expect(firstMatchStage.$match.action.$in).toEqual(['purchased', 'saved', 'favorited']);
      
      // Verify second aggregate call is for tags
      const secondCall = FeedbackLog.aggregate.mock.calls[1][0];
      const secondMatchStage = secondCall.find(stage => stage.$match);
      expect(secondMatchStage.$match).toHaveProperty('recipient');
      expect(secondMatchStage.$match.recipient).toEqual(new mongoose.Types.ObjectId(recipientId));
      expect(secondMatchStage.$match.action.$in).toEqual(['purchased', 'saved', 'favorited']);
      expect(secondMatchStage.$match.tags).toHaveProperty('$exists', true);
      expect(secondMatchStage.$match.tags).toHaveProperty('$ne', []);
      
      // Verify the structure of the result
      expect(result).toHaveProperty('categoryPreferences');
      expect(result).toHaveProperty('tagPreferences');
      expect(Array.isArray(result.categoryPreferences)).toBe(true);
      expect(Array.isArray(result.tagPreferences)).toBe(true);
      expect(result.categoryPreferences.length).toBe(2);
      expect(result.tagPreferences.length).toBe(2);
      
      // Verify specific preference data
      expect(result.categoryPreferences[0].category).toBe('Electronics');
      expect(result.categoryPreferences[0].count).toBe(8);
      expect(result.categoryPreferences[0].averageRating).toBe(4.2);
      
      expect(result.tagPreferences[0].tag).toBe('tech');
      expect(result.tagPreferences[0].count).toBe(6);
      expect(result.tagPreferences[0].averageRating).toBe(4.0);
    });

    it('should throw error when recipient ID is not provided', async () => {
      // Act & Assert
      await expect(trendAnalysisService.analyzeRecipientPreferences())
        .rejects.toThrow('Recipient ID is required');
    });

    it('should use date range when provided', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const mockResults = createMockRecipientPreferencesResults();
      
      FeedbackLog.aggregate = jest.fn()
        .mockImplementationOnce(() => Promise.resolve(mockResults.categoryResults))
        .mockImplementationOnce(() => Promise.resolve(mockResults.tagResults));
      
      const dateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };
      
      // Act
      const result = await trendAnalysisService.analyzeRecipientPreferences(recipientId, dateRange);
      
      // Assert
      expect(FeedbackLog.aggregate).toHaveBeenCalledTimes(2);
      
      // Check that both aggregate calls include date range conditions
      const firstCall = FeedbackLog.aggregate.mock.calls[0][0];
      const firstMatchStage = firstCall.find(stage => stage.$match);
      expect(firstMatchStage.$match).toHaveProperty('timestamp');
      expect(firstMatchStage.$match.timestamp).toHaveProperty('$gte', dateRange.startDate);
      expect(firstMatchStage.$match.timestamp).toHaveProperty('$lte', dateRange.endDate);
      
      const secondCall = FeedbackLog.aggregate.mock.calls[1][0];
      const secondMatchStage = secondCall.find(stage => stage.$match);
      expect(secondMatchStage.$match).toHaveProperty('timestamp');
      expect(secondMatchStage.$match.timestamp).toHaveProperty('$gte', dateRange.startDate);
      expect(secondMatchStage.$match.timestamp).toHaveProperty('$lte', dateRange.endDate);
    });

    it('should handle error during aggregation', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const errorMessage = 'Aggregation error';
      FeedbackLog.aggregate = jest.fn().mockRejectedValue(new Error(errorMessage));
      
      // Act & Assert
      await expect(trendAnalysisService.analyzeRecipientPreferences(recipientId))
        .rejects.toThrow(errorMessage);
    });
  });

  // Section 4: Global Performance Metrics Tests
  describe('getGlobalPerformanceMetrics', () => {
    it('should successfully retrieve global performance metrics', async () => {
      // Arrange
      FeedbackLog.aggregate = jest.fn().mockResolvedValue(createMockGlobalMetricsResults());
      
      // Act
      const result = await trendAnalysisService.getGlobalPerformanceMetrics();
      
      // Assert
      expect(FeedbackLog.aggregate).toHaveBeenCalled();
      
      // Verify the structure and calculations of the result
      expect(result).toHaveProperty('totalInteractions', 100); // Sum of all actions: 25+15+10+45+5
      expect(result).toHaveProperty('actionsBreakdown');
      expect(result.actionsBreakdown).toHaveProperty('purchased', 25);
      expect(result.actionsBreakdown).toHaveProperty('saved', 15);
      expect(result.actionsBreakdown).toHaveProperty('ignored', 10);
      expect(result.actionsBreakdown).toHaveProperty('viewed', 45);
      expect(result.actionsBreakdown).toHaveProperty('favorited', 5);
      
      expect(result).toHaveProperty('purchaseRate', 0.25); // 25/100
      expect(result).toHaveProperty('saveRate', 0.15); // 15/100
      expect(result).toHaveProperty('ignoreRate', 0.1); // 10/100
      expect(result).toHaveProperty('viewedOnlyRate', 0.45); // 45/100
      expect(result).toHaveProperty('successRate', 0.325); // 0.25 + (0.15 * 0.5)
    });

    it('should use date range when provided', async () => {
      // Arrange
      FeedbackLog.aggregate = jest.fn().mockResolvedValue(createMockGlobalMetricsResults());
      
      const dateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };
      
      // Act
      const result = await trendAnalysisService.getGlobalPerformanceMetrics(dateRange);
      
      // Assert
      expect(FeedbackLog.aggregate).toHaveBeenCalled();
      
      // Check that the aggregate pipeline includes date range conditions
      const aggregatePipeline = FeedbackLog.aggregate.mock.calls[0][0];
      const matchStage = aggregatePipeline.find(stage => stage.$match);
      
      expect(matchStage.$match).toHaveProperty('timestamp');
      expect(matchStage.$match.timestamp).toHaveProperty('$gte', dateRange.startDate);
      expect(matchStage.$match.timestamp).toHaveProperty('$lte', dateRange.endDate);
    });

    it('should handle empty results', async () => {
      // Arrange
      FeedbackLog.aggregate = jest.fn().mockResolvedValue([]);
      
      // Act
      const result = await trendAnalysisService.getGlobalPerformanceMetrics();
      
      // Assert
      expect(FeedbackLog.aggregate).toHaveBeenCalled();
      
      // Verify the structure with zeroed metrics
      expect(result).toHaveProperty('totalInteractions', 0);
      expect(result).toHaveProperty('actionsBreakdown', {});
      expect(result).toHaveProperty('purchaseRate', 0);
      expect(result).toHaveProperty('saveRate', 0);
      expect(result).toHaveProperty('ignoreRate', 0);
      expect(result).toHaveProperty('viewedOnlyRate', 0);
      expect(result).toHaveProperty('successRate', 0);
    });

    it('should handle error during aggregation', async () => {
      // Arrange
      const errorMessage = 'Aggregation error';
      FeedbackLog.aggregate = jest.fn().mockRejectedValue(new Error(errorMessage));
      
      // Act & Assert
      await expect(trendAnalysisService.getGlobalPerformanceMetrics())
        .rejects.toThrow(errorMessage);
    });
  });

  // Section 5: Time-Based Trends Tests
  describe('getTimeBasedTrends', () => {
    // Bucketing and labels run against real MongoDB in tests/integration/feedback-timeline.test.js
    it('should use default date range when not provided', async () => {
      // Arrange
      FeedbackLog.aggregate = jest.fn().mockResolvedValue(createMockTimeBasedTrendsResults());
      
      // Act
      const result = await trendAnalysisService.getTimeBasedTrends();
      
      // Assert
      expect(FeedbackLog.aggregate).toHaveBeenCalled();
      
      // Check that a default date range was created and used
      const aggregatePipeline = FeedbackLog.aggregate.mock.calls[0][0];
      const matchStage = aggregatePipeline.find(stage => stage.$match);
      expect(matchStage.$match).toHaveProperty('timestamp');
      expect(matchStage.$match.timestamp).toHaveProperty('$gte');
      expect(matchStage.$match.timestamp).toHaveProperty('$lte');
    });
    
    it('should handle error during aggregation', async () => {
      // Arrange
      const errorMessage = 'Aggregation error';
      FeedbackLog.aggregate = jest.fn().mockRejectedValue(new Error(errorMessage));
      
      // Act & Assert
      await expect(trendAnalysisService.getTimeBasedTrends())
        .rejects.toThrow(errorMessage);
    });
  });

  // Section 6: Recipient Feedback Timeline Tests
  describe('getRecipientFeedbackTimeline', () => {
    it('should successfully retrieve recipient feedback timeline', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const mockFeedbackLogs = createMockFeedbackTimeline(10, recipientId);
      
      FeedbackLog.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(mockFeedbackLogs)
      });
      
      // Act
      const result = await trendAnalysisService.getRecipientFeedbackTimeline(recipientId);
      
      // Assert
      expect(FeedbackLog.find).toHaveBeenCalled();
      expect(FeedbackLog.find).toHaveBeenCalledWith({
        recipient: new mongoose.Types.ObjectId(recipientId)
      });
      
      // Verify the structure of the result
      expect(result).toHaveProperty('timeline');
      expect(result).toHaveProperty('timelineByMonth');
      expect(Array.isArray(result.timeline)).toBe(true);
      expect(Array.isArray(result.timelineByMonth)).toBe(true);
      
      // Check timeline structure
      expect(result.timeline.length).toBe(10);
      expect(result.timeline[0]).toHaveProperty('id');
      expect(result.timeline[0]).toHaveProperty('timestamp');
      expect(result.timeline[0]).toHaveProperty('action');
      expect(result.timeline[0]).toHaveProperty('gift');
      expect(result.timeline[0].gift).toHaveProperty('id');
      expect(result.timeline[0].gift).toHaveProperty('name');
      expect(result.timeline[0].gift).toHaveProperty('category');
      expect(result.timeline[0].gift).toHaveProperty('tags');
      expect(result.timeline[0].gift).toHaveProperty('estimatedPrice');
      
      // Check timelineByMonth structure
      expect(result.timelineByMonth[0]).toHaveProperty('month');
      expect(result.timelineByMonth[0]).toHaveProperty('events');
      expect(Array.isArray(result.timelineByMonth[0].events)).toBe(true);
    });

    it('should throw error when recipient ID is not provided', async () => {
      // Act & Assert
      await expect(trendAnalysisService.getRecipientFeedbackTimeline())
        .rejects.toThrow('Recipient ID is required');
    });

    it('should use date range when provided', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const mockFeedbackLogs = createMockFeedbackTimeline(10, recipientId);
      
      FeedbackLog.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue(mockFeedbackLogs)
      });
      
      const dateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };
      
      // Act
      const result = await trendAnalysisService.getRecipientFeedbackTimeline(recipientId, dateRange);
      
      // Assert
      expect(FeedbackLog.find).toHaveBeenCalled();
      
      // Check that the find query includes date range conditions
      const findQuery = FeedbackLog.find.mock.calls[0][0];
      expect(findQuery).toHaveProperty('timestamp');
      expect(findQuery.timestamp).toHaveProperty('$gte', dateRange.startDate);
      expect(findQuery.timestamp).toHaveProperty('$lte', dateRange.endDate);
    });

    it('should handle empty results', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      
      FeedbackLog.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue([])
      });
      
      // Act
      const result = await trendAnalysisService.getRecipientFeedbackTimeline(recipientId);
      
      // Assert
      expect(FeedbackLog.find).toHaveBeenCalled();
      expect(result).toHaveProperty('timeline');
      expect(result).toHaveProperty('timelineByMonth');
      expect(result.timeline.length).toBe(0);
      expect(result.timelineByMonth.length).toBe(0);
    });

    it('should handle error during find operation', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const errorMessage = 'Find operation error';
      
      FeedbackLog.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockRejectedValue(new Error(errorMessage))
      });
      
      // Act & Assert
      await expect(trendAnalysisService.getRecipientFeedbackTimeline(recipientId))
        .rejects.toThrow(errorMessage);
    });
  });

  // Section 7: Recipient Feedback Sentiment Tests
  describe('getRecipientFeedbackSentiment', () => {
    it('should successfully analyze recipient feedback sentiment', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const mockResults = createMockFeedbackSentimentResults();
      
      // Mock multiple aggregate calls with different results
      FeedbackLog.aggregate = jest.fn()
        .mockImplementationOnce(() => Promise.resolve(mockResults.actionDistribution))
        .mockImplementationOnce(() => Promise.resolve(mockResults.ratingDistribution))
        .mockImplementationOnce(() => Promise.resolve(mockResults.ratingTrend))
        .mockImplementationOnce(() => Promise.resolve(mockResults.topPositiveTags))
        .mockImplementationOnce(() => Promise.resolve(mockResults.topNegativeTags));
      
      // Act
      const result = await trendAnalysisService.getRecipientFeedbackSentiment(recipientId);
      
      // Assert
      expect(FeedbackLog.aggregate).toHaveBeenCalledTimes(5);
      
      // Verify that the first call is for action distribution
      const firstCall = FeedbackLog.aggregate.mock.calls[0][0];
      const firstMatchStage = firstCall.find(stage => stage.$match);
      expect(firstMatchStage.$match).toHaveProperty('recipient');
      expect(firstMatchStage.$match.recipient).toEqual(new mongoose.Types.ObjectId(recipientId));
      
      // Verify structure of the result
      expect(result).toHaveProperty('sentimentScore');
      expect(result).toHaveProperty('sentimentText');
      expect(result).toHaveProperty('sentimentDistribution');
      expect(result).toHaveProperty('averageSentiment');
      expect(result).toHaveProperty('topPositiveTags');
      expect(result).toHaveProperty('topNegativeTags');
      expect(result).toHaveProperty('actions');
      expect(result).toHaveProperty('ratings');
      
      // Verify actions breakdown
      expect(result.actions).toHaveProperty('distribution');
      expect(result.actions).toHaveProperty('total');
      expect(result.actions).toHaveProperty('positive');
      expect(result.actions).toHaveProperty('negative');
      expect(result.actions).toHaveProperty('neutral');
      expect(result.actions).toHaveProperty('positiveRate');
      expect(result.actions).toHaveProperty('negativeRate');
      
      // Verify ratings data
      expect(result.ratings).toHaveProperty('distribution');
      expect(result.ratings).toHaveProperty('trend');
      expect(Array.isArray(result.ratings.distribution)).toBe(true);
      expect(Array.isArray(result.ratings.trend)).toBe(true);
    });

    it('should throw error when recipient ID is not provided', async () => {
      // Act & Assert
      await expect(trendAnalysisService.getRecipientFeedbackSentiment())
        .rejects.toThrow('Recipient ID is required');
    });

    it('should use date range when provided', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const mockResults = createMockFeedbackSentimentResults();
      
      // Mock multiple aggregate calls with different results
      FeedbackLog.aggregate = jest.fn()
        .mockImplementationOnce(() => Promise.resolve(mockResults.actionDistribution))
        .mockImplementationOnce(() => Promise.resolve(mockResults.ratingDistribution))
        .mockImplementationOnce(() => Promise.resolve(mockResults.ratingTrend))
        .mockImplementationOnce(() => Promise.resolve(mockResults.topPositiveTags))
        .mockImplementationOnce(() => Promise.resolve(mockResults.topNegativeTags));
      
      const dateRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };
      
      // Act
      const result = await trendAnalysisService.getRecipientFeedbackSentiment(recipientId, dateRange);
      
      // Assert
      expect(FeedbackLog.aggregate).toHaveBeenCalledTimes(5);
      
      // Verify that all calls include date range conditions
      FeedbackLog.aggregate.mock.calls.forEach(call => {
        const matchStage = call[0].find(stage => stage.$match);
        if (matchStage.$match.timestamp) {
          expect(matchStage.$match.timestamp).toHaveProperty('$gte', dateRange.startDate);
          expect(matchStage.$match.timestamp).toHaveProperty('$lte', dateRange.endDate);
        }
      });
    });

    it('should handle empty results', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      
      // Mock empty results for all aggregate calls
      FeedbackLog.aggregate = jest.fn().mockResolvedValue([]);
      
      // Act
      const result = await trendAnalysisService.getRecipientFeedbackSentiment(recipientId);
      
      // Assert
      expect(FeedbackLog.aggregate).toHaveBeenCalled();
      
      // Verify structure with empty/zero values
      expect(result).toHaveProperty('sentimentScore');
      expect(result).toHaveProperty('sentimentText');
      expect(result).toHaveProperty('actions');
      expect(result.actions).toHaveProperty('total', 0);
      expect(result.actions).toHaveProperty('positive', 0);
      expect(result.actions).toHaveProperty('negative', 0);
      expect(result.actions).toHaveProperty('neutral', 0);
      expect(result.ratings.distribution).toEqual([0, 0, 0, 0, 0]);
    });

    it('should handle error during aggregation', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const errorMessage = 'Aggregation error';
      FeedbackLog.aggregate = jest.fn().mockRejectedValue(new Error(errorMessage));
      
      // Act & Assert
      await expect(trendAnalysisService.getRecipientFeedbackSentiment(recipientId))
        .rejects.toThrow(errorMessage);
    });
  });
});
