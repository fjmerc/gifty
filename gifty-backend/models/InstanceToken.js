// Invite and password-reset links (1b). Only a SHA-256 of each token is
// stored. Validity is expiresAt > now; MongoDB deletes a token 30 days after
// it expires, so until then the pages can say "expired" or "already used".
const mongoose = require('mongoose');

const GRACE_SECONDS = 30 * 24 * 60 * 60;

const instanceTokenSchema = new mongoose.Schema({
  type: { type: String, enum: ['invite', 'reset'], required: true },
  hash: { type: String, required: true },
  email: { type: String, default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null }
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'instancetokens' });

instanceTokenSchema.index({ hash: 1 }, { unique: true });
instanceTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: GRACE_SECONDS });
instanceTokenSchema.index({ type: 1, userId: 1 });

module.exports = mongoose.models.InstanceToken || mongoose.model('InstanceToken', instanceTokenSchema);
