const express = require('express');
const { authLimiters } = require('../middleware/rateLimitMiddleware');
const { validationRules, validate } = require('../middleware/validationMiddleware');
const { lookupResetLink, useResetLink } = require('../controllers/passwordResetController');

const router = express.Router();

// Public: the reset page checks its link, then sets the new password
router.get('/:token', authLimiters.links, lookupResetLink);
router.post('/:token', authLimiters.links, validationRules.resetPassword, validate, useResetLink);

module.exports = router;
