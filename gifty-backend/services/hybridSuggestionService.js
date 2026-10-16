const GiftLibrary = require('../models/GiftLibrary');
const aiSuggestionService = require('./openaiService');
const reranker = require('./suggestionRerankerService');
const aiConfig = require('../config/aiConfig');
const { isAiError } = require('../utils/aiErrors');
const logger = require('../utils/logger');

// Scraped list titles keep their numbering ("22. Gift Basket")
const LIST_NUMBERING = /^\s*\d+[.)]\s*/;
const withoutNumbering = (gift) => ({ ...gift, name: String(gift.name || '').replace(LIST_NUMBERING, '') });

// A library gift needs a price to be offered: without one (0-0, missing) it
// would be saved as a free gift, like an AI suggestion without a price
const PRICED = { 'priceRange.max': { $gt: 0 } };

// Gifts for this age, or with no age range at all
const fitsAge = (age) => ({
  $or: [
    { 'demographics.ageRange.1': { $exists: false } },
    { 'demographics.ageRange.0': { $lte: age }, 'demographics.ageRange.1': { $gte: age } }
  ]
});

class HybridSuggestionService {
  constructor() {
    this.discoveredGiftRatio = 0.7; // 70% discovered, 30% AI-generated
    // Library size below which hybrid reports unhealthy and callers fall
    // back to enhanced AI-only suggestions
    this.minLibrarySize = parseInt(process.env.HYBRID_MIN_LIBRARY_SIZE) || 50;
  }

  async generateHybridSuggestions(recipientProfile, options = {}) {
    try {
      const {
        count = 5,
        budget = null,
        includeSources = false,
        ai = {},
        excludeNames = []
      } = options;

      // Get discovered gifts from library, dropping recently suggested
      // names up front so history repeats never enter the pool (the
      // controller's post-filter would remove them anyway, but that
      // shrinks the batch below the requested count).
      let discoveredGifts = await this.getDiscoveredGifts(recipientProfile, budget);
      if (excludeNames.length > 0) {
        const excluded = new Set(excludeNames.map(name => name.toLowerCase()));
        discoveredGifts = discoveredGifts.filter(
          gift => !excluded.has((gift.name || '').toLowerCase())
        );
      }

      // If not enough discovered gifts, fall back to AI or supplement
      if (discoveredGifts.length < count * 0.5) {
        logger.debug('Insufficient discovered gifts, supplementing with AI');
        const supplementedResult = await this.supplementWithAI(discoveredGifts, recipientProfile, count, ai, excludeNames);
        
        // Add source information if requested
        if (includeSources) {
          return this.addSourceInformation(supplementedResult).slice(0, count);
        }
        
        return supplementedResult.slice(0, count);
      }

      // Select diverse gifts from discovered pool
      const selectedDiscovered = this.selectDiverseGifts(discoveredGifts, Math.ceil(count * this.discoveredGiftRatio));
      
      // Generate AI suggestions for remaining slots
      const aiSuggestionCount = count - selectedDiscovered.length;
      const aiSuggestions = aiSuggestionCount > 0
        ? await this.generatePersonalizedAISuggestions(recipientProfile, aiSuggestionCount, selectedDiscovered, ai, excludeNames)
        : [];

      // Combine and rank suggestions
      const combinedSuggestions = this.combineAndRankSuggestions(selectedDiscovered, aiSuggestions, recipientProfile);
      
      // Add source information if requested
      if (includeSources) {
        const suggestionsWithSources = this.addSourceInformation(combinedSuggestions);
        return suggestionsWithSources.slice(0, count);
      }

      return combinedSuggestions.slice(0, count);
    } catch (error) {
      logger.error('Hybrid suggestion generation failed:', error.message);
      // A failed AI is not asked again through the fallback below
      if (isAiError(error)) throw error;
      // Fallback to traditional AI suggestions
      return this.generateTraditionalSuggestions(recipientProfile, options.count || 5, options.ai || {}, options.excludeNames || []);
    }
  }

  async getDiscoveredGifts(recipientProfile, budget) {
    const {
      age,
      gender,
      interests,
      relationship,
      occasion
    } = recipientProfile;

    // Build query based on recipient profile
    const query = {
      status: 'active',
      ...PRICED
    };

    // Add budget constraint
    if (budget) {
      // Gifts that can be had within the price guide (no slack above it)
      query['priceRange.min'] = { $lte: budget };
    }

    // Add demographic constraints
    if (age) {
      query['demographics.ageRange.0'] = { $lte: age };
      query['demographics.ageRange.1'] = { $gte: age };
    }

    if (gender && gender !== 'all') {
      query['demographics.gender'] = gender;
    }

    if (interests && interests.length) {
      query['demographics.interests'] = { $in: interests };
    }

    if (occasion) {
      query.occasions = occasion;
    }

    // Execute query with sorting by popularity
    // Never carry other accounts' legacy feedback along with library gifts
    const gifts = await GiftLibrary.find(query, '-feedbackHistory')
      .sort({ popularityScore: -1 })
      .limit(100)
      .lean();

    // If no exact matches, try broader search
    if (gifts.length < 10) {
      const broaderQuery = { status: 'active', ...PRICED };
      const conditions = [];
      
      if (budget) {
        broaderQuery['priceRange.min'] = { $lte: budget };
      }

      if (age) conditions.push(fitsAge(age));
      
      if (interests && interests.length) {
        conditions.push({
          $or: [
            { categories: { $in: interests } },
            { tags: { $in: interests } }
          ]
        });
      }
      if (conditions.length) broaderQuery.$and = conditions;
      
      if (occasion) {
        broaderQuery.occasions = occasion;
      }
      
      const additionalGifts = await GiftLibrary.find(broaderQuery, '-feedbackHistory')
        .sort({ popularityScore: -1 })
        .limit(50)
        .lean();

      // The broader query can re-match gifts the narrow query already
      // returned — dedupe by _id so the same product can't appear twice
      // in the final suggestion set.
      const seenIds = new Set(gifts.map((g) => String(g._id)));
      for (const gift of additionalGifts) {
        if (!seenIds.has(String(gift._id))) {
          seenIds.add(String(gift._id));
          gifts.push(gift);
        }
      }
    }

    // Score and rank gifts based on recipient profile
    return this.scoreGiftsForRecipient(gifts.map(withoutNumbering), recipientProfile);
  }

  scoreGiftsForRecipient(gifts, recipientProfile) {
    return gifts.map(gift => {
      let score = gift.popularityScore || 0;
      
      // Interest match bonus
      if (recipientProfile.interests) {
        const matchingInterests = (gift.categories || []).filter(cat =>
          recipientProfile.interests.includes(cat)
        ).length;
        score += matchingInterests * 10;
      }
      
      // Age match bonus
      if (recipientProfile.age && gift.demographics && gift.demographics.ageRange) {
        const [minAge, maxAge] = gift.demographics.ageRange;
        if (recipientProfile.age >= minAge && recipientProfile.age <= maxAge) {
          score += 15;
        }
      }
      
      // Occasion match bonus
      if (recipientProfile.occasion && gift.occasions) {
        if (gift.occasions.includes(recipientProfile.occasion)) {
          score += 20;
        }
      }
      
      // Price appropriateness bonus
      if (recipientProfile.budget && gift.priceRange) {
        const priceDiff = Math.abs(gift.priceRange.min - recipientProfile.budget);
        if (priceDiff < recipientProfile.budget * 0.1) { // Within 10% of budget
          score += 10;
        }
      }
      
      return { ...gift, matchScore: score };
    }).sort((a, b) => b.matchScore - a.matchScore);
  }

  selectDiverseGifts(gifts, count) {
    if (gifts.length <= count) return gifts;

    // Weighted shuffle (Efraimidis-Spirakis) of the top candidates so
    // repeated requests rotate through the strong options instead of
    // deterministically returning the same top-scored gifts every time.
    const pool = gifts
      .slice(0, Math.max(count * 3, 10))
      .map(gift => ({
        gift,
        sortKey: Math.pow(Math.random(), 1 / Math.max(gift.matchScore || 0, 1))
      }))
      .sort((a, b) => b.sortKey - a.sortKey)
      .map(({ gift }) => gift);

    const selected = [];
    const categories = new Set();
    const priceRanges = new Set();

    // First, select the highest-weighted gift
    selected.push(pool[0]);
    const firstGiftCategory = pool[0].categories && pool[0].categories.length > 0 ? pool[0].categories[0] : 'unknown';
    categories.add(firstGiftCategory);
    priceRanges.add(this.getPriceRange(pool[0].priceRange));

    // Select remaining gifts with diversity
    for (let i = 1; i < pool.length && selected.length < count; i++) {
      const gift = pool[i];
      const giftCategory = gift.categories && gift.categories.length > 0 ? gift.categories[0] : 'unknown';
      const giftPriceRange = this.getPriceRange(gift.priceRange);
      
      // Calculate diversity score
      let diversityScore = 0;
      
      // Category diversity
      if (!categories.has(giftCategory)) {
        diversityScore += 1;
      }
      
      // Price range diversity
      if (!priceRanges.has(giftPriceRange)) {
        diversityScore += 1;
      }
      
      // Add gift if it contributes to diversity or if we need more items
      if (diversityScore > 0 || selected.length < count / 2) {
        selected.push(gift);
        categories.add(giftCategory);
        priceRanges.add(giftPriceRange);
      }
    }

    // Backfill if the diversity walk didn't reach the requested count
    for (let i = 1; i < pool.length && selected.length < count; i++) {
      if (!selected.includes(pool[i])) {
        selected.push(pool[i]);
      }
    }

    return selected;
  }

  getPriceRange(priceRange) {
    if (!priceRange) return 'unknown';
    const avg = (priceRange.min + priceRange.max) / 2;
    if (avg < 25) return 'budget';
    if (avg < 50) return 'moderate';
    if (avg < 100) return 'premium';
    return 'luxury';
  }

  async generatePersonalizedAISuggestions(recipientProfile, count, existingGifts, aiOpts = {}, excludeNames = []) {
    // Prepare context for AI to avoid duplicating existing gifts in
    // this batch as well as recently suggested gifts (history).
    const existingGiftNames = existingGifts.map(g => g.name);
    const existingCategories = [...new Set(existingGifts.flatMap(g => g.categories || []))];

    const aiContext = {
      avoid: [...new Set([...existingGiftNames, ...excludeNames])],
      preferCategories: recipientProfile.interests ? recipientProfile.interests.filter(i => !existingCategories.includes(i)) : [],
      targetCount: count,
      count: count,
      ai: aiOpts
    };
    
    // Call existing AI service with context
    const aiSuggestions = await aiSuggestionService.generateGiftSuggestions(recipientProfile, aiContext);
    
    // Ensure we have an array
    const suggestionsArray = Array.isArray(aiSuggestions) ? aiSuggestions : [];
    
    // Format AI suggestions to match our structure
    return suggestionsArray.map(suggestion => ({
      name: suggestion.name,
      description: suggestion.description,
      priceRange: { 
        min: (suggestion.estimatedPrice || 30) * 0.8, 
        max: (suggestion.estimatedPrice || 30) * 1.2 
      },
      categories: suggestion.categories || [],
      tags: suggestion.tags || [],
      source: 'ai_generated',
      matchScore: suggestion.confidenceScore || 50
    }));
  }

  async supplementWithAI(discoveredGifts, recipientProfile, count, aiOpts = {}, excludeNames = []) {
    const neededCount = Math.max(1, count - discoveredGifts.length);

    try {
      const aiSuggestions = await this.generatePersonalizedAISuggestions(
        recipientProfile,
        neededCount,
        discoveredGifts,
        aiOpts,
        excludeNames
      );

      const combined = this.combineAndRankSuggestions(discoveredGifts, aiSuggestions, recipientProfile);

      // Ensure we return at least some suggestions
      if (combined.length === 0) {
        return this.generateTraditionalSuggestions(recipientProfile, count, aiOpts, excludeNames);
      }
      
      return combined.slice(0, count);
    } catch (error) {
      logger.error('supplementWithAI failed:', error.message);
      // With no library gifts to show, a failed AI is the answer: say so
      if (isAiError(error) && discoveredGifts.length === 0) throw error;
      return this.combineAndRankSuggestions(discoveredGifts, [], recipientProfile).slice(0, count);
    }
  }

  combineAndRankSuggestions(discoveredGifts, aiSuggestions, recipientProfile) {
    const safeDiscoveredGifts = Array.isArray(discoveredGifts) ? discoveredGifts : [];
    const safeAISuggestions = Array.isArray(aiSuggestions) ? aiSuggestions : [];

    // Combine with explicit source attribution. We also map the
    // hybrid-internal scoring fields (matchScore, popularityScore) onto
    // the shape the unified reranker expects (relevanceScore + category
    // + tags + estimatedPrice) so all four suggestion modes share the
    // same feedback-aware ranking.
    const allSuggestions = [
      ...safeDiscoveredGifts.map(gift => ({
        ...gift,
        source: gift.source || 'discovered',
        relevanceScore: gift.matchScore ?? gift.popularityScore ?? 50,
        // GiftLibrary docs store categories as an array; the reranker
        // expects a single `category`. Pick the most specific (first).
        category: Array.isArray(gift.categories) && gift.categories.length > 0
          ? gift.categories[0]
          : gift.category || 'Uncategorized',
        estimatedPrice: gift.estimatedPrice
          ?? (gift.priceRange ? (gift.priceRange.min + gift.priceRange.max) / 2 : undefined),
      })),
      ...safeAISuggestions.map(suggestion => ({
        ...suggestion,
        source: suggestion.source || 'ai_generated',
        relevanceScore: suggestion.relevanceScore ?? suggestion.matchScore ?? 50,
      })),
    ];

    // Apply the unified feedback-aware reranker. Hybrid mode now picks
    // its final set the same way Enhanced does — using budget fit,
    // recipient preferences, personalization signals, and MMR diversity
    // — rather than relying on raw popularity + a +5 discovered bias.
    //
    // Source preference (slight boost for verified discovered gifts) is
    // preserved by adding it back after the reranker scores everything.
    const rerankContext = {
      recipient: this._adaptRecipientProfile(recipientProfile),
      recipientPreferences: recipientProfile?.recipientPreferences,
      categoryTrends: recipientProfile?.categoryTrends,
      tagTrends: recipientProfile?.tagTrends,
      negativeFeedback: recipientProfile?.negativeFeedback,
      finalCount: aiConfig.enhanced.finalCount || allSuggestions.length,
    };

    const ranked = reranker.rerank(allSuggestions, rerankContext);

    // Preserve the small source-preference boost from the previous
    // implementation so verified discovered gifts still float up when
    // scores are otherwise tied. Five points is well within MMR noise
    // so it acts as a tiebreaker, not a dominating signal.
    return ranked
      .map(s => ({
        ...s,
        rerankScore: (s.rerankScore || 0) + (s.source === 'discovered' ? 5 : 0),
      }))
      .sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0));
  }

  /**
   * Translate the hybrid-service `recipientProfile` shape into the
   * shape the reranker expects (matches the Recipient mongoose doc).
   * Only the budget fields are needed for scoring; interests/hobbies
   * are already on the profile.
   */
  _adaptRecipientProfile(recipientProfile) {
    if (!recipientProfile) return {};
    return {
      minimumPriceBudget: recipientProfile.minBudget,
      maximumPriceBudget: recipientProfile.budget,
      interests: recipientProfile.interests,
      hobbies: recipientProfile.hobbies,
    };
  }

  addSourceInformation(suggestions) {
    if (!suggestions || !Array.isArray(suggestions)) {
      logger.warn('addSourceInformation: Invalid suggestions input');
      return [];
    }
    
    return suggestions.map(suggestion => {
      if (!suggestion) return suggestion;
      
      return {
        ...suggestion,
        sourceDetails: {
          type: suggestion.source || 'unknown',
          url: suggestion.sourceUrl || null,
          discoveryDate: suggestion.discoveryDate || null,
          isVerified: suggestion.source === 'discovered',
          popularity: suggestion.popularityScore || null
        }
      };
    });
  }

  async generateTraditionalSuggestions(recipientProfile, count, aiOpts = {}, excludeNames = []) {
    // Fallback to existing AI-only suggestion service
    return aiSuggestionService.generateGiftSuggestions(recipientProfile, { count, ai: aiOpts, avoid: excludeNames });
  }

  // Utility method to check if hybrid system is healthy
  async isHybridSystemHealthy() {
    try {
      // Use aggregate instead of countDocuments for better compatibility
      const [giftStats, recentStats] = await Promise.all([
        GiftLibrary.aggregate([
          { $match: { status: 'active' } },
          { $group: { _id: null, totalGifts: { $sum: 1 } } }
        ]),
        GiftLibrary.aggregate([
          { 
            $match: { 
              status: 'active',
              discoveryDate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            }
          },
          { $group: { _id: null, recentGifts: { $sum: 1 } } }
        ])
      ]);
      
      const giftCount = giftStats[0]?.totalGifts || 0;
      const recentGifts = recentStats[0]?.recentGifts || 0;
      
      const result = {
        isHealthy: giftCount > this.minLibrarySize,
        totalGifts: giftCount,
        recentGifts,
        lastDiscovery: await GiftLibrary.findOne().sort({ discoveryDate: -1 }).select('discoveryDate')
      };
      
      logger.debug(`[HybridSuggestionService] System health check: ${giftCount} gifts, ${recentGifts} recent, ${result.isHealthy ? 'healthy' : 'needs attention'}`);
      return result;
    } catch (error) {
      logger.error('Health check failed:', error);
      return { isHealthy: false, error: error.message };
    }
  }
}

module.exports = new HybridSuggestionService();
