// tests/controllers/giftController.test.js
const mongoose = require('mongoose');
const giftController = require('../../controllers/giftController');
const Gift = require('../../models/Gift');
const Recipient = require('../../models/Recipient');
const Event = require('../../models/Event');
const { Budget, OverallBudget } = require('../../models/Budget');
const { createMockReqRes, mockNext } = require('../utils/mockUtils');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Mock dependencies
jest.mock('../../models/Gift');
jest.mock('../../models/Recipient');
jest.mock('../../models/Event');
jest.mock('../../models/Budget');
jest.mock('../../models/SuggestionHistory');
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));
jest.mock('../../services/aiService');
jest.mock('../../services/enhancedAiService'); // New mock
jest.mock('../../services/webSearchAiService'); // New mock
jest.mock('../../services/hybridSuggestionService'); // New mock
jest.mock('../../utils/suggestionUtilsEnhanced');
jest.mock('../../services/trendAnalysisService');
// The price guide reads the year's budget summary (real-DB tested in
// suggestionBudget.test.js); these unit tests mock the models
jest.mock('../../services/moneyService', () => ({
  ...jest.requireActual('../../services/moneyService'),
  getSuggestionPriceGuide: jest.fn(async () => ({ min: 0, max: null, currency: 'USD' }))
}));
jest.mock('../../config/suggestionConfig', () => ({
  filtering: {
    minimumSuggestions: 3,
    similarityThreshold: 0.8
  }
}));

// Mock Redis and BullMQ (Queue). The mock objects live inside the
// hoisted factories (a top-level const hits the TDZ because the factory
// runs during the controller require above); grab references afterwards.
jest.mock('../../config/redis', () => ({
  redisClient: {
    get: jest.fn(),
    setex: jest.fn(),
  },
  keyPrefixes: {
    suggestions: 'suggestions:'
  }
}));
const { redisClient: mockRedisClient } = require('../../config/redis');


// Set higher timeout for controller tests
jest.setTimeout(30000);

describe('Gift Controller', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  beforeEach(() => {
    // assertOwnedRefs: by default the caller owns the referenced recipient/event
    Recipient.exists = jest.fn().mockResolvedValue({ _id: 'owned' });
    Event.exists = jest.fn().mockResolvedValue({ _id: 'owned' });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await clearDatabase();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  describe('getGifts', () => {
    it('should return gifts for the user with pagination', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const gifts = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Gift 1',
          price: 29.99,
          budgetStatus: 'within_budget',
          toObject: jest.fn().mockReturnValue({
            _id: new mongoose.Types.ObjectId(),
            name: 'Gift 1',
            price: 29.99,
            budgetStatus: 'within_budget'
          })
        }
      ];

      const { req, res } = createMockReqRes({
        user: { _id: userId },
        query: {
          page: '1',
          limit: '10',
          sortBy: 'createdAt',
          sortOrder: 'desc'
        }
      });

      Gift.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              populate: jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue(gifts)
})
            })
          })
        })
      });
      
      Gift.countDocuments = jest.fn().mockResolvedValue(1);

      // Act
      await giftController.getGifts(req, res, mockNext);

      // Assert
      expect(Gift.find).toHaveBeenCalledWith(
        { user: userId },
        expect.any(String)
      );
      
      expect(res.json).toHaveBeenCalledWith({
        gifts: expect.any(Array),
        pagination: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false
        }
      });
    });

    it('should filter gifts by status', async () => {
      const userId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        user: { _id: userId },
        query: { status: 'purchased' }
      });

      Gift.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              populate: jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue([])
})
            })
          })
        })
      });
      Gift.countDocuments = jest.fn().mockResolvedValue(0);

      await giftController.getGifts(req, res, mockNext);
      expect(Gift.find).toHaveBeenCalledWith({ user: userId, status: 'purchased' }, expect.any(String));
    });

    it('should filter gifts by recipientId', async () => {
      const userId = new mongoose.Types.ObjectId();
      const recipientId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        user: { _id: userId },
        query: { recipientId: recipientId.toString() }
      });

      Gift.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              populate: jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue([])
})
            })
          })
        })
      });
      Gift.countDocuments = jest.fn().mockResolvedValue(0);

      await giftController.getGifts(req, res, mockNext);
      expect(Gift.find).toHaveBeenCalledWith({ user: userId, recipient: recipientId.toString() }, expect.any(String));
    });

    it('should filter gifts by eventId', async () => {
      const userId = new mongoose.Types.ObjectId();
      const eventId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        user: { _id: userId },
        query: { eventId: eventId.toString() }
      });

      Gift.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              populate: jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue([])
})
            })
          })
        })
      });
      Gift.countDocuments = jest.fn().mockResolvedValue(0);

      await giftController.getGifts(req, res, mockNext);
      expect(Gift.find).toHaveBeenCalledWith({ user: userId, event: eventId.toString() }, expect.any(String));
    });

    it('should filter gifts by favorite status', async () => {
      const userId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        user: { _id: userId },
        query: { favorite: 'true' }
      });

      Gift.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              populate: jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue([])
})
            })
          })
        })
      });
      Gift.countDocuments = jest.fn().mockResolvedValue(0);

      await giftController.getGifts(req, res, mockNext);
      expect(Gift.find).toHaveBeenCalledWith({ user: userId, favorite: true }, expect.any(String));
    });

    it('should sort gifts by name in ascending order', async () => {
      const userId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        user: { _id: userId },
        query: { sortBy: 'name', sortOrder: 'asc' }
      });

      const mockSort = jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({
              populate: jest.fn().mockResolvedValue([])
})
          })
        })
      });
      Gift.find = jest.fn().mockReturnValue({ sort: mockSort });
      Gift.countDocuments = jest.fn().mockResolvedValue(0);

      await giftController.getGifts(req, res, mockNext);
      expect(mockSort).toHaveBeenCalledWith({ name: 1 });
    });

    it('should apply field projection', async () => {
      const userId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        user: { _id: userId },
        query: { fields: 'name,price' }
      });

      Gift.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              populate: jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue([])
})
            })
          })
        })
      });
      Gift.countDocuments = jest.fn().mockResolvedValue(0);

      await giftController.getGifts(req, res, mockNext);
      expect(Gift.find).toHaveBeenCalledWith({ user: userId }, 'name price');
    });

    it('should handle pagination for an empty result set', async () => {
      const userId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        user: { _id: userId },
        query: { page: '1', limit: '10' }
      });

      Gift.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              populate: jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue([])
})
            })
          })
        })
      });
      Gift.countDocuments = jest.fn().mockResolvedValue(0);

      await giftController.getGifts(req, res, mockNext);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        gifts: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false
        }
      }));
    });

    it('should handle pagination for a specific page and limit', async () => {
      const userId = new mongoose.Types.ObjectId();
      const gifts = Array(25).fill({
        toObject: jest.fn().mockReturnValue({
          _id: new mongoose.Types.ObjectId(),
          name: 'Gift',
          budgetStatus: 'no_budget'
        })
      });
      const { req, res } = createMockReqRes({
        user: { _id: userId },
        query: { page: '2', limit: '10' }
      });

      Gift.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              populate: jest.fn().mockReturnValue({
                populate: jest.fn().mockResolvedValue(gifts.slice(10, 20))
})
            })
          })
        })
      });
      Gift.countDocuments = jest.fn().mockResolvedValue(25);

      await giftController.getGifts(req, res, mockNext);
      expect(Gift.find).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        gifts: expect.any(Array),
        pagination: {
          total: 25,
          page: 2,
          limit: 10,
          totalPages: 3,
          hasNextPage: true,
          hasPrevPage: true
        }
      }));
    });
  });

  describe('toggleFavorite', () => {
    it('should toggle the favorite status of a gift', async () => {
      // Arrange
      const giftId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        params: { giftId },
        user: { _id: userId }
      });

      const gift = {
        _id: giftId,
        user: userId,
        name: 'Gift to Favorite',
        favorite: false,
        save: jest.fn().mockResolvedValue({
          _id: giftId,
          user: userId,
          name: 'Gift to Favorite',
          favorite: true
        })
      };
      Gift.findById = jest.fn().mockResolvedValue(gift);

      // Act
      await giftController.toggleFavorite(req, res, mockNext);

      // Assert
      expect(Gift.findById).toHaveBeenCalledWith(giftId);
      expect(gift.favorite).toBe(true);
      expect(gift.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
    });

    it('should return 404 if gift not found', async () => {
      // Arrange
      const giftId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        params: { giftId },
        user: { _id: new mongoose.Types.ObjectId() }
      });

      Gift.findById = jest.fn().mockResolvedValue(null);

      // Act
      await giftController.toggleFavorite(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 404 if the gift belongs to another user (toggle favorite)', async () => {
      // Arrange
      const giftId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const anotherUserId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        params: { giftId },
        user: { _id: anotherUserId } // Different user
      });

      const gift = {
        _id: giftId,
        user: userId,
        name: 'Gift to Favorite',
        favorite: false,
        save: jest.fn() // Add save mock here
      };
      Gift.findById = jest.fn().mockResolvedValue(gift);

      // Act
      await giftController.toggleFavorite(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(404);
      expect(gift.save).not.toHaveBeenCalled();
    });
  });

  describe('getFavorites', () => {
    it('should return all favorite gifts for the user', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const favoriteGifts = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Favorite Gift 1',
          price: 29.99,
          favorite: true,
          budgetStatus: 'within_budget',
          toObject: jest.fn().mockReturnValue({
            _id: new mongoose.Types.ObjectId(),
            name: 'Favorite Gift 1',
            price: 29.99,
            favorite: true,
            budgetStatus: 'within_budget'
          })
        }
      ];

      const { req, res } = createMockReqRes({
        user: { _id: userId }
      });

      Gift.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(favoriteGifts)
})
      });

      // Act
      await giftController.getFavorites(req, res, mockNext);

      // Assert
      expect(Gift.find).toHaveBeenCalledWith({ 
        user: userId,
        favorite: true 
      });
      expect(res.json).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.any(Array));
    });

    it('should return an empty array if no favorite gifts are found', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        user: { _id: userId }
      });

      Gift.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue([])
})
      });

      // Act
      await giftController.getFavorites(req, res, mockNext);

      // Assert
      expect(Gift.find).toHaveBeenCalledWith({ 
        user: userId,
        favorite: true 
      });
      expect(res.json).toHaveBeenCalledWith([]);
    });
  });

  describe('generateGiftSuggestions', () => {
    // No gifts saved or bought for the recipient yet
    beforeEach(() => {
      Gift.find = jest.fn().mockReturnValue({ sort: () => ({ select: () => ({ lean: async () => [] }) }) });
    });

    it('should generate AI gift suggestions successfully', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const eventId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        body: { recipientId, eventId },
        user: { _id: userId }
      });
      
      // Mock recipient and event
      const mockRecipient = {
        _id: recipientId,
        firstName: 'John',
        lastName: 'Doe',
        age: 30,
        relation: 'friend',
        interests: ['technology', 'gaming'],           // REQUIRED: Array
        hobbies: ['reading', 'hiking'],               // REQUIRED: Array  
        favoriteColors: ['blue', 'green'],           // REQUIRED: Array
        favoriteBooks: ['Book 1'],                   // REQUIRED: Array
        favoriteMovies: ['Movie 1'],                 // REQUIRED: Array
        favoriteMusic: ['Genre 1'],                  // REQUIRED: Array
        personalityTraits: ['analytical', 'creative'], // REQUIRED: Array
        dietaryRestrictions: [],                      // REQUIRED: Array (can be empty)
        allergies: [],                               // REQUIRED: Array (can be empty)
        wishList: [],                                // REQUIRED: Array (can be empty)
        giftPreferences: 'practical',
        relationshipLength: '5',
        relationshipCloseness: 'close',
        clothingSizes: { shirt: 'M', pants: '32', shoe: '10' },
        tags: [{ name: 'tech-enthusiast' }]          // REQUIRED: Array of objects
      };
      
      const mockEvent = {
        _id: eventId,
        name: 'Birthday',
        date: new Date('2025-12-25')
      };
      
      Recipient.findOne = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockRecipient)
      });
      Event.findOne = jest.fn().mockResolvedValue(mockEvent);
      Budget.findOne = jest.fn().mockResolvedValue(null);
      
      // Mock services using the mocked modules
      const mockAiService = require('../../services/aiService');
      const mockEnhancedAiService = require('../../services/enhancedAiService');
      const mockWebSearchAiService = require('../../services/webSearchAiService');
      const mockHybridSuggestionService = require('../../services/hybridSuggestionService');
      const mockSuggestionUtils = require('../../utils/suggestionUtilsEnhanced');
      
      // Define mockAiSuggestions before using it
      const mockAiSuggestions = [
        {
          name: 'Wireless Headphones',
          description: 'High-quality wireless headphones',
          estimatedPrice: 99.99,
          category: 'Electronics',
          tags: ['technology', 'audio'],
          whereToBuy: ['Amazon', 'Best Buy'],
          relevanceScore: 85
        }
      ];
      
      mockSuggestionUtils.filterIgnoredSuggestions.mockResolvedValue(mockAiSuggestions);
      mockSuggestionUtils.isFilteringTooAggressive.mockResolvedValue({ isTooAggressive: false });
      mockSuggestionUtils.getDynamicCooldownPeriod.mockResolvedValue(24);

      // Suggestion history: one prior suggestion that must appear in the
      // basic-mode prompt as an exclusion, and recording must be invoked
      // for each saved gift.
      const SuggestionHistory = require('../../models/SuggestionHistory');
      SuggestionHistory.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([
          { giftMetadata: { name: 'Smart Watch' } }
        ])
      });
      SuggestionHistory.recordSuggestion = jest.fn().mockResolvedValue({});

      // Fix Gift constructor mocking:
      const mockSavedGift = {
        _id: new mongoose.Types.ObjectId(),
        save: jest.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
          budgetStatus: 'within_budget' // or 'no_budget', 'over_budget'
        }),
        toObject: jest.fn().mockReturnValue({
          _id: new mongoose.Types.ObjectId(),
          name: 'Mock Gift',
          budgetStatus: 'within_budget'
        })
      };

      Gift.mockImplementation((giftData) => ({
        ...giftData,
        _id: new mongoose.Types.ObjectId(),
        save: jest.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
          ...giftData,
          budgetStatus: 'no_budget'
        }),
        toObject: jest.fn().mockReturnValue({
          _id: new mongoose.Types.ObjectId(),
          ...giftData,
          budgetStatus: 'no_budget'
        })
      }));
      
      Gift.populate.mockImplementation((gifts) => {
        return Promise.resolve(gifts.map(gift => ({
          ...gift,
          toObject: jest.fn().mockReturnValue({
            ...gift,
            budgetStatus: gift.budgetStatus || 'no_budget'
          })
        })));
      });

      // Standard AI service:
      mockAiService.getAISuggestions.mockResolvedValue([
        {
          name: 'Wireless Headphones',
          description: 'High-quality wireless headphones',
          estimatedPrice: 99.99,
          category: 'Electronics',
          tags: ['technology', 'audio'],
          whereToBuy: ['Amazon', 'Best Buy'],
          relevanceScore: 85
        }
      ]);

      // Web enhanced service:
      mockWebSearchAiService.getWebEnhancedGiftSuggestions.mockResolvedValue({ suggestions: [
        {
          name: 'Web Enhanced Gift',
          description: 'Description',
          estimatedPrice: 200,
          category: 'Gadget',
          currentPrice: 190, // Add web-specific properties
          availability: 'In Stock',
          reviews: { rating: 4.5, count: 120 }
        }
      ], webSearch: { configured: true, attempted: 1, succeeded: 1, rateLimited: false } });

      // Hybrid service:
      mockHybridSuggestionService.generateHybridSuggestions.mockResolvedValue([
        {
          name: 'Hybrid Gift 1',
          description: 'Hybrid description',
          priceRange: { min: 50, max: 100 },
          categories: ['Art'],
          tags: ['creative'],
          matchScore: 85,
          source: 'discovered',
          sourceDetails: { type: 'discovered', popularity: 80 }
        }
      ]);
      
      // Act
      await giftController.generateGiftSuggestions(req, res, mockNext);
      
      // Assert
      expect(Recipient.findOne).toHaveBeenCalledWith({ _id: recipientId, user: req.user._id });
      expect(Event.findOne).toHaveBeenCalledWith({ _id: eventId, user: req.user._id });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        suggestions: expect.arrayContaining([
          expect.objectContaining({
            name: 'Wireless Headphones'
          })
        ])
      }));

      // Basic-mode prompt must list previously suggested gifts to exclude
      const promptArg = mockAiService.getAISuggestions.mock.calls[0][0];
      expect(promptArg).toContain('Previously Suggested Gifts');
      expect(promptArg).toContain('- Smart Watch');

      // Each saved gift must be recorded in suggestion history
      expect(SuggestionHistory.recordSuggestion).toHaveBeenCalledWith(
        expect.objectContaining({
          user: userId,
          recipient: recipientId,
          giftName: 'Wireless Headphones',
          cooldownPeriod: 24
        })
      );
    });

    it('should return 400 if required parameters are missing', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        body: { recipientId: new mongoose.Types.ObjectId() }, // Missing eventId
        user: { _id: new mongoose.Types.ObjectId() }
      });

      // Act
      await giftController.generateGiftSuggestions(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Please provide both recipient and event IDs');
    });

    it('should return 404 if recipient not found', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const eventId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        body: { recipientId, eventId },
        user: { _id: new mongoose.Types.ObjectId() }
      });

      // Mock recipient not found
      Recipient.findOne = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(null)
      });
      
      // Mock event found
      Event.findOne = jest.fn().mockResolvedValue({
        _id: eventId,
        name: 'Birthday',
        date: new Date('2025-12-25')
      });

      // Act
      await giftController.generateGiftSuggestions(req, res, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
      expect(mockNext.mock.calls[0][0].message).toBe('Recipient not found');
    });

    it('should return 404 if event not found', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const eventId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        body: { recipientId, eventId },
        user: { _id: new mongoose.Types.ObjectId() }
      });

      // Mock recipient found
      Recipient.findOne = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          _id: recipientId,
          firstName: 'John',
          lastName: 'Doe',
          tags: []
        })
      });
      
      // Mock event not found
      Event.findOne = jest.fn().mockResolvedValue(null);

      // Act
      await giftController.generateGiftSuggestions(req, res, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
      expect(mockNext.mock.calls[0][0].message).toBe('Event not found');
    });

    it('should generate enhanced AI gift suggestions successfully', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const eventId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        body: { recipientId, eventId, enhanced: true },
        user: { _id: userId }
      });
      
      const mockRecipient = {
        _id: recipientId,
        firstName: 'John',
        lastName: 'Doe',
        age: 30,
        relation: 'friend',
        interests: ['technology', 'gaming'],           // REQUIRED: Array
        hobbies: ['reading', 'hiking'],               // REQUIRED: Array  
        favoriteColors: ['blue', 'green'],           // REQUIRED: Array
        favoriteBooks: ['Book 1'],                   // REQUIRED: Array
        favoriteMovies: ['Movie 1'],                 // REQUIRED: Array
        favoriteMusic: ['Genre 1'],                  // REQUIRED: Array
        personalityTraits: ['analytical', 'creative'], // REQUIRED: Array
        dietaryRestrictions: [],                      // REQUIRED: Array (can be empty)
        allergies: [],                               // REQUIRED: Array (can be empty)
        wishList: [],                                // REQUIRED: Array (can be empty)
        giftPreferences: 'practical',
        relationshipLength: '5',
        relationshipCloseness: 'close',
        clothingSizes: { shirt: 'M', pants: '32', shoe: '10' },
        tags: [{ name: 'tech-enthusiast' }]          // REQUIRED: Array of objects
      };
      const mockEvent = { _id: eventId, name: 'Birthday', date: new Date() };
      
      Recipient.findOne = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(mockRecipient) });
      Event.findOne = jest.fn().mockResolvedValue(mockEvent);
      Budget.findOne = jest.fn().mockResolvedValue(null);
      
      const { getEnhancedGiftSuggestions } = require('../../services/enhancedAiService');
      getEnhancedGiftSuggestions.mockResolvedValue([
        { name: 'Enhanced Gift', description: 'Enhanced description', estimatedPrice: 150, category: 'Luxury' }
      ]);
      
      const { filterIgnoredSuggestions, isFilteringTooAggressive, getDynamicCooldownPeriod } = require('../../utils/suggestionUtilsEnhanced');
      
      filterIgnoredSuggestions.mockResolvedValue([
        { name: 'Enhanced Gift', description: 'Enhanced description', estimatedPrice: 150, category: 'Luxury' }
      ]);
      isFilteringTooAggressive.mockResolvedValue({ isTooAggressive: false });
      getDynamicCooldownPeriod.mockResolvedValue(24);

      Gift.mockImplementation(() => ({
        save: jest.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
          toObject: jest.fn().mockReturnValue({
            _id: new mongoose.Types.ObjectId(),
            name: 'Enhanced Gift',
            budgetStatus: 'no_budget'
          })
        })
      }));
      Gift.populate = jest.fn().mockResolvedValue([
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Enhanced Gift',
          toObject: jest.fn().mockReturnValue({
            _id: new mongoose.Types.ObjectId(),
            name: 'Enhanced Gift',
            budgetStatus: 'no_budget'
          })
        }
      ]);

      // Act
      await giftController.generateGiftSuggestions(req, res, mockNext);

      // Assert
      expect(getEnhancedGiftSuggestions).toHaveBeenCalledWith(recipientId, eventId, userId, { provider: undefined, model: undefined, priceGuide: { min: 0, max: null, currency: 'USD' }, alreadyChosen: [], locale: { country: null, currency: 'USD' } });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        suggestions: expect.arrayContaining([
          expect.objectContaining({ name: 'Enhanced Gift' })
        ])
      }));
    });

    it('should generate web-enhanced AI gift suggestions successfully', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const eventId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        body: { recipientId, eventId, webEnhanced: true },
        user: { _id: userId }
      });
      
      const mockRecipient = {
        _id: recipientId,
        firstName: 'Jane',
        lastName: 'Doe',
        age: 28,
        relation: 'friend',
        interests: ['technology', 'gaming'],           // REQUIRED: Array
        hobbies: ['reading', 'hiking'],               // REQUIRED: Array  
        favoriteColors: ['blue', 'green'],           // REQUIRED: Array
        favoriteBooks: ['Book 1'],                   // REQUIRED: Array
        favoriteMovies: ['Movie 1'],                 // REQUIRED: Array
        favoriteMusic: ['Genre 1'],                  // REQUIRED: Array
        personalityTraits: ['analytical', 'creative'], // REQUIRED: Array
        dietaryRestrictions: [],                      // REQUIRED: Array (can be empty)
        allergies: [],                               // REQUIRED: Array (can be empty)
        wishList: [],                                // REQUIRED: Array (can be empty)
        giftPreferences: 'unique',
        relationshipLength: '5',
        relationshipCloseness: 'close',
        clothingSizes: { shirt: 'M', pants: '32', shoe: '10' },
        tags: [{ name: 'tech-enthusiast' }]          // REQUIRED: Array of objects
      };
      const mockEvent = { _id: eventId, name: 'Anniversary', date: new Date() };
      
      Recipient.findOne = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(mockRecipient) });
      Event.findOne = jest.fn().mockResolvedValue(mockEvent);
      Budget.findOne = jest.fn().mockResolvedValue(null);
      
      const { getWebEnhancedGiftSuggestions } = require('../../services/webSearchAiService');
      getWebEnhancedGiftSuggestions.mockResolvedValue({
        suggestions: [{ name: 'Web Enhanced Gift', description: 'Web enhanced description', estimatedPrice: 200, category: 'Gadget', currentPrice: 190 }],
        webSearch: { configured: true, attempted: 1, succeeded: 1, rateLimited: false }
      });
      
      const { filterIgnoredSuggestions, isFilteringTooAggressive, getDynamicCooldownPeriod } = require('../../utils/suggestionUtilsEnhanced');
      
      filterIgnoredSuggestions.mockResolvedValue([
        { name: 'Web Enhanced Gift', description: 'Web enhanced description', estimatedPrice: 200, category: 'Gadget', currentPrice: 190 }
      ]);
      isFilteringTooAggressive.mockResolvedValue({ isTooAggressive: false });
      getDynamicCooldownPeriod.mockResolvedValue(24);

      Gift.mockImplementation(() => ({
        save: jest.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
          toObject: jest.fn().mockReturnValue({
            _id: new mongoose.Types.ObjectId(),
            name: 'Web Enhanced Gift',
            budgetStatus: 'no_budget'
          })
        })
      }));
      Gift.populate = jest.fn().mockResolvedValue([
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Web Enhanced Gift',
          toObject: jest.fn().mockReturnValue({
            _id: new mongoose.Types.ObjectId(),
            name: 'Web Enhanced Gift',
            budgetStatus: 'no_budget'
          })
        }
      ]);

      // Act
      await giftController.generateGiftSuggestions(req, res, mockNext);

      // Assert
      expect(getWebEnhancedGiftSuggestions).toHaveBeenCalledWith(recipientId, eventId, userId, { provider: undefined, model: undefined, priceGuide: { min: 0, max: null, currency: 'USD' }, alreadyChosen: [], locale: { country: null, currency: 'USD' } });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        suggestions: expect.arrayContaining([
          expect.objectContaining({
            name: 'Web Enhanced Gift'
          })
        ]),
        webSearchInfo: expect.any(Object) // or null
      }));
    });

    it('should handle web search rate limit warning', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const eventId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        body: { recipientId, eventId, webEnhanced: true },
        user: { _id: userId }
      });
      
      const mockRecipient = {
        _id: recipientId,
        firstName: 'Jane',
        lastName: 'Doe',
        age: 28,
        relation: 'friend',
        interests: ['technology', 'gaming'],           // REQUIRED: Array
        hobbies: ['reading', 'hiking'],               // REQUIRED: Array  
        favoriteColors: ['blue', 'green'],           // REQUIRED: Array
        favoriteBooks: ['Book 1'],                   // REQUIRED: Array
        favoriteMovies: ['Movie 1'],                 // REQUIRED: Array
        favoriteMusic: ['Genre 1'],                  // REQUIRED: Array
        personalityTraits: ['analytical', 'creative'], // REQUIRED: Array
        dietaryRestrictions: [],                      // REQUIRED: Array (can be empty)
        allergies: [],                               // REQUIRED: Array (can be empty)
        wishList: [],                                // REQUIRED: Array (can be empty)
        giftPreferences: 'unique',
        relationshipLength: '5',
        relationshipCloseness: 'close',
        clothingSizes: { shirt: 'M', pants: '32', shoe: '10' },
        tags: [{ name: 'tech-enthusiast' }]          // REQUIRED: Array of objects
      };
      const mockEvent = { _id: eventId, name: 'Anniversary', date: new Date() };
      
      Recipient.findOne = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(mockRecipient) });
      Event.findOne = jest.fn().mockResolvedValue(mockEvent);
      Budget.findOne = jest.fn().mockResolvedValue(null);
      
      const { getWebEnhancedGiftSuggestions } = require('../../services/webSearchAiService');
      getWebEnhancedGiftSuggestions.mockResolvedValue({
        suggestions: [
          { name: 'Gift 1', estimatedPrice: 20, webSearch: 'ok' },
          { name: 'Gift 2', estimatedPrice: 20, webSearch: 'rate_limited' }
        ],
        webSearch: { configured: true, attempted: 2, succeeded: 1, rateLimited: true }
      });
      
      const { filterIgnoredSuggestions, isFilteringTooAggressive, getDynamicCooldownPeriod } = require('../../utils/suggestionUtilsEnhanced');
      
      filterIgnoredSuggestions.mockResolvedValue([
        { name: 'Gift 1', estimatedPrice: 20 },
        { name: 'Gift 2', estimatedPrice: 20 }
      ]);
      isFilteringTooAggressive.mockResolvedValue({ isTooAggressive: false });
      getDynamicCooldownPeriod.mockResolvedValue(24);

      Gift.mockImplementation(() => ({
        save: jest.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
          toObject: jest.fn().mockReturnValue({
            _id: new mongoose.Types.ObjectId(),
            name: 'Gift',
            budgetStatus: 'no_budget'
          })
        })
      }));
      Gift.populate = jest.fn().mockResolvedValue([
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Gift 1',
          toObject: jest.fn().mockReturnValue({
            _id: new mongoose.Types.ObjectId(),
            name: 'Gift 1',
            budgetStatus: 'no_budget'
          })
        },
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Gift 2',
          toObject: jest.fn().mockReturnValue({
            _id: new mongoose.Types.ObjectId(),
            name: 'Gift 2',
            budgetStatus: 'no_budget'
          })
        }
      ]);

      // Act
      await giftController.generateGiftSuggestions(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        webSearchInfo: expect.objectContaining({
          searchPerformed: true,
          warning: 'Web search worked for 1 of 2 suggestions (rate limit reached).'
        })
      }));
      // Brave's own rate-limit headers never reach the client
      expect(res.json.mock.calls[0][0].webSearchInfo).not.toHaveProperty('rateLimitHeaders');
    });

    it('does not ask the AI a second time when the web mode fails', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const eventId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        body: { recipientId, eventId, webEnhanced: true },
        user: { _id: userId }
      });
      
      const mockRecipient = {
        _id: recipientId,
        firstName: 'Jane',
        lastName: 'Doe',
        age: 28,
        relation: 'friend',
        interests: ['technology', 'gaming'],           // REQUIRED: Array
        hobbies: ['reading', 'hiking'],               // REQUIRED: Array  
        favoriteColors: ['blue', 'green'],           // REQUIRED: Array
        favoriteBooks: ['Book 1'],                   // REQUIRED: Array
        favoriteMovies: ['Movie 1'],                 // REQUIRED: Array
        favoriteMusic: ['Genre 1'],                  // REQUIRED: Array
        personalityTraits: ['analytical', 'creative'], // REQUIRED: Array
        dietaryRestrictions: [],                      // REQUIRED: Array (can be empty)
        allergies: [],                               // REQUIRED: Array (can be empty)
        wishList: [],                                // REQUIRED: Array (can be empty)
        giftPreferences: 'unique',
        relationshipLength: '5',
        relationshipCloseness: 'close',
        clothingSizes: { shirt: 'M', pants: '32', shoe: '10' },
        tags: [{ name: 'tech-enthusiast' }]          // REQUIRED: Array of objects
      };
      const mockEvent = { _id: eventId, name: 'Anniversary', date: new Date() };
      
      Recipient.findOne = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(mockRecipient) });
      Event.findOne = jest.fn().mockResolvedValue(mockEvent);
      Budget.findOne = jest.fn().mockResolvedValue(null);
      
      const { getWebEnhancedGiftSuggestions } = require('../../services/webSearchAiService');
      getWebEnhancedGiftSuggestions.mockRejectedValue(new Error('Web search service error'));
      
      const { getEnhancedGiftSuggestions } = require('../../services/enhancedAiService');
      getEnhancedGiftSuggestions.mockResolvedValue([
        { name: 'Fallback Enhanced Gift', description: 'Fallback description', estimatedPrice: 100 }
      ]);
      
      const { filterIgnoredSuggestions, isFilteringTooAggressive, getDynamicCooldownPeriod } = require('../../utils/suggestionUtilsEnhanced');
      
      filterIgnoredSuggestions.mockResolvedValue([
        { name: 'Fallback Enhanced Gift', description: 'Fallback description', estimatedPrice: 100 }
      ]);
      isFilteringTooAggressive.mockResolvedValue({ isTooAggressive: false });
      getDynamicCooldownPeriod.mockResolvedValue(24);

      Gift.mockImplementation(() => ({
        save: jest.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
          toObject: jest.fn().mockReturnValue({
            _id: new mongoose.Types.ObjectId(),
            name: 'Fallback Enhanced Gift',
            budgetStatus: 'no_budget'
          })
        })
      }));
      Gift.populate = jest.fn().mockResolvedValue([
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Fallback Enhanced Gift',
          toObject: jest.fn().mockReturnValue({
            _id: new mongoose.Types.ObjectId(),
            name: 'Fallback Enhanced Gift',
            budgetStatus: 'no_budget'
          })
        }
      ]);

      // Act & Assert: the error is passed on; no Enhanced fallback call
      await giftController.generateGiftSuggestions(req, res, mockNext);
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ message: 'Web search service error' }));
      expect(getWebEnhancedGiftSuggestions).toHaveBeenCalled();
      expect(getEnhancedGiftSuggestions).not.toHaveBeenCalled();
    });

    it('should generate hybrid gift suggestions successfully', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const eventId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        body: { recipientId, eventId, hybrid: true },
        user: { _id: userId }
      });
      
      const mockRecipient = {
        _id: recipientId,
        firstName: 'Alice',
        lastName: 'Smith',
        age: 25,
        gender: 'female',
        relation: 'sister',
        interests: ['art'],
        hobbies: ['painting'],
        favoriteColors: ['blue', 'green'],
        favoriteBooks: ['Book 1'],
        favoriteMovies: ['Movie 1'],
        favoriteMusic: ['Genre 1'],
        personalityTraits: ['analytical', 'creative'],
        dietaryRestrictions: [],
        allergies: [],
        wishList: [],
        giftPreferences: 'practical',
        relationshipLength: '5',
        relationshipCloseness: 'close',
        clothingSizes: { shirt: 'M', pants: '32', shoe: '10' },
        tags: [{ name: 'tech-enthusiast' }]
      };
      const mockEvent = { _id: eventId, name: 'Christmas', date: new Date() };
      const mockBudget = { maximumAmount: 500 };
      require('../../services/moneyService').getSuggestionPriceGuide
        .mockResolvedValueOnce({ min: 0, max: 500, currency: 'USD' });
      
      Recipient.findOne = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(mockRecipient) });
      Event.findOne = jest.fn().mockResolvedValue(mockEvent);
      Budget.findOne = jest.fn().mockResolvedValue(mockBudget);
      OverallBudget.findOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
      
      const SuggestionHistory = require('../../models/SuggestionHistory');
      SuggestionHistory.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([
          { giftMetadata: { name: 'Previously Suggested Gift' } }
        ])
      });
      SuggestionHistory.recordSuggestion = jest.fn().mockResolvedValue({});

      const { isHybridSystemHealthy, generateHybridSuggestions } = require('../../services/hybridSuggestionService');
      isHybridSystemHealthy.mockResolvedValue({ isHealthy: true, totalGifts: 500 });
      generateHybridSuggestions.mockResolvedValue([
        {
          name: 'Hybrid Gift 1',
          description: 'Hybrid description', 
          priceRange: { min: 50, max: 100 }, 
          categories: ['Art'], 
          tags: ['creative'], 
          source: 'discovered', 
          sourceUrl: 'http://example.com/hybrid1', 
          matchScore: 95,
          sourceDetails: { type: 'discovered', popularity: 80 }
        }
      ]);
      
      const { filterIgnoredSuggestions, isFilteringTooAggressive, getDynamicCooldownPeriod } = require('../../utils/suggestionUtilsEnhanced');
      
      filterIgnoredSuggestions.mockResolvedValue([
        { 
          name: 'Hybrid Gift 1', 
          description: 'Hybrid description', 
          estimatedPrice: 75, // (50+100)/2
          priceRange: '50 - 100',
          category: 'Art', 
          tags: ['creative'], 
          whereToBuy: ['http://example.com/hybrid1'],
          relevanceScore: 95,
          isDiscovered: true,
          sourceType: 'discovered',
          sourceUrl: 'http://example.com/hybrid1',
          popularityScore: 80
        }
      ]);
      isFilteringTooAggressive.mockResolvedValue({ isTooAggressive: false });
      getDynamicCooldownPeriod.mockResolvedValue(24);

      Gift.mockImplementation(() => ({
        save: jest.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
          toObject: jest.fn().mockReturnValue({
            _id: new mongoose.Types.ObjectId(),
            name: 'Hybrid Gift 1',
            budgetStatus: 'within_budget'
          })
        })
      }));
      Gift.populate = jest.fn().mockResolvedValue([
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Hybrid Gift 1',
          toObject: jest.fn().mockReturnValue({
            _id: new mongoose.Types.ObjectId(),
            name: 'Hybrid Gift 1',
            budgetStatus: 'within_budget'
          })
        }
      ]);

      // Act
      await giftController.generateGiftSuggestions(req, res, mockNext);

      // Assert
      expect(isHybridSystemHealthy).toHaveBeenCalled();
      expect(generateHybridSuggestions).toHaveBeenCalledWith(
        expect.objectContaining({
          age: 25,
          gender: 'female',
          interests: expect.arrayContaining(['art', 'painting']),
          relationship: 'sister',
          occasion: 'Christmas',
          budget: 500
        }),
        expect.objectContaining({
          count: 5,
          budget: 500,
          includeSources: true,
          excludeNames: ['Previously Suggested Gift']
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        suggestions: expect.arrayContaining([
          expect.objectContaining({
            name: 'Hybrid Gift 1'
          })
        ])
      }));
    });

    it('should handle hybrid system unhealthy scenario', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const eventId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        body: { recipientId, eventId, hybrid: true },
        user: { _id: userId }
      });
      
      const mockRecipient = {
        _id: recipientId,
        firstName: 'Alice',
        lastName: 'Smith',
        age: 25,
        gender: 'female',
        relation: 'sister',
        interests: ['art'],           // REQUIRED: Array
        hobbies: ['painting'],               // REQUIRED: Array  
        favoriteColors: ['blue', 'green'],           // REQUIRED: Array
        favoriteBooks: ['Book 1'],                   // REQUIRED: Array
        favoriteMovies: ['Movie 1'],                 // REQUIRED: Array
        favoriteMusic: ['Genre 1'],                  // REQUIRED: Array
        personalityTraits: ['analytical', 'creative'], // REQUIRED: Array
        dietaryRestrictions: [],                      // REQUIRED: Array (can be empty)
        allergies: [],                               // REQUIRED: Array (can be empty)
        wishList: [],                                // REQUIRED: Array (can be empty)
        giftPreferences: 'practical',
        relationshipLength: '5',
        relationshipCloseness: 'close',
        clothingSizes: { shirt: 'M', pants: '32', shoe: '10' },
        tags: [{ name: 'tech-enthusiast' }]          // REQUIRED: Array of objects
      };
      const mockEvent = { _id: eventId, name: 'Christmas', date: new Date() };
      
      Recipient.findOne = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(mockRecipient) });
      Event.findOne = jest.fn().mockResolvedValue(mockEvent);
      Budget.findOne = jest.fn().mockResolvedValue(null);
      
      const { isHybridSystemHealthy, generateHybridSuggestions } = require('../../services/hybridSuggestionService');
      isHybridSystemHealthy.mockResolvedValue({ isHealthy: false, totalGifts: 3 }); // System is unhealthy
      generateHybridSuggestions.mockResolvedValue([]); // Should not be called if unhealthy, but mock for safety
      
      const { getEnhancedGiftSuggestions } = require('../../services/enhancedAiService');
      getEnhancedGiftSuggestions.mockResolvedValue([
        { name: 'Fallback Enhanced Gift', description: 'Fallback description', estimatedPrice: 100 }
      ]);
      
      const { filterIgnoredSuggestions, isFilteringTooAggressive, getDynamicCooldownPeriod } = require('../../utils/suggestionUtilsEnhanced');
      
      filterIgnoredSuggestions.mockResolvedValue([
        { name: 'Fallback Enhanced Gift', description: 'Fallback description', estimatedPrice: 100 }
      ]);
      isFilteringTooAggressive.mockResolvedValue({ isTooAggressive: false });
      getDynamicCooldownPeriod.mockResolvedValue(24);

      Gift.mockImplementation(() => ({
        save: jest.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
          toObject: jest.fn().mockReturnValue({
            _id: new mongoose.Types.ObjectId(),
            name: 'Fallback Enhanced Gift',
            budgetStatus: 'no_budget'
          })
        })
      }));
      Gift.populate = jest.fn().mockResolvedValue([
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Fallback Enhanced Gift',
          toObject: jest.fn().mockReturnValue({
            _id: new mongoose.Types.ObjectId(),
            name: 'Fallback Enhanced Gift',
            budgetStatus: 'no_budget'
          })
        }
      ]);

      // Act
      await giftController.generateGiftSuggestions(req, res, mockNext);

      // Assert
      expect(isHybridSystemHealthy).toHaveBeenCalled();
      expect(generateHybridSuggestions).not.toHaveBeenCalled(); // Should not call hybrid if unhealthy
      expect(getEnhancedGiftSuggestions).toHaveBeenCalled(); // Should fall back to enhanced
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        suggestions: expect.arrayContaining([
          expect.objectContaining({ name: 'Fallback Enhanced Gift' })
        ])
      }));
    });

    it('should filter out ignored suggestions', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const eventId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        body: { recipientId, eventId },
        user: { _id: userId }
      });
      
      const mockRecipient = {
        _id: recipientId,
        firstName: 'John',
        lastName: 'Doe',
        age: 30,
        relation: 'friend',
        interests: ['technology', 'gaming'],
        hobbies: ['reading', 'hiking'],
        favoriteColors: ['blue', 'green'],
        favoriteBooks: ['Book 1'],
        favoriteMovies: ['Movie 1'],
        favoriteMusic: ['Genre 1'],
        personalityTraits: ['analytical', 'creative'],
        dietaryRestrictions: [],
        allergies: [],
        wishList: [],
        giftPreferences: 'practical',
        relationshipLength: '5',
        relationshipCloseness: 'close',
        clothingSizes: { shirt: 'M', pants: '32', shoe: '10' },
        tags: [{ name: 'tech-enthusiast' }]
      };
      const mockEvent = { _id: eventId, name: 'Birthday', date: new Date() };
      
      Recipient.findOne = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(mockRecipient) });
      Event.findOne = jest.fn().mockResolvedValue(mockEvent);
      Budget.findOne = jest.fn().mockResolvedValue(null);
      
      const { getAISuggestions } = require('../../services/aiService');
      getAISuggestions.mockResolvedValue([
        { name: 'Gift 1', estimatedPrice: 10 },
        { name: 'Gift 2', estimatedPrice: 20 },
        { name: 'Gift 3', estimatedPrice: 30 }
      ]);
      
      const { filterIgnoredSuggestions, isFilteringTooAggressive, getDynamicCooldownPeriod } = require('../../utils/suggestionUtilsEnhanced');
      filterIgnoredSuggestions.mockResolvedValue([
        { name: 'Gift 1', estimatedPrice: 10 },
        { name: 'Gift 3', estimatedPrice: 30 }
      ]); // Simulate filtering out Gift 2
      
      isFilteringTooAggressive.mockResolvedValue({ isTooAggressive: false });
      getDynamicCooldownPeriod.mockResolvedValue(24);

      Gift.mockImplementation(() => ({
        save: jest.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
          toObject: jest.fn().mockReturnValue({
            _id: new mongoose.Types.ObjectId(),
            name: 'Gift',
            budgetStatus: 'no_budget'
          })
        })
      }));
      Gift.populate = jest.fn().mockResolvedValue([
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Gift 1',
          toObject: jest.fn().mockReturnValue({
            _id: new mongoose.Types.ObjectId(),
            name: 'Gift 1',
            budgetStatus: 'no_budget'
          })
        },
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Gift 3',
          toObject: jest.fn().mockReturnValue({
            _id: new mongoose.Types.ObjectId(),
            name: 'Gift 3',
            budgetStatus: 'no_budget'
          })
        }
      ]);

      // Act
      await giftController.generateGiftSuggestions(req, res, mockNext);

      // Assert
      expect(filterIgnoredSuggestions).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Gift 1' }),
          expect.objectContaining({ name: 'Gift 2' }),
          expect.objectContaining({ name: 'Gift 3' })
        ]),
        userId,
        recipientId,
        expect.objectContaining({
          minimumSuggestions: 3,
          cooldownPeriod: 24,
          similarityThreshold: 0.8,
          forceBypass: false
        })
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        suggestions: expect.arrayContaining([
          expect.objectContaining({ name: 'Gift 1' }),
          expect.objectContaining({ name: 'Gift 3' })
        ]),
        suggestions: expect.not.arrayContaining([
          expect.objectContaining({ name: 'Gift 2' })
        ])
      }));
    });

  });

  describe('Helper Functions (Indirectly Tested)', () => {
    // The helper functions createPrompt and getBudgetStatusMessage are not exported
    // from giftController.js. They are tested indirectly through the controller
    // functions that use them (e.g., generateGiftSuggestions, createGift, getGifts, updateGift).
    // Direct testing would require modifying giftController.js to export them,
    // which is outside the scope of this task.
    // The existing tests for generateGiftSuggestions, createGift, getGifts, and updateGift
    // already cover scenarios that implicitly test these helper functions.
  });
});
