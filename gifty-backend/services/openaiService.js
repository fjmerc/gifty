const aiService = require('./aiService');
const logger = require('../utils/logger');

/**
 * Generate gift suggestions using AI
 * @param {Object} recipientProfile - Recipient profile information
 * @param {Object} options - Options for generating suggestions
 * @returns {Array} Array of gift suggestions
 */
exports.generateGiftSuggestions = async (recipientProfile, options = {}) => {
  try {
    // Create a prompt from the recipient profile
    const prompt = createPromptFromProfile(recipientProfile, options);
    
    // Extract tags from recipient profile
    const recipientTags = recipientProfile.interests || [];
    
    // Call the underlying AI service, forwarding any provider/model
    // override so user preference applies in hybrid/traditional modes.
    return await aiService.getAISuggestions(prompt, recipientTags, options.ai || {});
  } catch (error) {
    logger.error('Error generating gift suggestions:', error);
    // A typed AI failure (502) keeps its type and message
    if (error.statusCode) throw error;
    throw new Error('Failed to generate gift suggestions');
  }
};

/**
 * Create a prompt from recipient profile
 * @param {Object} profile - Recipient profile
 * @param {Object} options - Additional options
 * @returns {String} Formatted prompt for AI
 */
function createPromptFromProfile(profile, options = {}) {
  const {
    age,
    gender,
    interests = [],
    relationship,
    occasion,
    budget
  } = profile;
  
  let prompt = `I need gift suggestions for a ${age ? age + ' year old ' : ''}`;
  prompt += gender ? `${gender} ` : '';
  prompt += `who is my ${relationship || 'friend'}`;
  
  if (interests && interests.length > 0) {
    prompt += ` and is interested in ${interests.join(', ')}`;
  }
  
  if (occasion) {
    prompt += `. The occasion is ${occasion}`;
  }
  
  if (budget) {
    prompt += `. My budget is around $${budget}`;
  }
  
  // Add context from options
  if (options.avoid && options.avoid.length > 0) {
    prompt += `. Please avoid suggesting: ${options.avoid.join(', ')}`;
  }
  
  if (options.preferCategories && options.preferCategories.length > 0) {
    prompt += `. I'd prefer gifts in these categories: ${options.preferCategories.join(', ')}`;
  }
  
  if (options.targetCount) {
    prompt += `. Please suggest exactly ${options.targetCount} gift ideas`;
  }
  
  return prompt;
}
