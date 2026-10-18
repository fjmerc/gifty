const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { legacyEncode } = require('../utils/legacyInputEncoding');
const logger = require('../utils/logger');
const { HOLIDAY_CATEGORIES, SUGGESTION_MODES } = require('../config/userPreferences');
const { SUPPORTED_CURRENCIES } = require('../config/instanceDefaults');

// bcrypt cost for new hashes; older, cheaper hashes are moved up on the next
// successful sign-in
const BCRYPT_COST = 12;

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
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
    dateOfBirth: {
        type: Date
    },
    profilePicture: {
        type: String,
        default: null
    },
    // Carried in every token; raising it (sign-out, password or email
    // change) ends all sessions issued before. Accounts and tokens from
    // before it existed count as 0.
    tokenVersion: {
        type: Number,
        default: 0
    },
    // Instance role (1b). The owner is kept in the instance settings
    // (services/instanceSettings), and is always an admin.
    role: {
        type: String,
        enum: ['admin', 'member'],
        default: 'member'
    },
    // Deactivated accounts can't sign in; their data is kept
    active: {
        type: Boolean,
        default: true
    },
    tags: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tag'
    }],
    recipients: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Recipient'
    }],
    preferences: {
        theme: {
            type: String,
            enum: ['light', 'dark', 'system'],
            default: 'system'
        },
        timezone: {
            type: String,
            default: 'UTC'
        },
        allowRetroactiveNotifications: {
            type: Boolean,
            default: true
        },
        // AI suggestion mode last chosen on /gifts. (Replaces the old
        // useHybridSuggestions/useEnhancedSuggestions/useWebSearch switches,
        // which older documents may still carry and are ignored.)
        suggestionMode: {
            type: String,
            enum: SUGGESTION_MODES
        },
        // Preferred AI provider (openai|anthropic|gemini). When unset,
        // the server uses AI_DEFAULT_PROVIDER from env (default: openai).
        aiProvider: {
            type: String,
            trim: true
        },
        // Preferred model id within the chosen provider. Validated
        // server-side against modelRegistry.
        aiModel: {
            type: String,
            trim: true
        },
        // Money is shown in this currency until a year has an overall
        // budget. Set at registration from DEFAULT_CURRENCY; no default, so
        // accounts from before it read as USD (see moneyService)
        currency: {
            type: String,
            enum: SUPPORTED_CURRENCIES
        },
        notificationSettings: {
            email: {
                enabled: { type: Boolean, default: true },
                address: { type: String }
            },
            push: {
                enabled: { type: Boolean, default: true }
            },
            sms: {
                enabled: { type: Boolean, default: false },
                number: { type: String }
            }
        },
        holidaySettings: {
            enabled: { type: Boolean, default: true },
            categories: {
                type: [String],
                enum: HOLIDAY_CATEGORIES,
                default: ['national', 'cultural']
            },
            countryCode: {
                type: String,
                default: 'US'
            },
            defaultRemindDaysBefore: {
                type: Number,
                default: 7
            }
        }
    }
}, {
    timestamps: true
});

// Validate username and email uniqueness before saving
userSchema.pre('validate', async function(next) {
    if (this.isNew || this.isModified('username')) {
        const existingUser = await User.findOne({ username: this.username });
        if (existingUser && existingUser._id.toString() !== this._id.toString()) {
            this.invalidate('username', 'Username is already taken');
        }
    }
    
    if (this.isNew || this.isModified('email')) {
        const existingUser = await User.findOne({ email: this.email });
        if (existingUser && existingUser._id.toString() !== this._id.toString()) {
            this.invalidate('email', 'Email is already in use');
        }
    }
    
    next();
});

// Hash password before saving
// A complete bcrypt hash: never hashed again (defence in depth for rehash)
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

userSchema.pre('save', async function(next) {
    if (!this.isModified('password') || BCRYPT_HASH.test(this.password)) {
        return next();
    }
    try {
        const salt = await bcrypt.genSalt(BCRYPT_COST);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to check if entered password is correct. Passwords set before
// 2026-10 were HTML-encoded by a since-removed middleware before hashing
// (see utils/legacyInputEncoding); such a hash still accepts the real
// password once and is then re-hashed from it.
userSchema.methods.matchPassword = async function(enteredPassword) {
    if (await bcrypt.compare(enteredPassword, this.password)) {
        if (bcrypt.getRounds(this.password) < BCRYPT_COST) await rehash(this, enteredPassword);
        return true;
    }

    const legacy = legacyEncode(enteredPassword);
    if (!legacy || legacy === enteredPassword) return false;
    if (!(await bcrypt.compare(legacy, this.password))) return false;

    await rehash(this, enteredPassword);
    return true;
};

// Re-hash with a direct write: save() would run every current validator,
// and an old document failing one must not turn a correct login into an error
// The loaded document takes the new hash without being marked modified: a
// later save() in the same request would otherwise hash the hash, and the
// account could never sign in again
async function rehash(user, password) {
    const hash = await bcrypt.hash(password, await bcrypt.genSalt(BCRYPT_COST));
    await user.constructor.updateOne({ _id: user._id }, { $set: { password: hash } });
    user.password = hash;
    user.unmarkModified('password');
}

// Helper method to get overall budget for a specific year
userSchema.methods.getOverallBudget = async function(year) {
    try {
        const { OverallBudget } = require('./Budget');
        return await OverallBudget.findOne({ user: this._id, year });
    } catch (error) {
        logger.error('Error finding overall budget:', error);
        return null;
    }
};

const User = mongoose.model('User', userSchema);

module.exports = User;
module.exports.BCRYPT_COST = BCRYPT_COST;
