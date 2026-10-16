const aiConfig = require('../config/aiConfig');
const reranker = require('./suggestionRerankerService');
const aiProviderService = require('./ai/aiProviderService');
const { safeExtractJson } = require('../utils/safeJson');
const { badOutput, providerFailed, isUsableSuggestion } = require('../utils/aiErrors');
const { readSuggestionPrice } = require('../utils/suggestionPrice');
const logger = require('../utils/logger');

/**
 * Get AI-powered gift suggestions
 * @param {String} prompt - User prompt with recipient details
 * @param {Array} recipientTags - Array of tags associated with the recipient
 * @param {Object} [opts] - Optional overrides
 * @param {String} [opts.provider] - AI provider id (openai|anthropic|gemini)
 * @param {String} [opts.model] - Model id for the provider
 * @returns {Array} Array of gift suggestions
 */
exports.getAISuggestions = async (prompt, recipientTags = [], opts = {}) => {
    try {
        logger.debug('[aiService] Generating gift suggestions...');

        // Input validation
        if (!prompt || typeof prompt !== 'string') {
            throw new Error('Invalid prompt: prompt must be a non-empty string');
        }

        if (prompt.length < 10) {
            throw new Error('Invalid prompt: prompt is too short (minimum 10 characters)');
        }

        if (prompt.length > 10000) {
            logger.warn('[aiService] Prompt is very long, truncating to 10000 characters');
            prompt = prompt.substring(0, 10000);
        }

        // Validate recipientTags
        if (!Array.isArray(recipientTags)) {
            logger.warn('[aiService] recipientTags is not an array, converting to empty array');
            recipientTags = [];
        }

        // Filter out invalid tags
        recipientTags = recipientTags.filter(tag => typeof tag === 'string' && tag.trim().length > 0);

        logger.debug('[aiService] Recipient tags:', recipientTags);

        // Create a structured system prompt with clear sections
        const systemPrompt = createStructuredSystemPrompt(recipientTags);
        logger.debug('[aiService] System prompt created with length:', systemPrompt.length);

        // Route through the provider abstraction. If the caller didn't
        // pick a provider/model, we fall back to env defaults; if that
        // provider is misconfigured or fails, the facade cascades.
        const response = await aiProviderService.complete({
            systemPrompt,
            userPrompt: prompt,
            provider: opts.provider,
            // No model chosen: the registry uses aiConfig's model for the mode
            model: opts.model,
            mode: 'basic',
            temperature: aiConfig.basic.temperature,
            maxTokens: aiConfig.basic.maxTokens,
            jsonMode: true,
            telemetry: opts.telemetry,
        }).catch((error) => { throw providerFailed(error); });

        const rawSuggestions = response.content;
        logger.debug('[aiService] Raw AI response received with length:', rawSuggestions.length, `(${response.provider}/${response.model})`);

        // Parse the raw suggestions into structured data
        const parsedSuggestions = exports.parseSuggestions(rawSuggestions, recipientTags);
        logger.debug('[aiService] Parsed suggestions:', parsedSuggestions.length);

        // Re-rank candidates with diversity (MMR). Basic mode has no
        // recipient/feedback context so this mostly enforces diversity
        // across category/price tier and trims to finalCount.
        const reranked = reranker.rerank(parsedSuggestions, {
            finalCount: aiConfig.basic.finalCount,
        });
        logger.debug('[aiService] Re-ranked to:', reranked.length);

        // Stamp the actual provider+model that ran this generation
        // onto each suggestion so the controller can persist it on
        // the Gift and the UI can render a badge.
        return reranked.map((s) => ({
            ...s,
            aiProvider: response.provider,
            aiModel: response.model,
        }));

    } catch (error) {
        logger.error('[aiService] Error generating suggestions:', error.detail || error.cause?.message || error.message);
        // A typed AI failure (502) reaches the user as it is
        if (error.statusCode) throw error;
        throw new Error('Failed to generate gift suggestions');
    }
};

/**
 * Create a structured system prompt with clear sections
 * @param {Array} recipientTags - Array of tags associated with the recipient
 * @returns {String} Structured system prompt
 */
function createStructuredSystemPrompt(recipientTags = []) {
    return `# GIFT CONSULTANT ROLE

## RESPONSE FORMAT

You MUST respond with a valid JSON object using this exact structure:

{
  "suggestions": [
    {
      "name": "Specific Gift Name",
      "description": "Detailed personalized description explaining why this gift is perfect for this recipient",
      "category": "Primary Category",
      "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
      "estimatedPrice": 50.00,
      "priceRange": { "min": 40, "max": 60 },
      "whereToBuy": ["Store1", "Store2", "Website"],
      "relationshipRelevance": "Explanation of why this gift suits your relationship"
    }
  ]
}

# GIFT CONSULTANT ROLE

You are an expert gift consultant with deep expertise in personalized gift-giving. 
${recipientTags.length > 0 ? `The recipient has been tagged with these descriptors: ${recipientTags.join(', ')}. 
These tags represent core aspects of their identity and preferences and MUST be central to your gift recommendations.` : ''}

# PERSONALIZATION PRIORITIES (RANKED)

1. SAFETY CONSTRAINTS (HIGHEST PRIORITY)
   - Allergies and dietary restrictions must NEVER be violated
   - Living situation limitations must be respected
   - Age-appropriate gifts only

2. RECIPIENT-SPECIFIC ELEMENTS (HIGH PRIORITY)
   - Individual interests, hobbies, and passions
   - Personal style and aesthetic preferences
   - Specific needs based on lifestyle and occupation
   - Cultural background and values

3. RELATIONSHIP CONTEXT (HIGH PRIORITY)
   - Nature and length of relationship
   - Shared history and experiences
   - Appropriate level of intimacy/sentimentality
   - Previous gift exchanges and their reception

4. PRACTICAL CONSIDERATIONS (MEDIUM PRIORITY)
   - Budget constraints (every suggestion must be within the stated budget range)
   - Occasion appropriateness
   - Availability and accessibility
   - Long-term usefulness and value

# GIFT SUGGESTION REQUIREMENTS

Each suggestion MUST include:
- Specific product name (not generic categories)
- Detailed explanation of why it's perfect for THIS recipient
- Explicit references to recipient's unique traits/interests
- Primary category and 3-5 relevant tags
- Accurate price range (min-max)
- 2-3 specific purchase locations
- Relationship context relevance
- Occasion appropriateness

# CRITICAL CONSTRAINTS TO FOLLOW

- NEVER suggest items containing allergens mentioned
- NEVER suggest items impractical for living situation
- NEVER suggest items violating dietary restrictions
- NEVER suggest items that are too similar to previously shown gifts
- ALWAYS respect budget range - every suggestion must be priced within it
- ALWAYS consider relationship context for sentimental items
- ALWAYS prioritize diversity in your suggestions
- AVOID generic suggestions without specific products
- AVOID obvious choices lacking personalization
- AVOID extremely expensive items far beyond budget
- Do NOT name a specific product or brand you cannot price realistically; give its real retail price, and if no real product fits the budget, suggest a kind of gift instead of bending a price to fit
- AVOID repetitive suggestions in the same category

# SUGGESTION FORMAT

Follow the JSON structure specified above. Each suggestion object should include:

- "name": Specific product name (be precise, not generic)
- "description": Detailed explanation of why this gift is meaningful for THIS SPECIFIC recipient
- "category": Primary gift category (e.g., Electronics, Fashion, Books, Experience)
- "tags": Array of 3-5 relevant tags that describe this gift
- "estimatedPrice": Numerical price value without currency symbols
- "priceRange": Object with "min" and "max" numerical values
- "whereToBuy": Array of 2-3 specific stores or websites
- "relationshipRelevance": Brief note about how this gift connects to the relationship

# SUGGESTION DIVERSITY

Provide exactly ${aiConfig.basic.candidateCount} suggestions with this mix (all within the stated budget range):
- One uniquely creative option matching their interests
- One that specifically emphasizes relationship context
- One practical item for their everyday life

# EXAMPLES OF POOR SUGGESTIONS TO AVOID

- "Generic Gift Card" (too impersonal unless specifically requested)
- "Subscription Box" (too vague without specifying which exact box)
- Suggesting cookware for someone with a tiny kitchen and no storage
- Suggesting anything containing allergens explicitly mentioned to avoid
- Suggesting intimate gifts for professional relationships
- Extremely expensive items far beyond the indicated budget range`;
}

/**
 * Parse the model's JSON answer into structured suggestions. The answer must
 * be a JSON object with a "suggestions" array; anything else is unreadable
 * (AI_BAD_OUTPUT), never replaced by a placeholder gift. Suggestions without
 * a name or a usable price are skipped; when the model sent some and none
 * is usable, the answer is unreadable too.
 * @param {String|Object} rawSuggestions - The model's answer
 * @param {Array} recipientTags - Array of tags associated with the recipient
 * @returns {Array} Array of structured gift suggestions (may be empty)
 */
exports.parseSuggestions = function(rawSuggestions, recipientTags = []) {
    const json = typeof rawSuggestions === 'string'
        ? safeExtractJson(rawSuggestions, 'aiService')
        : rawSuggestions;
    if (!json || !Array.isArray(json.suggestions)) {
        throw badOutput(`no suggestions array in: ${String(rawSuggestions).substring(0, 200)}`);
    }
    const parsed = json.suggestions
        .filter((suggestion) => suggestion && typeof suggestion === 'object')
        .map((suggestion) => processStructuredSuggestion(suggestion, recipientTags));
    const usable = parsed.filter(isUsableSuggestion);
    if (usable.length < json.suggestions.length) {
        logger.warn(`[aiService] Skipped ${json.suggestions.length - usable.length} suggestion(s) without a name or price`);
    }
    if (json.suggestions.length > 0 && usable.length === 0) {
        throw badOutput('no suggestion had a name and a price');
    }
    return usable;
};

/**
 * Process a structured suggestion (from JSON format)
 * @param {Object} suggestion - Structured suggestion object
 * @param {Array} recipientTags - Array of tags associated with the recipient
 * @returns {Object} Standardized gift suggestion
 */
function processStructuredSuggestion(suggestion, recipientTags = []) {
    try {
        // Extract tags
        let tags = [];
        if (suggestion.tags) {
            if (Array.isArray(suggestion.tags)) {
                tags = suggestion.tags;
            } else if (typeof suggestion.tags === 'string') {
                tags = suggestion.tags.split(/,\s*/).map(tag => tag.trim()).filter(tag => tag);
            }
        }
        
        // Extract price range
        let minPrice = null;
        let maxPrice = null;
        let estimatedPrice = suggestion.estimatedPrice;
        
        if (suggestion.priceRange) {
            // Handle string format like "$25-$50" or "$25 to $50"
            if (typeof suggestion.priceRange === 'string') {
                const priceMatch = suggestion.priceRange.match(/\$?(\d+(?:\.\d{1,2})?)[^\d]+\$?(\d+(?:\.\d{1,2})?)/);
                if (priceMatch) {
                    minPrice = parseFloat(priceMatch[1]);
                    maxPrice = parseFloat(priceMatch[2]);
                }
            } 
            // Handle object format like {min: 25, max: 50}
            else if (typeof suggestion.priceRange === 'object') {
                minPrice = suggestion.priceRange.min;
                maxPrice = suggestion.priceRange.max;
            }
        }
        
        // Extract purchase locations
        let whereToBuy = [];
        if (suggestion.whereToBuy) {
            if (Array.isArray(suggestion.whereToBuy)) {
                whereToBuy = suggestion.whereToBuy;
            } else if (typeof suggestion.whereToBuy === 'string') {
                whereToBuy = suggestion.whereToBuy.split(/,\s*/).map(place => place.trim()).filter(place => place);
            }
        }
        
        // Calculate relevance score
        const relevanceScore = calculateRelevanceScore(
            suggestion.name, 
            suggestion.description, 
            suggestion.primaryCategory || suggestion.category, 
            tags, 
            estimatedPrice, 
            { min: minPrice, max: maxPrice }, 
            whereToBuy, 
            suggestion.relationshipContext || suggestion.relationshipRelevance, 
            recipientTags
        );
        
        // The model's price, else the middle of its range; never a constant
        const price = readSuggestionPrice(estimatedPrice, minPrice, maxPrice);

        // Create the standardized suggestion object
        return {
            name: suggestion.name,
            description: suggestion.description || '',
            category: suggestion.primaryCategory || suggestion.category || 'Uncategorized',
            tags: tags.length > 0 ? tags : ['gift'],
            estimatedPrice: price.estimatedPrice,
            priceRange: price.priceRange,
            whereToBuy: whereToBuy.length > 0 ? whereToBuy : ['Online retailers'],
            relevanceScore: relevanceScore,
            relationshipRelevance: suggestion.relationshipContext || suggestion.relationshipRelevance || '',
            occasionRelevance: suggestion.occasionRelevance || ''
        };
    } catch (error) {
        logger.error('[aiService] Error processing JSON suggestion:', error);
        return null;
    }
}

/**
 * Calculate relevance score for a suggestion
 * @param {String} name - Suggestion name
 * @param {String} description - Suggestion description
 * @param {String} category - Suggestion category
 * @param {Array} tags - Suggestion tags
 * @param {Number} estimatedPrice - Estimated price
 * @param {Object} priceRange - Price range object with min and max
 * @param {Array} whereToBuy - Where to buy locations
 * @param {String} relationshipRelevance - Relationship relevance
 * @param {Array} recipientTags - Recipient tags
 * @returns {Number} Relevance score (0-100)
 */
function calculateRelevanceScore(name, description, category, tags, estimatedPrice, priceRange, whereToBuy, relationshipRelevance, recipientTags) {
    let score = 50; // Base score
    
    // Add points for completeness
    if (name) score += 5;
    if (description && description.length > 50) score += 10;
    if (category) score += 5;
    if (tags && tags.length >= 3) score += 5;
    if (estimatedPrice) score += 5;
    if (priceRange && priceRange.min && priceRange.max) score += 5;
    if (whereToBuy && whereToBuy.length >= 2) score += 5;
    if (relationshipRelevance && relationshipRelevance.length > 20) score += 10;
    
    // Boost score if the suggestion incorporates recipient tags
    if (recipientTags && recipientTags.length > 0) {
        // Check if any recipient tags appear in the name, description or suggested tags
        const suggestionText = `${name || ''} ${description || ''} ${(tags || []).join(' ')}`.toLowerCase();
        const tagMatches = recipientTags.filter(tag => 
            suggestionText.includes(tag.toLowerCase())
        ).length;
        
        // Bonus points for tag matches (up to 15 points)
        if (tagMatches > 0) {
            const tagBonus = Math.min(tagMatches * 5, 15);
            score += tagBonus;
        }
    }
    
    // Cap at 100
    return Math.min(score, 100);
}
