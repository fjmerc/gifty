// tests/services/aiService.test.js
const mongoose = require('mongoose');
const axios = require('axios');
const aiService = require('../../services/aiService');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Mock all dependencies
jest.mock('axios');

// Mock data factory functions
const createMockOpenAIJsonResponse = (overrides = {}) => {
  const defaultSuggestions = [
    {
      name: 'Premium Hiking Daypack',
      description: 'A high-quality waterproof daypack perfect for a hiking enthusiast who enjoys outdoor adventures.',
      category: 'Outdoor Gear',
      tags: ['hiking', 'practical', 'outdoorsy', 'adventure', 'durable'],
      estimatedPrice: 85,
      priceRange: { min: 75, max: 95 },
      whereToBuy: ['REI', 'Amazon', 'Backcountry'],
      relationshipRelevance: 'Shows you understand their passion for hiking and outdoor activities.'
    },
    {
      name: 'Compact Indoor Herb Garden Kit',
      description: 'A space-efficient indoor herb garden that combines their love of cooking and gardening.',
      category: 'Home & Garden',
      tags: ['cooking', 'gardening', 'practical', 'creative', 'sustainable'],
      estimatedPrice: 45,
      priceRange: { min: 35, max: 55 },
      whereToBuy: ['Amazon', 'Home Depot', 'Etsy'],
      relationshipRelevance: 'Acknowledges their dual passions for cooking and gardening.'
    }
  ];

  const suggestions = overrides.suggestions || defaultSuggestions;

  return {
    data: {
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestions: suggestions
            })
          }
        }
      ]
    }
  };
};

const createMockOpenAITextResponse = (format = 'numbered', overrides = {}) => {
  let content = '';

  if (format === 'numbered') {
    content = `
1. Premium Hiking Daypack
Description: A high-quality waterproof daypack perfect for a hiking enthusiast who enjoys outdoor adventures.
Category: Outdoor Gear
Tags: hiking, practical, outdoorsy, adventure, durable
Estimated Price: $85 (Range: $75-$95)
Where to Buy: REI, Amazon, Backcountry
Relationship Relevance: Shows you understand their passion for hiking and outdoor activities.

2. Compact Indoor Herb Garden Kit
Description: A space-efficient indoor herb garden that combines their love of cooking and gardening.
Category: Home & Garden
Tags: cooking, gardening, practical, creative, sustainable
Estimated Price: $45 (Range: $35-$55)
Where to Buy: Amazon, Home Depot, Etsy
Relationship Relevance: Acknowledges their dual passions for cooking and gardening.
`;
  } else if (format === 'headers') {
    content = `
**Gift 1: Premium Hiking Daypack**
Description: A high-quality waterproof daypack perfect for a hiking enthusiast who enjoys outdoor adventures.
Category: Outdoor Gear
Tags: hiking, practical, outdoorsy, adventure, durable
Estimated Price: $85 (Range: $75-$95)
Where to Buy: REI, Amazon, Backcountry
Relationship Relevance: Shows you understand their passion for hiking and outdoor activities.

**Gift 2: Compact Indoor Herb Garden Kit**
Description: A space-efficient indoor herb garden that combines their love of cooking and gardening.
Category: Home & Garden
Tags: cooking, gardening, practical, creative, sustainable
Estimated Price: $45 (Range: $35-$55)
Where to Buy: Amazon, Home Depot, Etsy
Relationship Relevance: Acknowledges their dual passions for cooking and gardening.
`;
  } else if (format === 'compact') {
    content = `
Gift 1: Premium Hiking Daypack - A high-quality waterproof daypack perfect for a hiking enthusiast who enjoys outdoor adventures.
- Category: Outdoor Gear
- Tags: hiking, practical, outdoorsy, adventure, durable
- Price: $85 (Range: $75-$95)
- Where to Buy: REI, Amazon, Backcountry
- Relevance: Shows you understand their passion for hiking and outdoor activities.

Gift 2: Compact Indoor Herb Garden Kit - A space-efficient indoor herb garden that combines their love of cooking and gardening.
- Category: Home & Garden
- Tags: cooking, gardening, practical, creative, sustainable
- Price: $45 (Range: $35-$55)
- Where to Buy: Amazon, Home Depot, Etsy
- Relevance: Acknowledges their dual passions for cooking and gardening.
`;
  }

  if (overrides.content) {
    content = overrides.content;
  }

  return {
    data: {
      choices: [
        {
          message: {
            content: content
          }
        }
      ]
    }
  };
};

const createMockMalformedResponse = (type = 'empty') => {
  if (type === 'empty') {
    return {
      data: {
        choices: [
          {
            message: {
              content: ''
            }
          }
        ]
      }
    };
  } else if (type === 'invalid-json') {
    return {
      data: {
        choices: [
          {
            message: {
              content: '{ "suggestions": [{'
            }
          }
        ]
      }
    };
  } else if (type === 'partial') {
    return {
      data: {
        choices: [
          {
            message: {
              content: `
1. Premium Hiking Daypack
Description: A high-quality waterproof daypack perfect for a hiking enthusiast.

2. 
`
            }
          }
        ]
      }
    };
  } else if (type === 'missing-fields') {
    return {
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                suggestions: [
                  {
                    name: 'Premium Hiking Daypack'
                    // Missing other fields
                  }
                ]
              })
            }
          }
        ]
      }
    };
  } else {
    // Non-standard response
    return {
      data: {
        choices: [
          {
            message: {
              content: 'This is not in the expected format at all.'
            }
          }
        ]
      }
    };
  }
};

const createMockRecipientTags = () => {
  return ['outdoorsy', 'creative', 'tech-savvy', 'bookworm'];
};

// Set higher timeout for service tests
jest.setTimeout(30000);

describe('AI Service', () => {
  const originalEnv = process.env;
  const testApiKey = 'test-api-key';
  
  beforeAll(async () => {
    process.env.OPENAI_API_KEY = testApiKey;
    await setupTestDB();
  });

  afterEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await teardownTestDB();
    process.env = originalEnv; // Restore original environment
  });

  describe('getAISuggestions', () => {
    it('should successfully generate gift suggestions with JSON response', async () => {
      // Arrange
      const testPrompt = 'Generate gift suggestions for my friend who loves hiking and gardening';
      const recipientTags = createMockRecipientTags();
      
      // Mock OpenAI API response
      axios.post.mockResolvedValue(createMockOpenAIJsonResponse());
      
      // Act
      const result = await aiService.getAISuggestions(testPrompt, recipientTags);
      
      // Assert
      expect(axios.post).toHaveBeenCalledTimes(1);
      // Check that axios was called with the correct model and temperature
      expect(axios.post.mock.calls[0][1].model).toBe('gpt-4o');
      expect(axios.post.mock.calls[0][1].temperature).toBe(0.7);
      expect(axios.post.mock.calls[0][1].max_tokens).toBe(2000);
      
      // Check that the user message contains the test prompt
      const userMessage = axios.post.mock.calls[0][1].messages.find(msg => msg.role === 'user');
      expect(userMessage).toBeTruthy();
      expect(userMessage.content).toBe(testPrompt);
      
      // Verify system prompt contains recipient tags
      const systemPrompt = axios.post.mock.calls[0][1].messages.find(msg => msg.role === 'system');
      expect(systemPrompt).toBeTruthy();
      expect(systemPrompt.content).toContain(recipientTags[0]);
      
      // Verify suggestion structure
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      
      // Verify first suggestion properties
      expect(result[0]).toHaveProperty('name', 'Premium Hiking Daypack');
      expect(result[0]).toHaveProperty('description');
      expect(result[0]).toHaveProperty('category', 'Outdoor Gear');
      expect(result[0]).toHaveProperty('tags');
      expect(Array.isArray(result[0].tags)).toBe(true);
      expect(result[0]).toHaveProperty('estimatedPrice', 85);
      expect(result[0]).toHaveProperty('priceRange');
      expect(result[0].priceRange).toHaveProperty('min', 75);
      expect(result[0].priceRange).toHaveProperty('max', 95);
      expect(result[0]).toHaveProperty('whereToBuy');
      expect(Array.isArray(result[0].whereToBuy)).toBe(true);
      expect(result[0]).toHaveProperty('relationshipRelevance');
      expect(result[0]).toHaveProperty('relevanceScore');
      expect(typeof result[0].relevanceScore).toBe('number');
    });

    it('rejects a text (non-JSON) answer as unreadable', async () => {
      axios.post.mockResolvedValue(createMockOpenAITextResponse('numbered'));
      await expect(aiService.getAISuggestions('Generate gift suggestions for my friend who loves hiking', createMockRecipientTags()))
        .rejects.toMatchObject({ statusCode: 502, code: 'AI_BAD_OUTPUT' });
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('turns a provider failure into a typed 502', async () => {
      axios.post.mockRejectedValue(new Error('API rate limit exceeded'));
      await expect(aiService.getAISuggestions('Generate gift suggestions for my friend'))
        .rejects.toMatchObject({ statusCode: 502, code: 'AI_PROVIDER_FAILED' });
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('never answers a malformed reply with a placeholder gift', async () => {
      const testPrompt = 'Generate gift suggestions for my friend';
      for (const type of ['invalid-json', 'empty', 'non-standard']) {
        axios.post.mockResolvedValue(createMockMalformedResponse(type));
        await expect(aiService.getAISuggestions(testPrompt))
          .rejects.toMatchObject({ statusCode: 502, code: 'AI_BAD_OUTPUT' });
      }
    });
  });

  describe('parseSuggestions', () => {
    it('should successfully parse JSON response', () => {
      // Arrange - Create a direct JSON object string that matches what OpenAI would return
      const jsonString = JSON.stringify({
        suggestions: [
          {
            name: 'Smart Watch',
            description: 'A feature-rich smartwatch for fitness tracking and notifications',
            category: 'Electronics',
            tags: ['tech', 'fitness', 'gadget', 'wearable'],
            estimatedPrice: 199,
            priceRange: { min: 149, max: 249 },
            whereToBuy: ['Amazon', 'Best Buy', 'Apple Store'],
            relationshipRelevance: 'Perfect for their active lifestyle and tech enthusiasm'
          }
        ]
      });
      
      // Act
      const result = aiService.parseSuggestions(jsonString);
      
      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0]).toHaveProperty('name', 'Smart Watch');
      expect(result[0]).toHaveProperty('description');
      expect(result[0]).toHaveProperty('category', 'Electronics');
      expect(result[0]).toHaveProperty('tags');
      expect(result[0].tags).toContain('tech');
      expect(result[0]).toHaveProperty('estimatedPrice', 199);
      expect(result[0]).toHaveProperty('priceRange');
      expect(result[0].priceRange).toHaveProperty('min', 149);
      expect(result[0].priceRange).toHaveProperty('max', 249);
    });

    it('should extract JSON from string with surrounding text', () => {
      // Arrange - Create a mixed string with JSON inside it
      const mixedResponse = `
Here are some gift suggestions:

{
  "suggestions": [
    {
      "name": "Smart Watch",
      "description": "A feature-rich smartwatch for fitness tracking and notifications",
      "category": "Electronics",
      "tags": ["tech", "fitness", "gadget", "wearable"],
      "estimatedPrice": 199,
      "priceRange": { "min": 149, "max": 249 },
      "whereToBuy": ["Amazon", "Best Buy", "Apple Store"],
      "relationshipRelevance": "Perfect for their active lifestyle and tech enthusiasm"
    }
  ]
}
`;
      
      // Act
      const result = aiService.parseSuggestions(mixedResponse);
      
      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0]).toHaveProperty('name', 'Smart Watch');
    });

    it('throws AI_BAD_OUTPUT for empty, truncated or prose answers', () => {
      for (const raw of ['', '{ "suggestions": [{', 'This is not a valid format for suggestions', '{"gifts": []}']) {
        expect(() => aiService.parseSuggestions(raw)).toThrow(expect.objectContaining({ code: 'AI_BAD_OUTPUT', statusCode: 502 }));
      }
    });

    it('skips a suggestion without a name and keeps the rest', () => {
      const raw = JSON.stringify({ suggestions: [
        { description: 'nameless', estimatedPrice: 20 },
        { name: 'Book', description: 'A novel', estimatedPrice: 15 }
      ] });
      expect(aiService.parseSuggestions(raw).map((s) => s.name)).toEqual(['Book']);
    });

    it('returns an empty list when the model sent none', () => {
      expect(aiService.parseSuggestions('{"suggestions": []}')).toEqual([]);
    });

    it('should correctly calculate relevance scores based on recipient tags', () => {
      // Arrange - JSON with matching tags
      const jsonWithTags = JSON.stringify({
        suggestions: [
          {
            name: 'E-reader',
            description: 'A lightweight e-reader perfect for avid readers who love books and reading on the go',
            category: 'Electronics',
            tags: ['reading', 'books', 'portable', 'tech'],
            estimatedPrice: 129,
            priceRange: { min: 99, max: 159 },
            whereToBuy: ['Amazon', 'Best Buy', 'Barnes & Noble'],
            relationshipRelevance: 'Perfect for their bookworm nature'
          }
        ]
      });
      
      const recipientTags = ['bookworm', 'tech-savvy', 'traveler'];
      
      // Act
      const result = aiService.parseSuggestions(jsonWithTags, recipientTags);
      
      // Assert
      expect(result[0]).toHaveProperty('relevanceScore');
      // The score should be higher due to tag matching with 'bookworm' and 'tech-savvy'
      expect(result[0].relevanceScore).toBeGreaterThan(70);
      
      // Arrange - JSON with no matching tags
      const jsonWithoutMatchingTags = JSON.stringify({
        suggestions: [
          {
            name: 'Gourmet Chocolate Box',
            description: 'A luxurious box of gourmet chocolates',
            category: 'Food & Drink',
            tags: ['gourmet', 'sweet', 'luxury'],
            estimatedPrice: 35,
            priceRange: { min: 25, max: 45 },
            whereToBuy: ['Godiva', 'Amazon', 'Local Chocolatier'],
            relationshipRelevance: 'A thoughtful treat for any occasion'
          }
        ]
      });
      
      // Act
      const result2 = aiService.parseSuggestions(jsonWithoutMatchingTags, recipientTags);
      
      // Assert - Should have lower score due to no tag matches
      expect(result2[0].relevanceScore).toBeLessThan(result[0].relevanceScore);
    });
    
    it('fills in defaults for missing fields but never a price', () => {
      const withRange = JSON.stringify({ suggestions: [
        { name: 'Wireless Earbuds', description: 'High-quality wireless earbuds', priceRange: { min: 60, max: 80 } }
      ] });
      const [result] = aiService.parseSuggestions(withRange);
      expect(result).toMatchObject({ name: 'Wireless Earbuds', category: 'Uncategorized', estimatedPrice: 70 });
      expect(result.tags).toContain('gift');
      expect(result.whereToBuy.length).toBeGreaterThan(0);

      // No price and no range: unusable, and alone it makes the answer unreadable
      const noPrice = JSON.stringify({ suggestions: [{ name: 'Wireless Earbuds', description: 'x' }] });
      expect(() => aiService.parseSuggestions(noPrice)).toThrow(expect.objectContaining({ code: 'AI_BAD_OUTPUT' }));
    });
    
    it('reads a price range given as text', () => {
      const raw = JSON.stringify({ suggestions: [
        { name: 'Premium Backpack', description: 'For hiking', estimatedPrice: 120, priceRange: '$100-$140' }
      ] });
      const [result] = aiService.parseSuggestions(raw);
      expect(result.priceRange).toEqual({ min: 100, max: 140 });
    });
  });
});
