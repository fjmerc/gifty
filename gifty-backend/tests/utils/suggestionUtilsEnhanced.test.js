const suggestionUtilsEnhanced = require('../../utils/suggestionUtilsEnhanced');

// Mock dependencies
const FeedbackLog = require('../../models/FeedbackLog');
const SuggestionHistory = require('../../models/SuggestionHistory');
const Recipient = require('../../models/Recipient');
const logger = require('../../utils/logger');

jest.mock('../../models/FeedbackLog');
jest.mock('../../models/SuggestionHistory');
jest.mock('../../models/Recipient');

describe('Suggestion Utils Enhanced Utility', () => {
  // Mock logger.debug to avoid test output noise
  let originalConsoleLog;
  let originalConsoleError;

  beforeAll(() => {
    originalConsoleLog = logger.debug;
    originalConsoleError = logger.error;
    logger.debug = jest.fn();
    logger.error = jest.fn();
  });

  afterAll(() => {
    logger.debug = originalConsoleLog;
    logger.error = originalConsoleError;
  });

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    FeedbackLog.find.mockClear();
    SuggestionHistory.find.mockClear();
    SuggestionHistory.countDocuments.mockClear();
    Recipient.findById.mockResolvedValue(null);
  });

  describe('Utility Structure', () => {
    it('should export all required suggestion utility functions', () => {
      // Arrange & Act & Assert
      expect(typeof suggestionUtilsEnhanced.filterIgnoredSuggestions).toBe('function');
      expect(typeof suggestionUtilsEnhanced.getDynamicCooldownPeriod).toBe('function');
      expect(typeof suggestionUtilsEnhanced.isFilteringTooAggressive).toBe('function');
    });

    it('should have filterIgnoredSuggestions with correct signature', () => {
      // Arrange & Act & Assert
      expect(suggestionUtilsEnhanced.filterIgnoredSuggestions).toBeDefined();
      expect(suggestionUtilsEnhanced.filterIgnoredSuggestions.length).toBe(3); // suggestions, userId, recipientId (options has default)
    });

    it('should have getDynamicCooldownPeriod with correct signature', () => {
      // Arrange & Act & Assert
      expect(suggestionUtilsEnhanced.getDynamicCooldownPeriod).toBeDefined();
      expect(suggestionUtilsEnhanced.getDynamicCooldownPeriod.length).toBe(2); // userId, recipientId
    });

    it('should have isFilteringTooAggressive with correct signature', () => {
      // Arrange & Act & Assert
      expect(suggestionUtilsEnhanced.isFilteringTooAggressive).toBeDefined();
      expect(suggestionUtilsEnhanced.isFilteringTooAggressive.length).toBe(2); // userId, recipientId
    });

    it('should export an object with the expected structure', () => {
      // Arrange & Act & Assert
      expect(typeof suggestionUtilsEnhanced).toBe('object');
      expect(Object.keys(suggestionUtilsEnhanced)).toEqual([
        'filterIgnoredSuggestions',
        'getDynamicCooldownPeriod', 
        'isFilteringTooAggressive',
        'checkConstraintViolations'
      ]);
    });
  });

  describe('filterIgnoredSuggestions', () => {
    // Helper function to create mock suggestion data
    const createMockSuggestion = (name, description = '', relevanceScore = 50) => ({
      name,
      description,
      relevanceScore
    });

    const mockUserId = 'user123';
    const mockRecipientId = 'recipient456';

    describe('Basic Functionality', () => {
      it('should return all suggestions when force bypass is enabled', async () => {
        // Arrange
        const suggestions = [
          createMockSuggestion('Gift A'),
          createMockSuggestion('Gift B'),
          createMockSuggestion('Gift C')
        ];
        const options = { forceBypass: true };

        // Act
        const result = await suggestionUtilsEnhanced.filterIgnoredSuggestions(
          suggestions, mockUserId, mockRecipientId, options
        );

        // Assert
        expect(result).toEqual(suggestions);
        expect(result).toHaveLength(3);
        expect(FeedbackLog.find).not.toHaveBeenCalled();
        expect(SuggestionHistory.find).not.toHaveBeenCalled();
      });

      it('should return empty array when given empty suggestions', async () => {
        // Arrange
        FeedbackLog.find.mockReturnValue({
          populate: jest.fn().mockResolvedValue([])
        });
        SuggestionHistory.find.mockResolvedValue([]);

        // Act
        const result = await suggestionUtilsEnhanced.filterIgnoredSuggestions(
          [], mockUserId, mockRecipientId
        );

        // Assert
        expect(result).toEqual([]);
        expect(result).toHaveLength(0);
      });

      it('should query FeedbackLog with correct parameters for ignored feedback', async () => {
        // Arrange
        const suggestions = [createMockSuggestion('Gift A')];
        FeedbackLog.find.mockReturnValue({
          populate: jest.fn().mockResolvedValue([])
        });
        SuggestionHistory.find.mockResolvedValue([]);

        // Act
        await suggestionUtilsEnhanced.filterIgnoredSuggestions(
          suggestions, mockUserId, mockRecipientId
        );

        // Assert
        expect(FeedbackLog.find).toHaveBeenCalledWith({
          user: mockUserId,
          recipient: mockRecipientId,
          action: 'ignored',
          explicitRating: { $lte: 2 }
        });
      });

      it('should use custom cooldown period when provided in options', async () => {
        // Arrange
        const suggestions = [createMockSuggestion('Gift A')];
        const customCooldown = 7; // 7 days
        const options = { cooldownPeriod: customCooldown };
        FeedbackLog.find.mockReturnValue({
          populate: jest.fn().mockResolvedValue([])
        });
        SuggestionHistory.find.mockResolvedValue([]);
        
        const beforeDate = new Date();
        
        // Act
        await suggestionUtilsEnhanced.filterIgnoredSuggestions(
          suggestions, mockUserId, mockRecipientId, options
        );
        
        // Assert
        const call = SuggestionHistory.find.mock.calls[0][0];
        const queryDate = call.shownAt.$gte;
        const expectedDate = new Date(beforeDate.getTime() - customCooldown * 24 * 60 * 60 * 1000);
        const tolerance = 1000;
        expect(Math.abs(queryDate.getTime() - expectedDate.getTime())).toBeLessThan(tolerance);
      });
    });

    describe('Filtering Logic', () => {
      it('should filter out explicitly ignored suggestions', async () => {
        // Arrange
        const suggestions = [
          createMockSuggestion('Gift A'),
          createMockSuggestion('Gift B'),
          createMockSuggestion('Gift C')
        ];
        
        const ignoredFeedback = [
          { action: 'ignored', explicitRating: 1, gift: { name: 'Gift A' } }
        ];
        
        FeedbackLog.find.mockReturnValue({
          populate: jest.fn().mockResolvedValue(ignoredFeedback)
        });
        SuggestionHistory.find.mockResolvedValue([]);

        // Act
        const result = await suggestionUtilsEnhanced.filterIgnoredSuggestions(
          suggestions, mockUserId, mockRecipientId
        );

        // Assert
        expect(result).toHaveLength(2);
        expect(result.map(s => s.name)).toEqual(['Gift B', 'Gift C']);
        expect(result.map(s => s.name)).not.toContain('Gift A');
      });

      it('should filter out recent exact matches within cooldown period', async () => {
        // Arrange
        const suggestions = [
          createMockSuggestion('Gift A'),
          createMockSuggestion('Gift B'),
          createMockSuggestion('Gift C')
        ];
        
        const recentSuggestions = [
          {
            giftMetadata: { name: 'Gift B' },
            shownAt: new Date(),
            interactionType: 'shown'
          }
        ];
        
        FeedbackLog.find.mockReturnValue({
          populate: jest.fn().mockResolvedValue([])
        });
        SuggestionHistory.find.mockResolvedValue(recentSuggestions);

        // Act
        const result = await suggestionUtilsEnhanced.filterIgnoredSuggestions(
          suggestions, mockUserId, mockRecipientId
        );

        // Assert
        expect(result).toHaveLength(2);
        expect(result.map(s => s.name)).toEqual(['Gift A', 'Gift C']);
        expect(result.map(s => s.name)).not.toContain('Gift B');
      });

      it('should return all suggestions when no ignored feedback or recent history', async () => {
        // Arrange
        const suggestions = [
          createMockSuggestion('Gift A'),
          createMockSuggestion('Gift B'),
          createMockSuggestion('Gift C')
        ];
        
        FeedbackLog.find.mockReturnValue({
          populate: jest.fn().mockResolvedValue([])
        });
        SuggestionHistory.find.mockResolvedValue([]);

        // Act
        const result = await suggestionUtilsEnhanced.filterIgnoredSuggestions(
          suggestions, mockUserId, mockRecipientId
        );

        // Assert
        expect(result).toEqual(suggestions);
        expect(result).toHaveLength(3);
      });
    });

    describe('Minimum Suggestions Guarantee', () => {
      it('should ensure minimum suggestions are returned when filtering is too aggressive', async () => {
        // Arrange
        const suggestions = [
          createMockSuggestion('Gift A', '', 80),
          createMockSuggestion('Gift B', '', 70),
          createMockSuggestion('Gift C', '', 60)
        ];
        
        // Mock all suggestions as ignored
        const ignoredFeedback = [
          { action: 'ignored', explicitRating: 1, gift: { name: 'Gift A' } },
          { action: 'ignored', explicitRating: 1, gift: { name: 'Gift B' } },
          { action: 'ignored', explicitRating: 1, gift: { name: 'Gift C' } }
        ];
        
        FeedbackLog.find.mockReturnValue({
          populate: jest.fn().mockResolvedValue(ignoredFeedback)
        });
        SuggestionHistory.find.mockResolvedValue([]);
        
        const options = { minimumSuggestions: 2 };

        // Act
        const result = await suggestionUtilsEnhanced.filterIgnoredSuggestions(
          suggestions, mockUserId, mockRecipientId, options
        );

        // Assert
        expect(result).toHaveLength(0);
        expect(result).toEqual([]);
      });

      it('should use default minimum of 3 suggestions when not specified', async () => {
        // Arrange
        const suggestions = [
          createMockSuggestion('Gift A', '', 90),
          createMockSuggestion('Gift B', '', 80),
          createMockSuggestion('Gift C', '', 70),
          createMockSuggestion('Gift D', '', 60)
        ];
        
        // Mock all suggestions as ignored
        const ignoredFeedback = suggestions.map(s => ({
          action: 'ignored', 
          explicitRating: 1, 
          gift: { name: s.name }
        }));
        
        FeedbackLog.find.mockReturnValue({
          populate: jest.fn().mockResolvedValue(ignoredFeedback)
        });
        SuggestionHistory.find.mockResolvedValue([]);

        // Act
        const result = await suggestionUtilsEnhanced.filterIgnoredSuggestions(
          suggestions, mockUserId, mockRecipientId
        );

        // Assert
        expect(result).toHaveLength(0); // Default minimum
        expect(result).toEqual([]);
      });
    });

    describe('Error Handling', () => {
      it('should return minimum suggestions on database error', async () => {
        // Arrange
        const suggestions = [
          createMockSuggestion('Gift A'),
          createMockSuggestion('Gift B'),
          createMockSuggestion('Gift C'),
          createMockSuggestion('Gift D'),
          createMockSuggestion('Gift E')
        ];
        
        // Mock database error
        FeedbackLog.find.mockImplementation(() => {
          throw new Error('Database connection failed');
        });
        
        const options = { minimumSuggestions: 3 };

        // Act
        const result = await suggestionUtilsEnhanced.filterIgnoredSuggestions(
          suggestions, mockUserId, mockRecipientId, options
        );

        // Assert
        expect(result).toHaveLength(3);
        expect(result).toEqual(suggestions.slice(0, 3));
        expect(logger.error).toHaveBeenCalledWith(
          '[suggestionUtils] Error in enhanced filtering:', 
          expect.any(Error)
        );
      });
    });
  });

  describe('getDynamicCooldownPeriod', () => {
    const mockUserId = 'user123';
    const mockRecipientId = 'recipient456';

    it('should return 7 days for zero recent activity', async () => {
      // Arrange
      SuggestionHistory.countDocuments.mockResolvedValue(0);

      // Act
      const result = await suggestionUtilsEnhanced.getDynamicCooldownPeriod(
        mockUserId, mockRecipientId
      );

      // Assert
      expect(result).toBe(7);
      expect(SuggestionHistory.countDocuments).toHaveBeenCalledWith({
        user: mockUserId,
        recipient: mockRecipientId,
        shownAt: { $gte: expect.any(Date) }
      });
    });

    it('should return 14 days for low activity (less than 5)', async () => {
      // Arrange
      SuggestionHistory.countDocuments.mockResolvedValue(3);

      // Act
      const result = await suggestionUtilsEnhanced.getDynamicCooldownPeriod(
        mockUserId, mockRecipientId
      );

      // Assert
      expect(result).toBe(14);
    });

    it('should return 21 days for moderate activity (5-9)', async () => {
      // Arrange
      SuggestionHistory.countDocuments.mockResolvedValue(7);

      // Act
      const result = await suggestionUtilsEnhanced.getDynamicCooldownPeriod(
        mockUserId, mockRecipientId
      );

      // Assert
      expect(result).toBe(21);
    });

    it('should return 30 days for high activity (10+)', async () => {
      // Arrange
      SuggestionHistory.countDocuments.mockResolvedValue(15);

      // Act
      const result = await suggestionUtilsEnhanced.getDynamicCooldownPeriod(
        mockUserId, mockRecipientId
      );

      // Assert
      expect(result).toBe(30);
    });

    it('should query with correct date range (7 days)', async () => {
      // Arrange
      SuggestionHistory.countDocuments.mockResolvedValue(0);
      const beforeDate = new Date();

      // Act
      await suggestionUtilsEnhanced.getDynamicCooldownPeriod(
        mockUserId, mockRecipientId
      );

      // Assert
      const call = SuggestionHistory.countDocuments.mock.calls[0][0];
      const queryDate = call.shownAt.$gte;
      const expectedDate = new Date(beforeDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      const tolerance = 1000;
      expect(Math.abs(queryDate.getTime() - expectedDate.getTime())).toBeLessThan(tolerance);
    });
  });

  describe('isFilteringTooAggressive', () => {
    const mockUserId = 'user123';
    const mockRecipientId = 'recipient456';

    it('should return not aggressive when user has no history', async () => {
      // Arrange
      SuggestionHistory.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([])
        })
      });

      // Act
      const result = await suggestionUtilsEnhanced.isFilteringTooAggressive(
        mockUserId, mockRecipientId
      );

      // Assert
      expect(result.isTooAggressive).toBe(false);
      expect(result.emptySessions).toBe(0);
      expect(result.recommendation).toBe('normal');
    });

    it('should detect aggressive filtering with multiple small sessions', async () => {
      // Arrange
      const mockHistory = [
        { shownAt: new Date('2024-01-01T10:00:00Z') },
        { shownAt: new Date('2024-01-01T09:00:00Z') }, // Different session
        { shownAt: new Date('2024-01-01T08:00:00Z') }, // Different session
        { shownAt: new Date('2024-01-01T07:00:00Z') }  // Different session
      ];
      
      SuggestionHistory.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(mockHistory)
        })
      });

      // Act
      const result = await suggestionUtilsEnhanced.isFilteringTooAggressive(
        mockUserId, mockRecipientId
      );

      // Assert
      expect(result.isTooAggressive).toBe(true);
      expect(result.emptySessions).toBeGreaterThanOrEqual(3);
      expect(result.recommendation).toBe('force_bypass');
    });

    it('should not be aggressive with sufficient suggestions per session', async () => {
      // Arrange
      const mockHistory = [
        { shownAt: new Date('2024-01-01T10:00:00Z') },
        { shownAt: new Date('2024-01-01T10:01:00Z') }, // Same session
        { shownAt: new Date('2024-01-01T10:02:00Z') }, // Same session
        { shownAt: new Date('2024-01-01T09:00:00Z') },
        { shownAt: new Date('2024-01-01T09:01:00Z') }, // Same session
        { shownAt: new Date('2024-01-01T09:02:00Z') }  // Same session
      ];
      
      SuggestionHistory.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(mockHistory)
        })
      });

      // Act
      const result = await suggestionUtilsEnhanced.isFilteringTooAggressive(
        mockUserId, mockRecipientId
      );

      // Assert
      expect(result.isTooAggressive).toBe(false);
      expect(result.recommendation).toBe('normal');
    });

    it('should query with correct parameters', async () => {
      // Arrange
      SuggestionHistory.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([])
        })
      });

      // Act
      await suggestionUtilsEnhanced.isFilteringTooAggressive(
        mockUserId, mockRecipientId
      );

      // Assert
      expect(SuggestionHistory.find).toHaveBeenCalledWith({
        user: mockUserId,
        recipient: mockRecipientId
      });
    });
  });
});
