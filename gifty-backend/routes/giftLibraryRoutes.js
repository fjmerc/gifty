const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/roleMiddleware');
const giftLibraryController = require('../controllers/giftLibraryController');

// @route   GET /api/gift-library/explore
// @desc    Browse gift library with filters
// @access  Private
router.get('/explore', protect, giftLibraryController.exploreGifts);

// @route   GET /api/gift-library/categories
// @desc    Get available gift categories
// @access  Private
router.get('/categories', protect, giftLibraryController.getCategories);

// @route   POST /api/gift-library/feedback
// @desc    Submit feedback on gift suggestions
// @access  Private
router.post('/feedback', protect, giftLibraryController.submitGiftFeedback);

// @route   GET /api/gift-library/trending
// @desc    Get trending gifts
// @access  Private
router.get('/trending', protect, giftLibraryController.getTrendingGifts);

// @route   GET /api/gift-library/discover/status
// @desc    Get discovery system status
// @access  Private
router.get('/discover/status', protect, giftLibraryController.getDiscoveryStatus);

// @route   GET /api/gift-library/system-health
// @desc    Get hybrid system health status
// @access  Private
router.get('/system-health', protect, giftLibraryController.getSystemHealth);

// @route   POST /api/gift-library/discover/trigger
// @desc    Manually trigger gift discovery (admin only)
// @access  Private/Admin
router.post('/discover/trigger', protect, requireAdmin, giftLibraryController.triggerDiscovery);

// @route   DELETE /api/gift-library/gifts/:giftId
// @desc    Delete a gift from the library (shared by all users: owner only)
// @access  Private/Admin
router.delete('/gifts/:giftId', protect, requireAdmin, giftLibraryController.deleteGiftFromLibrary);

module.exports = router;
