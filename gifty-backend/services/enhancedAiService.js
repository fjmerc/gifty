const Recipient = require('../models/Recipient');
const Event = require('../models/Event');
const trendAnalysisService = require('./trendAnalysisService');
const FeedbackLog = require('../models/FeedbackLog');
const SuggestionHistory = require('../models/SuggestionHistory');
const aiConfig = require('../config/aiConfig');
const reranker = require('./suggestionRerankerService');
const aiProviderService = require('./ai/aiProviderService');
const { safeExtractJson } = require('../utils/safeJson');
const { badOutput, providerFailed, isUsableSuggestion } = require('../utils/aiErrors');
const { applyPriceGuide, formatGuidePrice } = require('../utils/priceGuide');
const { readSuggestionPrice } = require('../utils/suggestionPrice');
const { checkConstraintViolations } = require('../utils/suggestionUtilsEnhanced');
const { present, oneLine, fieldLines, localeLine } = require('../utils/promptFields');
const asList = (items) => items.filter(present).map(oneLine).join(', ');
const logger = require('../utils/logger');

/**
 * Get enhanced gift suggestions with personalized preference data
 * @param {String} recipientId - ID of the recipient
 * @param {String} eventId - ID of the event
 * @param {String} userId - ID of the user
 * @returns {Array} Array of gift suggestions
 */
exports.getEnhancedGiftSuggestions = async (recipientId, eventId, userId, opts = {}) => {
  try {
    logger.debug('[enhancedAiService] Getting enhanced gift suggestions...');
    logger.debug('[enhancedAiService] Parameters:', { recipientId, eventId, userId, provider: opts.provider, model: opts.model });
    
    // Get recipient and event info
    const [recipient, event] = await Promise.all([
      Recipient.findById(recipientId).populate('tags'),
      Event.findById(eventId),
    ]);

    if (!recipient || !event) {
      logger.debug('[enhancedAiService] Recipient or event not found');
      throw new Error('Recipient or event not found');
    }
    applyPriceGuide(recipient, opts.priceGuide);
    
    logger.debug('[enhancedAiService] Found recipient and event:', {
      recipient: `${recipient.firstName} ${recipient.lastName}`,
      tagCount: recipient.tags ? recipient.tags.length : 0,
      event: event.name
    });
    
    // Extract recipient tags for the AI service
    const recipientTagNames = recipient.tags && Array.isArray(recipient.tags) 
      ? recipient.tags.map(tag => tag.name)
      : [];
    logger.debug('[enhancedAiService] Recipient tags:', recipientTagNames);
    
    // Fetch all personalization signals in parallel — they're
    // independent reads, and running them sequentially used to add
    // their latencies together ahead of the (already slow) LLM call.
    logger.debug('[enhancedAiService] Fetching preference data...');
    const [recipientPreferences, categoryTrends, tagTrends, feedbackHistory, suggestionHistory] = await Promise.all([
      // The caller's own feedback only: other accounts never shape this prompt
      trendAnalysisService.analyzeRecipientPreferences(recipientId, {}, userId),
      trendAnalysisService.analyzeCategorySuccess({}, userId),
      trendAnalysisService.analyzeTagEffectiveness({}, userId),
      getFeedbackHistory(recipientId, userId),
      getSuggestionHistory(userId, recipientId),
    ]);

    logger.debug('[enhancedAiService] Preference data retrieved:', {
      categoryPreferencesCount: recipientPreferences.categoryPreferences.length,
      tagPreferencesCount: recipientPreferences.tagPreferences.length,
      categoryTrendsCount: categoryTrends.length,
      tagTrendsCount: tagTrends.length,
      positiveFeedbackCount: feedbackHistory.positive.length,
      negativeFeedbackCount: feedbackHistory.negative.length,
      suggestionHistoryCount: suggestionHistory.length
    });
    
    // Create the comprehensive system prompt
    const systemPrompt = constructComprehensiveSystemPrompt(
      recipient, 
      event, 
      recipientTagNames, 
      recipientPreferences, 
      feedbackHistory,
      suggestionHistory,
      opts.alreadyChosen || [],
      opts.locale || {}
    );
    logger.debug('[enhancedAiService] System prompt created with length:', systemPrompt.length);
    
    // Create the detailed user prompt
    const userPrompt = createDetailedUserPrompt(recipient, event, feedbackHistory, opts.locale || {});
    logger.debug('[enhancedAiService] User prompt created with length:', userPrompt.length);
    
    // Call the user-selected (or default) AI provider through the
    // facade. Enhanced mode is context-heavy, so picking a flagship
    // model here matters — provider abstraction handles cascading
    // failover if the requested provider is down.
    const response = await aiProviderService.complete({
      systemPrompt,
      userPrompt,
      provider: opts.provider,
      // No model chosen: the registry uses aiConfig's model for the mode
      model: opts.model,
      mode: 'enhanced',
      temperature: aiConfig.enhanced.temperature,
      maxTokens: aiConfig.enhanced.maxTokens,
      jsonMode: true,
      telemetry: {
        userId,
        recipientId,
        eventId,
      },
    }).catch((error) => { throw providerFailed(error); });

    const rawSuggestions = response.content;
    logger.debug('[enhancedAiService] Raw AI response received with length:', rawSuggestions.length, `(${response.provider}/${response.model})`);

    // Enhanced parser handling both JSON and structured text formats
    const parsedSuggestions = parseEnhancedSuggestions(rawSuggestions, recipientTagNames, recipient);
    logger.debug('[enhancedAiService] Parsed suggestions:', parsedSuggestions.length);

    // Validate suggestions against constraints
    const validatedSuggestions = validateSuggestionsAgainstConstraints(parsedSuggestions, recipient);
    logger.debug('[enhancedAiService] Validated suggestions:', validatedSuggestions.length);

    // Re-rank with feedback-aware MMR. We asked the model for more
    // candidates than we return; the re-ranker uses recipient
    // preferences, category/tag success rates, negative feedback, and
    // MMR diversity to pick the best subset.
    const negativeFeedback = (feedbackHistory.negative || []).map((n) => ({
      name: n.name, category: n.category, tags: n.tags || [],
    }));
    const rerankedSuggestions = reranker.rerank(validatedSuggestions, {
      recipient,
      recipientPreferences,
      categoryTrends,
      tagTrends,
      negativeFeedback,
      finalCount: aiConfig.enhanced.finalCount,
    });
    logger.debug('[enhancedAiService] Re-ranked to:', rerankedSuggestions.length);

    // Stamp which provider/model actually produced each suggestion
    // so the controller can persist this on the Gift document and the
    // UI can show it as a badge. The facade returns these on the
    // response; we propagate them onto each candidate.
    const stamped = rerankedSuggestions.map((s) => ({
      ...s,
      aiProvider: response.provider,
      aiModel: response.model,
    }));

    // History recording happens in the controller after it persists the
    // Gift docs — it has the event ID (required by the Gift schema) and
    // covers every suggestion mode, not just enhanced.
    return stamped;
  } catch (error) {
    logger.error('[enhancedAiService] Error getting enhanced gift suggestions:', error.detail || error.cause?.message || error.message);
    // A typed AI failure (502) reaches the user as it is
    if (error.statusCode) throw error;
    throw new Error('Failed to generate enhanced gift suggestions');
  }
};

/**
 * Get feedback history for a recipient
 * @param {String} recipientId - Recipient ID
 * @param {String} [userId] - Only this account's feedback
 * @returns {Object} Feedback history
 */
async function getFeedbackHistory(recipientId, userId) {
  try {
    const owner = userId ? { user: userId } : {};
    const [positiveFeedback, negativeFeedback] = await Promise.all([
      FeedbackLog.find({
        ...owner,
        recipient: recipientId,
        action: { $in: ['purchased', 'saved', 'favorited'] }
      })
        .sort('-timestamp')
        .limit(10)
        .populate('gift'),
      FeedbackLog.find({
        ...owner,
        recipient: recipientId,
        action: 'ignored'
      })
        .sort('-timestamp')
        .limit(10)
        .populate('gift'),
    ]);
    
    // Format the feedback for inclusion in the prompt
    const positive = positiveFeedback.map(feedback => ({
      name: feedback.gift?.name,
      category: feedback.gift?.category,
      tags: feedback.gift?.tags || [],
      price: feedback.gift?.price,
      action: feedback.action,
      rating: feedback.explicitRating
    })).filter(item => item.name);
    
    const negative = negativeFeedback.map(feedback => ({
      name: feedback.gift?.name,
      category: feedback.gift?.category,
      tags: feedback.gift?.tags || [],
      price: feedback.gift?.price,
      action: feedback.action
    })).filter(item => item.name);
    
    return { positive, negative };
  } catch (error) {
    logger.error('[enhancedAiService] Error getting feedback history:', error);
    return { positive: [], negative: [] };
  }
}

/**
 * Get suggestion history for a user and recipient
 * @param {String} userId - User ID
 * @param {String} recipientId - Recipient ID
 * @returns {Array} Suggestion history
 */
async function getSuggestionHistory(userId, recipientId) {
  try {
    if (!SuggestionHistory) return [];
    
    // Get recent suggestions for this user and recipient
    const history = await SuggestionHistory.find({
      user: userId,
      recipient: recipientId,
      // Only consider entries from the last 90 days
      shownAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
    }).sort('-shownAt').limit(20);
    
    // Format the history for inclusion in the prompt
    return history.map(entry => ({
      name: entry.giftMetadata?.name,
      category: entry.giftMetadata?.category,
      tags: entry.giftMetadata?.tags || [],
      price: entry.giftMetadata?.price,
      shownAt: entry.shownAt,
      interacted: entry.interacted,
      interactionType: entry.interactionType
    })).filter(item => item.name);
  } catch (error) {
    logger.error('[enhancedAiService] Error getting suggestion history:', error);
    return [];
  }
}

/**
 * Constructs a comprehensive system prompt for the AI
 */
function constructComprehensiveSystemPrompt(recipient, event, recipientTagNames, recipientPreferences, feedbackHistory, suggestionHistory = [], alreadyChosen = [], locale = {}) {
  // Build the expert shopper prompt with clear sections
  let prompt = `# GIFT CONSULTANT ROLE AND OBJECTIVE

You are a master gift consultant with exceptional expertise in personalized gift-giving. 
Your suggestions must be extraordinarily specific and thoughtful, tailored precisely to the recipient's interests, preferences, and life context.

${recipientTagNames.length > 0 ? `## RECIPIENT TAGS (HIGHEST PRIORITY)
The recipient has been tagged with these descriptors: ${recipientTagNames.map(oneLine).join(', ')}. 
These tags represent core aspects of their identity and preferences and MUST be central to your gift recommendations.` : ''}`;

  // Add feedback history section if available
  if (feedbackHistory.positive.length > 0 || feedbackHistory.negative.length > 0) {
    prompt += "\n\n## FEEDBACK HISTORY (CRITICAL FOR PERSONALIZATION)";
    
    if (feedbackHistory.positive.length > 0) {
      prompt += "\nPreviously well-received gifts:";
      feedbackHistory.positive.forEach(item => {
        prompt += `\n- ${oneLine(item.name)} (${oneLine(item.category)}, ${formatGuidePrice(recipient, item.price)}) - ${item.action}`;
        if (item.rating) prompt += `, rated ${item.rating}/5`;
        if (item.tags.length > 0) prompt += ` - Tags: ${item.tags.map(oneLine).join(', ')}`;
      });
    }
    
    if (feedbackHistory.negative.length > 0) {
      prompt += "\nPreviously rejected gifts:";
      feedbackHistory.negative.forEach(item => {
        prompt += `\n- ${oneLine(item.name)} (${oneLine(item.category)}, ${formatGuidePrice(recipient, item.price)})`;
        if (item.tags.length > 0) prompt += ` - Tags: ${item.tags.map(oneLine).join(', ')}`;
      });
      prompt += "\nAVOID suggesting anything similar to these rejected gifts.";
    }
  }

  // Gifts already saved or bought for this recipient
  if (alreadyChosen.length > 0) {
    prompt += "\n\n## ALREADY CHOSEN FOR THIS RECIPIENT (DO NOT SUGGEST AGAIN)";
    prompt += "\nThese gifts were already saved or bought for this recipient:";
    // The most recent 50 at most: a long history must not crowd the prompt
    alreadyChosen.slice(0, 50).forEach((name) => { prompt += `\n- ${oneLine(name)}`; });
    prompt += "\nNEVER suggest these again or anything too similar to them.";
  }

  // Add suggestion history section if available
  if (suggestionHistory.length > 0) {
    prompt += "\n\n## PREVIOUSLY SHOWN SUGGESTIONS (DO NOT REPEAT)";
    prompt += "\nThese gifts have already been suggested to this recipient:";
    
    suggestionHistory.forEach(item => {
      prompt += `\n- ${oneLine(item.name)} (${oneLine(item.category)}, ${formatGuidePrice(recipient, item.price)})`;
      if (item.tags.length > 0) prompt += ` - Tags: ${item.tags.map(oneLine).join(', ')}`;
      if (item.interacted) prompt += ` - ${item.interactionType}`;
    });
    
    prompt += "\nNEVER suggest these exact gifts again or anything too similar to them.";
  }

  // Add recipient-specific category preferences if available
  if (recipientPreferences.categoryPreferences.length > 0) {
    prompt += "\n\n## HISTORICAL PREFERENCE DATA";
    prompt += "\nBased on past feedback, this recipient has shown strong interest in these categories:";
    
    recipientPreferences.categoryPreferences.slice(0, 3).forEach(pref => {
      prompt += `\n- ${pref.category} (${pref.count} positive interactions`;
      if (pref.averageRating) {
        prompt += `, average rating: ${pref.averageRating.toFixed(1)}/5`;
      }
      prompt += `)`;
    });
  }
  
  // Add recipient-specific tag preferences if available
  if (recipientPreferences.tagPreferences.length > 0) {
    prompt += "\n\nThis recipient has consistently valued gifts with these characteristics:";
    
    recipientPreferences.tagPreferences.slice(0, 5).forEach(pref => {
      prompt += `\n- ${pref.tag} (${pref.count} positive interactions`;
      if (pref.averageRating) {
        prompt += `, average rating: ${pref.averageRating.toFixed(1)}/5`;
      }
      prompt += `)`;
    });
  }
  
  // Add constraints section with strong emphasis
  const budgetRange = recipient.maximumPriceBudget != null
    ? `${formatGuidePrice(recipient, recipient.minimumPriceBudget ?? 0)} - ${formatGuidePrice(recipient, recipient.maximumPriceBudget)}`
    : 'Flexible';

  // Only what is known is listed: an empty field is left out, not printed
  // as "Not specified" (which invited made-up details)
  const constraints = [
    `Budget: ${budgetRange} - EVERY suggestion's estimated price must fall within this range${recipient.maximumPriceBudget != null ? `; never exceed ${formatGuidePrice(recipient, recipient.maximumPriceBudget)}` : ''}`,
    `Occasion: ${event.name || 'General gift'}${event.date ? ` (${new Date(event.date).toLocaleDateString('en-US', { timeZone: 'UTC' })})` : ''}`,
    present(recipient.allergies) && `ABSOLUTE RESTRICTIONS: ${asList(recipient.allergies)} - NEVER suggest anything containing these`,
    present(recipient.livingSituation) && `Living situation: ${oneLine(recipient.livingSituation)} - ONLY suggest items that work in this environment`,
    present(recipient.dietaryRestrictions) && `Dietary restrictions: ${asList(recipient.dietaryRestrictions)} - NEVER suggest items conflicting with these`,
    'Diversity: Ensure all suggestions are distinct from each other and from previously shown gifts'
  ].filter(Boolean);
  prompt += `\n\n## NON-NEGOTIABLE CONSTRAINTS (MUST BE FOLLOWED)\n${constraints.map((line, i) => `${i + 1}. ${line}`).join('\n')}`;
  if (localeLine(locale)) {
    prompt += `\n\n## WHERE THE GIVER SHOPS\n${localeLine(locale)}`;
  }

  const relationship = fieldLines([
    ['Relationship type', [recipient.relation, recipient.relationship]],
    ['Length of relationship (years)', recipient.relationshipLength],
    ['Closeness level', recipient.relationshipCloseness],
    ['Previous well-received gifts', recipient.previousGifts]
  ], '- ');
  prompt += `\n\n## RELATIONSHIP CONTEXT (CRUCIAL FOR PERSONALIZATION)\n${relationship ? `${relationship}\n` : ''}- Connect each gift to this relationship where the details above allow; do not invent shared history`;

  const profile = fieldLines([
    ['Age', recipient.age],
    ['Personality traits', recipient.personalityTraits],
    ['Occupation', recipient.occupation],
    ['Work schedule', recipient.workSchedule],
    ['Explicitly stated gift preferences (prioritize these)', recipient.giftPreferences]
  ], '- ');
  if (profile) {
    prompt += `\n\n## RECIPIENT PERSONALITY PROFILE\n${profile}`;
  }

  // Cultural and seasonal considerations
  const eventDate = event.date ? new Date(event.date) : new Date();
  const season = getSeason(eventDate);
  const culturalContext = determineCulturalContext(event.name, eventDate, recipient);

  prompt += `\n\n## CONTEXTUAL CONSIDERATIONS
- Season: ${season} - Consider seasonal appropriateness
- Cultural context: ${culturalContext} - Ensure cultural sensitivity
- Event significance: ${event.name || 'General occasion'} - Match gift meaningfulness to occasion importance`;

  // Generate more candidates than the user will see; the re-ranker
  // trims to finalCount with feedback-aware MMR diversity.
  const candidateCount = aiConfig.enhanced.candidateCount;
  prompt += `\n\n## GIFT REQUIREMENTS
1. Generate exactly ${candidateCount} highly personalized gift suggestions spanning a mix of these archetypes (use as many as the count allows; no duplicates):
   - Deeply personal items reflecting core interests (highest priority)
   - Uniquely creative items aligned with preferences
   - Items emphasizing the relationship context specifically
   - Exceptionally practical items for their specific lifestyle
   - Experiential or service-based gifts (when budget allows)
   - At least one gift in each of two distinct price tiers within budget

2. Each suggestion MUST include:
   - Specific product name (not a generic category like "cookware" - name an exact product)
   - Detailed explanation (2-3 sentences) explaining why perfect for THIS recipient
   - Explicit references to specific recipient interests or traits
   - Primary category and 3-5 relevant tags
   - A realistic estimated price and price range (min-max)
   - 2-3 specific purchase locations (online or physical)
   - A specific note about how this gift connects to your relationship
   - Clear relevance to the occasion

3. CRITICAL CONSIDERATIONS:
   - NEVER suggest generic items that don't demonstrate deep personalization
   - NEVER ignore dietary restrictions, allergies, or living situation
   - NEVER suggest items that are too similar to previously shown gifts
   - ENSURE suggestions reflect recipient's age appropriately
   - PRIORITIZE gifts that align with explicitly stated preferences
   - AVOID suggestions that are obvious without demonstrating insight
   - AVOID repetitive suggestions in the same category
   - FOCUS on items that are practical to obtain
   - MAXIMIZE diversity among your suggestions
   - Do NOT name a specific product or brand you cannot price realistically; give its real retail price, and if no real product fits the budget, suggest a kind of gift instead of bending a price to fit`;

  // Add response format instructions
  prompt += `\n\n## RESPONSE FORMAT
Provide a JSON object with a "suggestions" array containing exactly ${candidateCount} gift suggestions. Each suggestion must be a JSON object with these fields:
name, description, whyPerfectForRecipient, primaryCategory, tags, estimatedPrice, priceRange, whereToBuy, relationshipContext, occasionRelevance.

The estimatedPrice field is the realistic retail price as a plain number (no currency symbol).
The priceRange field should be an object with min and max properties.
The tags field should be an array of strings.
The whereToBuy field should be an array of strings.

Format example:
{
  "suggestions": [
    {
      "name": "Specific Product Name",
      "description": "Detailed description",
      "whyPerfectForRecipient": "Personalized explanation",
      "primaryCategory": "Category",
      "tags": ["tag1", "tag2", "tag3"],
      "estimatedPrice": 30,
      "priceRange": {"min": 25, "max": 35},
      "whereToBuy": ["Store 1", "Store 2"],
      "relationshipContext": "How it relates to your relationship",
      "occasionRelevance": "Why appropriate for this occasion"
    },
    ...additional suggestions...
  ]
}`;

  return prompt;
}

/**
 * Determine the season based on date
 */
function getSeason(date) {
  const month = date.getUTCMonth();
  // Northern hemisphere seasons
  if (month >= 2 && month <= 4) return "Spring";
  if (month >= 5 && month <= 7) return "Summer";
  if (month >= 8 && month <= 10) return "Fall";
  return "Winter";
}

/**
 * Determine cultural context based on event, date, and recipient
 */
function determineCulturalContext(eventName, date, recipient) {
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  
  // Consider recipient's cultural background if available
  let culturalBackground = '';
  if (recipient.culturalBackground) {
    culturalBackground = `${recipient.culturalBackground} cultural background`;
  }
  
  // Simple holiday detection
  if (eventName) {
    const name = eventName.toLowerCase();
    if (name.includes('christmas')) return `Christmas holiday${culturalBackground ? ' with ' + culturalBackground : ''}`;
    if (name.includes('hanukkah') || name.includes('chanukah')) return `Hanukkah celebration${culturalBackground ? ' with ' + culturalBackground : ''}`;
    if (name.includes('diwali')) return `Diwali festival${culturalBackground ? ' with ' + culturalBackground : ''}`;
    if (name.includes('eid')) return `Eid celebration${culturalBackground ? ' with ' + culturalBackground : ''}`;
    if (name.includes('lunar new year') || name.includes('chinese new year')) return `Lunar New Year${culturalBackground ? ' with ' + culturalBackground : ''}`;
    if (name.includes('graduation')) return `Academic achievement${culturalBackground ? ' with ' + culturalBackground : ''}`;
    if (name.includes('wedding')) return `Marriage celebration${culturalBackground ? ' with ' + culturalBackground : ''}`;
    if (name.includes('anniversary')) return `Relationship milestone${culturalBackground ? ' with ' + culturalBackground : ''}`;
    if (name.includes('birthday')) return `Personal celebration${culturalBackground ? ' with ' + culturalBackground : ''}`;
  }
  
  // Date-based holiday detection (simplified)
  if (month === 11 && day >= 20) return `Winter holiday season${culturalBackground ? ' with ' + culturalBackground : ''}`;
  if (month === 1 && day === 14) return `Valentine's Day context${culturalBackground ? ' with ' + culturalBackground : ''}`;
  if (month === 4 && day >= 8 && day <= 14) return `Mother's Day context${culturalBackground ? ' with ' + culturalBackground : ''}`;
  if (month === 5 && day >= 15 && day <= 21) return `Father's Day context${culturalBackground ? ' with ' + culturalBackground : ''}`;
  
  return `General gift-giving context${culturalBackground ? ' with ' + culturalBackground : ''}`;
}

/**
 * Creates a detailed user prompt with all recipient information
 */
function createDetailedUserPrompt(recipient, event, feedbackHistory, locale = {}) {
  const fullName = `${recipient.firstName} ${recipient.lastName}`;
  const tagNames = Array.isArray(recipient.tags) ? recipient.tags.map((tag) => tag && tag.name) : [];
  const sizes = recipient.clothingSizes || {};
  const profile = fieldLines([
    ['Tags', tagNames],
    ['Interests', recipient.interests],
    ['Hobbies', recipient.hobbies],
    ['Favorite colors', recipient.favoriteColors],
    ['Favorite books', recipient.favoriteBooks],
    ['Favorite movies', recipient.favoriteMovies],
    ['Favorite music', recipient.favoriteMusic],
    ['Personality traits', recipient.personalityTraits],
    ['Occupation', recipient.occupation],
    ['Work schedule', recipient.workSchedule],
    ['Gift preferences', recipient.giftPreferences]
  ], '    ');
  const practical = fieldLines([
    ['Dietary restrictions', recipient.dietaryRestrictions],
    ['Clothing sizes', [sizes.shirt && `top ${sizes.shirt}`, sizes.pants && `bottom ${sizes.pants}`, sizes.shoe && `shoe ${sizes.shoe}`]],
    ['Allergies', recipient.allergies],
    ['Living situation', recipient.livingSituation]
  ], '    ');
  const relationship = fieldLines([
    ['Known each other for (years)', recipient.relationshipLength],
    ['Closeness', recipient.relationshipCloseness],
    ['Previous gifts that were well-received', recipient.previousGifts]
  ], '    ');
  const budget = recipient.maximumPriceBudget != null
    ? `${formatGuidePrice(recipient, recipient.minimumPriceBudget ?? 0)} - ${formatGuidePrice(recipient, recipient.maximumPriceBudget)} (hard limit - never exceed the maximum)`
    : 'Flexible';
  const who = `my ${recipient.relation || 'friend'} named ${fullName}${recipient.age ? ` who is ${recipient.age} years old` : ''}`;

  // Only what is known is sent; empty fields are left out
  let prompt = `I need exceptionally personalized gift recommendations for ${who}. The occasion is ${event?.name || 'a special event'}${event?.date ? ` which is on ${new Date(event.date).toLocaleDateString('en-US', { timeZone: 'UTC' })}` : ''}.`;
  if (localeLine(locale)) prompt += `\n\n${localeLine(locale)}`;
  if (profile) prompt += `\n\nDetailed Recipient Profile:\n${profile}`;
  if (relationship) prompt += `\n\nRelationship Context:\n${relationship}`;
  prompt += `\n\nPractical Considerations:\n${practical ? `${practical}\n` : ''}    Budget range: ${budget}`;

  // Add wish list items if available
  if (recipient.wishList?.length) {
    prompt += `\n\nWish List Items (in order of priority):
${recipient.wishList.map(item => `- ${oneLine(item.item)} (Priority: ${oneLine(item.priority)})`).join('\n')}`;
  }

  // Add feedback history summary if available
  if (feedbackHistory.positive.length > 0 || feedbackHistory.negative.length > 0) {
    prompt += "\n\nFeedback History:";
    
    if (feedbackHistory.positive.length > 0) {
      const categories = [...new Set(feedbackHistory.positive.map(item => item.category))];
      const tags = [...new Set(feedbackHistory.positive.flatMap(item => item.tags))];
      
      prompt += `\n    Positive reactions to: ${categories.filter(present).map(oneLine).join(', ')}`;
      if (tags.length > 0) {
        prompt += `\n    Appreciated gift attributes: ${tags.filter(present).map(oneLine).join(', ')}`;
      }
    }
    
    if (feedbackHistory.negative.length > 0) {
      const categories = [...new Set(feedbackHistory.negative.map(item => item.category))];
      prompt += `\n    Previously declined: ${categories.filter(present).map(oneLine).join(', ')}`;
    }
  }

  prompt += `\n\nPlease provide ${aiConfig.enhanced.candidateCount} exceptionally personalized gift suggestions that perfectly match this person's specific interests, preferences, and our relationship context. Ensure DIVERSITY across categories and price tiers — repeated category/tier picks will be filtered. Format your response as a JSON object with a "suggestions" array.`;

  return prompt;
}

/**
 * Parse the model's JSON answer: an object with a "suggestions" array (or a
 * bare array). Anything else is unreadable (AI_BAD_OUTPUT), never wrapped as
 * a nameless suggestion or replaced by a placeholder gift. Suggestions
 * without a name or a usable price are skipped; when the model sent some
 * and none is usable, the answer is unreadable too.
 */
function parseEnhancedSuggestions(rawSuggestions, recipientTags = [], recipient) {
  const json = safeExtractJson(rawSuggestions, 'enhancedAiService');
  const suggestions = Array.isArray(json) ? json : json?.suggestions;
  if (!Array.isArray(suggestions)) {
    throw badOutput(`no suggestions array in: ${String(rawSuggestions).substring(0, 200)}`);
  }
  const usable = suggestions
    .filter((suggestion) => suggestion && typeof suggestion === 'object')
    .map((suggestion) => processJsonSuggestion(suggestion, recipientTags, recipient))
    .filter(isUsableSuggestion);
  if (usable.length < suggestions.length) {
    logger.warn(`[enhancedAiService] Skipped ${suggestions.length - usable.length} suggestion(s) without a name or price`);
  }
  if (suggestions.length > 0 && usable.length === 0) {
    throw badOutput('no suggestion had a name and a price');
  }
  return usable;
}

/**
 * Process a JSON-formatted suggestion
 * @param {Object} suggestion - JSON suggestion object
 * @param {Array} recipientTags - Array of tags associated with the recipient
 * @param {Object} recipient - Recipient object
 * @returns {Object} Standardized gift suggestion
 */
function processJsonSuggestion(suggestion, recipientTags = [], recipient) {
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
    
    // Calculate relevance score based on recipient tags and other factors
    const relevanceScore = calculateEnhancedRelevanceScore(
      suggestion.name, 
      suggestion.description || suggestion.whyPerfectForRecipient, 
      suggestion.primaryCategory || suggestion.category, 
      tags, 
      estimatedPrice, 
      { min: minPrice, max: maxPrice }, 
      whereToBuy, 
      suggestion.relationshipContext || suggestion.relationshipRelevance, 
      recipientTags,
      recipient
    );
    
    // The model's price, else the middle of its range; never a constant
    const price = readSuggestionPrice(estimatedPrice, minPrice, maxPrice);

    // Create the standardized suggestion object
    return {
      name: suggestion.name,
      description: suggestion.description || suggestion.whyPerfectForRecipient || '',
      whyPerfectForRecipient: suggestion.whyPerfectForRecipient || suggestion.description || '',
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
    logger.error('[enhancedAiService] Error processing JSON suggestion:', error);
    return null;
  }
}

/**
 * Calculate enhanced relevance score for a suggestion
 * @param {String} name - Suggestion name
 * @param {String} description - Suggestion description
 * @param {String} category - Suggestion category
 * @param {Array} tags - Suggestion tags
 * @param {Number} estimatedPrice - Estimated price
 * @param {Object} priceRange - Price range object with min and max
 * @param {Array} whereToBuy - Where to buy locations
 * @param {String} relationshipRelevance - Relationship relevance
 * @param {Array} recipientTags - Recipient tags
 * @param {Object} recipient - Recipient object
 * @returns {Number} Relevance score (0-100)
 */
function calculateEnhancedRelevanceScore(name, description, category, tags, estimatedPrice, priceRange, whereToBuy, relationshipRelevance, recipientTags, recipient) {
  let score = 50; // Base score
  const scoreFactors = [];
  
  // Add points for completeness
  if (name) {
    score += 5;
    scoreFactors.push('Complete name: +5');
  }
  
  if (description && description.length > 50) {
    score += 10;
    scoreFactors.push('Detailed description: +10');
  }
  
  if (category) {
    score += 5;
    scoreFactors.push('Category specified: +5');
  }
  
  if (tags && tags.length >= 3) {
    score += 5;
    scoreFactors.push('Multiple tags: +5');
  }
  
  if (estimatedPrice) {
    score += 5;
    scoreFactors.push('Price specified: +5');
  }
  
  if (priceRange && priceRange.min && priceRange.max) {
    score += 5;
    scoreFactors.push('Price range specified: +5');
  }
  
  if (whereToBuy && whereToBuy.length >= 2) {
    score += 5;
    scoreFactors.push('Multiple purchase locations: +5');
  }
  
  if (relationshipRelevance && relationshipRelevance.length > 20) {
    score += 10;
    scoreFactors.push('Relationship context: +10');
  }
  
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
      scoreFactors.push(`Recipient tag matches (${tagMatches}): +${tagBonus}`);
    }
  }
  
  // Check budget alignment if recipient has budget constraints
  if (recipient && recipient.maximumPriceBudget && estimatedPrice) {
    const minBudget = recipient.minimumPriceBudget || 0;
    const maxBudget = recipient.maximumPriceBudget;
    
    if (estimatedPrice >= minBudget && estimatedPrice <= maxBudget) {
      // Perfect budget match
      score += 10;
      scoreFactors.push('Within budget range: +10');
    } else if (estimatedPrice < minBudget * 0.8 || estimatedPrice > maxBudget * 1.2) {
      // Significantly outside budget range
      score -= 15;
      scoreFactors.push('Significantly outside budget: -15');
    } else {
      // Slightly outside budget range
      score -= 5;
      scoreFactors.push('Slightly outside budget: -5');
    }
  }
  
  // Check for personalization elements
  const personalizationTerms = ['custom', 'personalized', 'monogram', 'engraved', 'bespoke', 'tailored'];
  const hasPersonalization = personalizationTerms.some(term => 
    (name && name.toLowerCase().includes(term)) || 
    (description && description.toLowerCase().includes(term))
  );
  
  if (hasPersonalization) {
    score += 8;
    scoreFactors.push('Personalization elements: +8');
  }
  
  // Check for recipient interests if available
  if (recipient && recipient.interests && Array.isArray(recipient.interests) && recipient.interests.length > 0) {
    const suggestionText = `${name || ''} ${description || ''} ${category || ''} ${(tags || []).join(' ')}`.toLowerCase();
    
    const interestMatches = recipient.interests.filter(interest => 
      suggestionText.includes(interest.toLowerCase())
    ).length;
    
    if (interestMatches > 0) {
      const interestBonus = Math.min(interestMatches * 7, 15);
      score += interestBonus;
      scoreFactors.push(`Interest matches (${interestMatches}): +${interestBonus}`);
    }
  }
  
  // Check for hobby matches if available
  if (recipient && recipient.hobbies && Array.isArray(recipient.hobbies) && recipient.hobbies.length > 0) {
    const suggestionText = `${name || ''} ${description || ''} ${category || ''} ${(tags || []).join(' ')}`.toLowerCase();
    
    const hobbyMatches = recipient.hobbies.filter(hobby => 
      suggestionText.includes(hobby.toLowerCase())
    ).length;
    
    if (hobbyMatches > 0) {
      const hobbyBonus = Math.min(hobbyMatches * 7, 15);
      score += hobbyBonus;
      scoreFactors.push(`Hobby matches (${hobbyMatches}): +${hobbyBonus}`);
    }
  }
  
  // Log the score calculation
  logger.debug(`[enhancedAiService] Relevance score for "${name}": ${Math.min(score, 100)}`);
  logger.debug(`[enhancedAiService] Score factors: ${scoreFactors.join(', ')}`);
  
  // Cap final score between 0-100
  return Math.min(Math.max(score, 0), 100);
}

/**
 * Validate suggestions against recipient constraints
 * @param {Array} suggestions - Array of gift suggestions
 * @param {Object} recipient - Recipient object
 * @returns {Array} Validated suggestions
 */
function validateSuggestionsAgainstConstraints(suggestions, recipient) {
  if (!suggestions || !Array.isArray(suggestions) || !recipient) {
    return suggestions;
  }
  
  logger.debug('[enhancedAiService] Validating suggestions against recipient constraints...');
  
  return suggestions.filter(suggestion => {
    const constraintViolations = checkConstraintViolations(suggestion, recipient);
    
    if (constraintViolations.length > 0) {
      logger.debug(`[enhancedAiService] Filtering out "${suggestion.name}" due to constraint violations: ${constraintViolations.join(', ')}`);
      return false;
    }
    
    return true;
  });
}
