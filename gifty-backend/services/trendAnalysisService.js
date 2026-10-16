const FeedbackLog = require('../models/FeedbackLog');
const mongoose = require('mongoose');
const { getTimeZone } = require('../utils/dates');
const logger = require('../utils/logger');

// Feedback belongs to one account: every analysis reads only that account's
// feedback when given a userId
const ownedBy = (matchCondition, userId) => {
  if (userId) matchCondition.user = new mongoose.Types.ObjectId(String(userId));
  return matchCondition;
};

const trendAnalysisService = {
  /**
   * Analyze category success rates
   * @param {Object} dateRange - Optional date range with start and end dates
   * @param {String} [userId] - Only this account's feedback
   * @returns {Object} Category success metrics
   */
  async analyzeCategorySuccess(dateRange = {}, userId = null) {
    try {
      logger.debug('[trendAnalysisService] Analyzing category success rates...');
      
      // Build match condition with date range if provided
      const matchCondition = ownedBy({ action: { $in: ['purchased', 'saved', 'ignored'] } }, userId);
      
      if (dateRange.startDate && dateRange.endDate) {
        matchCondition.timestamp = {
          $gte: new Date(dateRange.startDate),
          $lte: new Date(dateRange.endDate)
        };
      }
      
      logger.debug('[trendAnalysisService] Using date range:', dateRange.startDate ? `From ${dateRange.startDate.toISOString()}` : 'No start date', 
        dateRange.endDate ? `To ${dateRange.endDate.toISOString()}` : 'No end date');
      
      const results = await FeedbackLog.aggregate([
        {
          $match: matchCondition
        },
        {
          $group: {
            _id: {
              category: '$category',
              action: '$action'
            },
            count: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: '$_id.category',
            actions: {
              $push: {
                action: '$_id.action',
                count: '$count'
              }
            },
            totalInteractions: { $sum: '$count' }
          }
        },
        {
          $project: {
            category: '$_id',
            actions: 1,
            totalInteractions: 1,
            _id: 0
          }
        }
      ]);
      
      logger.debug('[trendAnalysisService] Raw category metrics:', results.length);
      
      // Calculate success rates
      const categoryMetrics = results.map(category => {
        const actionCounts = category.actions.reduce((acc, item) => {
          acc[item.action] = item.count;
          return acc;
        }, {});
        
        const purchaseRate = (actionCounts.purchased || 0) / category.totalInteractions;
        const saveRate = (actionCounts.saved || 0) / category.totalInteractions;
        const ignoreRate = (actionCounts.ignored || 0) / category.totalInteractions;
        
        const metrics = {
          category: category.category || 'Unknown',
          totalInteractions: category.totalInteractions || 0,
          purchaseRate: purchaseRate || 0,
          saveRate: saveRate || 0,
          ignoreRate: ignoreRate || 0,
          successRate: purchaseRate + (saveRate * 0.5) // Weighted success metric
        };
        
        logger.debug('[trendAnalysisService] Category metrics:', {
          category: metrics.category,
          interactions: metrics.totalInteractions,
          successRate: metrics.successRate
        });
        
        return metrics;
      });
      
      logger.debug('[trendAnalysisService] Final category metrics:', categoryMetrics);
      
      return categoryMetrics;
    } catch (error) {
      logger.error('[trendAnalysisService] Error analyzing category success:', error);
      throw error;
    }
  },
  
  /**
   * Analyze tag effectiveness
   * @param {Object} dateRange - Optional date range with start and end dates
   * @param {String} [userId] - Only this account's feedback
   * @returns {Object} Tag effectiveness metrics
   */
  async analyzeTagEffectiveness(dateRange = {}, userId = null) {
    try {
      logger.debug('[trendAnalysisService] Analyzing tag effectiveness...');
      
      // Build match condition with date range if provided
      const matchCondition = ownedBy({
        action: { $in: ['purchased', 'saved', 'ignored'] },
        tags: { $exists: true, $ne: [] }
      }, userId);
      
      if (dateRange.startDate && dateRange.endDate) {
        matchCondition.timestamp = {
          $gte: new Date(dateRange.startDate),
          $lte: new Date(dateRange.endDate)
        };
      }
      
      logger.debug('[trendAnalysisService] Using date range for tag analysis:', dateRange.startDate ? `From ${dateRange.startDate.toISOString()}` : 'No start date', 
        dateRange.endDate ? `To ${dateRange.endDate.toISOString()}` : 'No end date');
      
      const results = await FeedbackLog.aggregate([
        {
          $match: matchCondition
        },
        {
          $unwind: '$tags'
        },
        {
          $group: {
            _id: {
              tag: '$tags',
              action: '$action'
            },
            count: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: '$_id.tag',
            actions: {
              $push: {
                action: '$_id.action',
                count: '$count'
              }
            },
            totalInteractions: { $sum: '$count' }
          }
        },
        {
          $project: {
            tag: '$_id',
            actions: 1,
            totalInteractions: 1,
            _id: 0
          }
        }
      ]);
      
      logger.debug('[trendAnalysisService] Raw tag metrics:', results.length);
      
      // Calculate success rates
      const tagMetrics = results.map(tag => {
        const actionCounts = tag.actions.reduce((acc, item) => {
          acc[item.action] = item.count;
          return acc;
        }, {});
        
        const purchaseRate = (actionCounts.purchased || 0) / tag.totalInteractions;
        const saveRate = (actionCounts.saved || 0) / tag.totalInteractions;
        const ignoreRate = (actionCounts.ignored || 0) / tag.totalInteractions;
        
        const metrics = {
          tag: tag.tag || 'Unknown',
          totalInteractions: tag.totalInteractions || 0,
          purchaseRate: purchaseRate || 0,
          saveRate: saveRate || 0,
          ignoreRate: ignoreRate || 0,
          successRate: purchaseRate + (saveRate * 0.5) // Weighted success metric
        };
        
        logger.debug('[trendAnalysisService] Tag metrics:', {
          tag: metrics.tag,
          interactions: metrics.totalInteractions,
          successRate: metrics.successRate
        });
        
        return metrics;
      });
      
      logger.debug('[trendAnalysisService] Final tag metrics:', tagMetrics);
      
      return tagMetrics;
    } catch (error) {
      logger.error('[trendAnalysisService] Error analyzing tag effectiveness:', error);
      throw error;
    }
  },
  
  /**
   * Analyze recipient preferences 
   * @param {String} recipientId - Recipient ID
   * @param {Object} dateRange - Optional date range with start and end dates
   * @param {String} [userId] - Restrict to feedback recorded by this user
   * @returns {Object} Recipient preference patterns
   */
  async analyzeRecipientPreferences(recipientId, dateRange = {}, userId = null) {
    try {
      logger.debug('[trendAnalysisService] Analyzing recipient preferences:', recipientId);
      
      if (!recipientId) {
        throw new Error('Recipient ID is required');
      }
      
      // Build match condition with date range if provided
      const matchCondition = { 
        recipient: new mongoose.Types.ObjectId(recipientId),
        action: { $in: ['purchased', 'saved', 'favorited'] }
      };
      if (userId) {
        matchCondition.user = new mongoose.Types.ObjectId(String(userId));
      }
      
      if (dateRange.startDate && dateRange.endDate) {
        matchCondition.timestamp = {
          $gte: new Date(dateRange.startDate),
          $lte: new Date(dateRange.endDate)
        };
      }
      
      logger.debug('[trendAnalysisService] Using date range for recipient analysis:', dateRange.startDate ? `From ${dateRange.startDate.toISOString()}` : 'No start date', 
        dateRange.endDate ? `To ${dateRange.endDate.toISOString()}` : 'No end date');
      
      const results = await FeedbackLog.aggregate([
        {
          $match: matchCondition
        },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            averageRating: { $avg: '$explicitRating' }
          }
        },
        {
          $project: {
            category: '$_id',
            count: 1,
            averageRating: 1,
            _id: 0
          }
        },
        {
          $sort: { count: -1 }
        }
      ]);
      
      logger.debug('[trendAnalysisService] Recipient category preferences:', results.length);
      
      // Also analyze tags - use same date range
      const tagMatchCondition = { 
        recipient: new mongoose.Types.ObjectId(recipientId),
        action: { $in: ['purchased', 'saved', 'favorited'] },
        tags: { $exists: true, $ne: [] }
      };
      if (userId) {
        tagMatchCondition.user = new mongoose.Types.ObjectId(String(userId));
      }
      
      if (dateRange.startDate && dateRange.endDate) {
        tagMatchCondition.timestamp = {
          $gte: new Date(dateRange.startDate),
          $lte: new Date(dateRange.endDate)
        };
      }
      
      const tagResults = await FeedbackLog.aggregate([
        {
          $match: tagMatchCondition
        },
        {
          $unwind: '$tags'
        },
        {
          $group: {
            _id: '$tags',
            count: { $sum: 1 },
            averageRating: { $avg: '$explicitRating' }
          }
        },
        {
          $project: {
            tag: '$_id',
            count: 1,
            averageRating: 1,
            _id: 0
          }
        },
        {
          $sort: { count: -1 }
        }
      ]);
      
      logger.debug('[trendAnalysisService] Recipient tag preferences:', tagResults.length);
      
      return {
        categoryPreferences: results.map(item => ({
          category: item.category || item._id,
          count: item.count,
          averageRating: item.averageRating
        })),
        tagPreferences: tagResults.map(item => ({
          tag: item.tag || item._id,
          count: item.count,
          averageRating: item.averageRating
        }))
      };
    } catch (error) {
      logger.error('[trendAnalysisService] Error analyzing recipient preferences:', error);
      throw error;
    }
  },
  
  /**
   * Get global gift suggestion performance metrics
   * @param {Object} dateRange - Optional date range with start and end dates
   * @param {String} [userId] - Only this account's feedback
   * @returns {Object} Suggestion performance metrics
   */
  async getGlobalPerformanceMetrics(dateRange = {}, userId = null) {
    try {
      logger.debug('[trendAnalysisService] Getting global performance metrics...');
      
      // Build match condition with date range if provided
      const matchCondition = ownedBy({}, userId);
      
      if (dateRange.startDate && dateRange.endDate) {
        matchCondition.timestamp = {
          $gte: new Date(dateRange.startDate),
          $lte: new Date(dateRange.endDate)
        };
      }
      
      logger.debug('[trendAnalysisService] Using date range for global metrics:', dateRange.startDate ? `From ${dateRange.startDate.toISOString()}` : 'No start date', 
        dateRange.endDate ? `To ${dateRange.endDate.toISOString()}` : 'No end date');
      
      const metrics = await FeedbackLog.aggregate([
        {
          $match: matchCondition
        },
        {
          $group: {
            _id: '$action',
            count: { $sum: 1 }
          }
        }
      ]);
      
      const totalInteractions = metrics.reduce((sum, metric) => sum + metric.count, 0);
      
      const actionsMap = metrics.reduce((acc, metric) => {
        acc[metric._id] = metric.count;
        return acc;
      }, {});
      
      const purchaseRate = totalInteractions > 0 ? (actionsMap['purchased'] || 0) / totalInteractions : 0;
      const saveRate = totalInteractions > 0 ? (actionsMap['saved'] || 0) / totalInteractions : 0;
      const ignoreRate = totalInteractions > 0 ? (actionsMap['ignored'] || 0) / totalInteractions : 0;
      const viewedOnlyRate = totalInteractions > 0 ? (actionsMap['viewed'] || 0) / totalInteractions : 0;
      
      const results = {
        totalInteractions,
        actionsBreakdown: actionsMap,
        purchaseRate,
        saveRate,
        ignoreRate,
        viewedOnlyRate,
        successRate: purchaseRate + (saveRate * 0.5)
      };
      
      logger.debug('[trendAnalysisService] Global metrics calculated:', {
        interactions: results.totalInteractions,
        successRate: results.successRate,
        actions: Object.keys(actionsMap).join(', ')
      });
      
      return results;
    } catch (error) {
      logger.error('[trendAnalysisService] Error getting global metrics:', error);
      throw error;
    }
  },
  /**
   * Get time-based trends for feedback analysis
   * @param {Object} dateRange - Date range with start and end dates
   * @param {String} groupBy - Time unit to group by (day, week, month)
   * @param {String} [userId] - Only this account's feedback
   * @returns {Array} Array of time-based trend data points
   */
  async getTimeBasedTrends(dateRange = {}, groupBy = 'day', userId = null) {
    try {
      logger.debug('[trendAnalysisService] Getting time-based trends, grouping by:', groupBy);
      
      // Ensure we have a date range for time-based analysis
      if (!dateRange.startDate || !dateRange.endDate) {
        logger.debug('[trendAnalysisService] No date range provided for time-based analysis, using last 30 days');
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30); // Default to last 30 days
        
        dateRange = {
          startDate,
          endDate
        };
      }
      
      // Build match condition with date range
      const matchCondition = ownedBy({
        timestamp: {
          $gte: new Date(dateRange.startDate),
          $lte: new Date(dateRange.endDate)
        }
      }, userId);
      
      // Buckets are keyed by the ISO date they start on, counted in the
      // instance time zone: the day, the Monday of the ISO week, or the 1st
      const period = ['week', 'month'].includes(groupBy) ? groupBy : 'day';
      const at = { date: '$timestamp', timezone: getTimeZone() };
      const bucketStart = {
        day: { $dateToString: { format: '%Y-%m-%d', ...at } },
        month: { $dateToString: { format: '%Y-%m-01', ...at } },
        week: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: { $dateFromParts: { isoWeekYear: { $isoWeekYear: at }, isoWeek: { $isoWeek: at }, isoDayOfWeek: 1 } }
          }
        }
      }[period];

      const results = await FeedbackLog.aggregate([
        {
          $match: matchCondition
        },
        {
          $group: {
            _id: bucketStart,
            total: { $sum: 1 },
            purchased: {
              $sum: {
                $cond: [{ $eq: ["$action", "purchased"] }, 1, 0]
              }
            },
            saved: {
              $sum: {
                $cond: [{ $eq: ["$action", "saved"] }, 1, 0]
              }
            },
            ignored: {
              $sum: {
                $cond: [{ $eq: ["$action", "ignored"] }, 1, 0]
              }
            },
            favorited: {
              $sum: {
                $cond: [{ $eq: ["$action", "favorited"] }, 1, 0]
              }
            },
            viewed: {
              $sum: {
                $cond: [{ $eq: ["$action", "viewed"] }, 1, 0]
              }
            },
            averageRating: { $avg: "$explicitRating" }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]);
      
      // Format the results for easier consumption
      const formattedResults = results.map(item => {
        // Calculate positive rate
        const positiveInteractions = item.purchased + item.saved + item.favorited;
        const positiveRate = item.total > 0 ? positiveInteractions / item.total : 0;
        
        return {
          date: item._id,
          period,
          total: item.total,
          purchased: item.purchased,
          saved: item.saved,
          ignored: item.ignored,
          favorited: item.favorited,
          viewed: item.viewed,
          averageRating: item.averageRating || 0,
          positiveRate: positiveRate
        };
      });
      
      logger.debug(`[trendAnalysisService] Retrieved ${formattedResults.length} time-based data points`);
      
      return formattedResults;
    } catch (error) {
      logger.error('[trendAnalysisService] Error getting time-based trends:', error);
      throw error;
    }
  },
  
  /**
   * Get recipient feedback timeline for detailed analysis
   * @param {String} recipientId - Recipient ID
   * @param {Object} dateRange - Date range with start and end dates
   * @returns {Array} Timeline of recipient feedback events
   */
  async getRecipientFeedbackTimeline(recipientId, dateRange = {}) {
    try {
      logger.debug(`[trendAnalysisService] Getting feedback timeline for recipient: ${recipientId}`);
      
      if (!recipientId) {
        throw new Error('Recipient ID is required');
      }
      
      // Build match condition with date range
      const matchCondition = {
        recipient: new mongoose.Types.ObjectId(recipientId)
      };
      
      if (dateRange.startDate && dateRange.endDate) {
        matchCondition.timestamp = {
          $gte: new Date(dateRange.startDate),
          $lte: new Date(dateRange.endDate)
        };
      }
      
      // Get feedback logs in chronological order
      let query = FeedbackLog.find(matchCondition)
        .sort({ timestamp: 1 })
        .populate('gift', 'name category tags estimatedPrice');
      
      // Add lean() only if it's available (in real MongoDB but not in mocks)
      try {
        if (typeof query.lean === 'function') {
          query = query.lean();
        }
      } catch (error) {
        // Ignore if lean is not available
      }
      
      const feedbackLogs = await query;
      
      // Process logs into timeline format
      const timeline = feedbackLogs.map(log => {
        return {
          id: log._id,
          timestamp: log.timestamp,
          action: log.action,
          rating: log.explicitRating,
          gift: {
            id: log.gift._id,
            name: log.gift.name,
            category: log.gift.category,
            tags: log.gift.tags,
            estimatedPrice: log.gift.estimatedPrice
          },
          category: log.category,
          tags: log.tags,
          comment: log.comment
        };
      });
      
      // Group by month for timeline visualization
      const groupedByMonth = {};
      timeline.forEach(item => {
        const date = new Date(item.timestamp);
        const monthYear = `${date.getMonth() + 1}/${date.getFullYear()}`;
        
        if (!groupedByMonth[monthYear]) {
          groupedByMonth[monthYear] = [];
        }
        
        groupedByMonth[monthYear].push(item);
      });
      
      // Convert to array format
      const timelineByMonth = Object.keys(groupedByMonth).map(monthYear => {
        return {
          month: monthYear,
          events: groupedByMonth[monthYear]
        };
      });
      
      // Sort by month (newest first)
      timelineByMonth.sort((a, b) => {
        const [aMonth, aYear] = a.month.split('/');
        const [bMonth, bYear] = b.month.split('/');
        
        if (aYear !== bYear) {
          return bYear - aYear;
        }
        
        return bMonth - aMonth;
      });
      
      logger.debug(`[trendAnalysisService] Retrieved timeline with ${timeline.length} events across ${timelineByMonth.length} months`);
      
      return {
        timeline,
        timelineByMonth
      };
    } catch (error) {
      logger.error('[trendAnalysisService] Error getting recipient feedback timeline:', error);
      throw error;
    }
  },
  
  /**
   * Get sentiment analysis for recipient feedback
   * @param {String} recipientId - Recipient ID
   * @param {Object} dateRange - Date range with start and end dates
   * @returns {Object} Sentiment analysis metrics
   */
  async getRecipientFeedbackSentiment(recipientId, dateRange = {}, userId) {
    try {
      logger.debug(`[trendAnalysisService] Analyzing sentiment for recipient: ${recipientId}`);
      
      if (!recipientId) {
        throw new Error('Recipient ID is required');
      }
      
      // Build match condition with date range
      const matchCondition = {
        recipient: new mongoose.Types.ObjectId(recipientId)
      };
      if (userId) matchCondition.user = new mongoose.Types.ObjectId(String(userId));
      
      if (dateRange.startDate && dateRange.endDate) {
        matchCondition.timestamp = {
          $gte: new Date(dateRange.startDate),
          $lte: new Date(dateRange.endDate)
        };
      }
      
      // Get action distribution
      const actionDistribution = await FeedbackLog.aggregate([
        { $match: matchCondition },
        { $group: { _id: '$action', count: { $sum: 1 } } }
      ]);
      
      // Get rating distribution
      const ratingDistribution = await FeedbackLog.aggregate([
        { 
          $match: { 
            ...matchCondition,
            explicitRating: { $ne: null } 
          } 
        },
        { $group: { _id: '$explicitRating', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]);
      
      // Get average ratings over time (monthly)
      const ratingTrend = await FeedbackLog.aggregate([
        { 
          $match: { 
            ...matchCondition,
            explicitRating: { $ne: null } 
          } 
        },
        {
          $group: {
            _id: {
              year: { $year: "$timestamp" },
              month: { $month: "$timestamp" }
            },
            averageRating: { $avg: "$explicitRating" },
            count: { $sum: 1 }
          }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } }
      ]);
      
      // Format the rating trend data
      const formattedRatingTrend = ratingTrend.map(item => {
        return {
          month: `${item._id.month}/${item._id.year}`,
          averageRating: item.averageRating,
          count: item.count
        };
      });
      
      // Format action distribution
      const formattedActionDistribution = {};
      let totalActions = 0;
      
      actionDistribution.forEach(item => {
        formattedActionDistribution[item._id] = item.count;
        totalActions += item.count;
      });
      
      // Calculate positive/negative/neutral sentiment
      const positiveActions = ['purchased', 'saved', 'favorited'];
      const negativeActions = ['ignored'];
      
      const positiveCount = positiveActions.reduce((sum, action) => {
        return sum + (formattedActionDistribution[action] || 0);
      }, 0);
      
      const negativeCount = negativeActions.reduce((sum, action) => {
        return sum + (formattedActionDistribution[action] || 0);
      }, 0);
      
      const neutralCount = totalActions - positiveCount - negativeCount;
      
      // Format rating distribution
      const formattedRatingDistribution = [0, 0, 0, 0, 0]; // Initialize with zeros for ratings 1-5
      ratingDistribution.forEach(item => {
        if (item._id >= 1 && item._id <= 5) {
          formattedRatingDistribution[item._id - 1] = item.count;
        }
      });
      
      // Calculate overall sentiment score (scale of -1 to 1)
      let sentimentScore = 0;
      
      if (totalActions > 0) {
        // Weight from actions
        const actionWeight = 0.7;
        const actionSentiment = (positiveCount - negativeCount) / totalActions;
        
        // Weight from ratings (if available)
        const ratingWeight = 0.3;
        let ratingSentiment = 0;
        
        const totalRatings = formattedRatingDistribution.reduce((sum, count) => sum + count, 0);
        if (totalRatings > 0) {
          // Convert 1-5 scale to -1 to 1 scale: (rating - 3) / 2
          let weightedRatingSum = 0;
          for (let i = 0; i < 5; i++) {
            const ratingValue = (i + 1 - 3) / 2; // Convert to -1 to 1 scale
            weightedRatingSum += ratingValue * formattedRatingDistribution[i];
          }
          ratingSentiment = weightedRatingSum / totalRatings;
        }
        
        // Combine weighted sentiment scores
        sentimentScore = (actionSentiment * actionWeight) + (ratingSentiment * ratingWeight);
      }
      
      // Create sentiment distribution for the frontend component
      const sentimentDistribution = [
        { sentiment: 'Very Positive', count: 0, color: '#2ecc71' },
        { sentiment: 'Positive', count: 0, color: '#3498db' },
        { sentiment: 'Neutral', count: 0, color: '#95a5a6' },
        { sentiment: 'Negative', count: 0, color: '#e67e22' },
        { sentiment: 'Very Negative', count: 0, color: '#e74c3c' }
      ];
      
      // Distribute the actions into sentiment categories
      if (totalActions > 0) {
        // Positive actions go to Very Positive and Positive
        if (positiveCount > 0) {
          const purchasedCount = formattedActionDistribution['purchased'] || 0;
          const savedCount = formattedActionDistribution['saved'] || 0;
          const favoritedCount = formattedActionDistribution['favorited'] || 0;
          
          // Purchased is Very Positive
          sentimentDistribution[0].count += purchasedCount;
          
          // Saved and favorited are Positive
          sentimentDistribution[1].count += (savedCount + favoritedCount);
        }
        
        // Neutral actions go to Neutral
        sentimentDistribution[2].count += neutralCount;
        
        // Negative actions go to Negative and Very Negative
        if (negativeCount > 0) {
          const ignoredCount = formattedActionDistribution['ignored'] || 0;
          
          // Split ignored between Negative and Very Negative based on ratings
          const lowRatings = formattedRatingDistribution[0] + formattedRatingDistribution[1]; // 1-2 stars
          const totalRatings = formattedRatingDistribution.reduce((sum, count) => sum + count, 0);
          
          if (totalRatings > 0 && lowRatings > 0) {
            const veryNegativeRatio = formattedRatingDistribution[0] / totalRatings;
            const negativeRatio = formattedRatingDistribution[1] / totalRatings;
            
            sentimentDistribution[4].count += Math.round(ignoredCount * veryNegativeRatio);
            sentimentDistribution[3].count += Math.round(ignoredCount * negativeRatio);
          } else {
            // If no ratings, put all ignored in Negative
            sentimentDistribution[3].count += ignoredCount;
          }
        }
      }
      
      // Get top positive and negative tags
      const topPositiveTags = await FeedbackLog.aggregate([
        { 
          $match: { 
            ...matchCondition,
            action: { $in: positiveActions },
            tags: { $exists: true, $ne: [] }
          } 
        },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 3 }
      ]);
      
      const topNegativeTags = await FeedbackLog.aggregate([
        { 
          $match: { 
            ...matchCondition,
            action: { $in: negativeActions },
            tags: { $exists: true, $ne: [] }
          } 
        },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 3 }
      ]);
      
      const result = {
        sentimentScore,
        sentimentText: getSentimentText(sentimentScore),
        sentimentDistribution,
        averageSentiment: (sentimentScore + 1) / 2, // Convert from -1,1 to 0,1 scale
        topPositiveTags: topPositiveTags.map(t => t._id),
        topNegativeTags: topNegativeTags.map(t => t._id),
        actions: {
          distribution: formattedActionDistribution,
          total: totalActions,
          positive: positiveCount,
          negative: negativeCount,
          neutral: neutralCount,
          positiveRate: totalActions > 0 ? positiveCount / totalActions : 0,
          negativeRate: totalActions > 0 ? negativeCount / totalActions : 0
        },
        ratings: {
          distribution: formattedRatingDistribution,
          trend: formattedRatingTrend
        }
      };
      
      logger.debug(`[trendAnalysisService] Sentiment analysis completed with score: ${sentimentScore.toFixed(2)} (${result.sentimentText})`);
      
      return result;
    } catch (error) {
      logger.error('[trendAnalysisService] Error analyzing sentiment:', error);
      throw error;
    }
  }
};

/**
 * Helper function to convert sentiment score to text description
 * @param {Number} score - Sentiment score (-1 to 1)
 * @returns {String} Text description of sentiment
 */
function getSentimentText(score) {
  if (score >= 0.6) return 'Very Positive';
  if (score >= 0.2) return 'Positive';
  if (score >= -0.2) return 'Neutral';
  if (score >= -0.6) return 'Negative';
  return 'Very Negative';
}

// ---------------------------------------------------------------------------
// Redis cache for the GLOBAL (cross-user) aggregations. These scan the whole
// FeedbackLog collection, change slowly, and are recomputed on every Enhanced
// suggestion request — caching them is nearly free accuracy-wise and removes
// two full-collection aggregations from the request path.
//
// Fails open: if Redis is unavailable (or not yet connected) we just run the
// aggregation. Disabled under test so unit tests stay hermetic.
// ---------------------------------------------------------------------------

const TREND_CACHE_TTL = parseInt(process.env.AI_TREND_CACHE_TTL, 10) || 600;
const TREND_CACHE_ENABLED =
  process.env.AI_TREND_CACHE_ENABLED !== 'false' && process.env.NODE_ENV !== 'test';

function getTrendCacheRedis() {
  // Lazy require: config/redis opens connections at require time, which we
  // only want when caching is actually in play.
  try {
    const { redisClient } = require('../config/redis');
    return redisClient && redisClient.status === 'ready' ? redisClient : null;
  } catch {
    return null;
  }
}

const TREND_CACHE_VERSION_KEY = 'gifty:analytics:trend:ver';

function cacheGlobalAggregation(methodName) {
  const original = trendAnalysisService[methodName].bind(trendAnalysisService);
  trendAnalysisService[methodName] = async function (dateRange = {}, userId = null) {
    if (!TREND_CACHE_ENABLED) return original(dateRange, userId);
    const redis = getTrendCacheRedis();
    if (!redis) return original(dateRange, userId);

    // The version is bumped on positive feedback (feedbackService) so
    // fresh signals show up before the TTL would have expired.
    let key;
    try {
      const version = (await redis.get(TREND_CACHE_VERSION_KEY)) || '0';
      // One entry per account: a key without the user would serve one
      // account's feedback to another
      key = `gifty:analytics:trend:v${version}:${methodName}:${userId ? String(userId) : 'all'}:${JSON.stringify(dateRange)}`;
      const hit = await redis.get(key);
      if (hit) return JSON.parse(hit);
    } catch (err) {
      logger.warn(`[trendAnalysisService] Cache read failed (${methodName}):`, err.message);
    }

    const result = await original(dateRange, userId);
    if (key) {
      try {
        await redis.setex(key, TREND_CACHE_TTL, JSON.stringify(result));
      } catch (err) {
        logger.warn(`[trendAnalysisService] Cache write failed (${methodName}):`, err.message);
      }
    }
    return result;
  };
}

cacheGlobalAggregation('analyzeCategorySuccess');
cacheGlobalAggregation('analyzeTagEffectiveness');

/**
 * Invalidate the cached global trend aggregations by bumping the
 * version key. Old-version entries age out via their TTL.
 * @returns {Boolean} true on success (or when caching is off)
 */
trendAnalysisService.invalidateTrendCache = async function () {
  if (!TREND_CACHE_ENABLED) return true;
  const redis = getTrendCacheRedis();
  if (!redis) return true;
  try {
    await redis.incr(TREND_CACHE_VERSION_KEY);
    return true;
  } catch (err) {
    logger.warn('[trendAnalysisService] Trend cache invalidation failed:', err.message);
    return false;
  }
};

module.exports = trendAnalysisService;
