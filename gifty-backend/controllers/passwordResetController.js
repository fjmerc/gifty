// Reset links (1b): an admin makes a one-time link; whoever opens it sets a
// new password, which ends every session of that account.
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const InstanceToken = require('../models/InstanceToken');
const tokens = require('../services/instanceTokens');
const { loadTarget, ownerNeeded } = require('./adminController');
const { getOwnerId } = require('../services/instanceSettings');
const { recordAudit } = require('../services/auditLog');
const logger = require('../utils/logger');

const RESET_MESSAGES = {
  RESET_EXPIRED: 'This reset link has expired. Ask an admin for a new one.',
  RESET_USED: "This reset link was already used. Ask an admin for a new one if you still can't sign in.",
  RESET_UNKNOWN: "This reset link isn't valid. Ask an admin for a new one.",
  ACCOUNT_DEACTIVATED: 'This account is deactivated. Ask an admin.'
};
const CODE_OF = { expired: 'RESET_EXPIRED', used: 'RESET_USED', unknown: 'RESET_UNKNOWN' };
const refuse = (res, code) => res.status(code === 'RESET_UNKNOWN' ? 404 : code === 'ACCOUNT_DEACTIVATED' ? 403 : 410)
  .json({ code, message: RESET_MESSAGES[code] });

// The link's state and its account; a deleted account makes the link unknown
const checkLink = async (raw) => {
  const { status, doc } = await tokens.inspectToken('reset', raw);
  if (status !== 'valid') return { code: CODE_OF[status] };
  const user = await User.findById(doc.userId);
  if (!user) return { code: 'RESET_UNKNOWN' };
  if (user.active === false) return { code: 'ACCOUNT_DEACTIVATED' };
  // A link is only as good as the admin who made it: one who was since
  // deactivated or demoted can't use a link made earlier
  if (doc.createdBy) {
    const maker = await User.findById(doc.createdBy).select('role active').lean();
    if (!maker || maker.role !== 'admin' || maker.active === false) return { code: 'RESET_UNKNOWN' };
  }
  // Whoever made the link must still be allowed to: an admin's link for a
  // member is no use once that account is an admin or the owner (the server
  // command's links, createdBy null, open any account)
  if (doc.createdBy && user.role === 'admin') {
    const ownerId = await getOwnerId();
    if (String(user._id) === ownerId || String(doc.createdBy) !== ownerId) return { code: 'RESET_UNKNOWN' };
  }
  return { doc, user };
};

// @route POST /api/admin/users/:id/reset-link (admin; an admin's account: owner)
exports.createResetLink = asyncHandler(async (req, res) => {
  const loaded = await loadTarget(req, res);
  if (!loaded) return undefined;
  const { target, ownerId } = loaded;
  if (ownerNeeded(target, req, ownerId, res)) return undefined;
  if (target.active === false) return res.status(400).json({ message: 'Reactivate this account first.', code: 'INACTIVE' });
  const { token, expiresAt } = await tokens.createResetLink({ userId: target._id, createdBy: req.user._id });
  await recordAudit('reset.created', { actor: req.user._id, target: target._id });
  return res.status(201).json({ link: tokens.linkFor('reset', token), expiresAt });
});

// @route GET /api/password-reset/:token (public)
exports.lookupResetLink = asyncHandler(async (req, res) => {
  const { code, doc } = await checkLink(req.params.token);
  if (code) return refuse(res, code);
  return res.json({ expiresAt: doc.expiresAt });
});

// @route POST /api/password-reset/:token (public)
exports.useResetLink = asyncHandler(async (req, res) => {
  const { code, user } = await checkLink(req.params.token);
  if (code) return refuse(res, code);
  const consumed = await tokens.consumeToken('reset', req.params.token, { userId: user._id });
  if (!consumed) return refuse(res, 'RESET_USED');
  user.password = req.body.password;
  user.tokenVersion = (user.tokenVersion || 0) + 1; // every session of this account ends
  await user.save();
  // The account's other links go; this one stays (used) so a second use reads "already used"
  await InstanceToken.deleteMany({ type: 'reset', userId: user._id, _id: { $ne: consumed._id } });
  logger.info(`Password of ${user._id} set through a reset link`);
  await recordAudit('reset.used', { actor: user._id, target: user._id });
  return res.json({ message: 'Your password was changed. Sign in with the new one.' });
});

exports.RESET_MESSAGES = RESET_MESSAGES;
