// tests/services/giftDiscoveryService.test.js
const axios = require('axios');
const cheerio = require('cheerio');
const similarity = require('similarity');
const GiftLibrary = require('../../models/GiftLibrary');
const RateLimiter = require('../../utils/rateLimiter');
const { GiftDiscoveryService } = require('../../services/giftDiscoveryService'); // Import class for testing
const logger = require('../../utils/logger');

// Mock all dependencies
jest.mock('axios');
jest.mock('cheerio');
jest.mock('similarity');
jest.mock('../../models/GiftLibrary');
jest.mock('../../utils/rateLimiter');

// Mock data factory functions
const createMockBraveSearchResponse = (overrides = {}) => {
  const defaultResults = [
    {
      url: 'https://example.com/best-gifts-2025',
      title: 'Best Gifts 2025 - Top Gift Ideas',
      description: 'Discover the most popular gifts for 2025, including electronics, home goods, and unique presents.'
    },
    {
      url: 'https://giftguide.com/trending-gifts',
      title: 'Trending Gift Guide - Holiday 2025',
      description: 'Find trending gifts perfect for any occasion including birthdays, holidays, and special events.'
    },
    {
      url: 'https://retailer.com/gift-ideas',
      title: 'Ultimate Gift Ideas Collection',
      description: 'Browse our curated collection of gift ideas for everyone on your list.'
    }
  ];

  return {
    data: {
      web: {
        results: overrides.results || defaultResults
      }
    }
  };
};

const createMockHtmlContent = (type = 'standard') => {
  if (type === 'standard') {
    return `
      <html>
        <body>
          <div class="product-list">
            <div class="product">
              <h3 class="product-name">Wireless Bluetooth Headphones</h3>
              <p class="description">High-quality wireless headphones with noise cancellation</p>
              <span class="price">$89.99</span>
              <img src="https://example.com/headphones.jpg" alt="Headphones">
            </div>
            <div class="product">
              <h3 class="product-name">Smart Coffee Maker</h3>
              <p class="description">WiFi-enabled coffee maker with app control</p>
              <span class="price">$149.99</span>
              <img src="https://example.com/coffee-maker.jpg" alt="Coffee Maker">
            </div>
          </div>
        </body>
      </html>
    `;
  } else if (type === 'alternative') {
    return `
      <html>
        <body>
          <article class="gift">
            <h2>Eco-Friendly Water Bottle</h2>
            <p>Sustainable stainless steel water bottle perfect for outdoor activities</p>
            <span class="cost">$24.99</span>
          </article>
          <article class="gift">
            <h3>Luxury Candle Set</h3>
            <p>Hand-poured soy candles with natural fragrances</p>
            <span class="price">$45.00 - $65.00</span>
          </article>
        </body>
      </html>
    `;
  } else if (type === 'generic') {
    return `
      <html>
        <body>
          <h2>Best Wireless Charger</h2>
          <p>Fast charging wireless pad compatible with all devices</p>
          <h3>Perfect Kitchen Knife Set</h3>
          <p>Professional grade knives for home cooking enthusiasts</p>
          <span>$120.00</span>
          <h4>Unique Art Print Collection</h4>
          <p>Limited edition prints for art lovers</p>
        </body>
      </html>
    `;
  }
  return '<html><body></body></html>';
};

const createMockGiftObject = (overrides = {}) => {
  return {
    name: overrides.name || 'Sample Gift',
    description: overrides.description || 'A wonderful gift for any occasion',
    priceRange: overrides.priceRange || { min: 25, max: 50 },
    categories: overrides.categories || ['general'],
    tags: overrides.tags || ['gift', 'popular'],
    demographics: overrides.demographics || {},
    occasions: overrides.occasions || [],
    sourceUrl: overrides.sourceUrl || 'https://example.com',
    imageUrls: overrides.imageUrls || [],
    popularityScore: overrides.popularityScore || 0,
    status: overrides.status || 'active',
    ...overrides
  };
};

const createMockSavedGift = (overrides = {}) => {
  return {
    _id: 'mock-id-123',
    ...createMockGiftObject(overrides),
    save: jest.fn().mockResolvedValue(true),
    toObject: jest.fn().mockReturnValue(createMockGiftObject(overrides))
  };
};

// Set higher timeout for service tests
jest.setTimeout(30000);

describe('Gift Discovery Service', () => {
  const originalEnv = process.env;
  let giftDiscoveryService; // Declare service instance here
  
  beforeAll(() => {
    // Set test environment variables
    process.env.BRAVE_SEARCH_API_KEY = 'test-brave-api-key';
    process.env.SIMILARITY_THRESHOLD = '0.85';
    process.env.MAX_GIFTS_PER_DISCOVERY = '1000';
  });

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Setup default mocks
    const mockRateLimiter = {
      wait: jest.fn().mockResolvedValue()
    };
    RateLimiter.mockImplementation(() => mockRateLimiter);
    
    // Reset logger.debug and logger.error mocks if needed
    jest.spyOn(logger, 'debug').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});

    // Instantiate the service AFTER environment variables are set
    giftDiscoveryService = new GiftDiscoveryService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv; // Restore original environment
  });

  describe('Service Initialization', () => {
    it('should have correct configuration from environment variables', () => {
      // The service is already initialized with test environment variables
      expect(giftDiscoveryService.braveApiKey).toBe('test-brave-api-key');
      expect(giftDiscoveryService.similarityThreshold).toBe(0.85);
      expect(giftDiscoveryService.maxGiftsPerDiscovery).toBe(1000);
      expect(RateLimiter).toHaveBeenCalledWith(10, 60000);
    });

    it('should have rate limiter properly initialized', () => {
      expect(giftDiscoveryService.rateLimiter).toBeDefined();
      expect(giftDiscoveryService.rateLimiter.wait).toBeDefined();
    });

    it('should handle constructor errors by setting safe defaults', () => {
      // This test verifies the error handling in the constructor
      // by checking that the service still functions with defaults
      expect(giftDiscoveryService.similarityThreshold).toBeGreaterThan(0);
      expect(giftDiscoveryService.maxGiftsPerDiscovery).toBeGreaterThan(0);
    });
  });

  describe('Brave Search API Integration', () => {
    it('should successfully make API calls with correct parameters', async () => {
      // Arrange
      const mockResponse = createMockBraveSearchResponse();
      axios.get.mockResolvedValue(mockResponse);
      
      const query = 'best electronics gifts 2025';
      
      // Act
      const result = await giftDiscoveryService.searchBrave(query);
      
      // Assert
      expect(axios.get).toHaveBeenCalledTimes(1);
      expect(axios.get).toHaveBeenCalledWith(
        'https://api.search.brave.com/res/v1/web/search',
        {
          params: { q: query },
          headers: { 
            'Accept': 'application/json',
            'X-Subscription-Token': 'test-brave-api-key'
          }
        }
      );
      
      expect(result).toEqual(mockResponse.data.web.results);
      expect(giftDiscoveryService.rateLimiter.wait).toHaveBeenCalledTimes(1);
    });

    it('should handle API authentication errors', async () => {
      // Arrange
      const authError = new Error('Unauthorized');
      authError.response = {
        status: 401,
        statusText: 'Unauthorized',
        headers: {}
      };
      axios.get.mockRejectedValue(authError);
      
      // Act & Assert
      await expect(giftDiscoveryService.searchBrave('test query'))
        .rejects.toThrow('Unauthorized');
      
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('BRAVE API KEY IS INVALID OR NOT AUTHORIZED!')
      );
    });

    it('should handle API rate limiting errors', async () => {
      // Arrange
      const rateLimitError = new Error('Too Many Requests');
      rateLimitError.response = {
        status: 429,
        statusText: 'Too Many Requests',
        headers: {}
      };
      axios.get.mockRejectedValue(rateLimitError);
      
      // Act & Assert
      await expect(giftDiscoveryService.searchBrave('test query'))
        .rejects.toThrow('Too Many Requests');
    });

    it('should handle missing API key', async () => {
      // Arrange
      const originalKey = giftDiscoveryService.braveApiKey;
      giftDiscoveryService.braveApiKey = null;
      
      // Act & Assert
      await expect(giftDiscoveryService.searchBrave('test query'))
        .rejects.toThrow('Brave API key not configured');
      
      // Restore
      giftDiscoveryService.braveApiKey = originalKey;
    });

    it('should handle API responses with no web results', async () => {
      // Arrange
      const emptyResponse = { data: { web: { results: [] } } };
      axios.get.mockResolvedValue(emptyResponse);
      
      // Act
      const result = await giftDiscoveryService.searchBrave('test query');
      
      // Assert
      expect(result).toEqual([]);
    });

    it('should handle malformed API responses', async () => {
      // Arrange
      const malformedResponse = { data: {} }; // Missing web.results
      axios.get.mockResolvedValue(malformedResponse);
      
      // Act
      const result = await giftDiscoveryService.searchBrave('test query');
      
      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('Web Scraping and Content Fetching', () => {
    it('should successfully fetch page content with correct headers', async () => {
      // Arrange
      const testUrl = 'https://example.com/gifts';
      const mockHtml = createMockHtmlContent('standard');
      axios.get.mockResolvedValue({ data: mockHtml });
      
      // Act
      const result = await giftDiscoveryService.fetchPageContent(testUrl);
      
      // Assert
      expect(axios.get).toHaveBeenCalledWith(testUrl, {
        timeout: 30000,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });
      expect(result).toBe(mockHtml);
    });

    it('should handle fetch timeout errors', async () => {
      // Arrange
      const testUrl = 'https://slow-site.com/gifts';
      const timeoutError = new Error('timeout of 10000ms exceeded');
      timeoutError.code = 'ECONNABORTED';
      axios.get.mockRejectedValue(timeoutError);
      
      // Act & Assert
      await expect(giftDiscoveryService.fetchPageContent(testUrl))
        .rejects.toThrow('timeout of 10000ms exceeded');
    });

    it('should handle network connection errors', async () => {
      // Arrange
      const testUrl = 'https://unreachable-site.com/gifts';
      const networkError = new Error('ENOTFOUND unreachable-site.com');
      networkError.code = 'ENOTFOUND';
      axios.get.mockRejectedValue(networkError);
      
      // Act & Assert
      await expect(giftDiscoveryService.fetchPageContent(testUrl))
        .rejects.toThrow('ENOTFOUND unreachable-site.com');
    });

    it('should handle HTTP error status codes', async () => {
      // Arrange
      const testUrl = 'https://example.com/not-found';
      const httpError = new Error('Request failed with status code 404');
      httpError.response = { status: 404, statusText: 'Not Found' };
      axios.get.mockRejectedValue(httpError);
      
      // Act & Assert
      await expect(giftDiscoveryService.fetchPageContent(testUrl))
        .rejects.toThrow('Request failed with status code 404');
    });
  });

  describe('Gift Extraction and HTML Parsing', () => {
    it('should extract gifts from search results successfully', async () => {
      // Arrange
      const searchResults = [
        { url: 'https://example.com/gift1', title: 'Gift Guide 1' },
        { url: 'https://example.com/gift2', title: 'Gift Guide 2' }
      ];
      
      const mockHtml = createMockHtmlContent('standard');
      axios.get.mockResolvedValue({ data: mockHtml });
      
      // Mock parseGiftsFromContent to return predictable results based on URL
      jest.spyOn(giftDiscoveryService, 'parseGiftsFromContent').mockImplementation(async (htmlContent, sourceUrl) => {
        if (sourceUrl === 'https://example.com/gift1') {
          return [
            createMockGiftObject({ name: 'Gift 1 from 1', sourceUrl: 'https://example.com/gift1' }),
            createMockGiftObject({ name: 'Gift 2 from 1', sourceUrl: 'https://example.com/gift1' })
          ];
        } else if (sourceUrl === 'https://example.com/gift2') {
          return [
            createMockGiftObject({ name: 'Gift 1 from 2', sourceUrl: 'https://example.com/gift2' }),
            createMockGiftObject({ name: 'Gift 2 from 2', sourceUrl: 'https://example.com/gift2' })
          ];
        }
        return [];
      });
      
      // Act
      const result = await giftDiscoveryService.extractGiftsFromResults(searchResults);
      
      // Assert
      expect(result).toHaveLength(4); // 2 gifts from each of 2 URLs
      expect(result[0].sourceUrl).toBe('https://example.com/gift1');
      expect(result[2].sourceUrl).toBe('https://example.com/gift2');
    });

    it('should enhance gifts with category metadata', async () => {
      // Arrange
      const searchResults = [{ url: 'https://example.com/electronics', title: 'Electronics Guide' }];
      const category = 'electronics';
      
      axios.get.mockResolvedValue({ data: createMockHtmlContent('standard') });
      jest.spyOn(giftDiscoveryService, 'parseGiftsFromContent').mockResolvedValue([
        createMockGiftObject({ name: 'Smartphone' })
      ]);
      
      // Act
      const result = await giftDiscoveryService.extractGiftsFromResults(searchResults, category);
      
      // Assert
      expect(result[0].categories).toContain('electronics');
      expect(result[0].sourceUrl).toBe('https://example.com/electronics');
    });

    it('should enhance gifts with demographics metadata', async () => {
      // Arrange
      const searchResults = [{ url: 'https://example.com/teens', title: 'Teen Gifts' }];
      const demographics = { age: '13-18', gender: 'teen' };
      
      axios.get.mockResolvedValue({ data: createMockHtmlContent('standard') });
      jest.spyOn(giftDiscoveryService, 'parseGiftsFromContent').mockResolvedValue([
        createMockGiftObject({ name: 'Teen Gift' })
      ]);
      
      // Act
      const result = await giftDiscoveryService.extractGiftsFromResults(searchResults, null, demographics);
      
      // Assert
      expect(result[0].demographics).toEqual(demographics);
    });

    it('should enhance gifts with occasion metadata', async () => {
      // Arrange
      const searchResults = [{ url: 'https://example.com/birthday', title: 'Birthday Gifts' }];
      const occasion = 'birthday';
      
      axios.get.mockResolvedValue({ data: createMockHtmlContent('standard') });
      jest.spyOn(giftDiscoveryService, 'parseGiftsFromContent').mockResolvedValue([
        createMockGiftObject({ name: 'Birthday Gift' })
      ]);
      
      // Act
      const result = await giftDiscoveryService.extractGiftsFromResults(searchResults, null, null, occasion);
      
      // Assert
      expect(result[0].occasions).toContain('birthday');
    });

    it('should handle extraction failures gracefully', async () => {
      // Arrange
      const searchResults = [
        { url: 'https://working-site.com', title: 'Working Site' },
        { url: 'https://broken-site.com', title: 'Broken Site' }
      ];
      
      axios.get.mockImplementation((url) => {
        if (url.includes('broken-site')) {
          return Promise.reject(new Error('Site unreachable'));
        }
        return Promise.resolve({ data: createMockHtmlContent('standard') });
      });
      
      jest.spyOn(giftDiscoveryService, 'parseGiftsFromContent').mockResolvedValue([
        createMockGiftObject({ name: 'Working Gift' })
      ]);
      
      // Act
      const result = await giftDiscoveryService.extractGiftsFromResults(searchResults);
      
      // Assert
      expect(result).toHaveLength(1); // Only from working site
      expect(result[0].name).toBe('Working Gift');
      expect(logger.error).toHaveBeenCalledWith(
        '[GiftDiscoveryService] Failed to extract gifts from: https://broken-site.com - Site unreachable'
      );
    });
  });

  describe('Helper Methods', () => {
    describe('extractPriceRange', () => {
      it('should extract single price correctly', () => {
        const result = giftDiscoveryService.extractPriceRange('$89.99');
        expect(result).toEqual({ min: 89.99, max: 89.99 });
      });

      it('should extract price range correctly', () => {
        const result = giftDiscoveryService.extractPriceRange('$25.00 - $45.99');
        expect(result).toEqual({ min: 25.00, max: 45.99 });
      });

      it('should handle multiple prices and return min/max', () => {
        const result = giftDiscoveryService.extractPriceRange('Was $100.00 now $75.50 save $24.50');
        expect(result).toEqual({ min: 24.50, max: 100.00 });
      });

      it('should return zero range for no prices found', () => {
        const result = giftDiscoveryService.extractPriceRange('No price information available');
        expect(result).toEqual({ min: 0, max: 0 });
      });

      it('should handle various price formats', () => {
        expect(giftDiscoveryService.extractPriceRange('$15')).toEqual({ min: 15, max: 15 });
        expect(giftDiscoveryService.extractPriceRange('USD $25.99')).toEqual({ min: 25.99, max: 25.99 });
        expect(giftDiscoveryService.extractPriceRange('Price: $10.00')).toEqual({ min: 10.00, max: 10.00 });
      });
    });

    describe('extractTags', () => {
      it('should extract meaningful tags from text', () => {
        const text = 'Premium wireless headphones with noise cancellation for music lovers';
        const result = giftDiscoveryService.extractTags(text);
        
        expect(result).toContain('premium');
        expect(result).toContain('wireless');
        expect(result).toContain('headphones');
        expect(result).toContain('noise');
        expect(result).toContain('cancellation');
        expect(result).toContain('music');
        expect(result).toContain('lovers');
        
        // Should not contain common words
        expect(result).not.toContain('with');
        expect(result).not.toContain('for');
        expect(result).not.toContain('the');
      });

      it('should handle empty or short text', () => {
        expect(giftDiscoveryService.extractTags('')).toEqual([]);
        expect(giftDiscoveryService.extractTags('a')).toEqual([]);
        expect(giftDiscoveryService.extractTags('the and for')).toEqual([]);
      });

      it('should filter out words shorter than 4 characters', () => {
        const result = giftDiscoveryService.extractTags('Big red car runs fast');
        expect(result).not.toContain('big'); // 3 chars
        expect(result).not.toContain('red'); // 3 chars
        expect(result).not.toContain('car'); // 3 chars
        expect(result).toContain('runs'); // 4 chars
        expect(result).toContain('fast'); // 4 chars
      });
    });

    describe('looksLikeGiftName', () => {
      it('should identify gift-related text correctly', () => {
        expect(giftDiscoveryService.looksLikeGiftName('Best gift for mom')).toBe(true);
        expect(giftDiscoveryService.looksLikeGiftName('Perfect present ideas')).toBe(true);
        expect(giftDiscoveryService.looksLikeGiftName('Top 10 unique gifts')).toBe(true);
        expect(giftDiscoveryService.looksLikeGiftName('Special birthday gift')).toBe(true);
      });

      it('should reject non-gift text', () => {
        expect(giftDiscoveryService.looksLikeGiftName('About our company')).toBe(false);
        expect(giftDiscoveryService.looksLikeGiftName('Contact information')).toBe(false);
        expect(giftDiscoveryService.looksLikeGiftName('Privacy policy')).toBe(false);
      });

      it('should handle case insensitive matching', () => {
        expect(giftDiscoveryService.looksLikeGiftName('PERFECT GIFT IDEAS')).toBe(true);
        expect(giftDiscoveryService.looksLikeGiftName('unique PRESENT')).toBe(true);
      });
    });

    describe('isValidGiftName', () => {
      it('should reject scraped article questions', () => {
        expect(giftDiscoveryService.isValidGiftName('Is it rude not to bring a housewarming gift?', '')).toBe(false);
        expect(giftDiscoveryService.isValidGiftName('What are the top toy brands & retailers for 2025?', '$20')).toBe(false);
      });

      it('should reject editorial/how-to headlines', () => {
        expect(giftDiscoveryService.isValidGiftName('How We Chose The Best Tech Gifts', '$50')).toBe(false);
        expect(giftDiscoveryService.isValidGiftName('How to Choose Kids Gifts With Lasting Value', '')).toBe(false);
        expect(giftDiscoveryService.isValidGiftName('What To Consider When Buying The Best Tech Gifts', '')).toBe(false);
      });

      it('should reject listicle and roundup titles', () => {
        expect(giftDiscoveryService.isValidGiftName('The 20 Best Gifts for Gamers', '$30')).toBe(false);
        expect(giftDiscoveryService.isValidGiftName('28 Best Anniversary Gifts by Year', '')).toBe(false);
        expect(giftDiscoveryService.isValidGiftName('Best Travel Gifts for the Adventurer', '')).toBe(false);
        expect(giftDiscoveryService.isValidGiftName("Wirecutter's 100 Most Popular Gifts Ever", '')).toBe(false);
        expect(giftDiscoveryService.isValidGiftName('21 Great Hanukkah Gift Ideas', '')).toBe(false);
      });

      it('should accept real product names with a price', () => {
        expect(giftDiscoveryService.isValidGiftName('Le Creuset Signature Dutch Oven', '$350.00')).toBe(true);
        expect(giftDiscoveryService.isValidGiftName('Manduka PRO Yoga Mat', '$120')).toBe(true);
        expect(giftDiscoveryService.isValidGiftName('Fujifilm Instax Mini 11 Camera Bundle', '$85')).toBe(true);
      });

      it('should accept gift-flavored product names without a price', () => {
        expect(giftDiscoveryService.isValidGiftName('Personalized Birthday Gift Box', '')).toBe(true);
        expect(giftDiscoveryService.isValidGiftName('Unique Handmade Ceramic Mug', '')).toBe(true);
      });

      it('should still reject price-only names', () => {
        expect(giftDiscoveryService.isValidGiftName('$25.00', '$25.00')).toBe(false);
        expect(giftDiscoveryService.isValidGiftName('$100 value', '$100')).toBe(false);
      });
    });
  });

  describe('Discovery Strategies', () => {
    beforeEach(() => {
      // Mock searchBrave to return consistent results for strategy tests
      jest.spyOn(giftDiscoveryService, 'searchBrave').mockResolvedValue([
        { url: 'https://example.com/gifts1', title: 'Gift Guide 1' },
        { url: 'https://example.com/gifts2', title: 'Gift Guide 2' }
      ]);
      
      // Mock extractGiftsFromResults to return predictable gifts
      jest.spyOn(giftDiscoveryService, 'extractGiftsFromResults').mockResolvedValue([
        createMockGiftObject({ name: 'Strategy Gift 1' }),
        createMockGiftObject({ name: 'Strategy Gift 2' })
      ]);
    });

    describe('discoverByCategoryTrends', () => {
      it('should search for gifts across all categories', async () => {
        // Act
        const result = await giftDiscoveryService.discoverByCategoryTrends();
        
        // Assert
        const currentYear = new Date().getFullYear();
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith(`best electronics gifts ${currentYear}`);
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith(`best home gifts ${currentYear}`);
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith(`best fashion gifts ${currentYear}`);
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith(`best books gifts ${currentYear}`);
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith(`best toys gifts ${currentYear}`);
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith(`best sports gifts ${currentYear}`);
        
        expect(result).toHaveLength(12); // 2 gifts × 6 categories
      });
    });

    describe('discoverByDemographics', () => {
      it('should search for gifts across all demographic combinations', async () => {
        // Act
        const result = await giftDiscoveryService.discoverByDemographics();
        
        // Assert
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('gifts for teen person');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('gifts for 20-30 year old person');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('gifts for 30-40 year old person');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('gifts for 40-50 year old person');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('gifts for 50-60 year old person');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('gifts for 60+ year old person');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('gifts for child person');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('gifts for toddler person');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('gifts for adult person');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('gifts for senior person');
        
        expect(giftDiscoveryService.extractGiftsFromResults).toHaveBeenCalledTimes(10);
        expect(result).toHaveLength(20); // 2 gifts × 10 demographics
      });
    });

    describe('discoverByOccasions', () => {
      it('should search for gifts across all occasions', async () => {
        // Act
        const result = await giftDiscoveryService.discoverByOccasions();
        
        // Assert
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('birthday gift ideas');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('christmas gift ideas');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('anniversary gift ideas');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('graduation gift ideas');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('wedding gift ideas');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('baby shower gift ideas');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('mother\'s day gift ideas');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('father\'s day gift ideas');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('valentine\'s day gift ideas');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('housewarming gift ideas');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('retirement gift ideas');
        
        expect(giftDiscoveryService.extractGiftsFromResults).toHaveBeenCalledTimes(11);
        expect(result).toHaveLength(22); // 2 gifts × 11 occasions
      });
    });

    describe('discoverTrendingGifts', () => {
      it('should search for trending gifts across platforms', async () => {
        // Act
        const result = await giftDiscoveryService.discoverTrendingGifts();
        
        // Assert
        const currentYear = new Date().getFullYear();
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith(`trending gifts amazon ${currentYear}`);
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith(`trending gifts etsy ${currentYear}`);
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith(`trending gifts pinterest ${currentYear}`);
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith(`trending gifts tiktok ${currentYear}`);
        
        expect(giftDiscoveryService.extractGiftsFromResults).toHaveBeenCalledTimes(4);
        expect(result).toHaveLength(8); // 2 gifts × 4 platforms
      });
    });

    describe('discoverFromCuratedLists', () => {
      it('should search curated gift guide sources', async () => {
        // Act
        const result = await giftDiscoveryService.discoverFromCuratedLists();
        
        // Assert
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('nymag gift guide');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('wirecutter gift ideas');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('buzzfeed gift guide');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('good housekeeping gift ideas');
        expect(giftDiscoveryService.searchBrave).toHaveBeenCalledWith('oprah favorite things');
        
        expect(giftDiscoveryService.extractGiftsFromResults).toHaveBeenCalledTimes(5);
        expect(result).toHaveLength(10); // 2 gifts × 5 sources
      });
    });
  });

  describe('Deduplication Algorithm', () => {
    beforeEach(() => {
      // Mock similarity function
      similarity.mockImplementation((str1, str2) => {
        // logger.debug(`Comparing: "${str1}" and "${str2}"`); // For debugging
        if (str1 === str2) return 1.0;
        // Specifically for the combined name and description similarity test
        if (
          (str1.includes('Gaming Headset') && str2.includes('Gaming Audio')) ||
          (str1.includes('Wireless gaming headphones') && str2.includes('Wireless headphones for gaming'))
        ) {
          return 0.9; // Ensure high enough similarity for deduplication
        }
        if (str1.toLowerCase().includes('wireless') && str2.toLowerCase().includes('wireless')) return 0.9;
        if (str1.toLowerCase().includes('headphones') && str2.toLowerCase().includes('headphones')) return 0.8;
        return 0.3; // Low similarity for different items
      });
    });

    it('should remove exact duplicates based on name similarity', async () => {
      // Arrange
      const gifts = [
        createMockGiftObject({ name: 'Wireless Headphones', description: 'Great sound quality' }),
        createMockGiftObject({ name: 'Wireless Headphones', description: 'Excellent audio' }),
        createMockGiftObject({ name: 'Smart Watch', description: 'Fitness tracking' })
      ];
      
      // Act
      const result = await giftDiscoveryService.deduplicateGifts(gifts);
      
      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Wireless Headphones');
      expect(result[1].name).toBe('Smart Watch');
    });

    it('should remove similar items based on similarity threshold', async () => {
      // Arrange
      const gifts = [
        createMockGiftObject({ name: 'Wireless Bluetooth Headphones', description: 'Premium audio' }),
        createMockGiftObject({ name: 'Wireless Gaming Headphones', description: 'Great for gaming' }),
        createMockGiftObject({ name: 'Kitchen Knife Set', description: 'Sharp knives' })
      ];
      
      // Act
      const result = await giftDiscoveryService.deduplicateGifts(gifts);
      
      // Assert
      expect(result).toHaveLength(2); // One wireless headphone + knife set
      expect(result.some(gift => gift.name.includes('Headphones'))).toBe(true);
      expect(result.some(gift => gift.name.includes('Knife'))).toBe(true);
    });

    it('should keep items with low similarity scores', async () => {
      // Arrange
      const gifts = [
        createMockGiftObject({ name: 'Coffee Maker', description: 'Brews great coffee' }),
        createMockGiftObject({ name: 'Book Collection', description: 'Educational reading' }),
        createMockGiftObject({ name: 'Yoga Mat', description: 'Exercise equipment' })
      ];
      
      // Act
      const result = await giftDiscoveryService.deduplicateGifts(gifts);
      
      // Assert
      expect(result).toHaveLength(3); // All items should be kept
      expect(result.map(g => g.name)).toContain('Coffee Maker');
      expect(result.map(g => g.name)).toContain('Book Collection');
      expect(result.map(g => g.name)).toContain('Yoga Mat');
    });

    it('should handle combined name and description similarity', async () => {
      // Arrange
      const gifts = [
        createMockGiftObject({ 
          name: 'Gaming Headset', 
          description: 'Wireless gaming headphones with microphone' 
        }),
        createMockGiftObject({ 
          name: 'Gaming Audio', 
          description: 'Wireless headphones for gaming with built-in mic' 
        })
      ];
      
      // Act
      const result = await giftDiscoveryService.deduplicateGifts(gifts);
      
      // Assert
      expect(result).toHaveLength(1); // Should deduplicate based on combined similarity
    });

    it('should handle empty gift array', async () => {
      const result = await giftDiscoveryService.deduplicateGifts([]);
      expect(result).toEqual([]);
    });
  });

  describe('Database Operations', () => {
    const mockExistingNames = (names) => {
      GiftLibrary.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(names.map((name) => ({ name })))
      });
    };

    beforeEach(() => {
      // Reset all GiftLibrary mocks
      GiftLibrary.find.mockClear();
      GiftLibrary.insertMany.mockClear();
      GiftLibrary.mockClear();
    });

    it('should save new gifts successfully', async () => {
      // Arrange
      const gifts = [
        createMockGiftObject({ name: 'New Gift 1' }),
        createMockGiftObject({ name: 'New Gift 2' })
      ];

      // Mock database - no existing gifts found
      mockExistingNames([]);
      GiftLibrary.insertMany.mockResolvedValue(gifts);

      // Act
      const result = await giftDiscoveryService.saveDiscoveredGifts(gifts);

      // Assert - single batched existence query for all names
      expect(GiftLibrary.find).toHaveBeenCalledTimes(1);
      expect(GiftLibrary.find).toHaveBeenCalledWith(
        {
          name: {
            $in: [new RegExp('^New Gift 1$', 'i'), new RegExp('^New Gift 2$', 'i')]
          }
        },
        { name: 1 }
      );
      expect(GiftLibrary.insertMany).toHaveBeenCalledTimes(1);
      expect(GiftLibrary.insertMany).toHaveBeenCalledWith(gifts, { ordered: false });
      expect(result).toHaveLength(2);
    });

    it('should skip existing gifts', async () => {
      // Arrange
      const gifts = [
        createMockGiftObject({ name: 'Existing Gift' }),
        createMockGiftObject({ name: 'New Gift' })
      ];

      mockExistingNames(['Existing Gift']);
      GiftLibrary.insertMany.mockResolvedValue([gifts[1]]);

      // Act
      const result = await giftDiscoveryService.saveDiscoveredGifts(gifts);

      // Assert
      expect(GiftLibrary.insertMany).toHaveBeenCalledWith([gifts[1]], { ordered: false });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('New Gift');
    });

    it('should handle database save errors gracefully', async () => {
      // Arrange
      const gifts = [
        createMockGiftObject({ name: 'Valid Gift' }),
        createMockGiftObject({ name: 'Invalid Gift' })
      ];

      mockExistingNames([]);

      // Unordered insertMany reports partial success via insertedDocs/writeErrors
      const bulkError = new Error('Database save failed');
      bulkError.insertedDocs = [gifts[0]];
      bulkError.writeErrors = [{ index: 1, errmsg: 'Database save failed' }];
      GiftLibrary.insertMany.mockRejectedValue(bulkError);

      // Act
      const result = await giftDiscoveryService.saveDiscoveredGifts(gifts);

      // Assert
      expect(result).toHaveLength(1); // Only successful save
      expect(result[0].name).toBe('Valid Gift');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save gift: Invalid Gift'),
        expect.objectContaining({
          error: 'Database save failed',
          giftData: expect.objectContaining({ name: 'Invalid Gift' })
        })
      );
    });

    it('should handle empty gift list without touching the database', async () => {
      const result = await giftDiscoveryService.saveDiscoveredGifts([]);
      expect(result).toEqual([]);
      expect(GiftLibrary.find).not.toHaveBeenCalled();
      expect(GiftLibrary.insertMany).not.toHaveBeenCalled();
    });
  });

  describe('Main Discovery Orchestration', () => {
    beforeEach(() => {
      // Mock all strategy methods
      jest.spyOn(giftDiscoveryService, 'discoverByCategoryTrends').mockResolvedValue([
        createMockGiftObject({ name: 'Category Gift 1' }),
        createMockGiftObject({ name: 'Category Gift 2' })
      ]);
      
      jest.spyOn(giftDiscoveryService, 'discoverByDemographics').mockResolvedValue([
        createMockGiftObject({ name: 'Demo Gift 1' })
      ]);
      
      jest.spyOn(giftDiscoveryService, 'discoverByOccasions').mockResolvedValue([
        createMockGiftObject({ name: 'Occasion Gift 1' })
      ]);
      
      jest.spyOn(giftDiscoveryService, 'discoverTrendingGifts').mockResolvedValue([
        createMockGiftObject({ name: 'Trending Gift 1' })
      ]);
      
      jest.spyOn(giftDiscoveryService, 'discoverFromCuratedLists').mockResolvedValue([
        createMockGiftObject({ name: 'Curated Gift 1' })
      ]);
      
      // Mock deduplication and saving
      jest.spyOn(giftDiscoveryService, 'deduplicateGifts').mockImplementation(async (gifts) => gifts);
      jest.spyOn(giftDiscoveryService, 'saveDiscoveredGifts').mockResolvedValue([
        createMockSavedGift({ name: 'Saved Gift 1' }),
        createMockSavedGift({ name: 'Saved Gift 2' })
      ]);
    });

    it('should run all discovery strategies successfully', async () => {
      // Act
      const result = await giftDiscoveryService.discoverGifts();
      
      // Assert
      expect(giftDiscoveryService.discoverByCategoryTrends).toHaveBeenCalledTimes(1);
      expect(giftDiscoveryService.discoverByDemographics).toHaveBeenCalledTimes(1);
      expect(giftDiscoveryService.discoverByOccasions).toHaveBeenCalledTimes(1);
      expect(giftDiscoveryService.discoverTrendingGifts).toHaveBeenCalledTimes(1);
      expect(giftDiscoveryService.discoverFromCuratedLists).toHaveBeenCalledTimes(1);
      
      expect(giftDiscoveryService.deduplicateGifts).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Category Gift 1' }),
          expect.objectContaining({ name: 'Demo Gift 1' }),
          expect.objectContaining({ name: 'Occasion Gift 1' }),
          expect.objectContaining({ name: 'Trending Gift 1' }),
          expect.objectContaining({ name: 'Curated Gift 1' })
        ])
      );
      
      expect(giftDiscoveryService.saveDiscoveredGifts).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
    });

    it('should handle strategy failures gracefully', async () => {
      // Arrange - Make some strategies fail
      giftDiscoveryService.discoverByCategoryTrends.mockRejectedValue(new Error('Category strategy failed'));
      giftDiscoveryService.discoverByDemographics.mockRejectedValue(new Error('Demographics strategy failed'));
      
      // Act
      const result = await giftDiscoveryService.discoverGifts();
      
      // Assert
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Strategy CategoryTrends failed:'),
        'Category strategy failed'
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Strategy Demographics failed:'),
        'Demographics strategy failed'
      );
      
      // Should still continue with other strategies
      expect(giftDiscoveryService.discoverByOccasions).toHaveBeenCalledTimes(1);
      expect(giftDiscoveryService.discoverTrendingGifts).toHaveBeenCalledTimes(1);
      expect(giftDiscoveryService.discoverFromCuratedLists).toHaveBeenCalledTimes(1);
      
      expect(result).toHaveLength(2); // Still returns saved gifts
    });

    it('should throw error when Brave API key is not configured', async () => {
      // Arrange
      const originalKey = giftDiscoveryService.braveApiKey;
      giftDiscoveryService.braveApiKey = null;
      
      // Act & Assert
      await expect(giftDiscoveryService.discoverGifts())
        .rejects.toThrow('Brave API key not configured - cannot proceed with discovery');
      
      // Restore
      giftDiscoveryService.braveApiKey = originalKey;
    });
  });

  describe('HTML Content Parsing', () => {
    beforeEach(() => {
      // Mock cheerio.load to return a mock jQuery-like object
      const createMockCheerio = () => {
        // This is the main cheerio object returned by cheerio.load
        const $ = jest.fn((selectorOrElement) => {
          // If selectorOrElement is an element (from .each callback), return it directly
          if (typeof selectorOrElement === 'object' && selectorOrElement !== null && 'find' in selectorOrElement) {
            return selectorOrElement;
          }

          // Mock for product list items
          if (selectorOrElement === '.product-list .product') {
            return {
              each: jest.fn().mockImplementation((callback) => {
                const mockElements = [
                  // Mock for first product
                  {
                    find: jest.fn((subSelector) => {
                      if (subSelector === '.product-name, .product-title') return { 
                        text: () => 'Wireless Headphones', 
                        trim: () => 'Wireless Headphones',
                        first: () => ({ text: () => 'Wireless Headphones', trim: () => 'Wireless Headphones' })
                      };
                      if (subSelector === 'p, .description, .summary') return { first: () => ({ text: () => 'High-quality audio', trim: () => 'High-quality audio', substring: () => 'High-quality audio' }) };
                      if (subSelector === '.price, .cost') return { 
                        text: () => '$89.99', 
                        trim: () => '$89.99',
                        first: () => ({ text: () => '$89.99', trim: () => '$89.99' })
                      };
                      if (subSelector === 'img') return { first: () => ({ attr: () => 'https://example.com/headphones.jpg' }) };
                      return { text: () => '', trim: () => '', first: () => ({ text: () => '', trim: () => '' }) };
                    }),
                    text: () => 'Wireless Headphones $89.99'
                  },
                  // Mock for second product
                  {
                    find: jest.fn((subSelector) => {
                      if (subSelector === '.product-name, .product-title') return { 
                        text: () => 'Smart Coffee Maker', 
                        trim: () => 'Smart Coffee Maker',
                        first: () => ({ text: () => 'Smart Coffee Maker', trim: () => 'Smart Coffee Maker' })
                      };
                      if (subSelector === 'p, .description, .summary') return { first: () => ({ text: () => 'WiFi-enabled coffee maker', trim: () => 'WiFi-enabled coffee maker', substring: () => 'WiFi-enabled coffee maker' }) };
                      if (subSelector === '.price, .cost') return { 
                        text: () => '$149.99', 
                        trim: () => '$149.99',
                        first: () => ({ text: () => '$149.99', trim: () => '$149.99' })
                      };
                      if (subSelector === 'img') return { first: () => ({ attr: () => 'https://example.com/coffee-maker.jpg' }) };
                      return { text: () => '', trim: () => '', first: () => ({ text: () => '', trim: () => '' }) };
                    }),
                    text: () => 'Smart Coffee Maker $149.99'
                  }
                ];
                mockElements.forEach((elem, index) => callback(index, elem));
              })
            };
          }
          // Mock for generic selectors like h2, h3, h4
          if (['h2', 'h3', 'h4'].includes(selectorOrElement)) {
            const genericElements = [
              {
                text: () => 'Best Wireless Charger',
                trim: () => 'Best Wireless Charger',
                next: jest.fn(() => ({ text: () => 'Fast charging wireless pad compatible with all devices', trim: () => 'Fast charging wireless pad compatible with all devices' })),
                parent: jest.fn(() => ({
                  find: jest.fn((subSelector) => {
                    if (subSelector === '.price, .cost, span:contains("$")') return { first: jest.fn(() => ({ text: () => '$99.99', trim: () => '$99.99' })) };
                    return { text: () => '', trim: () => '' };
                  })
                }))
              }
            ];
            return {
              each: jest.fn().mockImplementation((callback) => {
                genericElements.forEach((elem, index) => callback(index, elem));
              })
            };
          }
          // Default return for any other selector: an object that can be chained with .find()
          return {
            find: jest.fn(() => ({
              text: jest.fn(() => ''),
              trim: jest.fn(() => ''),
              first: jest.fn(() => ({
                text: jest.fn(() => ''),
                trim: jest.fn(() => ''),
                attr: jest.fn(() => '')
              }))
            })),
            each: jest.fn() // Ensure .each is also available for general selectors
          };
        });
        
        // Add $.text() method for fallback parsing
        $.text = jest.fn(() => 'Sample text content with $25.99 and other prices');
        
        return $;
      };
      
      cheerio.load.mockImplementation(createMockCheerio);
    });

    it('should parse gifts from HTML content using standard product pattern', async () => {
      const htmlContent = `
        <html>
          <body>
            <div class="product-list">
              <div class="product">
                <h3 class="product-name">Wireless Headphones</h3>
                <p class="description">High-quality audio</p>
                <span class="price">$89.99</span>
                <img src="https://example.com/headphones.jpg" alt="Headphones">
              </div>
            </div>
          </body>
        </html>
      `;
      const sourceUrl = 'https://example.com/gifts';
      
      const result = await giftDiscoveryService.parseGiftsFromContent(htmlContent, sourceUrl);
      
      expect(cheerio.load).toHaveBeenCalledWith(htmlContent);
      expect(result).toHaveLength(2);
      
      expect(result[0]).toEqual({
        name: 'Wireless Headphones',
        description: 'High-quality audio',
        priceRange: { min: 89.99, max: 89.99 },
        imageUrls: ['https://example.com/headphones.jpg'],
        sourceUrl,
        categories: [],
        tags: ['wireless', 'headphones', 'high-quality', 'audio'],
        popularityScore: 1,
        status: 'active',
        sourceType: 'discovered',
        discoveryDate: expect.any(Date)
      });
      
      expect(result[1]).toEqual({
        name: 'Smart Coffee Maker',
        description: 'WiFi-enabled coffee maker',
        priceRange: { min: 149.99, max: 149.99 },
        imageUrls: ['https://example.com/coffee-maker.jpg'],
        sourceUrl,
        categories: [],
        tags: ['smart', 'coffee', 'maker', 'wifi-enabled'],
        popularityScore: 1,
        status: 'active',
        sourceType: 'discovered',
        discoveryDate: expect.any(Date)
      });
    });

    it('should handle empty HTML content gracefully', async () => {
      const mockCheerio = jest.fn().mockImplementation(() => ({
        each: jest.fn()
      }));
      mockCheerio.text = jest.fn(() => ''); // Add text method to the mock
      cheerio.load.mockImplementation(() => mockCheerio);
      
      const emptyHtml = '<html><body></body></html>';
      const sourceUrl = 'https://example.com/empty';
      
      const result = await giftDiscoveryService.parseGiftsFromContent(emptyHtml, sourceUrl);
      
      expect(result).toEqual([]);
    });
  });

  describe('Popularity Score Calculation', () => {
    it('should calculate score based on metadata', () => {
      const gift = {
        metadata: {
          avgRating: 4.5,
          reviewCount: 200
        },
        discoveryDate: Date.now() - (3 * 24 * 60 * 60 * 1000), // 3 days ago
        priceRange: { min: 25, max: 75 }
      };
      
      const score = giftDiscoveryService.calculatePopularityScore(gift);
      
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(score).toBe(82); // Corrected calculation: 45 + 2 + 20 + 15 = 82
    });

    it('should handle gifts without metadata', () => {
      const gift = {
        discoveryDate: Date.now() - (10 * 24 * 60 * 60 * 1000), // 10 days ago
        priceRange: { min: 150, max: 300 }
      };
      
      const score = giftDiscoveryService.calculatePopularityScore(gift);
      
      expect(score).toBe(10); // Only 10-30 day freshness bonus
    });

    it('should apply freshness bonuses correctly', () => {
      const freshGift = {
        discoveryDate: Date.now() - (2 * 24 * 60 * 60 * 1000),
        priceRange: { min: 200, max: 300 }
      };
      expect(giftDiscoveryService.calculatePopularityScore(freshGift)).toBe(20);
      
      const recentGift = {
        discoveryDate: Date.now() - (15 * 24 * 60 * 60 * 1000),
        priceRange: { min: 200, max: 300 }
      };
      expect(giftDiscoveryService.calculatePopularityScore(recentGift)).toBe(10);
      
      const oldGift = {
        discoveryDate: Date.now() - (40 * 24 * 60 * 60 * 1000),
        priceRange: { min: 200, max: 300 }
      };
      expect(giftDiscoveryService.calculatePopularityScore(oldGift)).toBe(0);
    });

    it('should apply price range bonuses correctly', () => {
      const baseGift = {
        discoveryDate: Date.now() - (40 * 24 * 60 * 60 * 1000) // Old gift for no freshness bonus
      };
      
      const midRangeGift = { ...baseGift, priceRange: { min: 30, max: 80 } };
      expect(giftDiscoveryService.calculatePopularityScore(midRangeGift)).toBe(15);
      
      const expensiveGift = { ...baseGift, priceRange: { min: 150, max: 300 } };
      expect(giftDiscoveryService.calculatePopularityScore(expensiveGift)).toBe(0);
      
      const cheapGift = { ...baseGift, priceRange: { min: 5, max: 15 } };
      expect(giftDiscoveryService.calculatePopularityScore(cheapGift)).toBe(0);
    });
  });
});
