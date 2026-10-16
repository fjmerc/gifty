const express = require('express');
const { 
    registerUser, 
    loginUser, 
    getUserProfile,
    updateUserProfile,
    uploadProfilePicture,
    changePassword,
    deleteAccount,
    updateUserPreferences,
    logoutUser
} = require('../controllers/userController');
const { refreshToken } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { imageUpload, validateUploadedFile } = require('../middleware/uploadMiddleware');
const { validationRules, validate } = require('../middleware/validationMiddleware');
const { authLimiters, apiLimiters } = require('../middleware/rateLimitMiddleware');

const router = express.Router();

// Public routes - add rate limiting to auth endpoints
router.post('/register', authLimiters.register, validationRules.registerUser, validate, registerUser);
// Per-IP first: an address over its limit can't create per-email counters.
// Per-email after validation, which normalises the email the login looks up.
router.post('/login', authLimiters.login, validationRules.loginUser, validate, authLimiters.loginPerEmail, authLimiters.loginFailureLog, loginUser);
router.post('/refresh-token', apiLimiters.standard, refreshToken);

// Protected routes
router.post('/logout', protect, logoutUser);
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, validationRules.updateUserProfile, validate, updateUserProfile);
router.post('/profile/picture', protect, apiLimiters.expensive, imageUpload.single('profilePicture'), validateUploadedFile, uploadProfilePicture);
router.post('/change-password', protect, authLimiters.password, validationRules.changePassword, validate, changePassword);
router.put('/preferences', protect, apiLimiters.standard, updateUserPreferences);
router.delete('/account', protect, authLimiters.password, deleteAccount);

module.exports = router;
