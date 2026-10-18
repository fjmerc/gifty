const express = require('express');
const { authLimiters } = require('../middleware/rateLimitMiddleware');
const { lookupInvite } = require('../controllers/inviteController');

const router = express.Router();

// Public: the invite page asks whether its link is still usable
router.get('/:token', authLimiters.links, lookupInvite);

module.exports = router;
