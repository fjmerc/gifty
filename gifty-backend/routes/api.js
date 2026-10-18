const express = require('express');
const router = express.Router();

// Import routes
const budgetRoutes = require('./budgetRoutes');
const eventRoutes = require('./eventRoutes');
const eventTypeRoutes = require('./eventTypeRoutes');
const giftRoutes = require('./giftRoutes');
const healthRoutes = require('./healthRoutes');
const notificationRoutes = require('./notificationRoutes');
const recipientRoutes = require('./recipientRoutes');
const tagRoutes = require('./tagRoutes'); 
const userRoutes = require('./userRoutes');
const vendorRoutes = require('./vendorRoutes');
const settingsRoutes = require('./settingsRoutes');
const emailConfigRoutes = require('./emailConfigRoutes');
const feedbackRoutes = require('./feedbackRoutes');
const giftLibraryRoutes = require('./giftLibraryRoutes');
const holidayRoutes = require('./holidayRoutes');
const aiRoutes = require('./aiRoutes');
const adminRoutes = require('./adminRoutes');
const { clearUserCacheOnWrite } = require('../middleware/cacheMiddleware');

// @route   GET api/test
// @desc    Test route
// @access  Public
router.get('/test', (req, res) => res.json({ msg: 'API running' }));

// Successful writes clear the caller's cached GET responses
router.use(clearUserCacheOnWrite);

// Use routes
router.use('/budgets', budgetRoutes);
router.use('/events', eventRoutes);
router.use('/eventTypes', eventTypeRoutes);
router.use('/gifts', giftRoutes);
router.use('/health', healthRoutes); // Health check routes
router.use('/holidays', holidayRoutes);
router.use('/notifications', notificationRoutes);
router.use('/recipients', recipientRoutes);
router.use('/tags', tagRoutes); 
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/vendors', vendorRoutes);
router.use('/settings', settingsRoutes);
router.use('/email-config', emailConfigRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/gift-library', giftLibraryRoutes);
router.use('/ai', aiRoutes);
router.use('/instance', require('./instanceRoutes'));
router.use('/invites', require('./inviteRoutes'));
router.use('/password-reset', require('./passwordResetRoutes'));

module.exports = router;
