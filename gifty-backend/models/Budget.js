const mongoose = require('mongoose');
const { roundMoney } = require('../utils/money');

// User Preferences Model
const userPreferencesSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    useBudgetFeature: {
        type: Boolean,
        default: true
    },
    trackExpenditures: {
        type: Boolean,
        default: true
    },
    alertThresholds: {
        warning: {
            type: Number,
            default: 80,  // Alert at 80% of budget
            min: 0,
            max: 100
        },
        critical: {
            type: Number,
            default: 95,  // Alert at 95% of budget
            min: 0,
            max: 100
        }
    }
}, {
    timestamps: true
});

const UserPreferences = mongoose.model('UserPreferences', userPreferencesSchema);

// Budgets hold configuration only. Allocated, Unallocated, Spent, Left and
// statuses are computed on read by services/moneyService.js; nothing here
// stores a money figure that purchases could make stale.

// Overall Budget Model
const overallBudgetSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: function() {
            return this.isLimited;
        },
        min: [0, 'Amount cannot be negative'],
        set: roundMoney
    },
    isLimited: {
        type: Boolean,
        default: true
    },
    // The currency of every figure shown for this year
    currency: {
        type: String,
        default: 'USD',
        required: true
    },
    year: {
        type: Number,
        required: true
    },
    notes: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

overallBudgetSchema.index({ user: 1, year: 1 }, { unique: true });

const OverallBudget = mongoose.model('OverallBudget', overallBudgetSchema);

// Individual (per recipient) Budget Model
const budgetSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Recipient',
        required: true
    },
    allocationType: {
        type: String,
        enum: ['fixed', 'percentage'],
        default: 'fixed'
    },
    minimumAmount: {
        type: Number,
        default: 0,
        min: [0, 'Amount cannot be negative'],
        set: roundMoney
    },
    // Fixed budgets only: a percentage budget's limit is the overall amount ×
    // percentageAllocation / 100, computed on read
    maximumAmount: {
        type: Number,
        required: [function() {
            return this.allocationType !== 'percentage';
        }, 'Maximum amount is required for a fixed budget'],
        min: [0, 'Amount cannot be negative'],
        set: roundMoney
    },
    percentageAllocation: {
        type: Number,
        min: 0,
        max: 100,
        required: [function() {
            return this.allocationType === 'percentage';
        }, 'Percentage allocation is required when allocation type is percentage']
    },
    isLimited: {
        type: Boolean,
        default: true
    },
    // Deprecated: figures are shown in the overall budget's currency. Kept so
    // old documents load; never written.
    currency: {
        type: String
    },
    year: {
        type: Number,
        required: true
    },
    startDate: {
        type: Date,
        default: Date.now,
        required: true
    },
    endDate: {
        type: Date
    },
    frequency: {
        type: String,
        enum: ['one-time', 'weekly', 'monthly', 'yearly'],
        default: 'yearly'
    },
    category: {
        type: String,
        enum: ['gifts', 'events', 'general'],
        default: 'gifts'
    },
    notes: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

budgetSchema.index({ user: 1, recipient: 1, year: 1 }, { unique: true });

// invalidate() produces a ValidationError, which the API reports as a 400
budgetSchema.pre('validate', function(next) {
    if (this.allocationType !== 'percentage' && this.maximumAmount != null &&
        this.minimumAmount > this.maximumAmount) {
        this.invalidate('minimumAmount', 'Minimum amount cannot be greater than maximum amount');
    }
    if (this.endDate && this.startDate > this.endDate) {
        this.invalidate('endDate', 'End date must be after start date');
    }
    next();
});

// A user who turned the budget feature off gets unlimited budgets
budgetSchema.pre('save', async function(next) {
    try {
        const prefs = await mongoose.model('UserPreferences').findOne({ user: this.user });
        if (prefs && !prefs.useBudgetFeature) {
            this.isLimited = false;
        }
        next();
    } catch (error) {
        next(error);
    }
});

const Budget = mongoose.model('Budget', budgetSchema);

module.exports = { UserPreferences, OverallBudget, Budget };
