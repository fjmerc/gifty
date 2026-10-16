const mongoose = require('mongoose');
const logger = require('../utils/logger');

const recipientSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true
  },
  isSelf: {
    type: Boolean,
    default: false
  },
  isSystemAccount: {
    type: Boolean,
    default: false,
    description: 'Indicates if this recipient is a system account for automated events'
  },
  // Deleting a recipient you have bought gifts for archives them instead:
  // hidden from lists and pickers, purchases kept for the spending history
  archived: {
    type: Boolean,
    default: false
  },
  archivedAt: {
    type: Date,
    default: null
  },
  profilePicture: {
    type: String, 
    default: ''
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  relation: {
    type: String,
    required: true
  },
  relationship: {
    type: String,
    enum: [
      'family',
      'romantic',
      'friendship',
      'professional',
      'community',
      'online',
      'situational',
      'service',
      'acquaintance',
      'rival',
      'platonic'
    ],
    default: 'acquaintance',
    required: true
  },
  birthdate: {
    type: Date,
    required: true
  },
  tags: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tag'
  }],
  minimumPriceBudget: {
    type: Number,
    required: false // Changed to false
  },
  maximumPriceBudget: {
    type: Number,
    required: false // Changed to false
  },
  giftStatus: {
    type: String,
    enum: ['active', 'inactive', 'paused', 'seasonal'],
    default: 'inactive'
  },
  visibility: {
    type: Boolean,
    default: true
  },
  address: {
    street: {
      type: String,
      required: function() { return this.giftStatus === 'active'; },
      trim: true
    },
    city: {
      type: String,
      required: function() { return this.giftStatus === 'active'; },
      trim: true
    },
    state: {
      type: String,
      required: function() { return this.giftStatus === 'active'; },
      trim: true
    },
    country: {
      type: String,
      required: function() { return this.giftStatus === 'active'; },
      trim: true
    },
    zipCode: {
      type: String,
      required: function() { return this.giftStatus === 'active'; },
      trim: true
    }
  },
  interests: [{
    type: String,
    trim: true
  }],
  hobbies: [{
    type: String,
    trim: true
  }],
  favoriteColors: [{
    type: String,
    trim: true
  }],
  favoriteBooks: [{
    type: String,
    trim: true
  }],
  favoriteMovies: [{
    type: String,
    trim: true
  }],
  favoriteMusic: [{
    type: String,
    trim: true
  }],
  personalityTraits: [{
    type: String,
    enum: ['introverted', 'extroverted', 'analytical', 'creative', 'adventurous', 'cautious', 'organized', 'spontaneous'],
    trim: true
  }],
  occupation: {
    type: String,
    trim: true
  },
  workSchedule: {
    type: String,
    trim: true
  },
  relationshipLength: {
    type: Number,  // in years
    min: 0
  },
  relationshipCloseness: {
    type: String,
    enum: ['very close', 'close', 'neutral', 'distant', 'very distant'],
    default: 'neutral'
  },
  giftPreferences: {
    type: String,
    enum: ['practical', 'sentimental', 'experiential', 'luxury', 'handmade'],
    default: 'practical'
  },
  dietaryRestrictions: [{
    type: String,
    trim: true
  }],
  clothingSizes: {
    shirt: String,
    pants: String,
    shoe: String
  },
  wishList: [{
    item: String,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    }
  }],
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Virtual property for age
recipientSchema.virtual('age').get(function() {
  if (!this.birthdate) return null;
  
  const today = new Date();
  const birthDate = new Date(this.birthdate);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
});

// Ensure virtuals are included when the document is converted to JSON
recipientSchema.set('toJSON', { virtuals: true });
recipientSchema.set('toObject', { virtuals: true });

// Middleware for automatic timestamp updating
recipientSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Middleware for data sanitization
recipientSchema.pre('save', function(next) {
  if (this.firstName) this.firstName = this.firstName.trim();
  if (this.lastName) this.lastName = this.lastName.trim();
  if (this.address) {
    if (this.address.street) this.address.street = this.address.street.trim();
    if (this.address.city) this.address.city = this.address.city.trim();
    if (this.address.state) this.address.state = this.address.state.trim();
    if (this.address.country) this.address.country = this.address.country.trim();
    if (this.address.zipCode) this.address.zipCode = this.address.zipCode.trim();
  }
  next();
});

// Middleware for logging
recipientSchema.post('save', function(doc) {
  logger.debug(`Recipient ${doc._id} was saved`);
});

// Middleware for custom validation
recipientSchema.pre('validate', function(next) {
  if (this.minimumPriceBudget > this.maximumPriceBudget) {
    this.invalidate('budget', 'Minimum price cannot be greater than maximum price');
  }
  next();
});

// Make sure virtuals are included in JSON output
recipientSchema.set('toJSON', { virtuals: true });
recipientSchema.set('toObject', { virtuals: true });

// Add indexes for common query patterns
// Primary user index
recipientSchema.index({ user: 1 }, { name: 'user_index' });

// User with visibility index
recipientSchema.index({ user: 1, visibility: 1 }, { name: 'user_visibility' });

// User with gift status index
recipientSchema.index({ user: 1, giftStatus: 1 }, { name: 'user_gift_status' });

// Name search index
recipientSchema.index({ user: 1, firstName: 'text', lastName: 'text' }, { name: 'name_search' });

// Relationship index
recipientSchema.index({ user: 1, relationship: 1 }, { name: 'user_relationship' });

// System accounts index
recipientSchema.index({ isSystemAccount: 1 }, { name: 'system_accounts' });

// Birthdate index for birthday queries
recipientSchema.index({ user: 1, birthdate: 1 }, { name: 'user_birthdate' });

const Recipient = mongoose.model('Recipient', recipientSchema);

module.exports = Recipient;
