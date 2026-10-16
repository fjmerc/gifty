const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const FeedbackLogSchema = new Schema({
  gift: {
    type: Schema.Types.ObjectId,
    ref: 'Gift',
    required: true
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: Schema.Types.ObjectId,
    ref: 'Recipient', 
    required: true
  },
  action: {
    type: String,
    enum: ['viewed', 'saved', 'purchased', 'ignored', 'favorited'],
    required: true
  },
  explicitRating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  category: {
    type: String
  },
  tags: [{
    type: String
  }],
  relevanceScore: {
    type: Number
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  comment: {
    type: String,
    trim: true
  }
});

// Create indexes for efficient querying
FeedbackLogSchema.index({ user: 1 });
FeedbackLogSchema.index({ recipient: 1 });
FeedbackLogSchema.index({ category: 1 });
FeedbackLogSchema.index({ tags: 1 });
FeedbackLogSchema.index({ action: 1 });
FeedbackLogSchema.index({ timestamp: 1 });
FeedbackLogSchema.index({ explicitRating: 1 });

module.exports = mongoose.model('FeedbackLog', FeedbackLogSchema);
