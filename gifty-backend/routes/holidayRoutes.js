const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Holiday = require('../models/Holiday');
const holidayService = require('../services/holidayService');
const logger = require('../utils/logger');

// @desc    Get all holidays
// @route   GET /api/holidays
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        // Get query parameters
        const countryCode = req.query.countryCode || 'US';
        const categories = req.query.categories ? req.query.categories.split(',') : null;
        
        // Build query
        const query = { countryCode };
        
        // Add categories filter if provided
        if (categories) {
            query.category = { $in: categories };
        }
        
        const holidays = await Holiday.find(query)
            .sort({ month: 1, day: 1 })
            .populate('eventType');
            
        res.json(holidays);
    } catch (error) {
        logger.error('Error getting holidays', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// @desc    Bring a user's holiday events in line with their settings: add
//          missing ones, remove upcoming ones no longer chosen (see the service)
// @route   POST /api/holidays/regenerate
// @access  Private
router.post('/regenerate', protect, async (req, res) => {
    try {
        const result = await holidayService.updateUserHolidayEvents(req.user._id);
        res.status(result.success ? 200 : 500).json(result);
    } catch (error) {
        logger.error('Error regenerating holiday events', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;