const mongoose = require('mongoose');
const { roundMoney } = require('../utils/money');

const giftSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Recipient',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    // New field for gift category
    category: {
        type: String,
        default: 'Uncategorized'
    },
    // New field for gift tags
    tags: [{
        type: String
    }],
    price: {
        type: Number,
        required: true,
        min: [0, 'Price cannot be negative'],
        // Whole cents: 34.999 is stored as 35 and 0.1 + 0.2 as 0.3. Mongoose
        // also runs setters when casting update queries.
        set: roundMoney
    },
    // New field for price range
    priceRange: {
        min: {
            type: Number
        },
        max: {
            type: Number
        }
    },
    // New field for purchase sources
    whereToBuy: [{
        type: String
    }],
    // Set only while status is 'purchased': "now" at purchase, or a
    // YYYY-MM-DD day chosen by the user (stored as noon in the instance TZ).
    // Money totals bucket purchases by this date.
    purchaseDate: {
        type: Date
    },
    status: {
        type: String,
        enum: ['suggestion', 'saved', 'purchased', 'ignored'],
        default: 'suggestion'
    },
    isAISuggested: {
        type: Boolean,
        default: false
    },
    // Which AI provider/model produced this suggestion. Set when the
    // gift is created from a generated suggestion; null for manual
    // entries. Lets the UI badge each card and lets analytics segment
    // engagement by provider.
    aiProvider: {
        type: String,
        trim: true
    },
    aiModel: {
        type: String,
        trim: true
    },
    // Web-Enhanced only: pages the web search returned for this suggestion
    // (http(s), at most 3; host taken from the URL). Links, nothing more:
    // no price, availability or rating is kept from the web.
    webSources: {
        type: [{
            _id: false,
            title: { type: String, trim: true, maxlength: 200 },
            url: { type: String, required: true, match: /^https?:\/\//i, maxlength: 2048 },
            host: { type: String, trim: true, maxlength: 255 }
        }],
        default: undefined,
        validate: {
            validator: (list) => !list || list.length <= 3,
            message: 'At most 3 web sources per gift'
        }
    },
    // An AI suggestion whose estimated price is above what was left of the
    // budget when it was suggested: kept and shown with an "Over budget" tag
    overBudget: {
        type: Boolean,
        default: false
    },
    relevanceScore: {
        type: Number,
        min: 0,
        max: 100
    },
    generatedAt: {
        type: Date
    },
    favorite: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
// Primary filters index
giftSchema.index({ user: 1, status: 1 }, { name: 'primary_filters' });

// AI suggestions index
giftSchema.index({ recipient: 1, event: 1, isAISuggested: 1 }, { name: 'ai_suggestions' });

// Status-based index
giftSchema.index({ user: 1, recipient: 1, status: 1 }, { name: 'user_recipient_status' });

// Timestamp-based index
giftSchema.index({ createdAt: -1 }, { name: 'created_timestamp' });

// Favorites index
giftSchema.index({ user: 1, favorite: 1 }, { name: 'user_favorites' });

// Events index with dates
giftSchema.index({ event: 1, purchaseDate: 1 }, { name: 'event_purchase_date' });

// Money summaries: one user's purchases bucketed by purchaseDate
giftSchema.index({ user: 1, status: 1, purchaseDate: 1 }, { name: 'user_status_purchase_date' });

// Money is never stored on gifts or budgets: Spent is derived from purchased
// gifts by services/moneyService.js, so purchasing, un-purchasing, deleting,
// re-pricing or moving a gift is a single write to the gift itself.

// Static method to find gifts within budget
giftSchema.statics.findWithinBudget = async function(userId, recipientId, maxPrice) {
    return this.find({
        user: userId,
        recipient: recipientId,
        price: { $lte: maxPrice },
        status: { $ne: 'purchased' }
    }).sort({ price: -1 });
};

const Gift = mongoose.model('Gift', giftSchema);

module.exports = Gift;
