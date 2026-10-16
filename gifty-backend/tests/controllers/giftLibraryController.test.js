// tests/controllers/giftLibraryController.test.js
const mongoose = require('mongoose');
const giftLibraryController = require('../../controllers/giftLibraryController');
const GiftLibrary = require('../../models/GiftLibrary');
const giftDiscoveryService = require('../../services/giftDiscoveryService');
const hybridSuggestionService = require('../../services/hybridSuggestionService');
const { createMockReqRes, mockNext } = require('../utils/mockUtils');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Mock dependencies
jest.mock('../../models/GiftLibrary');
jest.mock('../../services/giftDiscoveryService');
jest.mock('../../services/hybridSuggestionService');
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Set higher timeout for controller tests
jest.setTimeout(30000);

describe('Gift Library Controller', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  describe('getSystemHealth', () => {
    // The threshold comes from HYBRID_MIN_LIBRARY_SIZE; use a non-default value
    // so the test proves it's passed through rather than hardcoded
    beforeEach(() => { hybridSuggestionService.minLibrarySize = 37; });

    it('should return system health with statistics', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockHealthData = {
        isHealthy: true,
        totalGifts: 250,
        recentGifts: 15,
        lastDiscovery: {
          discoveryDate: new Date('2025-05-20T10:00:00Z')
        }
      };

      const mockCategoryDistribution = [
        { _id: 'electronics', count: 50 },
        { _id: 'books', count: 30 },
        { _id: 'clothing', count: 25 }
      ];

      const mockSourceDistribution = [
        { _id: 'discovered', count: 150 },
        { _id: 'ai_generated', count: 100 }
      ];

      hybridSuggestionService.isHybridSystemHealthy = jest.fn().mockResolvedValue(mockHealthData);
      
      // Mock GiftLibrary.aggregate for both aggregation calls
      GiftLibrary.aggregate = jest.fn()
        .mockResolvedValueOnce(mockCategoryDistribution) // First call for categories
        .mockResolvedValueOnce(mockSourceDistribution);   // Second call for sources

      // Act
      await giftLibraryController.getSystemHealth(req, res, mockNext);

      // Assert
      expect(hybridSuggestionService.isHybridSystemHealthy).toHaveBeenCalled();
      expect(GiftLibrary.aggregate).toHaveBeenCalledTimes(2);
      
      // Check category distribution aggregation
      expect(GiftLibrary.aggregate).toHaveBeenNthCalledWith(1, [
        { $match: { status: 'active' } },
        { $unwind: '$categories' },
        { $group: { _id: '$categories', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]);
      
      // Check source distribution aggregation
      expect(GiftLibrary.aggregate).toHaveBeenNthCalledWith(2, [
        { $match: { status: 'active' } },
        { $group: { _id: '$source', count: { $sum: 1 } } }
      ]);

      expect(res.json).toHaveBeenCalledWith({
        isHealthy: true,
        giftCount: 250,
        minLibrarySize: 37, // set on the mocked service below
        recentGifts: 15,
        lastDiscovery: new Date('2025-05-20T10:00:00Z'),
        categoryDistribution: [
          { category: 'electronics', count: 50 },
          { category: 'books', count: 30 },
          { category: 'clothing', count: 25 }
        ],
        sourceDistribution: {
          discovered: 150,
          aiGenerated: 100
        }
      });
    });

    it('should handle missing health data gracefully', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockHealthData = {
        isHealthy: false
        // Missing totalGifts, recentGifts, lastDiscovery
      };

      const mockCategoryDistribution = [];
      const mockSourceDistribution = [];

      hybridSuggestionService.isHybridSystemHealthy = jest.fn().mockResolvedValue(mockHealthData);
      GiftLibrary.aggregate = jest.fn()
        .mockResolvedValueOnce(mockCategoryDistribution)
        .mockResolvedValueOnce(mockSourceDistribution);

      // Act
      await giftLibraryController.getSystemHealth(req, res, mockNext);

      // Assert
      expect(res.json).toHaveBeenCalledWith({
        isHealthy: false,
        giftCount: 0, // Default when missing
        minLibrarySize: 37, // set on the mocked service below
        recentGifts: 0, // Default when missing
        lastDiscovery: null, // Default when missing
        categoryDistribution: [],
        sourceDistribution: {
          discovered: 0, // Default when not found
          aiGenerated: 0 // Default when not found
        }
      });
    });

    it('should handle partial source distribution data', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockHealthData = { isHealthy: true };
      const mockCategoryDistribution = [{ _id: 'toys', count: 20 }];
      const mockSourceDistribution = [
        { _id: 'discovered', count: 80 }
        // Missing ai_generated source
      ];

      hybridSuggestionService.isHybridSystemHealthy = jest.fn().mockResolvedValue(mockHealthData);
      GiftLibrary.aggregate = jest.fn()
        .mockResolvedValueOnce(mockCategoryDistribution)
        .mockResolvedValueOnce(mockSourceDistribution);

      // Act
      await giftLibraryController.getSystemHealth(req, res, mockNext);

      // Assert
      expect(res.json).toHaveBeenCalledWith({
        isHealthy: true,
        giftCount: 0,
        minLibrarySize: 37, // set on the mocked service below
        recentGifts: 0,
        lastDiscovery: null,
        categoryDistribution: [{ category: 'toys', count: 20 }],
        sourceDistribution: {
          discovered: 80,
          aiGenerated: 0 // Default when not found
        }
      });
    });
  });

  describe('deleteGiftFromLibrary', () => {
    it('should successfully delete a gift from library', async () => {
      // Arrange
      const giftId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        params: { giftId: giftId.toString() },
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockGift = {
        _id: giftId,
        name: 'Gift to Delete',
        status: 'active'
      };

      GiftLibrary.findById = jest.fn().mockResolvedValue(mockGift);
      GiftLibrary.findByIdAndDelete = jest.fn().mockResolvedValue(mockGift);

      // Act
      await giftLibraryController.deleteGiftFromLibrary(req, res, mockNext);

      // Assert
      expect(GiftLibrary.findById).toHaveBeenCalledWith(giftId.toString());
      expect(GiftLibrary.findByIdAndDelete).toHaveBeenCalledWith(giftId.toString());
      expect(res.json).toHaveBeenCalledWith({
        message: 'Gift deleted successfully',
        giftId: giftId.toString()
      });
    });

    it('should return 404 error when gift not found for deletion', async () => {
      // Arrange
      const giftId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        params: { giftId: giftId.toString() },
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockNext = jest.fn();
      GiftLibrary.findById = jest.fn().mockResolvedValue(null);

      // Act
      await giftLibraryController.deleteGiftFromLibrary(req, res, mockNext);

      // Assert
      expect(GiftLibrary.findById).toHaveBeenCalledWith(giftId.toString());
      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(GiftLibrary.findByIdAndDelete).not.toHaveBeenCalled();
    });
  });

  describe('getTrendingGifts', () => {
    it('should return trending gifts with default timeframe', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        query: { limit: '5' },
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockTrendingGifts = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Trending Gift 1',
          popularityScore: 95,
          discoveryDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          status: 'active'
        },
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Trending Gift 2',
          popularityScore: 88,
          discoveryDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
          status: 'active'
        }
      ];

      // Mock GiftLibrary.find with method chaining
      GiftLibrary.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockTrendingGifts)
          })
        })
      });

      // Act
      await giftLibraryController.getTrendingGifts(req, res, mockNext);

      // Assert
      expect(GiftLibrary.find).toHaveBeenCalledWith({
        status: 'active',
        discoveryDate: { $gte: expect.any(Date) }
      });
      const findReturn = GiftLibrary.find();
      expect(findReturn.sort).toHaveBeenCalledWith({ popularityScore: -1 });
      expect(findReturn.sort().limit).toHaveBeenCalledWith(5);
      expect(res.json).toHaveBeenCalledWith({
        trendingGifts: mockTrendingGifts,
        timeframe: '7d',
        totalCount: mockTrendingGifts.length
      });
    });

    it('should handle different timeframe options', async () => {
      // Arrange
      const testCases = [
        { timeframe: '24h' },
        { timeframe: '7d' },
        { timeframe: '30d' },
        { timeframe: 'invalid' } // Should default to 7d
      ];

      for (const testCase of testCases) {
        const { req, res } = createMockReqRes({
          query: { timeframe: testCase.timeframe, limit: '10' },
          user: { _id: new mongoose.Types.ObjectId() }
        });

        const mockGifts = [{ _id: new mongoose.Types.ObjectId(), name: 'Test Gift' }];

        // Reset mocks for each test case
        jest.clearAllMocks();
        GiftLibrary.find = jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(mockGifts)
            })
          })
        });

        // Act
        await giftLibraryController.getTrendingGifts(req, res, mockNext);

        // Assert
        expect(GiftLibrary.find).toHaveBeenCalledWith({
          status: 'active',
          discoveryDate: { $gte: expect.any(Date) }
        });
        expect(res.json).toHaveBeenCalledWith({
          trendingGifts: mockGifts,
          timeframe: testCase.timeframe,
          totalCount: mockGifts.length
        });
      }
    });

    it('should filter by category when category query provided', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        query: { category: 'electronics', limit: '8' },
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockTrendingGifts = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Trending Electronics',
          categories: ['electronics'],
          popularityScore: 92,
          status: 'active'
        }
      ];

      GiftLibrary.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockTrendingGifts)
          })
        })
      });

      // Act
      await giftLibraryController.getTrendingGifts(req, res, mockNext);

      // Assert
      expect(GiftLibrary.find).toHaveBeenCalledWith({
        status: 'active',
        discoveryDate: { $gte: expect.any(Date) },
        categories: 'electronics'
      });
      expect(res.json).toHaveBeenCalledWith({
        trendingGifts: mockTrendingGifts,
        timeframe: '7d',
        totalCount: mockTrendingGifts.length
      });
    });

    it('should return empty array when no trending gifts found', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        query: {},
        user: { _id: new mongoose.Types.ObjectId() }
      });

      GiftLibrary.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      await giftLibraryController.getTrendingGifts(req, res, mockNext);

      // Assert
      expect(res.json).toHaveBeenCalledWith({
        trendingGifts: [],
        timeframe: '7d',
        totalCount: 0
      });
    });
  });

  describe('getCategories', () => {
    it('should return categories with counts successfully', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockCategoryCounts = [
        { category: 'electronics', count: 25 },
        { category: 'books', count: 15 },
        { category: 'clothing', count: 10 }
      ];

      // Single aggregation pipeline replaces distinct + per-category counts
      GiftLibrary.aggregate = jest.fn().mockResolvedValue(mockCategoryCounts);

      // Act
      await giftLibraryController.getCategories(req, res, mockNext);

      // Assert
      expect(GiftLibrary.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
        { $match: { status: 'active' } },
        { $unwind: '$categories' }
      ]));
      expect(res.json).toHaveBeenCalledWith({
        categories: mockCategoryCounts
      });
    });

    it('should return empty array when no categories found', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        user: { _id: new mongoose.Types.ObjectId() }
      });

      // Aggregation returns no categories
      GiftLibrary.aggregate = jest.fn().mockResolvedValue([]);

      // Act
      await giftLibraryController.getCategories(req, res, mockNext);

      // Assert
      expect(res.json).toHaveBeenCalledWith({
        categories: []
      });
    });

    it('should sort categories by count in descending order', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        user: { _id: new mongoose.Types.ObjectId() }
      });

      // Sorting now happens inside the aggregation ($sort: { count: -1 })
      const sortedCounts = [
        { category: 'electronics', count: 30 },
        { category: 'books', count: 15 },
        { category: 'toys', count: 5 }
      ];
      GiftLibrary.aggregate = jest.fn().mockResolvedValue(sortedCounts);

      // Act
      await giftLibraryController.getCategories(req, res, mockNext);

      // Assert
      expect(GiftLibrary.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
        { $sort: { count: -1 } }
      ]));
      const responseCall = res.json.mock.calls[0][0];
      expect(responseCall.categories).toEqual(sortedCounts);
    });
  });

  // Scoring, one reaction per account and simultaneous requests run against
  // real MongoDB in tests/security/shared-data.security.test.js
  describe('submitGiftFeedback', () => {
    const send = async (body) => {
      const { req, res } = createMockReqRes({ body, user: { _id: new mongoose.Types.ObjectId() } });
      const next = jest.fn();
      await giftLibraryController.submitGiftFeedback(req, res, next);
      return { res, next };
    };

    it('rejects a missing gift id or a missing or unknown action with 400', async () => {
      GiftLibrary.exists = jest.fn();
      for (const body of [{ action: 'liked' }, { giftId: 'g1' }, { giftId: 'g1', action: 'adored' }, { giftId: 'g1', action: 'toString' }]) {
        const { res, next } = await send(body);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
      }
      expect(GiftLibrary.exists).not.toHaveBeenCalled();
    });

    it('returns 404 when the gift does not exist', async () => {
      GiftLibrary.exists = jest.fn().mockResolvedValue(null);
      const { res } = await send({ giftId: String(new mongoose.Types.ObjectId()), action: 'liked' });
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('exploreGifts', () => {
    it('should return filtered gifts with pagination successfully', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        query: {
          categories: 'electronics,books',
          minPrice: '20',
          maxPrice: '100',
          tags: 'birthday,anniversary',
          sort: 'price_asc',
          page: '1',
          limit: '10',
          search: 'smartphone'
        },
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockGifts = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Smartphone Gift',
          categories: ['electronics'],
          priceRange: { min: 50, max: 80 },
          tags: ['birthday'],
          popularityScore: 85,
          status: 'active'
        },
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Tech Book',
          categories: ['books'],
          priceRange: { min: 25, max: 30 },
          tags: ['anniversary'],
          popularityScore: 70,
          status: 'active'
        }
      ];

      const mockTotal = 25;

      // Mock GiftLibrary methods
      GiftLibrary.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(mockGifts)
            })
          })
        })
      });
      GiftLibrary.countDocuments = jest.fn().mockResolvedValue(mockTotal);

      // Act
      await giftLibraryController.exploreGifts(req, res, mockNext);

      // Assert
      expect(GiftLibrary.find).toHaveBeenCalledWith({
        status: 'active',
        categories: { $in: ['electronics', 'books'] },
        'priceRange.min': { $gte: 20 },
        'priceRange.max': { $lte: 100 },
        tags: { $in: ['birthday', 'anniversary'] },
        $text: { $search: 'smartphone' }
      });
      expect(res.json).toHaveBeenCalledWith({
        gifts: mockGifts,
        pagination: {
          currentPage: 1,
          totalPages: 3,
          totalItems: mockTotal,
          itemsPerPage: 10
        }
      });
    });

    it('should return gifts with default sorting when no sort parameter provided', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        query: {},
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockGifts = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Popular Gift',
          popularityScore: 95,
          status: 'active'
        }
      ];

      // Mock GiftLibrary methods with default popularity sorting
      GiftLibrary.find = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue(mockGifts)
            })
          })
        })
      });
      GiftLibrary.countDocuments = jest.fn().mockResolvedValue(1);

      // Act
      await giftLibraryController.exploreGifts(req, res, mockNext);

      // Assert
      expect(GiftLibrary.find).toHaveBeenCalledWith({ status: 'active' });
      // Check that sort was called with popularity score descending (default)
      const findReturn = GiftLibrary.find();
      expect(findReturn.sort).toHaveBeenCalledWith({ popularityScore: -1 });
      expect(res.json).toHaveBeenCalledWith({
        gifts: mockGifts,
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalItems: 1,
          itemsPerPage: 20
        }
      });
    });

    it('should handle different sort options correctly', async () => {
      // Arrange
      const testCases = [
        { sort: 'price_desc', expectedSort: { 'priceRange.max': -1 } },
        { sort: 'newest', expectedSort: { discoveryDate: -1 } },
        { sort: 'popularity', expectedSort: { popularityScore: -1 } }
      ];

      for (const testCase of testCases) {
        const { req, res } = createMockReqRes({
          query: { sort: testCase.sort },
          user: { _id: new mongoose.Types.ObjectId() }
        });

        const mockGifts = [{ _id: new mongoose.Types.ObjectId(), name: 'Test Gift' }];

        // Reset and setup mocks for each test case
        jest.clearAllMocks();
        GiftLibrary.find = jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(mockGifts)
              })
            })
          })
        });
        GiftLibrary.countDocuments = jest.fn().mockResolvedValue(1);

        // Act
        await giftLibraryController.exploreGifts(req, res, mockNext);

        // Assert
        const findReturn = GiftLibrary.find();
        expect(findReturn.sort).toHaveBeenCalledWith(testCase.expectedSort);
      }
    });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await clearDatabase();
  });

  afterAll(async () => {
    await teardownTestDB();
  });
});
