const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const GiftLibrary = require('../models/GiftLibrary');
const giftDiscoveryService = require('../services/giftDiscoveryService');
const hybridSuggestionService = require('../services/hybridSuggestionService');
const logger = require('../utils/logger');

// How much an account's reaction adds to a library gift's popularity
const REACTION_SCORES = { liked: 2, purchased: 5, disliked: -1, ignored: -0.5 };

// Legacy library documents may carry a free-form feedbackHistory with other
// accounts' ids and notes; it is never returned
const PRIVATE_FIELDS = '-feedbackHistory';

// @desc    Browse gift library with filters
// @route   GET /api/gift-library/explore
// @access  Private
exports.exploreGifts = asyncHandler(async (req, res) => {
    logger.debug('[exploreGifts] Browsing gift library...');
    
    const {
        categories,
        minPrice,
        maxPrice,
        tags,
        sort = 'popularity',
        search
    } = req.query;
    const page = req.query.page === undefined ? 1 : parseInt(req.query.page, 10);
    const limit = req.query.limit === undefined ? 20 : parseInt(req.query.limit, 10);
    if (!(page >= 1) || !(limit >= 1 && limit <= 100)) {
        res.status(400);
        throw new Error('page must be 1 or more and limit between 1 and 100');
    }

    const query = { status: 'active' };

    // Apply filters
    if (categories) {
        query.categories = { $in: categories.split(',') };
    }

    // Dot notation is required here: `query.priceRange = { min: {...} }`
    // is an exact subdocument match in MongoDB and silently matches nothing
    if (minPrice) query['priceRange.min'] = { $gte: parseFloat(minPrice) };
    if (maxPrice) query['priceRange.max'] = { $lte: parseFloat(maxPrice) };

    if (tags) {
        query.tags = { $in: tags.split(',') };
    }

    if (search) {
        query.$text = { $search: search };
    }

    // Apply sorting
    let sortOption = {};
    switch (sort) {
        case 'price_asc':
            sortOption = { 'priceRange.min': 1 };
            break;
        case 'price_desc':
            sortOption = { 'priceRange.max': -1 };
            break;
        case 'newest':
            sortOption = { discoveryDate: -1 };
            break;
        case 'popularity':
        default:
            sortOption = { popularityScore: -1 };
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    
    const [gifts, total] = await Promise.all([
        GiftLibrary.find(query)
            .select(PRIVATE_FIELDS)
            .sort(sortOption)
            .skip(skip)
            .limit(limit)
            .lean(),
        GiftLibrary.countDocuments(query)
    ]);

    logger.debug(`[exploreGifts] Found ${gifts.length} gifts (Total: ${total})`);

    res.json({
        gifts,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            itemsPerPage: limit
        }
    });
});

// @desc    Get available gift categories
// @route   GET /api/gift-library/categories
// @access  Private
exports.getCategories = asyncHandler(async (req, res) => {
    logger.debug('[getCategories] Fetching categories...');
    
    // Single aggregation instead of one countDocuments per category
    const categoryStats = await GiftLibrary.aggregate([
        { $match: { status: 'active' } },
        { $unwind: '$categories' },
        { $group: { _id: '$categories', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, category: '$_id', count: 1 } }
    ]);

    logger.debug(`[getCategories] Found ${categoryStats.length} categories`);

    res.json({
        categories: categoryStats
    });
});

// @desc    Submit feedback on gift suggestions
// @route   POST /api/gift-library/feedback
// @access  Private
exports.submitGiftFeedback = asyncHandler(async (req, res) => {
    const { giftId, action } = req.body;

    if (!giftId || !action) {
        res.status(400);
        throw new Error('Please provide both gift ID and action');
    }
    // An id, never an object (e.g. a query operator)
    if (typeof giftId !== 'string' || !mongoose.isValidObjectId(giftId)) {
        res.status(400);
        throw new Error('Invalid gift ID');
    }
    if (!Object.hasOwn(REACTION_SCORES, action)) {
        res.status(400);
        throw new Error('Unknown action');
    }

    if (!(await GiftLibrary.exists({ _id: giftId }))) {
        res.status(404);
        throw new Error('Gift not found');
    }

    // Each account counts once: a new reaction replaces its earlier one.
    // Conditional updates keep that true for simultaneous requests: the
    // first reaction is added only while the account has none, and a
    // change swaps out exactly the earlier reaction it read (retried if
    // another request changed it in between).
    const user = req.user._id;
    const score = REACTION_SCORES[action];
    let applied = false;
    for (let attempt = 0; attempt < 5 && !applied; attempt += 1) {
        const current = await GiftLibrary.findOne({ _id: giftId, 'reactions.user': user }, { 'reactions.$': 1 }).lean();
        if (!current) {
            const added = await GiftLibrary.updateOne(
                { _id: giftId, 'reactions.user': { $ne: user } },
                { $push: { reactions: { user, action, at: new Date() } }, $inc: { popularityScore: score } }
            );
            applied = added.modifiedCount === 1;
        } else {
            const previous = current.reactions[0].action;
            const changed = await GiftLibrary.updateOne(
                { _id: giftId, reactions: { $elemMatch: { user, action: previous } } },
                {
                    $set: { 'reactions.$.action': action, 'reactions.$.at': new Date() },
                    $inc: { popularityScore: score - REACTION_SCORES[previous] }
                }
            );
            applied = changed.matchedCount === 1;
        }
    }
    if (!applied) {
        // The gift was deleted meanwhile, or kept changing under us
        const stillThere = await GiftLibrary.exists({ _id: giftId });
        res.status(stillThere ? 409 : 404);
        throw new Error(stillThere ? 'The gift changed while saving your reaction; please try again' : 'Gift not found');
    }
    // Popularity never goes below 0
    await GiftLibrary.updateOne({ _id: giftId, popularityScore: { $lt: 0 } }, { $set: { popularityScore: 0 } });
    const gift = await GiftLibrary.findById(giftId, { popularityScore: 1 }).lean();
    if (!gift) {
        res.status(404);
        throw new Error('Gift not found');
    }

    logger.debug(`[submitGiftFeedback] Feedback processed for gift ${giftId}`);

    // Other accounts' reactions stay private: answer with the score only
    res.json({
        message: 'Feedback submitted successfully',
        gift: { _id: gift._id, popularityScore: gift.popularityScore }
    });
});

// @desc    Get trending gifts
// @route   GET /api/gift-library/trending
// @access  Private
exports.getTrendingGifts = asyncHandler(async (req, res) => {
    logger.debug('[getTrendingGifts] Fetching trending gifts...');
    
    const { limit = 10, category, timeframe = '7d' } = req.query;

    // Calculate timeframe
    let startDate;
    switch (timeframe) {
        case '24h':
            startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
            break;
        case '7d':
            startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            break;
        case '30d':
            startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            break;
        default:
            startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    const query = {
        status: 'active',
        discoveryDate: { $gte: startDate }
    };

    if (category) {
        query.categories = category;
    }

    const trendingGifts = await GiftLibrary.find(query)
        .select(PRIVATE_FIELDS)
        .sort({ popularityScore: -1 })
        .limit(Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100))
        .lean();

    logger.debug(`[getTrendingGifts] Found ${trendingGifts.length} trending gifts`);
    
    res.json({
        trendingGifts,
        timeframe,
        totalCount: trendingGifts.length
    });
});

// @desc    Get discovery system status
// @route   GET /api/gift-library/discover/status
// @access  Private
exports.getDiscoveryStatus = asyncHandler(async (req, res) => {
    logger.debug('[getDiscoveryStatus] Fetching discovery system status...');
    
    const [systemHealth, recentDiscoveries, giftStats] = await Promise.all([
        hybridSuggestionService.isHybridSystemHealthy(),
        GiftLibrary.find()
            .sort({ discoveryDate: -1 })
            .limit(10)
            .select('name discoveryDate categories popularityScore'),
        GiftLibrary.aggregate([
            { $match: { status: 'active' } },
            {
                $group: {
                    _id: null,
                    totalGifts: { $sum: 1 },
                    avgPopularity: { $avg: '$popularityScore' },
                    categories: { $addToSet: '$categories' }
                }
            }
        ])
    ]);

    res.json({
        systemHealth,
        recentDiscoveries,
        stats: giftStats[0],
        lastUpdate: new Date().toISOString()
    });
});

// @desc    Get hybrid system health status
// @route   GET /api/gift-library/system-health
// @access  Private
exports.getSystemHealth = asyncHandler(async (req, res) => {
    logger.debug('[getSystemHealth] Checking hybrid system health...');
    
    const healthData = await hybridSuggestionService.isHybridSystemHealthy();
    
    // Get additional statistics for the frontend
    const [categoryDistribution, sourceDistribution] = await Promise.all([
        // Get category distribution
        GiftLibrary.aggregate([
            { $match: { status: 'active' } },
            { $unwind: '$categories' },
            { $group: { _id: '$categories', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]),
        
        // Get source distribution
        GiftLibrary.aggregate([
            { $match: { status: 'active' } },
            { $group: { _id: '$source', count: { $sum: 1 } } }
        ])
    ]);
    
    // Format the response
    const response = {
        isHealthy: healthData.isHealthy,
        giftCount: healthData.totalGifts || 0,
        minLibrarySize: hybridSuggestionService.minLibrarySize,
        recentGifts: healthData.recentGifts || 0,
        lastDiscovery: healthData.lastDiscovery?.discoveryDate || null,
        categoryDistribution: categoryDistribution.map(cat => ({
            category: cat._id,
            count: cat.count
        })),
        sourceDistribution: {
            discovered: sourceDistribution.find(s => s._id === 'discovered')?.count || 0,
            aiGenerated: sourceDistribution.find(s => s._id === 'ai_generated')?.count || 0
        }
    };
    
    logger.debug(`[getSystemHealth] System health: ${response.isHealthy ? 'Healthy' : 'Unhealthy'}, ${response.giftCount} gifts`);
    
    res.json(response);
});

// @desc    Manually trigger gift discovery
// @route   POST /api/gift-library/discover/trigger
// @access  Private
exports.triggerDiscovery = asyncHandler(async (req, res) => {
    logger.debug('[triggerDiscovery] Manually triggering gift discovery...');
    
    // Allow any authenticated user to trigger discovery
    // This helps populate the shared gift library for better suggestions

    // Start discovery process
    res.json({ message: 'Discovery process started in background' });

    // Run discovery in background with timeout
    process.nextTick(async () => {
        const startTime = Date.now();
        const maxDuration = 10 * 60 * 1000; // 10 minutes max
        
        try {
            logger.debug('[triggerDiscovery] Starting gift discovery process...');
            
            // Create a timeout promise
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Discovery process timed out after 10 minutes')), maxDuration);
            });
            
            // Race between discovery and timeout
            const discoveredGifts = await Promise.race([
                giftDiscoveryService.discoverGifts(),
                timeoutPromise
            ]);
            
            const duration = Math.round((Date.now() - startTime) / 1000);
            logger.debug(`[triggerDiscovery] Discovery completed in ${duration}s. Found ${discoveredGifts.length} new gifts`);
        } catch (error) {
            const duration = Math.round((Date.now() - startTime) / 1000);
            logger.error(`[triggerDiscovery] Discovery failed after ${duration}s:`, error.message);
        }
    });
});

// @desc    Delete a gift from the library
// @route   DELETE /api/gift-library/gifts/:giftId
// @access  Private/Admin (instance owner)
exports.deleteGiftFromLibrary = asyncHandler(async (req, res) => {
    logger.debug('[deleteGiftFromLibrary] Deleting gift from library...');
    
    const { giftId } = req.params;
    
    // Find the gift by ID
    const gift = await GiftLibrary.findById(giftId);
    
    if (!gift) {
        res.status(404);
        throw new Error('Gift not found in library');
    }
    
    // Authorization: the library is shared by every user, so the route is
    // guarded by requireInstanceOwner (see routes/giftLibraryRoutes.js)
    
    // Delete the gift
    await GiftLibrary.findByIdAndDelete(giftId);
    
    logger.debug(`[deleteGiftFromLibrary] Gift ${giftId} deleted successfully`);
    
    res.json({
        message: 'Gift deleted successfully',
        giftId: giftId
    });
});
