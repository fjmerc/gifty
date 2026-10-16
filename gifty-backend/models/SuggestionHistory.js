const mongoose = require('mongoose');
const logger = require('../utils/logger');
const Schema = mongoose.Schema;

/**
 * SuggestionHistory model
 * Tracks all gift suggestions shown to users to prevent repetitive suggestions
 */
const SuggestionHistorySchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: Schema.Types.ObjectId,
    ref: 'Recipient',
    required: true
  },
  gift: {
    type: Schema.Types.ObjectId,
    ref: 'Gift',
    required: true
  },
  // When the suggestion was shown to the user
  shownAt: {
    type: Date,
    default: Date.now
  },
  // Optional: track if the user interacted with this suggestion
  interacted: {
    type: Boolean,
    default: false
  },
  // Optional: track the type of interaction (viewed, saved, purchased, ignored)
  interactionType: {
    type: String,
    enum: ['viewed', 'saved', 'purchased', 'ignored', 'none'],
    default: 'none'
  },
  // Track the similarity score at the time of suggestion
  similarityScore: {
    type: Number,
    min: 0,
    max: 1,
    default: 0
  },
  // Track the relevance score at the time of suggestion
  relevanceScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 50
  },
  // Store gift metadata for faster filtering without joins
  giftMetadata: {
    name: String,
    category: String,
    tags: [String],
    price: Number
  },
  // Cooldown period in days before similar suggestions can be shown again
  cooldownPeriod: {
    type: Number,
    default: 30, // Default 30 days
    min: 1,
    max: 365
  }
});

// Create compound index for efficient querying
SuggestionHistorySchema.index({ user: 1, recipient: 1, gift: 1 }, { unique: true });
SuggestionHistorySchema.index({ user: 1, recipient: 1, shownAt: -1 });
SuggestionHistorySchema.index({ 'giftMetadata.category': 1 });
SuggestionHistorySchema.index({ 'giftMetadata.tags': 1 });

// Exactly cooldownPeriod * 24h after shownAt. Local setDate() made the window
// an hour longer/shorter across DST changes (showing e.g. 30 days left, not 29).
const DAY_MS = 24 * 60 * 60 * 1000;
const cooldownEndOf = (doc) => new Date(new Date(doc.shownAt).getTime() + doc.cooldownPeriod * DAY_MS);

/**
 * Check if a gift is in cooldown period
 * @returns {Boolean} True if the gift is in cooldown period
 */
SuggestionHistorySchema.methods.isInCooldown = function() {
  const now = new Date();
  const cooldownEndDate = cooldownEndOf(this);
  
  return now < cooldownEndDate;
};

/**
 * Get days remaining in cooldown
 * @returns {Number} Days remaining in cooldown period
 */
SuggestionHistorySchema.methods.cooldownDaysRemaining = function() {
  const now = new Date();
  const cooldownEndDate = cooldownEndOf(this);
  
  if (now >= cooldownEndDate) return 0;
  
  const diffTime = Math.abs(cooldownEndDate - now);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

/**
 * Static method to record a new suggestion
 * @param {Object} data - Suggestion data
 * @returns {Promise} Promise resolving to the created record
 */
SuggestionHistorySchema.statics.recordSuggestion = async function(data) {
  try {
    // Check if this suggestion already exists
    const existing = await this.findOne({
      user: data.user,
      recipient: data.recipient,
      gift: data.gift
    });
    
    if (existing) {
      // Update the existing record with new timestamp
      existing.shownAt = new Date();
      if (data.similarityScore) existing.similarityScore = data.similarityScore;
      if (data.relevanceScore) existing.relevanceScore = data.relevanceScore;
      return await existing.save();
    }
    
    // Create a new record
    return await this.create({
      user: data.user,
      recipient: data.recipient,
      gift: data.gift,
      similarityScore: data.similarityScore || 0,
      relevanceScore: data.relevanceScore || 50,
      giftMetadata: {
        name: data.giftName,
        category: data.giftCategory,
        tags: data.giftTags || [],
        price: data.giftPrice
      },
      cooldownPeriod: data.cooldownPeriod || 30
    });
  } catch (error) {
    logger.error('[SuggestionHistory] Error recording suggestion:', error);
    throw error;
  }
};

/**
 * Static method to check if similar gifts have been suggested recently
 * @param {String} userId - User ID
 * @param {String} recipientId - Recipient ID
 * @param {Object} giftData - Gift data to check similarity against
 * @returns {Promise<Array>} Promise resolving to array of similar suggestions in cooldown
 */
SuggestionHistorySchema.statics.findSimilarInCooldown = async function(userId, recipientId, giftData) {
  try {
    const now = new Date();
    const category = giftData.category?.toLowerCase();
    const tags = giftData.tags?.map(tag => tag.toLowerCase()) || [];
    const price = giftData.estimatedPrice || giftData.price;
    
    // Find suggestions for this user and recipient that are in cooldown period
    const suggestions = await this.find({
      user: userId,
      recipient: recipientId,
      // Only consider suggestions that are still in cooldown
      shownAt: {
        $gte: new Date(now.setDate(now.getDate() - 365)) // Look back up to a year
      }
    });
    
    // Filter for similar suggestions
    return suggestions.filter(suggestion => {
      // Skip if cooldown period has passed
      if (!suggestion.isInCooldown()) return false;
      
      // Check for category match
      const categoryMatch = category && 
        suggestion.giftMetadata.category?.toLowerCase() === category;
      
      // Check for tag overlap
      const suggestionTags = suggestion.giftMetadata.tags?.map(tag => tag.toLowerCase()) || [];
      const commonTags = tags.filter(tag => suggestionTags.includes(tag));
      const tagOverlap = commonTags.length >= 2; // At least 2 common tags
      
      // Check for similar price point (within 20%)
      let priceMatch = false;
      if (price && suggestion.giftMetadata.price) {
        const priceDiffPercent = Math.abs(suggestion.giftMetadata.price - price) / suggestion.giftMetadata.price;
        priceMatch = priceDiffPercent < 0.2;
      }
      
      // Consider it similar if at least 2 of these match
      const similarityFactors = [categoryMatch, tagOverlap, priceMatch];
      const similarityCount = similarityFactors.filter(Boolean).length;
      
      return similarityCount >= 2;
    });
  } catch (error) {
    logger.error('[SuggestionHistory] Error finding similar suggestions:', error);
    return [];
  }
};

/**
 * Static method to update interaction status
 * @param {String} userId - User ID
 * @param {String} recipientId - Recipient ID
 * @param {String} giftId - Gift ID
 * @param {String} interactionType - Type of interaction
 * @returns {Promise} Promise resolving to the updated record
 */
SuggestionHistorySchema.statics.updateInteraction = async function(userId, recipientId, giftId, interactionType) {
  try {
    const record = await this.findOne({
      user: userId,
      recipient: recipientId,
      gift: giftId
    });
    
    if (record) {
      record.interacted = true;
      record.interactionType = interactionType;
      return await record.save();
    }
    
    return null;
  } catch (error) {
    logger.error('[SuggestionHistory] Error updating interaction:', error);
    return null;
  }
};

module.exports = mongoose.model('SuggestionHistory', SuggestionHistorySchema);
