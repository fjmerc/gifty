// Feedback on gift suggestions: tracking and the analytics built from it
const feedbackService = require('../services/feedbackService');
const Gift = require('../models/Gift');
const { findOwned } = require('../utils/ownership');
const logger = require('../utils/logger');

// POST /api/feedback - Track user feedback on gift suggestions
exports.trackFeedback = async (req, res) => {
  try {
    const feedback = {
      giftId: req.body.giftId,
      action: req.body.action,
      explicitRating: req.body.explicitRating,
      comment: req.body.comment,
      userId: req.user.id // From auth middleware
    };
    
    if (!feedback.giftId || !feedback.action) {
      logger.debug('[feedbackRoutes] Missing required fields');
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    if (!['viewed', 'saved', 'purchased', 'ignored', 'favorited'].includes(feedback.action)) {
      logger.debug('[feedbackRoutes] Invalid action:', feedback.action);
      return res.status(400).json({ message: 'Invalid action' });
    }
    
    if (feedback.explicitRating && (feedback.explicitRating < 1 || feedback.explicitRating > 5)) {
      logger.debug('[feedbackRoutes] Invalid rating:', feedback.explicitRating);
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }
    
    // Feedback can only be given on the caller's own gifts; anything else is a 404
    await findOwned(Gift, feedback.giftId, req.user._id, { label: 'Gift', select: '_id' });

    // Not the comment: it is the user's own words
    logger.debug('[feedback] Tracking feedback', { giftId: feedback.giftId, action: feedback.action });
    const result = await feedbackService.trackFeedback(feedback);
    
    if (result.success) {
      logger.debug('[feedbackRoutes] Feedback recorded successfully');
      res.status(200).json({ 
        message: 'Feedback recorded successfully',
        gift: result.gift
      });
    } else {
      logger.debug('[feedbackRoutes] Error recording feedback:', result.error);
      res.status(400).json({ message: result.error });
    }
  } catch (error) {
    logger.error('[feedbackRoutes] Error in feedback route:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/feedback/analytics - Get gift suggestion analytics
exports.getFeedbackAnalytics = async (req, res) => {
  try {
    const trendAnalysisService = require('../services/trendAnalysisService');
    logger.debug('[feedbackRoutes] Getting feedback analytics');
    
    // Parse date range parameters, if provided
    const dateRange = {
      startDate: req.query.startDate ? new Date(req.query.startDate) : null,
      endDate: req.query.endDate ? new Date(req.query.endDate) : null
    };
    
    // Check if we have valid dates
    if (dateRange.startDate && isNaN(dateRange.startDate.getTime())) {
      return res.status(400).json({ message: 'Invalid startDate format' });
    }
    
    if (dateRange.endDate && isNaN(dateRange.endDate.getTime())) {
      return res.status(400).json({ message: 'Invalid endDate format' });
    }
    
    // Every figure here is the caller's own feedback
    const globalMetrics = await trendAnalysisService.getGlobalPerformanceMetrics(dateRange, req.user._id);
    
    // Get category success rates with date range
    const categoryMetrics = await trendAnalysisService.analyzeCategorySuccess(dateRange, req.user._id);
    
    // Get tag effectiveness with date range
    const tagMetrics = await trendAnalysisService.analyzeTagEffectiveness(dateRange, req.user._id);
    
    // Get user feedback stats with date range
    const userStats = await feedbackService.getUserFeedbackStats(req.user.id, dateRange);
    
    // Get trend over time metrics if requested
    const includeTimeTrends = req.query.includeTimeTrends === 'true';
    let timeTrends = null;
    
    if (includeTimeTrends) {
      const groupBy = req.query.groupBy || 'day';
      timeTrends = await trendAnalysisService.getTimeBasedTrends(dateRange, groupBy, req.user._id);
    }
    
    logger.debug('[feedbackRoutes] Analytics retrieved:', {
      globalMetricsDataPoints: Object.keys(globalMetrics.actionsBreakdown || {}).length,
      categoryMetricsCount: categoryMetrics.length,
      tagMetricsCount: tagMetrics.length,
      userStats: userStats.totalFeedback,
      dateRange: dateRange.startDate ? `${dateRange.startDate.toISOString()} to ${dateRange.endDate ? dateRange.endDate.toISOString() : 'now'}` : 'all time',
      includeTimeTrends
    });
    
    logger.debug('[feedbackRoutes] Category metrics sample:', categoryMetrics.slice(0, 2));
    logger.debug('[feedbackRoutes] Tag metrics sample:', tagMetrics.slice(0, 2));
    logger.debug('[feedbackRoutes] User stats:', JSON.stringify(userStats, null, 2));
    
    res.status(200).json({
      globalMetrics,
      categoryMetrics,
      tagMetrics,
      userStats,
      dateRange: {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      },
      timeTrends: includeTimeTrends ? timeTrends : undefined
    });
  } catch (error) {
    logger.error('[feedbackRoutes] Error in analytics route:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/feedback/user - Get all feedback submitted by the current user
exports.getUserFeedback = async (req, res) => {
  try {
    logger.debug('[feedbackRoutes] Getting user feedback history for user:', req.user.id);
    
    // Parse date range parameters
    const dateRange = {
      startDate: req.query.startDate ? new Date(req.query.startDate) : null,
      endDate: req.query.endDate ? new Date(req.query.endDate) : null
    };
    
    // Check if we have valid dates
    if (dateRange.startDate && isNaN(dateRange.startDate.getTime())) {
      return res.status(400).json({ message: 'Invalid startDate format' });
    }
    
    if (dateRange.endDate && isNaN(dateRange.endDate.getTime())) {
      return res.status(400).json({ message: 'Invalid endDate format' });
    }
    
    // Parse filter and pagination parameters
    const filters = {
      action: req.query.action,
      category: req.query.category,
      recipientId: req.query.recipientId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      sortBy: req.query.sortBy || 'timestamp',
      sortOrder: req.query.sortOrder || 'desc'
    };
    
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;
    const page = req.query.page ? parseInt(req.query.page) : 1;
    
    // Get paginated user feedback
    const result = await feedbackService.getUserFeedbackHistory(req.user.id, filters, limit, page);
    
    logger.debug(`[feedbackRoutes] Found ${result.logs.length} feedback entries for user (page ${page}/${result.totalPages})`);
    
    res.status(200).json({
      feedback: result.logs,
      pagination: {
        page,
        limit,
        totalItems: result.totalLogs,
        totalPages: result.totalPages
      },
      filters
    });
  } catch (error) {
    logger.error('[feedbackRoutes] Error fetching user feedback:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
