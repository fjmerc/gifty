const express = require('express');
const {
    createGift,
    getGifts,
    updateGift,
    deleteGift,
    generateGiftSuggestions,
    updateGiftStatus,
    toggleFavorite,
    purchaseGift,
    getFavorites
} = require('../controllers/giftController');
const { protect } = require('../middleware/authMiddleware');
const { cacheMiddleware } = require('../middleware/cacheMiddleware');
const { keyPrefixes, ttl } = require('../config/redis');
const { apiLimiters } = require('../middleware/rateLimitMiddleware');
const { extendRequestTimeout } = require('../middleware/performanceMiddleware');

const router = express.Router();

// Apply cache middleware to read operations
router.get('/', protect, cacheMiddleware({
    prefix: keyPrefixes.gifts,
    expire: ttl.short // 1 minute cache
}), getGifts);


// Writes clear the caller's cached reads (clearUserCacheOnWrite in api.js)
router.post('/', protect, createGift);
router.put('/:giftId', protect, updateGift);
router.delete('/:giftId', protect, deleteGift);

// Gift suggestions — gated by per-user rate limits (burst + hourly) to
// contain the cost of expensive AI provider calls. Limits are env-
// overridable; the test env bypasses them so the suite isn't throttled.
// Web/hybrid suggestion pipelines (LLM call + web enrichment + product
// lookups) routinely take 45-60s, well past the app-wide 30s timeout.
router.post(
    '/suggestions',
    protect,
    extendRequestTimeout(120000),
    apiLimiters.aiSuggestionHourly,
    apiLimiters.aiSuggestion,
    generateGiftSuggestions
);


// Status and favorite actions
router.patch('/:giftId/status', protect, updateGiftStatus);
router.patch('/:giftId/favorite', protect, toggleFavorite);
router.get('/favorites', protect, cacheMiddleware({
    prefix: keyPrefixes.gifts,
    expire: ttl.short // 1 minute cache
}), getFavorites);

// Purchase gift
router.post('/:giftId/purchase', protect, purchaseGift);

module.exports = router;
