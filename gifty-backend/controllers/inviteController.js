// Invites (1b): an admin makes a one-time link; the person who opens it
// registers as a member. Only the link's hash is stored.
const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const tokens = require('../services/instanceTokens');
const { recordAudit } = require('../services/auditLog');

const INVITE_MESSAGES = {
  INVITE_REQUIRED: 'This Gifty is invite-only. Ask someone who uses it for an invite link.',
  INVITE_EXPIRED: 'This invite link has expired. Ask for a new one.',
  INVITE_USED: 'This invite link was already used. Ask for a new one if you still need an account.',
  INVITE_UNKNOWN: "This invite link isn't valid. It may have been revoked. Ask for a new one.",
  INVITE_EMAIL: 'This invite is for a different email address.'
};
const CODE_OF = { expired: 'INVITE_EXPIRED', used: 'INVITE_USED', unknown: 'INVITE_UNKNOWN' };

// @route POST /api/admin/invites (admin)
exports.createInvite = asyncHandler(async (req, res) => {
  const { email = null, days = tokens.DEFAULT_INVITE_DAYS } = req.body || {};
  const { token, invite } = await tokens.createInvite({ email: email || null, days, createdBy: req.user._id });
  await recordAudit('invite.created', { actor: req.user._id, target: invite._id, details: { email: invite.email, days } });
  res.status(201).json({
    invite: { _id: invite._id, email: invite.email, expiresAt: invite.expiresAt, createdAt: invite.createdAt },
    link: tokens.linkFor('invite', token)
  });
});

// @route GET /api/admin/invites (admin): pending ones
exports.listInvites = asyncHandler(async (req, res) => {
  const invites = await tokens.listPendingInvites();
  const creators = await User.find({ _id: { $in: invites.map((i) => i.createdBy).filter(Boolean) } })
    .select('_id firstName lastName').lean();
  const byId = new Map(creators.map((u) => [String(u._id), u]));
  res.json(invites.map((i) => ({
    _id: i._id, email: i.email, expiresAt: i.expiresAt, createdAt: i.createdAt,
    createdBy: (i.createdBy && byId.get(String(i.createdBy))) || null
  })));
});

// @route DELETE /api/admin/invites/:id (admin)
exports.revokeInvite = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id) || !(await tokens.revokeInvite(id))) return res.status(404).json({ message: 'No such invite' });
  await recordAudit('invite.revoked', { actor: req.user._id, target: id });
  return res.status(204).end();
});

// @route GET /api/invites/:token (public): is it usable, and for which email
exports.lookupInvite = asyncHandler(async (req, res) => {
  const { status, doc } = await tokens.inspectToken('invite', req.params.token);
  if (status === 'valid') return res.json({ email: doc.email, expiresAt: doc.expiresAt });
  const code = CODE_OF[status];
  return res.status(status === 'unknown' ? 404 : 410).json({ code, message: INVITE_MESSAGES[code] });
});

exports.INVITE_MESSAGES = INVITE_MESSAGES;
exports.CODE_OF = CODE_OF;
