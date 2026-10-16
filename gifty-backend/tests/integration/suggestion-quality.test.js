const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const { setupTestDB, clearDatabase, teardownTestDB } = require('../utils/testSetup');
const { createMockUser, generateTestToken } = require('../utils/mockUtils');

// Import routes and middleware needed for testing
const giftRoutes = require('../../routes/giftRoutes');
const authMiddleware = require('../../middleware/authMiddleware');

// Mock all external dependencies
jest.mock('../../models/User');
jest.mock('../../models/Recipient');
jest.mock('../../models/Event');
jest.mock('../../models/FeedbackLog');
jest.mock('../../models/GiftLibrary');
jest.mock('../../models/Gift');
jest.mock('../../services/aiService');
jest.mock('../../services/enhancedAiService');
jest.mock('../../services/giftDiscoveryService');
jest.mock('../../services/hybridSuggestionService');
jest.mock('../../utils/suggestionUtilsEnhanced');
// The models are mocked here; the price guide is tested on a real DB in
// tests/controllers/suggestionBudget.test.js
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
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Mock Redis
jest.mock('../../config/redis', () => {
  const mockRedisClient = {
    get: jest.fn(),
    setex: jest.fn(),
    quit: jest.fn().mockResolvedValue('OK')
  };
  
  return {
    redisClient: mockRedisClient,
    publisherClient: mockRedisClient,
    subscriberClient: mockRedisClient,
    keyPrefixes: {
      suggestions: 'suggestions:'
    },
    ttl: {
      short: 60,
      medium: 300,
      long: 3600
    }
  };
});

// Mock Bull queue
jest.mock('../../queues', () => ({
  cleanupQueue: {
    add: jest.fn().mockResolvedValue({ id: 'test-job-id' }),
    getJobs: jest.fn().mockResolvedValue([])
  }
}));

// Import mocked modules
const User = require('../../models/User');
const Recipient = require('../../models/Recipient');
const Event = require('../../models/Event');
const FeedbackLog = require('../../models/FeedbackLog');
const GiftLibrary = require('../../models/GiftLibrary');
const Gift = require('../../models/Gift');
const { getAISuggestions } = require('../../services/aiService');
const { getEnhancedGiftSuggestions } = require('../../services/enhancedAiService');

describe('Suggestion Quality Integration Tests', () => {
  let app, user, authToken, recipient, event;
  const originalEnv = process.env;

  beforeAll(async () => {
    await setupTestDB();
    
    // Setup test environment
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'test_jwt_secret',
      NODE_ENV: 'test'
    };
    
    // Set up Express app for testing
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    
    // Add gift routes to the app
    app.use('/api/gifts', giftRoutes);
    
    // Set up error handler - must be after routes
    app.use((err, req, res, next) => {
      const statusCode = err.statusCode || 500;
      res.status(statusCode);
      res.json({ message: err.message });
    });
  });

  beforeEach(async () => {
    // No gifts saved or bought for the recipient yet
    Gift.find = jest.fn().mockReturnValue({ sort: () => ({ select: () => ({ lean: async () => [] }) }) });
    jest.clearAllMocks();
    await clearDatabase();
    
    // Create mock user data
    const userId = new mongoose.Types.ObjectId();
    const recipientId = new mongoose.Types.ObjectId();
    const eventId = new mongoose.Types.ObjectId();
    
    user = {
      _id: userId,
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      username: 'testuser'
    };
    
    recipient = {
      _id: recipientId,
      user: userId,
      firstName: 'John',
      lastName: 'Doe',
      relation: 'Friend',
      birthdate: new Date('1990-01-01'),
      interests: ['technology', 'books'],
      giftStyle: 'practical',
      tags: []
    };
    
    event = {
      _id: eventId,
      user: userId,
      name: 'Birthday',
      date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      recipient: recipientId
    };
    
    authToken = generateTestToken(userId, 'access', process.env.JWT_SECRET);
    
    // Setup common mocks
    // Awaited directly (auth) or through .lean() (the suggestion controller)
    User.findById = jest.fn().mockImplementation(() => ({
      select: jest.fn(() => Object.assign(Promise.resolve(user), { lean: async () => user }))
    }));
    
    // The controller loads both through findOwned → findOne({ _id, user })
    Recipient.findOne = jest.fn().mockImplementation(() => ({
      populate: jest.fn().mockResolvedValue(recipient)
    }));
    
    Event.findOne = jest.fn().mockResolvedValue(event);
  });

  afterAll(async () => {
    await teardownTestDB();
    process.env = originalEnv;
  });

  describe('API Endpoint Quality Tests', () => {
    test('should generate valid suggestions via API', async () => {
      // Mock gift creation
      const mockGifts = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Test Gift 1',
          description: 'A great tech gift',
          category: 'Technology',
          price: 50,
          budgetStatus: 'no_budget',
          save: jest.fn().mockResolvedValue(true),
          toObject: jest.fn().mockReturnValue({
            name: 'Test Gift 1',
            description: 'A great tech gift',
            category: 'Technology',
            price: 50,
            budgetStatus: 'no_budget'
          })
        }
      ];
      
      // Mock AI service response
      getAISuggestions.mockResolvedValue([
        {
          name: 'Test Gift 1',
          description: 'A great tech gift',
          category: 'Technology',
          estimatedPrice: 50,
          tags: ['tech'],
          whereToBuy: ['Amazon']
        }
      ]);
      
      // Mock Gift model
      Gift.mockImplementation((data) => ({
        ...data,
        _id: new mongoose.Types.ObjectId(),
        save: jest.fn().mockResolvedValue({
          ...data,
          _id: new mongoose.Types.ObjectId(),
          budgetStatus: 'no_budget'
        }),
        toObject: jest.fn().mockReturnValue(data)
      }));
      
      Gift.populate = jest.fn().mockResolvedValue(mockGifts);
      
      // Mock utility functions
      const mockSuggestionUtils = require('../../utils/suggestionUtilsEnhanced');
      mockSuggestionUtils.filterIgnoredSuggestions.mockImplementation((suggestions) => suggestions);
      mockSuggestionUtils.isFilteringTooAggressive.mockResolvedValue({ isTooAggressive: false });
      mockSuggestionUtils.getDynamicCooldownPeriod.mockResolvedValue(7);
      
      // Mock monitoring service
      
      // Make API request
      const response = await request(app)
        .post('/api/gifts/suggestions')
        .set('Cookie', [`access_token=${authToken}`])
        .send({
          recipientId: recipient._id,
          eventId: event._id
        })
        .expect(201);
      
      expect(response.body).toHaveProperty('suggestions');
      expect(Array.isArray(response.body.suggestions)).toBe(true);
      expect(response.body.suggestions.length).toBeGreaterThan(0);
      
      const suggestion = response.body.suggestions[0];
      expect(suggestion).toHaveProperty('name');
      expect(suggestion).toHaveProperty('description');
      expect(suggestion).toHaveProperty('category');
      expect(suggestion).not.toHaveProperty('budgetInfo');
    });

    test('should handle enhanced mode selection', async () => {
      // Mock enhanced suggestions
      getEnhancedGiftSuggestions.mockResolvedValue([
        {
          name: 'Personalized Tech Gift',
          description: 'AI-enhanced suggestion based on history',
          category: 'Technology',
          estimatedPrice: 75,
          tags: ['tech', 'personalized'],
          whereToBuy: ['Best Buy']
        }
      ]);
      
      // Mock feedback count for enhanced mode
      FeedbackLog.countDocuments = jest.fn().mockResolvedValue(15);
      GiftLibrary.countDocuments = jest.fn().mockResolvedValue(50);
      
      // Mock Gift creation
      Gift.mockImplementation((data) => ({
        ...data,
        _id: new mongoose.Types.ObjectId(),
        save: jest.fn().mockResolvedValue({
          ...data,
          _id: new mongoose.Types.ObjectId(),
          budgetStatus: 'no_budget'
        }),
        toObject: jest.fn().mockReturnValue(data)
      }));
      
      Gift.populate = jest.fn().mockResolvedValue([{
        name: 'Personalized Tech Gift',
        description: 'AI-enhanced suggestion based on history',
        category: 'Technology',
        budgetStatus: 'no_budget',
        toObject: () => ({
          name: 'Personalized Tech Gift',
          description: 'AI-enhanced suggestion based on history',
          category: 'Technology',
          budgetStatus: 'no_budget'
        })
      }]);
      
      // Mock utility functions
      const mockSuggestionUtils = require('../../utils/suggestionUtilsEnhanced');
      mockSuggestionUtils.filterIgnoredSuggestions.mockImplementation((suggestions) => suggestions);
      mockSuggestionUtils.isFilteringTooAggressive.mockResolvedValue({ isTooAggressive: false });
      mockSuggestionUtils.getDynamicCooldownPeriod.mockResolvedValue(7);
      
      // Mock monitoring service
      
      const response = await request(app)
        .post('/api/gifts/suggestions')
        .set('Cookie', [`access_token=${authToken}`])
        .send({
          recipientId: recipient._id,
          eventId: event._id,
          mode: 'auto' // Should auto-select enhanced mode
        })
        .expect(201);
      
      expect(response.body.suggestions).toHaveLength(1);
      expect(response.body.suggestions[0].name).toBe('Personalized Tech Gift');
    });
  });

  describe('Performance Tests', () => {
    test('should handle concurrent suggestion requests', async () => {
      // Mock AI service
      getAISuggestions.mockResolvedValue([
        {
          name: 'Concurrent Test Gift',
          description: 'Test gift for concurrent requests',
          category: 'Technology',
          estimatedPrice: 40,
          tags: ['test'],
          whereToBuy: ['Store']
        }
      ]);
      
      // Mock Gift creation
      Gift.mockImplementation((data) => ({
        ...data,
        _id: new mongoose.Types.ObjectId(),
        save: jest.fn().mockResolvedValue({
          ...data,
          _id: new mongoose.Types.ObjectId(),
          budgetStatus: 'no_budget'
        }),
        toObject: jest.fn().mockReturnValue(data)
      }));
      
      Gift.populate = jest.fn().mockResolvedValue([{
        name: 'Concurrent Test Gift',
        budgetStatus: 'no_budget',
        toObject: () => ({ name: 'Concurrent Test Gift', budgetStatus: 'no_budget' })
      }]);
      
      // Mock utility functions
      const mockSuggestionUtils = require('../../utils/suggestionUtilsEnhanced');
      mockSuggestionUtils.filterIgnoredSuggestions.mockImplementation((suggestions) => suggestions);
      mockSuggestionUtils.isFilteringTooAggressive.mockResolvedValue({ isTooAggressive: false });
      mockSuggestionUtils.getDynamicCooldownPeriod.mockResolvedValue(7);
      
      
      const promises = [];
      const concurrentRequests = 3;
      
      for (let i = 0; i < concurrentRequests; i++) {
        const promise = request(app)
          .post('/api/gifts/suggestions')
          .set('Cookie', [`access_token=${authToken}`])
          .send({
            recipientId: recipient._id,
            eventId: event._id
          });
        promises.push(promise);
      }
      
      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.suggestions).toBeDefined();
        expect(Array.isArray(response.body.suggestions)).toBe(true);
      });
    });
  });

});