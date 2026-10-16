const axios = require('axios');
const cheerio = require('cheerio');
const similarity = require('similarity');
const GiftLibrary = require('../models/GiftLibrary');
const RateLimiter = require('../utils/rateLimiter');
const logger = require('../utils/logger');

class GiftDiscoveryService {
  constructor() {
    try {
      this.braveApiKey = process.env.BRAVE_SEARCH_API_KEY;
      this.rateLimiter = new RateLimiter(10, 60000); // 10 requests per minute
      this.similarityThreshold = parseFloat(process.env.SIMILARITY_THRESHOLD) || 0.85;
      this.maxGiftsPerDiscovery = parseInt(process.env.MAX_GIFTS_PER_DISCOVERY) || 1000;
      
      // Log API key status on initialization
      logger.debug('[GiftDiscoveryService] Initializing with Brave API key:', 
        this.braveApiKey ? 'Configured' : 'NOT CONFIGURED!!');
    } catch (error) {
      logger.error('[GiftDiscoveryService] Error during initialization:', error);
      // Set safe defaults
      this.braveApiKey = null;
      this.similarityThreshold = 0.85;
      this.maxGiftsPerDiscovery = 1000;
    }
  }

  // Discovery strategies
  async discoverGifts() {
    logger.debug('[GiftDiscoveryService] Starting gift discovery process...');

    if (!this.braveApiKey) {
      const error = new Error('Brave API key not configured - cannot proceed with discovery');
      logger.error('[GiftDiscoveryService] ERROR:', error.message);
      throw error;
    }

    // Overall timeout for the entire discovery process (default: 10 minutes)
    const overallTimeout = parseInt(process.env.DISCOVERY_TIMEOUT_MS) || 600000;
    const startTime = Date.now();

    try {
      const strategies = [
        { name: 'CategoryTrends', method: this.discoverByCategoryTrends.bind(this) },
        { name: 'Demographics', method: this.discoverByDemographics.bind(this) },
        { name: 'Occasions', method: this.discoverByOccasions.bind(this) },
        { name: 'TrendingGifts', method: this.discoverTrendingGifts.bind(this) },
        { name: 'CuratedLists', method: this.discoverFromCuratedLists.bind(this) }
      ];

      const discoveredGifts = [];

      for (let i = 0; i < strategies.length; i++) {
        // Check if we've exceeded the overall timeout
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime > overallTimeout) {
          logger.warn(`[GiftDiscoveryService] Overall timeout exceeded (${Math.round(elapsedTime / 1000)}s). Stopping after ${i} strategies.`);
          break;
        }

        const strategy = strategies[i];
        const remainingTime = overallTimeout - elapsedTime;

        try {
          logger.debug(`[GiftDiscoveryService] Running strategy ${i + 1}/${strategies.length}: ${strategy.name} (${Math.round(remainingTime / 1000)}s remaining)`);
          const strategyStartTime = Date.now();

          // Wrap strategy execution with a timeout
          const strategyTimeout = Math.min(remainingTime, 120000); // Max 2 minutes per strategy
          const gifts = await Promise.race([
            strategy.method(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`Strategy timeout after ${strategyTimeout}ms`)), strategyTimeout)
            )
          ]);

          const strategyDuration = Math.round((Date.now() - strategyStartTime) / 1000);

          logger.debug(`[GiftDiscoveryService] Strategy ${strategy.name} completed in ${strategyDuration}s, found ${gifts.length} gifts`);
          discoveredGifts.push(...gifts);

          // Progress indicator
          logger.debug(`[GiftDiscoveryService] Progress: ${i + 1}/${strategies.length} strategies completed (${Math.round((i + 1) / strategies.length * 100)}%)`);

        } catch (error) {
          logger.error(`[GiftDiscoveryService] Strategy ${strategy.name} failed:`, error.message);
          // Continue with other strategies
        }
      }

      logger.debug(`[GiftDiscoveryService] Total discovered gifts before deduplication: ${discoveredGifts.length}`);
      
      // Deduplicate and save
      const uniqueGifts = await this.deduplicateGifts(discoveredGifts);
      logger.debug(`[GiftDiscoveryService] Unique gifts after deduplication: ${uniqueGifts.length}`);
      
      const savedGifts = await this.saveDiscoveredGifts(uniqueGifts);
      logger.debug(`[GiftDiscoveryService] Successfully saved ${savedGifts.length} new gifts`);
      
      return savedGifts;
    } catch (error) {
      logger.error('[GiftDiscoveryService] Gift discovery failed:', error);
      throw error;
    }
  }

  async discoverByCategoryTrends() {
    const categories = ['electronics', 'home', 'fashion', 'books', 'toys', 'sports'];
    const year = new Date().getFullYear();
    const results = [];

    for (const category of categories) {
      const query = `best ${category} gifts ${year}`;
      const searchResults = await this.searchBrave(query);
      const gifts = await this.extractGiftsFromResults(searchResults, category);
      results.push(...gifts);
    }

    return results;
  }

  async discoverByDemographics() {
    // Comprehensive demographics list for inclusive gift discovery
    const demographics = [
      { age: 'teen', gender: 'person' },
      { age: '20-30', gender: 'person' },
      { age: '30-40', gender: 'person' },
      { age: '40-50', gender: 'person' },
      { age: '50-60', gender: 'person' },
      { age: '60+', gender: 'person' },
      { age: 'child', gender: 'person' },
      { age: 'toddler', gender: 'person' },
      { age: 'adult', gender: 'person' },
      { age: 'senior', gender: 'person' }
    ];

    const results = [];

    for (let i = 0; i < demographics.length; i++) {
      const demo = demographics[i];
      try {
        logger.debug(`[Demographics] Processing ${i + 1}/${demographics.length}: ${demo.age} ${demo.gender}`);
        
        const query = demo.age.includes('-') || demo.age === '60+' ? 
          `gifts for ${demo.age} year old ${demo.gender}` : 
          `gifts for ${demo.age} ${demo.gender}`;
        const searchResults = await this.searchBrave(query);
        const gifts = await this.extractGiftsFromResults(searchResults, null, demo);
        
        logger.debug(`[Demographics] Found ${gifts.length} gifts for ${demo.age} ${demo.gender}`);
        results.push(...gifts);
        
      } catch (error) {
        logger.error(`[Demographics] Failed for ${demo.age} ${demo.gender}:`, error.message);
        // Continue with other demographics
      }
    }

    return results;
  }

  async discoverByOccasions() {
    const occasions = [
      'birthday', 'christmas', 'anniversary', 'graduation', 
      'wedding', 'baby shower', 'mother\'s day', 'father\'s day',
      'valentine\'s day', 'housewarming', 'retirement'
    ];

    const results = [];

    for (const occasion of occasions) {
      const query = `${occasion} gift ideas`;
      const searchResults = await this.searchBrave(query);
      const gifts = await this.extractGiftsFromResults(searchResults, null, null, occasion);
      results.push(...gifts);
    }

    return results;
  }

  async discoverTrendingGifts() {
    const platforms = ['amazon', 'etsy', 'pinterest', 'tiktok'];
    const year = new Date().getFullYear();
    const results = [];

    for (const platform of platforms) {
      const query = `trending gifts ${platform} ${year}`;
      const searchResults = await this.searchBrave(query);
      const gifts = await this.extractGiftsFromResults(searchResults);
      results.push(...gifts);
    }

    return results;
  }

  async discoverFromCuratedLists() {
    const sources = [
      'nymag gift guide',
      'wirecutter gift ideas',
      'buzzfeed gift guide',
      'good housekeeping gift ideas',
      'oprah favorite things'
    ];

    const results = [];

    for (const source of sources) {
      const searchResults = await this.searchBrave(source);
      const gifts = await this.extractGiftsFromResults(searchResults);
      results.push(...gifts);
    }

    return results;
  }

  async searchBrave(query) {
    if (!this.braveApiKey) {
      const error = new Error('Brave API key not configured');
      logger.error('[GiftDiscoveryService] searchBrave ERROR:', error.message);
      throw error;
    }

    await this.rateLimiter.wait();

    try {
      logger.debug(`[GiftDiscoveryService] Brave search for: "${query}"`);
      
      const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
        params: { q: query },
        headers: { 
          'Accept': 'application/json',
          'X-Subscription-Token': this.braveApiKey
        }
      });

      const results = response.data.web?.results || [];
      logger.debug(`[GiftDiscoveryService] Brave search returned ${results.length} results`);
      
      return results;
    } catch (error) {
      logger.error('[GiftDiscoveryService] Brave search failed:', {
        query,
        status: error.response?.status,
        statusText: error.response?.statusText,
        message: error.message,
        headers: error.response?.headers
      });
      
      if (error.response?.status === 401) {
        logger.error('[GiftDiscoveryService] BRAVE API KEY IS INVALID OR NOT AUTHORIZED!');
      }
      
      throw error;
    }
  }

  async extractGiftsFromResults(searchResults, category = null, demographics = null, occasion = null) {
    const gifts = [];
    // Limit to first 3 results to improve reliability and speed
    const limitedResults = searchResults.slice(0, 3);
    
    logger.debug(`[GiftDiscoveryService] Processing ${limitedResults.length} out of ${searchResults.length} search results`);

    for (const result of limitedResults) {
      try {
        // Skip URLs that commonly timeout or block bots
        const skipPatterns = [
          'pinterest.com',
          'tiktok.com', 
          'instagram.com',
          'facebook.com',
          'youtube.com'
        ];
        
        if (skipPatterns.some(pattern => result.url.includes(pattern))) {
          logger.debug(`[GiftDiscoveryService] Skipping ${result.url} (known problematic site)`);
          continue;
        }

        logger.debug(`[GiftDiscoveryService] Fetching content from: ${result.url}`);
        const pageContent = await this.fetchPageContent(result.url);
        const extractedGifts = await this.parseGiftsFromContent(pageContent, result.url);
        
        logger.debug(`[GiftDiscoveryService] Extracted ${extractedGifts.length} gifts from ${result.url}`);
        
        // Enhance with metadata
        extractedGifts.forEach(gift => {
          if (category) {
            gift.categories = [category, ...(gift.categories || [])];
          }
          if (demographics) {
            gift.demographics = { ...gift.demographics, ...demographics };
          }
          if (occasion) {
            gift.occasions = [occasion, ...(gift.occasions || [])];
          }
          gift.sourceUrl = result.url;
          gift.discoveryDate = new Date();
        });

        gifts.push(...extractedGifts);
        
        // Add delay between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        logger.error(`[GiftDiscoveryService] Failed to extract gifts from: ${result.url} - ${error.message}`);
        // Continue with other results
      }
    }

    return gifts;
  }

  async fetchPageContent(url) {
    try {
      const response = await axios.get(url, {
        timeout: 30000, // Increased to 30 seconds
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
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch page: ${url} - ${error.message}`);
      throw error;
    }
  }

  async parseGiftsFromContent(htmlContent, sourceUrl) {
    const $ = cheerio.load(htmlContent);
    const gifts = [];

    // Enhanced patterns for gift lists
    const patterns = [
      { selector: '.product-list .product', nameSelector: '.product-name, .product-title', priceSelector: '.price, .cost' },
      { selector: 'article.gift, .gift-item, .product-item', nameSelector: 'h2, h3, .title, .name', priceSelector: '.price, .cost' },
      { selector: '[data-testid="product"], .product-card', nameSelector: '[data-testid="product-name"], h3, .product-title', priceSelector: '[data-testid="product-price"], .price' },
      { selector: 'li:contains("$"), .list-item:contains("$")', nameSelector: 'strong, b, h4', priceSelector: '*:contains("$")' },
      // Amazon-style selectors
      { selector: '[data-component-type="s-search-result"]', nameSelector: 'h2 a span', priceSelector: '.a-price .a-offscreen' },
      // General article/blog post patterns
      { selector: 'article h3, .entry-content h3, .content h3', nameSelector: '', priceSelector: '*:contains("$")' }
    ];

    let foundGifts = false;

    for (const pattern of patterns) {
      if (foundGifts && gifts.length > 5) break; // Stop if we already found enough gifts
      
      $(pattern.selector).each((i, elem) => {
        if (i >= 10) return false; // Limit to 10 items per pattern to avoid performance issues
        
        const $elem = $(elem);
        const name = pattern.nameSelector ? 
          $elem.find(pattern.nameSelector).first().text().trim() : 
          $elem.text().trim();
        
        // Skip if name is too short or generic
        if (!name || name.length < 5 || name.length > 150) return;
        
        const description = $elem.find('p, .description, .summary').first().text().trim().substring(0, 500);
        const priceText = $elem.find(pattern.priceSelector).first().text().trim();
        const imageUrl = $elem.find('img').first().attr('src') || $elem.find('img').first().attr('data-src');

        if (name && this.isValidGiftName(name, priceText)) {
          const gift = {
            name: this.cleanGiftName(name),
            // GiftLibrary requires a non-empty description; scraped pages
            // often have none, so fall back to the name rather than
            // failing schema validation at save time
            description: description || this.cleanGiftName(name),
            priceRange: this.extractPriceRange(priceText),
            imageUrls: imageUrl ? [this.normalizeImageUrl(imageUrl, sourceUrl)] : [],
            sourceUrl,
            categories: [],
            tags: this.extractTags(name + ' ' + description),
            popularityScore: 1,
            status: 'active',
            sourceType: 'discovered',
            discoveryDate: new Date()
          };

          gifts.push(gift);
          foundGifts = true;
        }
      });
    }

    // Fallback: Extract from simple text patterns
    if (gifts.length === 0) {
      const textContent = $.text();
      const giftMatches = textContent.match(/(\d+\.\s*[^$\n]*\$\d+[^\n]*)/g);
      
      if (giftMatches) {
        giftMatches.slice(0, 5).forEach(match => {
          const parts = match.split('$');
          if (parts.length >= 2) {
            const name = parts[0].replace(/^\d+\.\s*/, '').trim();
            const priceText = '$' + parts[1].split(/[^\d.,]/)[0];
            
            if (name.length > 5 && name.length < 100 && this.isValidGiftName(name, priceText)) {
              gifts.push({
                name: this.cleanGiftName(name),
                description: this.cleanGiftName(name),
                priceRange: this.extractPriceRange(priceText),
                sourceUrl,
                categories: [],
                tags: this.extractTags(name),
                popularityScore: 1,
                status: 'active',
                sourceType: 'discovered',
                discoveryDate: new Date()
              });
            }
          }
        });
      }
    }

    // Remove duplicates within this page
    const uniqueGifts = gifts.filter((gift, index, self) => 
      index === self.findIndex(g => g.name.toLowerCase() === gift.name.toLowerCase())
    );

    logger.debug(`[GiftDiscoveryService] Parsed ${uniqueGifts.length} unique gifts from content`);
    return uniqueGifts;
  }

  cleanGiftName(name) {
    return name
      .replace(/^\d+\.\s*/, '') // Remove numbered list prefixes
      .replace(/^[-•*]\s*/, '') // Remove bullet points
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  normalizeImageUrl(imageUrl, sourceUrl) {
    if (imageUrl.startsWith('http')) {
      return imageUrl;
    } else if (imageUrl.startsWith('//')) {
      return 'https:' + imageUrl;
    } else if (imageUrl.startsWith('/')) {
      const url = new URL(sourceUrl);
      return url.origin + imageUrl;
    }
    return imageUrl;
  }

  extractPriceRange(priceText) {
    // Handles "$1,299.99", "$45.5", "$ 30" — not just "$25.00".
    const prices = (priceText || '').match(/\$\s?\d+(?:,\d{3})*(?:\.\d{1,2})?(?!\d)/g) || [];
    const values = prices.map(p => parseFloat(p.replace(/[$,\s]/g, '')));

    if (values.length === 0) return { min: 0, max: 0 };
    if (values.length === 1) return { min: values[0], max: values[0] };
    
    return {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }

  extractTags(text) {
    // Split by non-alphanumeric characters, but keep hyphens within words
    const words = text.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean); // filter(Boolean) removes empty strings from split
    const commonWords = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'these', 'those', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being']);
    const uniqueTags = new Set(words.filter(word => word.length > 3 && !commonWords.has(word) && word.match(/[a-z0-9]/)));
    return Array.from(uniqueTags);
  }

  looksLikeGiftName(text) {
    const giftIndicators = ['gift', 'present', 'best', 'top', 'perfect', 'unique', 'special'];
    const lowerText = text.toLowerCase();
    return giftIndicators.some(indicator => lowerText.includes(indicator));
  }

  isJunkHeading(name) {
    // Strip leading quotes/punctuation so curly-quoted headlines
    // ("'Please Help!' Our Gifting Experts...") don't dodge the ^ anchors
    const lower = name.toLowerCase().trim().replace(/^[^a-z0-9$]+/, '');

    // Questions ("Is it rude not to bring a housewarming gift?")
    if (lower.endsWith('?')) {
      return true;
    }

    // Editorial/how-to headlines ("How We Chose The Best Tech Gifts")
    if (/^(how|what|why|when|where|which|who|is|are|do|does|can|could|should|will)\b/.test(lower)) {
      return true;
    }

    // Prose sentences ("We also love that the Switch can be played on...").
    // "I" is deliberately absent: pun products like "I Love Ewe Pillow" are real.
    if (/^(we|it|they|you|this|that|these|those|our|my)\b/.test(lower)) {
      return true;
    }

    // Listicle/roundup titles ("The 20 Best Gifts for Gamers", "Top 10 ...")
    if (/^(the\s+|a\s+|an\s+|our\s+)?\d*\s*(best|top|great(est)?|most|perfect)\b/.test(lower)) {
      return true;
    }

    // Category/guide titles rather than products ("Valentine's Day Gifts for Men")
    if (/\bgifts\b/.test(lower) || /\bgift (guides?|ideas?)\b/.test(lower)) {
      return true;
    }

    return false;
  }

  isValidGiftName(name, priceText) {
    // Don't accept names that are just prices
    if (name.match(/^\$?\d+(\.\d{2})?$/)) {
      return false;
    }

    // Don't accept names that start with price patterns
    if (name.match(/^\$\d+/)) {
      return false;
    }

    // Don't accept names that are primarily numbers and currency symbols
    if (name.replace(/[\d$.,\s]/g, '').length < 3) {
      return false;
    }

    // Don't accept scraped article headlines, questions, or list titles
    if (this.isJunkHeading(name)) {
      return false;
    }

    // Scrape artifacts: "Learn more" buttons, star-rating fragments,
    // price-range labels ("under $75"), sentence fragments, multi-line blobs
    if (/learn more/i.test(name)) {
      return false;
    }
    if (/\bout of \d+ stars\b/i.test(name)) {
      return false;
    }
    if (/^under\s+\$?\d/i.test(name)) {
      return false;
    }
    if (/^\d+[\s,.]*\b(or|and|off)\b/i.test(name)) {
      return false;
    }
    // Real newlines or literal "\n" sequences from double-escaped scrapes
    if (name.includes('\n') || name.includes('\\')) {
      return false;
    }
    // Truncated sentence fragments ("...or the metal one for")
    if (/\b(for|or|and|over|under|with|to|of|at|the|a|an)[\s.,]*$/i.test(name)) {
      return false;
    }
    // Category labels end in a colon ("Trendy gift under $20:")
    if (/:\s*$/.test(name)) {
      return false;
    }
    // Editorial review titles, not products
    if (/\breview\b/i.test(name)) {
      return false;
    }
    // Price/format glued to a word by broken markup ("8Hardcover")
    if (/^\d+(?=[A-Z][a-z])/.test(name)) {
      return false;
    }
    // Product names are short; 12+ words is prose
    if (name.trim().split(/\s+/).length > 12) {
      return false;
    }

    // Accept if it looks like a gift name OR has a valid price (but name isn't just a price)
    return this.looksLikeGiftName(name) || priceText.includes('$');
  }

  async deduplicateGifts(gifts) {
    if (!gifts || gifts.length === 0) return [];

    const uniqueGifts = [];
    // Use a Map for O(1) lookup of normalized names
    const seenNames = new Map();
    // Store first few words for quick prefix matching
    const nameTokens = new Map();

    // Helper function to normalize text for matching
    const normalizeText = (text) => (text || '').toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');

    // Helper function to get first N words
    const getPrefix = (text, n = 3) => normalizeText(text).split(/\s+/).slice(0, n).join(' ');

    // Helper to get first word for broader matching
    const getFirstWord = (text) => normalizeText(text).split(/\s+/)[0] || '';

    let duplicateCount = 0;
    let comparisonCount = 0;

    for (const gift of gifts) {
      const normalizedName = normalizeText(gift.name);
      const namePrefix = getPrefix(gift.name);
      const firstWord = getFirstWord(gift.name);

      // Quick exact match check (O(1))
      if (seenNames.has(normalizedName)) {
        duplicateCount++;
        continue;
      }

      let isDuplicate = false;
      const candidatesForComparison = new Set();

      // Get candidates with similar name prefixes or same first word
      for (const [prefix, indices] of nameTokens.entries()) {
        const prefixFirstWord = prefix.split(/\s+/)[0] || '';
        // Match if: same prefix, similar prefix, or same first word
        if (prefix === namePrefix ||
            similarity(prefix, namePrefix) > 0.5 ||
            (firstWord && prefixFirstWord === firstWord)) {
          indices.forEach(idx => candidatesForComparison.add(idx));
        }
      }

      // For small datasets, also compare with recent items to catch edge cases
      // This maintains original behavior for small lists while being efficient for large ones
      if (uniqueGifts.length <= 20) {
        for (let i = 0; i < uniqueGifts.length; i++) {
          candidatesForComparison.add(i);
        }
      }

      // Check all candidates
      for (const idx of candidatesForComparison) {
        const existingGift = uniqueGifts[idx];
        comparisonCount++;

        const nameSimilarity = similarity(gift.name, existingGift.name);

        // High name similarity = duplicate
        if (nameSimilarity > this.similarityThreshold) {
          logger.debug(`[Deduplication] Duplicate found: "${gift.name}" similar to "${existingGift.name}" (${nameSimilarity.toFixed(2)})`);
          isDuplicate = true;
          break;
        }

        // Description similarity is only meaningful when both gifts have a
        // real description: similarity('', '') === 1, which used to mark
        // every description-less gift as a duplicate of the first one.
        const descA = (gift.description || '').trim();
        const descB = (existingGift.description || '').trim();
        const descSimilarity = (descA.length >= 20 && descB.length >= 20)
          ? similarity(descA, descB)
          : 0;

        // High description similarity alone = duplicate (catches renamed products)
        if (descSimilarity > this.similarityThreshold) {
          logger.debug(`[Deduplication] Duplicate found via high description similarity: "${gift.name}" similar to "${existingGift.name}" (desc: ${descSimilarity.toFixed(2)})`);
          isDuplicate = true;
          break;
        }

        // Combined moderate similarity = duplicate (the key case for the test)
        if (nameSimilarity > 0.6 && descSimilarity > 0.6) {
          logger.debug(`[Deduplication] Duplicate found via combined similarity: "${gift.name}" similar to "${existingGift.name}" (name: ${nameSimilarity.toFixed(2)}, desc: ${descSimilarity.toFixed(2)})`);
          isDuplicate = true;
          break;
        }
      }

      if (isDuplicate) {
        duplicateCount++;
        continue;
      }

      // Add to unique gifts
      const newIndex = uniqueGifts.length;
      uniqueGifts.push(gift);
      seenNames.set(normalizedName, newIndex);

      // Add to prefix index
      if (!nameTokens.has(namePrefix)) {
        nameTokens.set(namePrefix, []);
      }
      nameTokens.get(namePrefix).push(newIndex);
    }

    logger.debug(`[Deduplication] Processed ${gifts.length} gifts, found ${duplicateCount} duplicates, performed ${comparisonCount} comparisons`);
    return uniqueGifts;
  }

  async saveDiscoveredGifts(gifts) {
    if (!gifts || gifts.length === 0) return [];

    logger.debug(`[GiftDiscoveryService] Attempting to save ${gifts.length} gifts`);

    // One batched existence query + one unordered insertMany instead of a
    // findOne + save round trip per gift (discovery batches reach 1000).
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existing = await GiftLibrary.find(
      { name: { $in: gifts.map((g) => new RegExp(`^${escapeRegex(g.name)}$`, 'i')) } },
      { name: 1 }
    ).lean();
    const existingNames = new Set(existing.map((doc) => doc.name.toLowerCase()));

    const newGifts = gifts.filter((gift) => {
      if (existingNames.has(gift.name.toLowerCase())) {
        logger.debug(`[GiftDiscoveryService] Gift already exists: ${gift.name}`);
        return false;
      }
      return true;
    });

    // Pre-validate: insertMany({ordered:false}) silently skips docs that
    // fail schema validation, which once masked a whole run saving nothing
    const validGifts = newGifts.filter((gift) => {
      const validationError = new GiftLibrary(gift).validateSync();
      if (validationError) {
        logger.error(`[GiftDiscoveryService] Invalid gift skipped: "${gift.name}" - ${validationError.message}`);
        return false;
      }
      return true;
    });

    let savedGifts = [];
    if (validGifts.length > 0) {
      try {
        savedGifts = await GiftLibrary.insertMany(validGifts, { ordered: false });
      } catch (error) {
        // Unordered insertMany keeps going past individual failures;
        // mongoose reports successes on error.insertedDocs.
        savedGifts = error.insertedDocs || [];
        (error.writeErrors || []).forEach((writeError) => {
          const failed = validGifts[writeError.index];
          logger.error(`[GiftDiscoveryService] Failed to save gift: ${failed?.name}`, {
            error: writeError.errmsg || writeError.err?.errmsg || error.message,
            giftData: failed
          });
        });
        if (!error.writeErrors) {
          logger.error('[GiftDiscoveryService] insertMany failed:', error.message);
        }
      }
    }

    logger.debug(`[GiftDiscoveryService] Successfully saved ${savedGifts.length} out of ${gifts.length} gifts`);

    return savedGifts;
  }

  // Additional utility methods
  calculatePopularityScore(gift) {
    let score = 0;
    
    // Base score from metadata
    if (gift.metadata) {
      if (gift.metadata.avgRating) score += gift.metadata.avgRating * 10;
      if (gift.metadata.reviewCount) score += Math.min(gift.metadata.reviewCount / 100, 20);
    }
    
    // Freshness bonus
    const daysSinceDiscovery = (Date.now() - gift.discoveryDate) / (1000 * 60 * 60 * 24);
    if (daysSinceDiscovery < 7) score += 20;
    else if (daysSinceDiscovery < 30) score += 10;
    
    // Price range bonus (mid-range gifts often more popular)
    if (gift.priceRange.min >= 20 && gift.priceRange.max <= 100) score += 15;
    
    return Math.min(score, 100); // Cap at 100
  }
}

// Export singleton instance for normal usage
const instance = new GiftDiscoveryService();
module.exports = instance;
// Also export class for testing (allows fresh instances)
module.exports.GiftDiscoveryService = GiftDiscoveryService;
