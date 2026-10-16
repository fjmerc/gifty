const mongoose = require('mongoose');

const giftLibrarySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  description: {
    type: String,
    required: true
  },
  priceRange: {
    min: Number,
    max: Number
  },
  categories: [{
    type: String,
    index: true
  }],
  tags: [{
    type: String,
    index: true
  }],
  demographics: {
    ageRange: [Number],
    gender: [String],
    interests: [String]
  },
  occasions: [String],
  sourceUrl: String,
  imageUrls: [String],
  popularityScore: {
    type: Number,
    default: 0
  },
  discoveryDate: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'archived', 'pending_review'],
    default: 'active'
  },
  metadata: {
    retailer: String,
    brand: String,
    avgRating: Number,
    reviewCount: Number
  },
  // One reaction per account, so popularity counts each account once.
  // Private to the server: never part of a read unless selected.
  reactions: {
    type: [{
      _id: false,
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      action: { type: String, enum: ['liked', 'purchased', 'disliked', 'ignored'], required: true },
      at: { type: Date, default: Date.now }
    }],
    select: false
  }
}, {
  timestamps: true
});

// Add compound indexes for efficient querying
giftLibrarySchema.index({ categories: 1, status: 1 });
giftLibrarySchema.index({ tags: 1, status: 1 });
giftLibrarySchema.index({ 'demographics.interests': 1, status: 1 });
giftLibrarySchema.index({ occasions: 1, status: 1 });
giftLibrarySchema.index({ popularityScore: -1, status: 1 });
giftLibrarySchema.index({ discoveryDate: -1, status: 1 });
giftLibrarySchema.index({ 'priceRange.min': 1, 'priceRange.max': 1, status: 1 });

// Add text index for search functionality
giftLibrarySchema.index({
  name: 'text',
  description: 'text',
  categories: 'text',
  tags: 'text'
});

// Methods
giftLibrarySchema.methods.isAffordable = function(budget) {
  if (!budget) return true;
  return this.priceRange.min <= budget && this.priceRange.max <= budget;
};

giftLibrarySchema.methods.matchesDemographics = function(age, gender, interests) {
  const matchesAge = !age || (this.demographics.ageRange[0] <= age && age <= this.demographics.ageRange[1]);
  const matchesGender = !gender || !this.demographics.gender.length || this.demographics.gender.includes(gender);
  const matchesInterests = !interests || !interests.length || 
    this.demographics.interests.some(interest => interests.includes(interest));
  
  return matchesAge && matchesGender && matchesInterests;
};

// Statics
giftLibrarySchema.statics.findByCategory = function(category, limit = 20) {
  return this.find({ categories: category, status: 'active' })
    .sort({ popularityScore: -1 })
    .limit(limit);
};

giftLibrarySchema.statics.findByOccasion = function(occasion, limit = 20) {
  return this.find({ occasions: occasion, status: 'active' })
    .sort({ popularityScore: -1 })
    .limit(limit);
};

giftLibrarySchema.statics.findTrending = function(limit = 20) {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return this.find({ 
    status: 'active',
    discoveryDate: { $gte: oneWeekAgo }
  })
  .sort({ popularityScore: -1 })
  .limit(limit);
};

// Pre-save middleware to update lastUpdated
giftLibrarySchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

const GiftLibrary = mongoose.model('GiftLibrary', giftLibrarySchema);

module.exports = GiftLibrary;
