const Gift = require('../models/Gift');
const FeedbackLog = require('../models/FeedbackLog');
const SuggestionHistory = require('../models/SuggestionHistory');
const mongoose = require('mongoose');
const suggestionCache = require('./suggestionCacheService');
const logger = require('../utils/logger');

// Sort fields/pagination arrive straight from query params on the
// feedback routes; an arbitrary sort field lets a caller sort on
// unindexed paths (slow collection scans), and an unbounded limit can
// pull the whole collection into memory.
const ALLOWED_SORT_FIELDS = ['timestamp', 'action', 'category', 'explicitRating', 'relevanceScore'];
const MAX_PAGE_SIZE = 200;

function sanitizeSort(filters) {
  const sortField = ALLOWED_SORT_FIELDS.includes(filters.sortBy) ? filters.sortBy : 'timestamp';
  return { [sortField]: filters.sortOrder === 'asc' ? 1 : -1 };
}

function sanitizePagination(limit, page, defaultLimit) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || defaultLimit, 1), MAX_PAGE_SIZE);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  return { limit: safeLimit, page: safePage };
}

const feedbackService = {
  /**
   * Track user interaction with gift suggestions
   * @param {Object} feedback - Feedback data
   * @param {String} feedback.giftId - ID of the gift
   * @param {String} feedback.action - Action taken (saved, purchased, ignored, favorited)
   * @param {Number} feedback.explicitRating - Optional user rating (1-5)
   * @param {String} feedback.userId - User ID
   * @param {String} feedback.comment - Optional user comment
   */
  async trackFeedback(feedback) {
    try {
      logger.debug('[feedbackService] Tracking feedback:', feedback);
      const { giftId, action, explicitRating, userId, comment } = feedback;
      
      // Only the caller's own gift
      const gift = await Gift.findOne({ _id: giftId, user: userId });
      
      if (!gift) {
        logger.debug('[feedbackService] Gift not found:', giftId);
        throw new Error('Gift not found');
      }
      
      // Feedback records an ML signal; it does not move a gift through the
      // purchase lifecycle. 'saved'/'purchased' status changes go through the
      // gift endpoints so the budget is charged/refunded. The only side
      // effects kept for the UI: 'ignored' hides an unpurchased suggestion,
      // and 'favorited' flags the gift. A purchased gift's status is never
      // changed here (that would orphan its budget charge).
      let giftChanged = false;
      if (action === 'ignored' && gift.status !== 'purchased' && gift.status !== 'ignored') {
        gift.status = 'ignored';
        giftChanged = true;
      } else if (action === 'favorited' && !gift.favorite) {
        gift.favorite = true;
        giftChanged = true;
      }
      
      if (giftChanged) {
        await gift.save();
        logger.debug(`[feedbackService] Updated gift (status ${gift.status}, favorite ${gift.favorite})`);
      }

      // Bump the suggestion cache version for this user-recipient pair
      // so the next generation reflects the fresh feedback signal
      // instead of returning a cached pre-feedback result.
      if (gift.recipient) {
        suggestionCache.invalidateForRecipient(String(userId), String(gift.recipient)).catch(() => {});
      }

      // Only track detailed feedback if it was an AI suggestion
      if (gift.isAISuggested) {
        logger.debug('[feedbackService] Recording feedback for AI-suggested gift:', {
          giftId: gift._id,
          name: gift.name,
          action,
          rating: explicitRating
        });
        
        // Record the interaction in FeedbackLog collection
        const feedbackLog = await FeedbackLog.create({
          gift: giftId,
          user: userId,
          recipient: gift.recipient,
          action,
          explicitRating: explicitRating || null,
          category: gift.category,
          tags: gift.tags,
          relevanceScore: gift.relevanceScore,
          timestamp: new Date(),
          comment: comment || null
        });
        
        logger.debug('[feedbackService] Feedback logged:', {
          feedbackId: feedbackLog._id,
          giftId: feedbackLog.gift,
          action: feedbackLog.action
        });
        
        // Update the suggestion history with this interaction
        await this.updateSuggestionHistory(userId, gift.recipient, giftId, action);
        
        // Update category and tag success metrics
        if (action === 'purchased' || action === 'saved' || action === 'favorited') {
          logger.debug('[feedbackService] Updating success metrics for positive feedback');
          await this.updateCategorySuccess(gift.category, action);
          await this.updateTagSuccess(gift.tags, action);
        }
      } else {
        logger.debug('[feedbackService] Skipping detailed feedback tracking for non-AI suggestion');
      }
      
      return { 
        success: true, 
        gift: {
          id: gift._id,
          name: gift.name,
          status: gift.status
        }
      };
    } catch (error) {
      logger.error('[feedbackService] Error tracking feedback:', error);
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Get summary statistics for a user's gift feedback
   * @param {String} userId - User ID to get statistics for
   * @param {Object} dateRange - Optional date range for filtering
   * @param {Date} dateRange.startDate - Start date for filtering
   * @param {Date} dateRange.endDate - End date for filtering
   */
  async getUserFeedbackStats(userId, dateRange = {}) {
    try {
      logger.debug(`[feedbackService] Getting feedback stats for user ${userId}`, 
        dateRange.startDate ? `from ${dateRange.startDate.toISOString()}` : '', 
        dateRange.endDate ? `to ${dateRange.endDate.toISOString()}` : '');
      
      // Build match condition with date range if provided
      const matchCondition = { user: new mongoose.Types.ObjectId(userId) };
      
      if (dateRange.startDate || dateRange.endDate) {
        matchCondition.timestamp = {};
        
        if (dateRange.startDate) {
          matchCondition.timestamp.$gte = dateRange.startDate;
        }
        
        if (dateRange.endDate) {
          matchCondition.timestamp.$lte = dateRange.endDate;
        }
      }
      
      // Get action counts
      const actionCounts = await FeedbackLog.aggregate([
        { $match: matchCondition },
        { $group: { _id: '$action', count: { $sum: 1 } } }
      ]);
      
      // Get average ratings
      const ratings = await FeedbackLog.aggregate([
        { 
          $match: { 
            ...matchCondition,
            explicitRating: { $ne: null } 
          } 
        },
        { 
          $group: { 
            _id: null, 
            averageRating: { $avg: '$explicitRating' },
            count: { $sum: 1 },
            minRating: { $min: '$explicitRating' },
            maxRating: { $max: '$explicitRating' }
          } 
        }
      ]);
      
      // Format the action counts into an object
      const formattedCounts = {};
      actionCounts.forEach(item => {
        formattedCounts[item._id] = item.count;
      });
      
      // Get category distribution
      const categoryDistribution = await FeedbackLog.aggregate([
        { $match: matchCondition },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);
      
      // Get tag distribution
      const tagDistribution = await FeedbackLog.aggregate([
        { $match: matchCondition },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 }
      ]);
      
      // Count total feedback
      const totalFeedback = await FeedbackLog.countDocuments(matchCondition);
      
      // Calculate engagement metrics
      const positiveActions = ['purchased', 'saved', 'favorited'];
      const positiveCount = positiveActions.reduce((sum, action) => sum + (formattedCounts[action] || 0), 0);
      const positiveRate = totalFeedback > 0 ? positiveCount / totalFeedback : 0;
      
      return {
        actionCounts: formattedCounts,
        ratings: ratings.length > 0 ? {
          average: ratings[0].averageRating,
          count: ratings[0].count,
          min: ratings[0].minRating,
          max: ratings[0].maxRating
        } : { average: 0, count: 0, min: 0, max: 0 },
        categories: categoryDistribution.map(c => ({ category: c._id, count: c.count })),
        tags: tagDistribution.map(t => ({ tag: t._id, count: t.count })),
        totalFeedback,
        engagement: {
          positiveRate,
          savedRate: totalFeedback > 0 ? (formattedCounts['saved'] || 0) / totalFeedback : 0,
          purchasedRate: totalFeedback > 0 ? (formattedCounts['purchased'] || 0) / totalFeedback : 0,
          ignoredRate: totalFeedback > 0 ? (formattedCounts['ignored'] || 0) / totalFeedback : 0
        }
      };
    } catch (error) {
      logger.error('[feedbackService] Error getting feedback stats:', error);
      throw error;
    }
  },
  
  /**
   * Get feedback summary for a specific recipient
   * @param {String} recipientId - Recipient ID
   * @param {Object} dateRange - Optional date range for filtering
   * @param {Date} dateRange.startDate - Start date for filtering
   * @param {Date} dateRange.endDate - End date for filtering
   */
  async getRecipientFeedbackSummary(recipientId, dateRange = {}, userId = null) {
    try {
      logger.debug(`[feedbackService] Getting feedback summary for recipient ${recipientId}`, 
        dateRange.startDate ? `from ${dateRange.startDate.toISOString()}` : '', 
        dateRange.endDate ? `to ${dateRange.endDate.toISOString()}` : '');
      
      // Build match condition with date range if provided
      const matchCondition = { recipient: new mongoose.Types.ObjectId(recipientId) };
      if (userId) {
        matchCondition.user = new mongoose.Types.ObjectId(String(userId));
      }
      
      if (dateRange.startDate || dateRange.endDate) {
        matchCondition.timestamp = {};
        
        if (dateRange.startDate) {
          matchCondition.timestamp.$gte = dateRange.startDate;
        }
        
        if (dateRange.endDate) {
          matchCondition.timestamp.$lte = dateRange.endDate;
        }
      };
      
      // Get top categories with positive feedback
      const topCategories = await FeedbackLog.aggregate([
        { 
          $match: { 
            ...matchCondition,
            action: { $in: ['purchased', 'saved', 'favorited'] }
          } 
        },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]);
      
      // Get top tags with positive feedback
      const topTags = await FeedbackLog.aggregate([
        { 
          $match: { 
            ...matchCondition,
            action: { $in: ['purchased', 'saved', 'favorited'] }
          } 
        },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);
      
      // Get categories/tags with negative feedback
      const negativeCategories = await FeedbackLog.aggregate([
        { 
          $match: { 
            ...matchCondition,
            action: 'ignored'
          } 
        },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 3 }
      ]);
      
      const negativeTags = await FeedbackLog.aggregate([
        { 
          $match: { 
            ...matchCondition,
            action: 'ignored'
          } 
        },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]);
      
      // Get average ratings
      const ratings = await FeedbackLog.aggregate([
        { 
          $match: { 
            ...matchCondition,
            explicitRating: { $ne: null } 
          } 
        },
        { 
          $group: { 
            _id: null, 
            averageRating: { $avg: '$explicitRating' },
            count: { $sum: 1 },
            minRating: { $min: '$explicitRating' },
            maxRating: { $max: '$explicitRating' }
          } 
        }
      ]);
      
      // Get monthly trends if date range spans more than 2 months
      let monthlyTrends = [];
      if (dateRange.startDate && dateRange.endDate) {
        const monthsDiff = (dateRange.endDate.getFullYear() - dateRange.startDate.getFullYear()) * 12 + 
                         (dateRange.endDate.getMonth() - dateRange.startDate.getMonth());
        
        if (monthsDiff >= 2) {
          monthlyTrends = await FeedbackLog.aggregate([
            { $match: matchCondition },
            {
              $group: {
                _id: { 
                  year: { $year: "$timestamp" },
                  month: { $month: "$timestamp" }
                },
                count: { $sum: 1 },
                positiveCount: {
                  $sum: {
                    $cond: [
                      { $in: ["$action", ['purchased', 'saved', 'favorited']] },
                      1,
                      0
                    ]
                  }
                }
              }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
          ]);
        }
      }
      
      // Count total feedback with the given criteria
      const totalFeedback = await FeedbackLog.countDocuments(matchCondition);
      
      return {
        topCategories: topCategories.map(c => ({ category: c._id, count: c.count })),
        topTags: topTags.map(t => ({ tag: t._id, count: t.count })),
        negativeCategories: negativeCategories.map(c => ({ category: c._id, count: c.count })),
        negativeTags: negativeTags.map(t => ({ tag: t._id, count: t.count })),
        ratings: ratings.length > 0 ? {
          average: ratings[0].averageRating,
          count: ratings[0].count,
          min: ratings[0].minRating,
          max: ratings[0].maxRating
        } : { average: 0, count: 0, min: 0, max: 0 },
        totalFeedback,
        monthlyTrends: monthlyTrends.map(m => ({
          year: m._id.year,
          month: m._id.month,
          count: m.count,
          positiveCount: m.positiveCount,
          positiveRate: m.count > 0 ? m.positiveCount / m.count : 0
        }))
      };
    } catch (error) {
      logger.error('[feedbackService] Error getting recipient feedback:', error);
      throw error;
    }
  },
  
  /**
   * Update success metrics for a category
   * @param {String} category - Category to update
   * @param {String} action - Action that was taken
   */
  async updateCategorySuccess(category, action) {
    try {
      if (!category) return;

      logger.debug('[feedbackService] Updating category success metrics for:', category);

      // Category success is aggregated on read by trendAnalysisService;
      // bump its cache version so this feedback shows up immediately.
      const trendAnalysisService = require('./trendAnalysisService');
      await trendAnalysisService.invalidateTrendCache();

      return true;
    } catch (error) {
      logger.error('[feedbackService] Error updating category success:', error);
      // Don't throw the error since this is a background calculation
      return false;
    }
  },
  
  /**
   * Update success metrics for tags
   * @param {Array} tags - Array of tags to update
   * @param {String} action - Action that was taken
   */
  async updateTagSuccess(tags, action) {
    try {
      if (!tags || !Array.isArray(tags) || tags.length === 0) return;

      logger.debug('[feedbackService] Updating tag success metrics for:', tags);

      // Tag effectiveness is aggregated on read by trendAnalysisService;
      // bump its cache version so this feedback shows up immediately.
      const trendAnalysisService = require('./trendAnalysisService');
      await trendAnalysisService.invalidateTrendCache();

      return true;
    } catch (error) {
      logger.error('[feedbackService] Error updating tag success:', error);
      // Don't throw the error since this is a background calculation
      return false;
    }
  },
  
  /**
   * Get feedback history for a specific user with pagination and filtering
   * @param {String} userId - User ID
   * @param {Object} filters - Optional filter criteria
   * @param {Number} limit - Maximum records to return (default 50)
   * @param {Number} page - Page number for pagination (default 1)
   * @returns {Object} Object containing logs and pagination information
   */
  async getUserFeedbackHistory(userId, filters = {}, limit = 50, page = 1) {
    try {
      ({ limit, page } = sanitizePagination(limit, page, 50));
      logger.debug(`[feedbackService] Getting user feedback history for ${userId}`,
        `with filters:`, filters,
        `page ${page}, limit ${limit}`);

      const query = { user: userId };
      
      // Apply filters if provided
      if (filters.action) query.action = filters.action;
      if (filters.category) query.category = filters.category;
      if (filters.recipientId) query.recipient = filters.recipientId;
      
      // Handle date range
      if (filters.startDate || filters.endDate) {
        query.timestamp = {};
        if (filters.startDate) query.timestamp.$gte = filters.startDate;
        if (filters.endDate) query.timestamp.$lte = filters.endDate;
      }
      
      const sortOptions = sanitizeSort(filters);

      // Get total count for pagination
      const totalLogs = await FeedbackLog.countDocuments(query);
      const totalPages = Math.ceil(totalLogs / limit);
      const skip = (page - 1) * limit;

      // Get logs with populated references
      const logs = await FeedbackLog.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .populate('gift', 'name category tags estimatedPrice status')
        .populate('recipient', 'firstName lastName')
        .lean();
      
      return {
        logs,
        totalLogs,
        totalPages,
        currentPage: page
      };
    } catch (error) {
      logger.error('[feedbackService] Error getting user feedback history:', error);
      throw error;
    }
  },
  
  /**
   * Get recipient feedback timeline
   * @param {String} recipientId - Recipient ID
   * @param {Object} dateRange - Optional date range for filtering
   * @returns {Promise<Array>} Array of feedback events in chronological order
   */
  async getRecipientFeedbackTimeline(recipientId, dateRange = {}, userId) {
    try {
      logger.debug(`[feedbackService] Getting feedback timeline for recipient ${recipientId}`, 
        dateRange.startDate ? `from ${dateRange.startDate.toISOString()}` : '', 
        dateRange.endDate ? `to ${dateRange.endDate.toISOString()}` : '');
      
      if (!recipientId) {
        throw new Error('Recipient ID is required');
      }
      
      // Build match condition with date range if provided
      const matchCondition = { recipient: new mongoose.Types.ObjectId(recipientId) };
      // Only the caller's own feedback: logs carry free-text comments
      if (userId) matchCondition.user = new mongoose.Types.ObjectId(String(userId));
      
      if (dateRange.startDate || dateRange.endDate) {
        matchCondition.timestamp = {};
        
        if (dateRange.startDate) {
          matchCondition.timestamp.$gte = dateRange.startDate;
        }
        
        if (dateRange.endDate) {
          matchCondition.timestamp.$lte = dateRange.endDate;
        }
      }
      
      // Get feedback events in chronological order
      const feedbackEvents = await FeedbackLog.find(matchCondition)
        .sort({ timestamp: 1 })
        .populate('gift', 'name description category tags estimatedPrice status')
        .lean();
      
      logger.debug(`[feedbackService] Retrieved ${feedbackEvents.length} feedback events for timeline`);
      
      // Format the events for easier consumption
      const formattedEvents = feedbackEvents.map(event => {
        return {
          id: event._id,
          date: event.timestamp,
          action: event.action,
          giftName: event.gift ? event.gift.name : 'Unknown Gift',
          giftId: event.gift ? event.gift._id : null,
          category: event.category || (event.gift ? event.gift.category : null),
          tags: event.tags || (event.gift ? event.gift.tags : []),
          price: event.gift ? event.gift.estimatedPrice : null,
          status: event.gift ? event.gift.status : null,
          rating: event.explicitRating || null,
          comment: event.comment || null
        };
      });
      
      return formattedEvents;
    } catch (error) {
      logger.error('[feedbackService] Error getting recipient timeline:', error);
      throw error;
    }
  },
  
  /**
   * Get recipient feedback sentiment analysis
   * @param {String} recipientId - Recipient ID
   * @param {Object} dateRange - Optional date range for filtering
   * @returns {Promise<Object>} Sentiment analysis data
   */
  async getRecipientFeedbackSentiment(recipientId, dateRange = {}, userId) {
    try {
      logger.debug(`[feedbackService] Getting feedback sentiment for recipient ${recipientId}`, 
        dateRange.startDate ? `from ${dateRange.startDate.toISOString()}` : '', 
        dateRange.endDate ? `to ${dateRange.endDate.toISOString()}` : '');
      
      if (!recipientId) {
        throw new Error('Recipient ID is required');
      }
      
      // Get the sentiment analysis from trendAnalysisService
      const trendAnalysisService = require('../services/trendAnalysisService');
      return await trendAnalysisService.getRecipientFeedbackSentiment(recipientId, dateRange, userId);
    } catch (error) {
      logger.error('[feedbackService] Error getting recipient sentiment:', error);
      throw error;
    }
  },
  
  /**
   * Update suggestion history with user interaction
   * @param {String} userId - User ID
   * @param {String} recipientId - Recipient ID
   * @param {String} giftId - Gift ID
   * @param {String} interactionType - Type of interaction (viewed, saved, purchased, ignored)
   * @returns {Promise} Promise resolving to the updated record or null
   */
  async updateSuggestionHistory(userId, recipientId, giftId, interactionType) {
    try {
      logger.debug(`[feedbackService] Updating suggestion history for gift ${giftId} with interaction: ${interactionType}`);
      
      if (!SuggestionHistory) {
        logger.debug('[feedbackService] SuggestionHistory model not available');
        return null;
      }
      
      // Find the suggestion history record
      const historyRecord = await SuggestionHistory.findOne({
        user: userId,
        recipient: recipientId,
        gift: giftId
      });
      
      if (!historyRecord) {
        logger.debug('[feedbackService] No suggestion history record found for this gift');
        
        // Try to get the gift details to create a new record
        const gift = await Gift.findById(giftId);
        if (!gift) {
          logger.debug('[feedbackService] Gift not found, cannot create suggestion history');
          return null;
        }
        
        // Create a new suggestion history record
        const newRecord = await SuggestionHistory.recordSuggestion({
          user: userId,
          recipient: recipientId,
          gift: giftId,
          similarityScore: 0,
          relevanceScore: gift.relevanceScore || 50,
          giftName: gift.name,
          giftCategory: gift.category,
          giftTags: gift.tags || [],
          giftPrice: gift.price || gift.estimatedPrice
        });
        
        // Update the interaction on the new record
        return await SuggestionHistory.updateInteraction(
          userId,
          recipientId,
          giftId,
          interactionType
        );
      }
      
      // Update the existing record
      return await SuggestionHistory.updateInteraction(
        userId,
        recipientId,
        giftId,
        interactionType
      );
    } catch (error) {
      logger.error('[feedbackService] Error updating suggestion history:', error);
      return null;
    }
  }
};

module.exports = feedbackService;
