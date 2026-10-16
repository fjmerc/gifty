const axios = require('axios');
const Recipient = require('../models/Recipient');
const Event = require('../models/Event');
const enhancedAiService = require('./enhancedAiService');
const { applyPriceGuide } = require('../utils/priceGuide');
const { normalizeUrl, buildWebSources, isAboutSuggestion } = require('../utils/webSources');
const logger = require('../utils/logger'); // Import the logger

// Read when used, so the operator's key (and tests) apply without a reload
const braveKey = () => process.env.BRAVE_SEARCH_API_KEY;

// Brave allows one request per second. The gap is measured from when the
// previous request *finished*, so a slow answer cannot make the next request
// start inside the provider's window (which answered 429 before).
const RATE_LIMIT_DELAY = 1100;
let lastRequestEnd = 0;

// Performance configuration - limit web enrichment to avoid timeouts
const MAX_WEB_ENRICHED_SUGGESTIONS = 2; // Only enrich top 2 suggestions to stay under 30s timeout
const WEB_SEARCH_TIMEOUT = 5000; // 5 second timeout per web search request

// Add delay function
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Perform a rate-limited Brave web search
 * @param {String} query - Search query
 * @param {Object} options - { count, freshness }
 * @returns {Array} Web search results
 */
// Searches from concurrent generations run one at a time through this
// queue, so the gap holds across requests too
let braveQueue = Promise.resolve();
function braveSearch(query, options) {
  const run = braveQueue.then(() => braveSearchNow(query, options));
  braveQueue = run.catch(() => {});
  return run;
}

async function braveSearchNow(query, { count, freshness }) {
  const wait = RATE_LIMIT_DELAY - (Date.now() - lastRequestEnd);
  if (wait > 0) {
    logger.info(`[webSearchAiService] Rate limiting: waiting ${wait}ms`);
    await delay(wait);
  }
  try {
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      params: { q: query, count, freshness },
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': braveKey()
      },
      timeout: WEB_SEARCH_TIMEOUT
    });
    return response.data.web?.results || [];
  } finally {
    lastRequestEnd = Date.now();
  }
}

/**
 * Get gift suggestions enhanced with real-time web search data. Web search
 * problems never fail the request: each suggestion records how its search
 * went (webSearch: ok | no_results | failed | rate_limited | skipped) and the totals say
 * whether any search worked, so the page can warn honestly. Errors from the
 * AI step itself (typed, 502) are passed on.
 * @returns {{ suggestions: Array, braveUrls: String[], webSearch: { configured, attempted, succeeded, rateLimited } }}
 */
exports.getWebEnhancedGiftSuggestions = async (recipientId, eventId, userId, opts = {}) => {
  try {
    logger.info('[webSearchAiService] Getting web-enhanced gift suggestions...');

    // Get recipient and event info
    const recipient = await Recipient.findById(recipientId).populate('tags');
    const event = await Event.findById(eventId);

    if (!recipient || !event) {
      logger.info('[webSearchAiService] Recipient or event not found');
      throw new Error('Recipient or event not found');
    }
    applyPriceGuide(recipient, opts.priceGuide);

    // Get AI-generated suggestions first, threading through the user's
    // chosen AI provider/model so web mode honors their preference too.
    logger.info('[webSearchAiService] Getting AI suggestions...');
    const aiSuggestions = await enhancedAiService.getEnhancedGiftSuggestions(recipientId, eventId, userId, opts);

    const configured = Boolean(braveKey());
    if (!configured) {
      logger.warn('[webSearchAiService] Brave Search API key not configured');
    }

    // Only the top suggestions are searched, to stay inside the route
    // timeout. Each suggestion is searched by its own name, and only that
    // search's results are attached to it: the AI never supplies a link.
    const braveUrls = [];
    const suggestions = [];
    for (const [index, aiSuggestion] of aiSuggestions.entries()) {
      const suggestion = { ...aiSuggestion, webSources: [] };
      if (!configured || index >= MAX_WEB_ENRICHED_SUGGESTIONS) {
        suggestions.push({ ...suggestion, webSearch: 'skipped' });
      } else {
        suggestions.push(await enrichSuggestionWithWebSearch(suggestion, braveUrls));
      }
    }
    // For a live check: which pages the search returned in this generation
    logger.debug({ message: '[webSearchAiService] Brave result URLs', urls: braveUrls });

    const attempted = suggestions.filter((s) => s.webSearch !== 'skipped').length;
    const succeeded = suggestions.filter((s) => s.webSearch === 'ok').length;
    const rateLimited = suggestions.some((s) => s.webSearch === 'rate_limited');
    logger.info(`[webSearchAiService] Web search worked for ${succeeded} of ${attempted} suggestions`);

    return { suggestions, braveUrls, webSearch: { configured, attempted, succeeded, rateLimited } };
  } catch (error) {
    logger.error('[webSearchAiService] Error:', error.detail || error.message);
    // A typed AI failure (502) reaches the user as it is
    if (error.statusCode) throw error;
    throw new Error('Failed to generate web-enhanced gift suggestions');
  }
};

/**
 * Check a suggestion against the web: search for it and attach the pages
 * found (webSources: title, url, host; http(s) only, at most 3). Nothing
 * else is taken from the results: no price, availability or rating. Never
 * throws: a failed search leaves the suggestion as it was, marked.
 * @param {Object} suggestion - AI-generated suggestion (webSources: [])
 * @param {String[]} braveUrls - collects every URL the search returned
 * @returns {Object} The suggestion with webSearch (and webSources) set
 */
async function enrichSuggestionWithWebSearch(suggestion, braveUrls) {
  const searchQuery = constructProductSearchQuery(suggestion);
  logger.info('[webSearchAiService] Searching for:', searchQuery);
  try {
    // Past week freshness for current information
    const webData = await braveSearch(searchQuery, { count: 5, freshness: 'pw' });
    const returned = webData.map((result) => normalizeUrl(result && result.url)).filter(Boolean);
    braveUrls.push(...returned);
    // An answer without results found nothing: not a search that worked
    if (webData.length === 0) return { ...suggestion, webSearch: 'no_results' };
    // Only results about this gift become links; none may pass
    const relevant = webData.filter((result) => isAboutSuggestion(result, suggestion.name));
    return { ...suggestion, webSearch: 'ok', webSources: buildWebSources(relevant, new Set(returned)) };
  } catch (error) {
    const status = error.response?.status;
    // The status only: Brave's headers carry the instance's plan and quota
    logger.warn(`[webSearchAiService] Web search failed (${status || error.code || error.message})`);
    return { ...suggestion, webSearch: status === 429 ? 'rate_limited' : 'failed' };
  }
}

/**
 * The search for a suggestion: its name, plus its category at most
 * @param {Object} suggestion - Gift suggestion
 * @returns {String} Search query
 */
function constructProductSearchQuery(suggestion) {
  let query = `${suggestion.name}`;
  
  if (suggestion.category && suggestion.category !== 'Uncategorized') {
    query += ` ${suggestion.category}`;
  }
  // Nothing else: shopping words ("price review where to buy") pulled in
  // generic listicles unrelated to the gift
  return query;
}
