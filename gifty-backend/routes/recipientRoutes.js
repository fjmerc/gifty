const express = require('express');
const { apiLimiters } = require('../middleware/rateLimitMiddleware');
const router = express.Router();
const recipientController = require('../controllers/recipientController');
const { protect } = require('../middleware/authMiddleware');
const { imageUpload, validateUploadedFile } = require('../middleware/uploadMiddleware');

// Existing routes
router.get('/', protect, recipientController.getAllRecipients);
router.get('/all-including-system', protect, recipientController.getRecipientsForEvents);
router.get('/:id', protect, recipientController.getRecipientById);
router.get('/:id/navigation', protect, recipientController.getNavigation);
router.post('/', protect, recipientController.addRecipient);
router.put('/:id', protect, recipientController.updateRecipient);
router.delete('/:id', protect, recipientController.deleteRecipient);
router.post('/:id/restore', protect, recipientController.restoreRecipient);

// New route for uploading profile picture
router.post('/:id/upload-profile-picture', protect, apiLimiters.recipientPhoto, imageUpload.single('profilePicture'), validateUploadedFile, recipientController.uploadProfilePicture);

module.exports = router;
