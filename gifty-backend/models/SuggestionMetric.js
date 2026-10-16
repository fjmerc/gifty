const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Per-AI-call telemetry. One document per provider call, including
 * failed ones. Indexed for the most common queries: "show me cost &
 * latency by provider over the last 7 days" and "which provider/model
 * works best for which user?"
 *
 * This is written fire-and-forget from the provider facade and the
 * controller — failures here must never break a user-facing request.
 */
const SuggestionMetricSchema = new Schema({
  // Who/what asked
  user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  recipient: { type: Schema.Types.ObjectId, ref: 'Recipient' },
  event: { type: Schema.Types.ObjectId, ref: 'Event' },

  // Pipeline metadata
  mode: { type: String, enum: ['basic', 'enhanced', 'web', 'hybrid', 'unknown'], default: 'unknown' },
  provider: { type: String, index: true },
  model: { type: String, index: true },

  // Performance
  latencyMs: Number,
  tokensIn: Number,
  tokensOut: Number,

  // Outcome
  success: { type: Boolean, default: true, index: true },
  errorCode: String,
  errorMessage: String,

  // What got produced
  candidateCount: Number,    // suggestions the model produced
  finalCount: Number,        // suggestions after re-ranking / filtering
  fromCache: { type: Boolean, default: false },

  // Whether the chain failed over to a backup provider before success.
  failoverAttempts: [{
    provider: String,
    model: String,
    code: String,
    status: Number,
    message: String,
    _id: false,
  }],

  timestamp: { type: Date, default: Date.now, index: true },
}, { collection: 'suggestion_metrics' });

// Useful compound index: aggregate per-user, per-provider over time.
SuggestionMetricSchema.index({ user: 1, provider: 1, timestamp: -1 });
SuggestionMetricSchema.index({ provider: 1, model: 1, timestamp: -1 });

module.exports = mongoose.model('SuggestionMetric', SuggestionMetricSchema);
