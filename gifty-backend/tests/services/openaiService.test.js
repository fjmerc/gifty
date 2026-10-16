// tests/services/openaiService.test.js
const openaiService = require('../../services/openaiService');
const aiService = require('../../services/aiService');
const logger = require('../../utils/logger');

// Mock dependencies
jest.mock('../../services/aiService');

// Mock logger.error
const mockConsoleError = jest.fn();
const originalConsoleError = logger.error;

beforeAll(() => {
  logger.error = mockConsoleError;
});

afterAll(() => {
  logger.error = originalConsoleError;
});

// Mock data factory functions
const createMockProfile = (overrides = {}) => ({
  age: 25,
  gender: 'female',
  interests: ['reading', 'cooking', 'travel'],
  relationship: 'friend',
  occasion: 'birthday',
  budget: 50,
  avoid: ['jewelry'],
  ...overrides
});

const createMockOptions = (overrides = {}) => ({
  avoid: ['electronics'],
  preferCategories: ['books', 'experiences'],
  targetCount: 5,
  ...overrides
});

const createMockAISuggestions = (count = 3) => Array.from({ length: count }, (_, i) => ({
  name: `Gift ${i + 1}`,
  description: `Description for gift ${i + 1}`,
  category: 'Test Category',
  tags: ['tag1', 'tag2'],
  estimatedPrice: 25 + i * 10,
  priceRange: { min: 20 + i * 10, max: 30 + i * 10 },
  whereToBuy: ['Store 1', 'Store 2']
}));

describe('OpenAI Service', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockConsoleError.mockClear();
  });

  describe('Function Structure and Exports', () => {
    it('should export generateGiftSuggestions function', () => {
      expect(typeof openaiService.generateGiftSuggestions).toBe('function');
    });

    it('should be an async function', () => {
      expect(openaiService.generateGiftSuggestions.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('generateGiftSuggestions', () => {
    it('should successfully generate gift suggestions with complete profile', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const mockOptions = createMockOptions();
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      const result = await openaiService.generateGiftSuggestions(mockProfile, mockOptions);
      
      // Assert
      expect(aiService.getAISuggestions).toHaveBeenCalledTimes(1);
      expect(aiService.getAISuggestions).toHaveBeenCalledWith(
        expect.any(String), // prompt
        mockProfile.interests, // recipientTags
        {} // provider/model overrides (none)
      );
      expect(result).toEqual(mockSuggestions);
    });

    it('should handle profile with empty interests array', async () => {
      // Arrange
      const mockProfile = createMockProfile({ interests: [] });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      const result = await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      expect(aiService.getAISuggestions).toHaveBeenCalledWith(
        expect.any(String),
        [], // empty recipientTags
        {}
      );
      expect(result).toEqual(mockSuggestions);
    });

    it('should handle profile with undefined interests', async () => {
      // Arrange
      const mockProfile = createMockProfile({ interests: undefined });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      const result = await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      expect(aiService.getAISuggestions).toHaveBeenCalledWith(
        expect.any(String),
        [], // empty recipientTags due to || []
        {}
      );
      expect(result).toEqual(mockSuggestions);
    });

    it('should handle aiService success', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const mockSuggestions = createMockAISuggestions(2);
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      const result = await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      expect(result).toHaveLength(2);
      expect(result).toEqual(mockSuggestions);
    });

    it('should handle aiService failure and log error', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const mockError = new Error('AI service unavailable');
      
      aiService.getAISuggestions.mockRejectedValue(mockError);
      
      // Act & Assert
      await expect(openaiService.generateGiftSuggestions(mockProfile)).rejects.toThrow('Failed to generate gift suggestions');
      
      expect(mockConsoleError).toHaveBeenCalledTimes(1);
      expect(mockConsoleError).toHaveBeenCalledWith('Error generating gift suggestions:', mockError);
    });

    it('should handle aiService failure with different error types', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const mockError = new Error('Network timeout');
      
      aiService.getAISuggestions.mockRejectedValue(mockError);
      
      // Act & Assert
      await expect(openaiService.generateGiftSuggestions(mockProfile)).rejects.toThrow('Failed to generate gift suggestions');
      
      expect(mockConsoleError).toHaveBeenCalledWith('Error generating gift suggestions:', mockError);
    });

    it('should pass correct prompt and tags to aiService', async () => {
      // Arrange
      const mockProfile = createMockProfile({
        age: 30,
        gender: 'male',
        interests: ['gaming', 'technology'],
        relationship: 'brother',
        occasion: 'Christmas',
        budget: 100
      });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      const [prompt, recipientTags] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).toContain('30 year old');
      expect(prompt).toContain('male');
      expect(prompt).toContain('brother');
      expect(prompt).toContain('gaming, technology');
      expect(prompt).toContain('Christmas');
      expect(prompt).toContain('$100');
      expect(recipientTags).toEqual(['gaming', 'technology']);
    });
  });

  describe('createPromptFromProfile', () => {
    // Test the internal helper function by testing the generated prompts
    it('should generate correct prompt with complete profile', async () => {
      // Arrange
      const mockProfile = createMockProfile({
        age: 25,
        gender: 'female',
        interests: ['reading', 'cooking'],
        relationship: 'friend',
        occasion: 'birthday',
        budget: 50
      });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert - Check the prompt content
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).toBe('I need gift suggestions for a 25 year old female who is my friend and is interested in reading, cooking. The occasion is birthday. My budget is around $50');
    });

    it('should generate prompt with minimal profile data', async () => {
      // Arrange
      const mockProfile = {
        interests: ['music']
      };
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).toBe('I need gift suggestions for a who is my friend and is interested in music');
    });

    it('should generate prompt without age when age is not provided', async () => {
      // Arrange
      const mockProfile = createMockProfile({ age: undefined });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).not.toContain('year old');
      expect(prompt).toContain('I need gift suggestions for a female who is my friend');
    });

    it('should generate prompt without gender when gender is not provided', async () => {
      // Arrange
      const mockProfile = createMockProfile({ gender: undefined });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).toContain('I need gift suggestions for a 25 year old who is my friend');
    });

    it('should use default relationship when not provided', async () => {
      // Arrange
      const mockProfile = createMockProfile({ relationship: undefined });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).toContain('who is my friend');
    });

    it('should handle empty interests array', async () => {
      // Arrange
      const mockProfile = createMockProfile({ interests: [] });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).not.toContain('and is interested in');
      expect(prompt).toContain('who is my friend. The occasion is birthday');
    });

    it('should handle undefined interests', async () => {
      // Arrange
      const mockProfile = createMockProfile({ interests: undefined });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).not.toContain('and is interested in');
    });

    it('should handle single interest', async () => {
      // Arrange
      const mockProfile = createMockProfile({ interests: ['painting'] });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).toContain('and is interested in painting');
    });

    it('should handle multiple interests with correct formatting', async () => {
      // Arrange
      const mockProfile = createMockProfile({ interests: ['reading', 'cooking', 'travel', 'photography'] });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).toContain('and is interested in reading, cooking, travel, photography');
    });

    it('should handle missing occasion', async () => {
      // Arrange
      const mockProfile = createMockProfile({ occasion: undefined });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).not.toContain('The occasion is');
      expect(prompt).toContain('My budget is around $50');
    });

    it('should handle missing budget', async () => {
      // Arrange
      const mockProfile = createMockProfile({ budget: undefined });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).not.toContain('My budget is around');
      expect(prompt).toContain('The occasion is birthday');
    });
  });

  describe('Options Parameter Handling', () => {
    it('should handle options.avoid array', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const mockOptions = createMockOptions({ avoid: ['jewelry', 'electronics'] });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile, mockOptions);
      
      // Assert
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).toContain('Please avoid suggesting: jewelry, electronics');
    });

    it('should handle options.preferCategories array', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const mockOptions = createMockOptions({ preferCategories: ['books', 'experiences', 'art'] });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile, mockOptions);
      
      // Assert
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).toContain("I'd prefer gifts in these categories: books, experiences, art");
    });

    it('should handle options.targetCount', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const mockOptions = createMockOptions({ targetCount: 8 });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile, mockOptions);
      
      // Assert
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).toContain('Please suggest exactly 8 gift ideas');
    });

    it('should handle all options together', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const mockOptions = createMockOptions({
        avoid: ['jewelry'],
        preferCategories: ['books'],
        targetCount: 3
      });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile, mockOptions);
      
      // Assert
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).toContain('Please avoid suggesting: jewelry');
      expect(prompt).toContain("I'd prefer gifts in these categories: books");
      expect(prompt).toContain('Please suggest exactly 3 gift ideas');
    });

    it('should handle empty options arrays', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const mockOptions = createMockOptions({
        avoid: [],
        preferCategories: [],
        targetCount: 0
      });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile, mockOptions);
      
      // Assert
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).not.toContain('Please avoid suggesting:');
      expect(prompt).not.toContain("I'd prefer gifts in these categories:");
      expect(prompt).not.toContain('Please suggest exactly');
    });

    it('should handle undefined options', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const mockOptions = createMockOptions({
        avoid: undefined,
        preferCategories: undefined,
        targetCount: undefined
      });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile, mockOptions);
      
      // Assert
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).not.toContain('Please avoid suggesting:');
      expect(prompt).not.toContain("I'd prefer gifts in these categories:");
      expect(prompt).not.toContain('Please suggest exactly');
    });

    it('should handle no options parameter', async () => {
      // Arrange
      const mockProfile = createMockProfile();
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act - No options parameter
      await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).not.toContain('Please avoid suggesting:');
      expect(prompt).not.toContain("I'd prefer gifts in these categories:");
      expect(prompt).not.toContain('Please suggest exactly');
    });
  });

  describe('Edge Cases and Boundaries', () => {
    it('should handle completely empty profile', async () => {
      // Arrange
      const mockProfile = {};
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      const [prompt, recipientTags] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).toBe('I need gift suggestions for a who is my friend');
      expect(recipientTags).toEqual([]);
    });

    it('should handle null profile values', async () => {
      // Arrange
      const mockProfile = createMockProfile({
        age: null,
        gender: null,
        interests: null,
        relationship: null,
        occasion: null,
        budget: null
      });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      const [prompt, recipientTags] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).toBe('I need gift suggestions for a who is my friend');
      expect(recipientTags).toEqual([]);
    });

    it('should handle zero budget', async () => {
      // Arrange
      const mockProfile = createMockProfile({ budget: 0 });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).not.toContain('My budget is around');
    });

    it('should handle very large interest arrays', async () => {
      // Arrange
      const largeInterests = Array.from({ length: 20 }, (_, i) => `interest${i + 1}`);
      const mockProfile = createMockProfile({ interests: largeInterests });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      const [prompt, recipientTags] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).toContain('and is interested in');
      expect(prompt).toContain('interest1, interest2');
      expect(recipientTags).toEqual(largeInterests);
    });

    it('should handle special characters in profile data', async () => {
      // Arrange
      const mockProfile = createMockProfile({
        interests: ['cooking & baking', 'rock & roll music', 'sci-fi & fantasy'],
        relationship: 'co-worker',
        occasion: 'work anniversary'
      });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).toContain('cooking & baking, rock & roll music, sci-fi & fantasy');
      expect(prompt).toContain('co-worker');
      expect(prompt).toContain('work anniversary');
    });

    it('should handle profile.avoid parameter (unused but destructured)', async () => {
      // Arrange - Test the avoid parameter from profile destructuring (even though it's not used)
      const mockProfile = createMockProfile({
        avoid: ['profile-avoid-item'] // This should be destructured but not used
      });
      const mockSuggestions = createMockAISuggestions();
      
      aiService.getAISuggestions.mockResolvedValue(mockSuggestions);
      
      // Act
      await openaiService.generateGiftSuggestions(mockProfile);
      
      // Assert - The profile.avoid should be destructured but not used in prompt
      const [prompt] = aiService.getAISuggestions.mock.calls[0];
      expect(prompt).not.toContain('profile-avoid-item');
      expect(prompt).toContain('who is my friend');
    });
  });
});
