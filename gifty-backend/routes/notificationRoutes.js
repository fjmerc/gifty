const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    getNotifications,
    updateNotification,
    deleteNotification,
    getNotificationStats,
    snoozeNotification
} = require('../controllers/notificationController');

// Protected routes (require authentication)
router.use(protect);

router.get('/', getNotifications);
router.get('/stats', getNotificationStats);

// Add snooze endpoint
router.put('/:notificationId/snooze', snoozeNotification);

router.route('/:notificationId')
    .put(updateNotification)
    .delete(deleteNotification);

module.exports = router;
