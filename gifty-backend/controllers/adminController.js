// Account management for the owner and admins (1b). Accounts stay private:
// these answers carry account fields only, never anyone's gifts or people.
// MongoDB 4.4 standalone has no transactions, so every change is one
// conditional write on the state the actor saw; when it no longer matches,
// the answer is 409 and the page reloads.
const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { getOwnerId, settingsCollection, SETTINGS_ID } = require('../services/instanceSettings');
const { checkCurrentPassword, WRONG_MESSAGE, TOO_MANY_MESSAGE } = require('../utils/passwordAttempts');
const { recordAudit } = require('../services/auditLog');
const tokens = require('../services/instanceTokens');
const logger = require('../utils/logger');

const ACCOUNT_FIELDS = '_id username firstName lastName email role active createdAt';
const ROLES = ['admin', 'member'];

const conflict = (res) => res.status(409).json({ message: 'This changed. Reload and try again.', code: 'CONFLICT' });

const publicAccount = (user, ownerId) => ({
  _id: user._id,
  username: user.username,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  role: user.role || 'member',
  active: user.active !== false,
  createdAt: user.createdAt,
  isOwner: String(user._id) === ownerId
});

// The account an admin action is about, after the rules every action shares:
// it exists, it is not the actor and it is not the owner
const loadTarget = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) { res.status(404).json({ message: 'No such account' }); return null; }
  const target = await User.findById(id).select(ACCOUNT_FIELDS).lean();
  if (!target) { res.status(404).json({ message: 'No such account' }); return null; }
  if (String(target._id) === String(req.user._id)) {
    res.status(400).json({ message: "You can't change your own account here.", code: 'SELF' });
    return null;
  }
  const ownerId = await getOwnerId();
  if (String(target._id) === ownerId) {
    res.status(403).json({ message: "The owner's account can't be changed here.", code: 'OWNER_PROTECTED' });
    return null;
  }
  return { target, ownerId };
};

// Only the owner acts on an admin's account; true when this request was refused
const ownerNeeded = (target, req, ownerId, res) => {
  if (target.role === 'admin' && String(req.user._id) !== ownerId) {
    res.status(403).json({ message: 'Only the owner of this Gifty can do this.', code: 'OWNER_ONLY' });
    return true;
  }
  return false;
};

// @route GET /api/admin/users (admin)
exports.listUsers = asyncHandler(async (req, res) => {
  const ownerId = await getOwnerId();
  const users = await User.find({}).select(ACCOUNT_FIELDS).sort({ _id: 1 }).lean();
  res.json(users.map((u) => publicAccount(u, ownerId)));
});

// @route PATCH /api/admin/users/:id/role (owner)
exports.setRole = asyncHandler(async (req, res) => {
  const { role } = req.body || {};
  if (!ROLES.includes(role)) return res.status(400).json({ message: 'Role must be admin or member', code: 'VALIDATION' });
  const loaded = await loadTarget(req, res);
  if (!loaded) return undefined;
  const { target, ownerId } = loaded;
  const from = role === 'admin' ? 'member' : 'admin';
  // Only from the opposite role (null: an account from before roles), so a
  // second identical request finds nothing
  const updated = await User.findOneAndUpdate(
    { _id: target._id, role: from === 'member' ? { $in: ['member', null] } : 'admin' },
    { $set: { role } },
    { new: true, projection: ACCOUNT_FIELDS }
  ).lean();
  if (!updated) return conflict(res);
  logger.info(`Role of ${target._id} set to ${role} by ${req.user._id}`);
  // A link an admin made for a member must not open an admin's account
  await tokens.deleteResetLinksFor(target._id);
  await recordAudit('role.changed', { actor: req.user._id, target: target._id, details: { from, to: role } });
  return res.json({ user: publicAccount(updated, ownerId) });
});

// @route PATCH /api/admin/users/:id/active (admin; an admin's account: owner)
exports.setActive = asyncHandler(async (req, res) => {
  const { active } = req.body || {};
  if (typeof active !== 'boolean') return res.status(400).json({ message: 'active must be true or false', code: 'VALIDATION' });
  const loaded = await loadTarget(req, res);
  if (!loaded) return undefined;
  const { target, ownerId } = loaded;
  if (ownerNeeded(target, req, ownerId, res)) return undefined;
  // Deactivating ends every session at once (protect also refuses active: false)
  const update = active ? { $set: { active: true } } : { $set: { active: false }, $inc: { tokenVersion: 1 } };
  const updated = await User.findOneAndUpdate(
    { _id: target._id, role: target.role, active: active ? false : { $ne: false } },
    update,
    { new: true, projection: ACCOUNT_FIELDS }
  ).lean();
  if (!updated) return conflict(res);
  if (!active) await tokens.deleteResetLinksFor(target._id);
  logger.info(`Account ${target._id} ${active ? 'reactivated' : 'deactivated'} by ${req.user._id}`);
  await recordAudit(active ? 'account.reactivated' : 'account.deactivated', { actor: req.user._id, target: target._id });
  return res.json({ user: publicAccount(updated, ownerId) });
});

// @route POST /api/admin/owner (owner): hand over ownership
exports.transferOwnership = asyncHandler(async (req, res) => {
  const { userId, currentPassword } = req.body || {};
  const passwordField = (status, message) => res.status(status).json({ message, errors: [{ field: 'currentPassword', message }] });
  if (typeof currentPassword !== 'string' || !currentPassword) return passwordField(400, 'Enter your current password to hand over ownership');
  if (!mongoose.isValidObjectId(userId)) return res.status(404).json({ message: 'No such account' });
  if (String(userId) === String(req.user._id)) return res.status(400).json({ message: 'You already own this Gifty.', code: 'SELF' });

  const actor = await User.findById(req.user._id);
  const check = await checkCurrentPassword(req, actor, currentPassword);
  if (check === 'blocked') return passwordField(429, TOO_MANY_MESSAGE);
  if (check === 'wrong') return passwordField(400, WRONG_MESSAGE);

  const target = await User.findById(userId).select('active').lean();
  if (!target) return res.status(404).json({ message: 'No such account' });
  if (target.active === false) return res.status(400).json({ message: 'Reactivate this account first.', code: 'INACTIVE' });
  // 1. The new owner is an active admin (promote first; harmless if step 2 fails)
  const promoted = await User.findOneAndUpdate(
    { _id: userId, active: { $ne: false } },
    { $set: { role: 'admin' } },
    { new: true, projection: ACCOUNT_FIELDS }
  ).lean();
  if (!promoted) return conflict(res);
  // 2. One write moves ownership, only from the owner who asked
  const moved = await settingsCollection().updateOne(
    { _id: SETTINGS_ID, ownerId: actor._id },
    { $set: { ownerId: promoted._id } }
  );
  if (moved.modifiedCount !== 1) return conflict(res);

  await tokens.deleteResetLinksFor(promoted._id);
  logger.info(`Ownership handed over from ${actor._id} to ${promoted._id}`);
  await recordAudit('owner.transferred', { actor: actor._id, target: promoted._id });
  return res.json({ owner: publicAccount(promoted, String(promoted._id)) });
});

exports.conflict = conflict;
exports.ownerNeeded = ownerNeeded;
exports.loadTarget = loadTarget;
exports.publicAccount = publicAccount;
exports.ACCOUNT_FIELDS = ACCOUNT_FIELDS;
