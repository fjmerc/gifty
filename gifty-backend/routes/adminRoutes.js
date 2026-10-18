const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { requireAdmin, requireOwner } = require('../middleware/roleMiddleware');
const { apiLimiters, authLimiters } = require('../middleware/rateLimitMiddleware');
const admin = require('../controllers/adminController');
const invites = require('../controllers/inviteController');
const instance = require('../controllers/instanceSettingsController');
const { validationRules, validate } = require('../middleware/validationMiddleware');

const router = express.Router();

router.get('/users', protect, requireAdmin, admin.listUsers);
router.patch('/users/:id/role', protect, requireOwner, apiLimiters.standard, admin.setRole);
router.patch('/users/:id/active', protect, requireAdmin, apiLimiters.standard, admin.setActive);
router.post('/users/:id/reset-link', protect, requireAdmin, apiLimiters.standard, require('../controllers/passwordResetController').createResetLink);
router.post('/owner', protect, requireOwner, authLimiters.password, admin.transferOwnership);

router.get('/invites', protect, requireAdmin, invites.listInvites);
router.post('/invites', protect, requireAdmin, apiLimiters.standard, validationRules.createInvite, validate, invites.createInvite);
router.delete('/invites/:id', protect, requireAdmin, apiLimiters.standard, invites.revokeInvite);

router.get('/settings', protect, requireAdmin, instance.getSettings);
router.patch('/settings', protect, requireAdmin, apiLimiters.standard, instance.updateSettings);
router.post('/setup-complete', protect, requireOwner, apiLimiters.standard, instance.completeSetup);

module.exports = router;
