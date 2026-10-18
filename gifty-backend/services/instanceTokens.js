// The only code that reads or writes invite and reset tokens. Every use of a
// token is one conditional update (no transactions on MongoDB 4.4), so two
// people using one link at once can't both get it.
const crypto = require('crypto');
const InstanceToken = require('../models/InstanceToken');
const { getPublicUrl } = require('../config/runtime');

const INVITE_DAYS = [1, 7, 30];
const DEFAULT_INVITE_DAYS = 7;
const RESET_HOURS = 24;
const HOUR = 60 * 60 * 1000;

const hashToken = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const linkFor = (type, raw) => `${getPublicUrl()}/${type === 'invite' ? 'invite' : 'reset'}/${raw}`;

const createInvite = async ({ email = null, days = DEFAULT_INVITE_DAYS, createdBy }) => {
  if (!INVITE_DAYS.includes(days)) throw new Error('An invite lasts 1, 7 or 30 days');
  const token = newToken();
  const invite = await InstanceToken.create({
    type: 'invite', hash: hashToken(token), email: email ? String(email).toLowerCase() : null,
    createdBy, expiresAt: new Date(Date.now() + days * 24 * HOUR)
  });
  return { token, invite: invite.toObject() };
};

const deleteResetLinksFor = async (userId) => {
  await InstanceToken.deleteMany({ type: 'reset', userId });
};

const createResetLink = async ({ userId, createdBy = null }) => {
  await deleteResetLinksFor(userId);
  const token = newToken();
  const expiresAt = new Date(Date.now() + RESET_HOURS * HOUR);
  await InstanceToken.create({ type: 'reset', hash: hashToken(token), userId, createdBy, expiresAt });
  return { token, expiresAt };
};

const inspectToken = async (type, raw) => {
  const doc = raw ? await InstanceToken.findOne({ type, hash: hashToken(raw) }).lean() : null;
  if (!doc) return { status: 'unknown', doc: null };
  if (doc.usedAt) return { status: 'used', doc };
  if (doc.expiresAt <= new Date()) return { status: 'expired', doc };
  return { status: 'valid', doc };
};

const consumeToken = async (type, raw, extra = {}) => InstanceToken.findOneAndUpdate(
  { type, hash: hashToken(raw), usedAt: null, expiresAt: { $gt: new Date() }, ...extra },
  { $set: { usedAt: new Date() } },
  { new: true }
).lean();

const releaseToken = async (id) => {
  await InstanceToken.updateOne({ _id: id }, { $set: { usedAt: null } });
};

const listPendingInvites = async () => InstanceToken.find(
  { type: 'invite', usedAt: null, expiresAt: { $gt: new Date() } },
  { _id: 1, email: 1, expiresAt: 1, createdAt: 1, createdBy: 1 }
).sort({ createdAt: -1 }).lean();

const revokeInvite = async (id) => (await InstanceToken.deleteOne({ _id: id, type: 'invite', usedAt: null })).deletedCount === 1;

module.exports = {
  INVITE_DAYS, DEFAULT_INVITE_DAYS, RESET_HOURS,
  hashToken, linkFor, createInvite, createResetLink, inspectToken, consumeToken,
  releaseToken, listPendingInvites, revokeInvite, deleteResetLinksFor
};
