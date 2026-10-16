const express = require('express');
const router = express.Router();
const { 
    getUserEmailConfig, 
    createUpdateEmailConfig, 
    testEmailConfig, 
    deleteEmailConfig 
} = require('../controllers/emailConfigController');
const { protect } = require('../middleware/authMiddleware');
const { apiLimiters } = require('../middleware/rateLimitMiddleware');

// All routes are protected with authentication
router.use(protect);

// Email configuration routes
router.route('/')
    .get(getUserEmailConfig)
    .post(createUpdateEmailConfig)
    .delete(deleteEmailConfig);

// Test email configuration: it connects out, so it is an expensive operation
router.post('/test', apiLimiters.smtpTest, testEmailConfig);

module.exports = router;