const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const feedbackController = require('../controllers/feedbackController');

router.post('/', protect, feedbackController.trackFeedback);
router.get('/analytics', protect, feedbackController.getFeedbackAnalytics);
router.get('/user', protect, feedbackController.getUserFeedback);

module.exports = router;
