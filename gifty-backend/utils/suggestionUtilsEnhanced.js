const FeedbackLog = require('../models/FeedbackLog');
const SuggestionHistory = require('../models/SuggestionHistory');
const Recipient = require('../models/Recipient');
const logger = require('../utils/logger');
const { applyPriceGuide } = require('./priceGuide');

/**
 * Check for constraint violations in a suggestion
 * @param {Object} suggestion - Gift suggestion
 * @param {Object} recipient - Recipient object
 * @returns {Array} Array of constraint violation messages
 */
function checkConstraintViolations(suggestion, recipient) {
  if (!recipient) return [];

  const violations = [];
  const combinedText = `${suggestion.name} ${suggestion.description || ''} ${suggestion.whyPerfectForRecipient || ''}`.toLowerCase();
  const suggestionTags = suggestion.tags?.map(tag => tag.toLowerCase()) || [];

  // Check for allergy violations
  if (recipient.allergies && Array.isArray(recipient.allergies) && recipient.allergies.length > 0) {
    recipient.allergies.forEach(allergy => {
      const allergyLower = allergy.toLowerCase();

      // Special handling for nuts
      if (allergyLower === 'nuts') {
        if (suggestion.name.toLowerCase().includes('nut') ||
            (suggestion.description && suggestion.description.toLowerCase().includes('nut')) ||
            suggestionTags.some(tag => tag.includes('nut')) ||
            suggestionTags.includes('nuts') ||
            // Additional checks for nut-related terms
            /\b(almond|cashew|pecan|walnut|peanut|hazelnut|pistachio|macadamia)\b/i.test(combinedText)) {
          logger.debug(`[checkConstraintViolations] Found nut allergy violation in "${suggestion.name}"`);
          violations.push(`Contains allergen: ${allergy}`);
          return; // Skip further checks for this allergy
        }
      }

      // General check for other allergies
      if (allergy &&
          (combinedText.includes(allergyLower) ||
           suggestionTags.includes(allergyLower))) {
        logger.debug(`[checkConstraintViolations] Found allergy violation: ${allergy} in "${suggestion.name}"`);
        violations.push(`Contains allergen: ${allergy}`);
      }
    });
  }

  // Check for dietary restriction violations
  if (recipient.dietaryRestrictions && Array.isArray(recipient.dietaryRestrictions) && recipient.dietaryRestrictions.length > 0) {
    const isFoodRelated =
      suggestion.category?.toLowerCase().includes('food') ||
      suggestion.category?.toLowerCase().includes('drink') ||
      suggestion.category?.toLowerCase().includes('snack') ||
      suggestion.category?.toLowerCase().includes('beverage') ||
      suggestion.name?.toLowerCase().includes('bread') ||
      suggestion.name?.toLowerCase().includes('baking') ||
      suggestionTags.some(tag =>
        ['food', 'drink', 'snack', 'beverage', 'edible', 'baking', 'cooking', 'kitchen', 'bread', 'gluten'].includes(tag)
      );

    if (isFoodRelated) {
      recipient.dietaryRestrictions.forEach(restriction => {
        const restrictionLower = restriction.toLowerCase();
        if (restrictionLower === 'gluten-free') {
          const containsGlutenKeyword = combinedText.includes('gluten') || suggestionTags.includes('gluten');
          const isExplicitlyGlutenFree = combinedText.includes('gluten-free') || suggestionTags.includes('gluten-free');
          const containsBreadKeyword = combinedText.includes('bread') || suggestionTags.includes('bread');

          if (containsBreadKeyword || (containsGlutenKeyword && !isExplicitlyGlutenFree)) {
            logger.debug(`[checkConstraintViolations] Found dietary restriction violation: ${restriction} in "${suggestion.name}"`);
            violations.push(`Violates dietary restriction: ${restriction}`);
            return;
          }
        }
        // General check for other restrictions
        else if (restriction && combinedText.includes(restrictionLower)) {
          logger.debug(`[checkConstraintViolations] Found dietary restriction violation: ${restriction} in "${suggestion.name}"`);
          violations.push(`Violates dietary restriction: ${restriction}`);
        }
      });
    }
  }

  // Price is not a violation: a suggestion above the price guide is kept and
  // flagged over budget by the controller, so a nearly used-up budget does
  // not empty the list

  // Check for living situation constraints
  if (recipient.livingSituation) {
    const livingSituation = recipient.livingSituation.toLowerCase();

    // Check for space constraints
    if (livingSituation.includes('small apartment') ||
        livingSituation.includes('dorm') ||
        livingSituation.includes('limited space')) {

      // Check for furniture items and large objects
      if (suggestion.category?.toLowerCase() === 'furniture' ||
          suggestion.name.toLowerCase().includes('bookshelf') ||
          suggestion.name.toLowerCase().includes('furniture') ||
          suggestion.name.toLowerCase().includes('large') ||
          combinedText.includes('bulky') ||
          combinedText.includes('spacious') ||
          // Enhanced detection for large furniture items
          (suggestion.category?.toLowerCase().includes('home') &&
           (combinedText.includes('shelf') ||
            combinedText.includes('cabinet') ||
            combinedText.includes('table') ||
            combinedText.includes('desk') ||
            combinedText.includes('storage'))) ||
          // Size indicators in name or description
          /\b(large|big|oversized|full-sized|full sized)\b/i.test(combinedText)) {

        logger.debug(`[checkConstraintViolations] Found living situation violation: ${livingSituation} conflicts with "${suggestion.name}"`);
        violations.push('May not be suitable for recipient\'s living situation (space constraints)');
      }
    }
  }

  // Age appropriateness
  const age = parseInt(recipient.age);
  if (age < 13 && ['alcohol', 'wine', 'beer', 'liquor', 'mature', 'adult content'].some((term) => combinedText.includes(term))) {
    violations.push(`Not age-appropriate for ${age}-year-old recipient`);
  }
  if (age > 75 && ['complicated setup', 'difficult to use', 'steep learning curve'].some((term) => combinedText.includes(term))) {
    violations.push(`May be too complex for ${age}-year-old recipient`);
  }

  if (violations.length > 0) {
    logger.debug(`[checkConstraintViolations] Total violations for "${suggestion.name}": ${violations.length}`);
  }

  return violations;
}

/**
 * Enhanced suggestion filtering that ensures at least some suggestions always get through
 * while still respecting user preferences and feedback
 */
exports.filterIgnoredSuggestions = async function(suggestions, userId, recipientId, options = {}) {
  try {
    logger.debug('[suggestionUtils] Enhanced filtering ignored and repetitive suggestions...');
    logger.debug('[suggestionUtils] Initial suggestion count:', suggestions.length);
    
    const {
      minimumSuggestions = 3,  // Always return at least this many
      cooldownPeriod = 14,     // Reduced from 30 to 14 days
      similarityThreshold = 0.8, // Raised from 0.6 to 0.8 (be more lenient)
      forceBypass = false,     // Emergency bypass for when filtering is too aggressive
      priceGuide = null        // The price range the AI was asked for (in memory only)
    } = options;
    
    // If force bypass is enabled (e.g., user hasn't received suggestions in X days), return all
    if (forceBypass) {
      logger.debug('[suggestionUtils] Force bypass enabled - returning all suggestions');
      return suggestions;
    }
    
    // Get only explicitly ignored feedback (not just recently shown)
    const ignoredFeedback = await FeedbackLog.find({
      user: userId,
      recipient: recipientId,
      action: 'ignored',
      explicitRating: { $lte: 2 }  // Only count explicitly disliked items
    }).populate('gift');
    
    logger.debug(`[suggestionUtils] Found ${ignoredFeedback.length} explicitly ignored gifts`);
    
    // Get recent suggestion history with the adjusted cooldown period
    const recentDate = new Date(Date.now() - cooldownPeriod * 24 * 60 * 60 * 1000);
    const suggestionHistoryEntries = await SuggestionHistory.find({
      user: userId,
      recipient: recipientId,
      shownAt: { $gte: recentDate },
      interactionType: { $ne: 'ignored' }  // Don't block if user already ignored it
    });
    
    logger.debug(`[suggestionUtils] Found ${suggestionHistoryEntries.length} recent (${cooldownPeriod}-day) non-ignored suggestions`);

    // Load recipient for constraint checking (allergies, dietary, budget, space)
    // judged by the same price guide the AI was given
    const recipient = applyPriceGuide(await Recipient.findById(recipientId), priceGuide);

    // Filter suggestions with more lenient criteria
    let keptSuggestions = [];
    let explicitlyIgnoredSuggestions = [];
    let recentExactMatchSuggestions = [];
    let constraintViolatedSuggestions = [];

    suggestions.forEach(suggestion => {
      const constraintViolations = checkConstraintViolations(suggestion, recipient);
      if (constraintViolations.length > 0) {
        constraintViolatedSuggestions.push({ suggestion, violations: constraintViolations });
        return;
      }
      
      const isExplicitlyIgnored = ignoredFeedback.some(feedback => {
        const gift = feedback.gift;
        return gift?.name?.toLowerCase() === suggestion.name.toLowerCase();
      });
      
      if (isExplicitlyIgnored) {
        explicitlyIgnoredSuggestions.push(suggestion);
        return;
      }
      
      const isRecentExactMatch = suggestionHistoryEntries.some(entry => {
        return entry.giftMetadata?.name?.toLowerCase() === suggestion.name.toLowerCase();
      });
      
      if (isRecentExactMatch) {
        recentExactMatchSuggestions.push(suggestion);
        return;
      }
      
      keptSuggestions.push(suggestion);
    });
    
    logger.debug(`[suggestionUtils] After initial categorization: Kept: ${keptSuggestions.length}, Ignored: ${explicitlyIgnoredSuggestions.length}, Recent: ${recentExactMatchSuggestions.length}, Constraints: ${constraintViolatedSuggestions.length}`);
    
    // Ensure minimum suggestions are returned
    if (keptSuggestions.length < minimumSuggestions) {
      logger.debug(`[suggestionUtils] Below minimum threshold (${minimumSuggestions}), attempting to add back suggestions`);
      
      // Only soft constraint violations (space) may be re-added; never
      // allergen/dietary violations, explicit ignores, or recent matches
      const eligibleForReaddition = constraintViolatedSuggestions
        .filter(({ violations }) => !violations.some(v => v.includes('allergen') || v.includes('dietary')))
        .map(({ suggestion }) => suggestion)
        .sort((a, b) => (b.relevanceScore || 50) - (a.relevanceScore || 50));

      for (const suggestion of eligibleForReaddition) {
        if (keptSuggestions.length >= minimumSuggestions) break;
        if (!keptSuggestions.includes(suggestion)) {
          keptSuggestions.push(suggestion);
          logger.debug(`[suggestionUtils] Added back "${suggestion.name}" (score: ${suggestion.relevanceScore}) to meet minimum`);
        }
      }
      
      logger.debug(`[suggestionUtils] After re-addition: ${keptSuggestions.length} suggestions remain`);
    }
    
    return keptSuggestions;
  } catch (error) {
    logger.error('[suggestionUtils] Error in enhanced filtering:', error);
    // On error, return at least some suggestions (use default minimum of 3)
    const defaultMinimum = options?.minimumSuggestions || 3;
    return suggestions.slice(0, defaultMinimum);
  }
};

/**
 * Dynamic cooldown adjustment based on user activity
 */
exports.getDynamicCooldownPeriod = async function(userId, recipientId) {
  // Count how many suggestions were shown in the last 7 days
  const recentCount = await SuggestionHistory.countDocuments({
    user: userId,
    recipient: recipientId,
    shownAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
  });
  
  // If user hasn't seen many suggestions lately, reduce cooldown
  if (recentCount === 0) return 7;    // 1 week if no recent activity
  if (recentCount < 5) return 14;     // 2 weeks if low activity
  if (recentCount < 10) return 21;    // 3 weeks if moderate activity
  return 30;                          // Default 30 days for heavy usage
};

/**
 * Self-healing mechanism to detect when filtering is too aggressive
 */
exports.isFilteringTooAggressive = async function(userId, recipientId) {
  // Check if user has had empty suggestion results in the last 3 attempts
  const recentSessions = await SuggestionHistory.find({
    user: userId,
    recipient: recipientId
  })
  .sort({ shownAt: -1 })
  .limit(10);
  
  // Group by session (suggestions shown within 5 minutes of each other)
  const sessions = [];
  let currentSession = [];
  
  recentSessions.forEach((entry, index) => {
    if (currentSession.length === 0) {
      currentSession.push(entry);
    } else {
      const timeDiff = currentSession[0].shownAt - entry.shownAt;
      if (timeDiff < 5 * 60 * 1000) { // Within 5 minutes
        currentSession.push(entry);
      } else {
        sessions.push(currentSession);
        currentSession = [entry];
      }
    }
    
    if (index === recentSessions.length - 1 && currentSession.length > 0) {
      sessions.push(currentSession);
    }
  });
  
  // Check if recent sessions had very few suggestions
  const emptySessionCount = sessions.filter(session => session.length < 2).length;
  
  return {
    isTooAggressive: emptySessionCount >= 3,
    emptySessions: emptySessionCount,
    recommendation: emptySessionCount >= 3 ? 'force_bypass' : 'normal'
  };
};

exports.checkConstraintViolations = checkConstraintViolations;
