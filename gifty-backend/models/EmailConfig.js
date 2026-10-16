const mongoose = require('mongoose');

const emailConfigSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    service: {
        type: String,
        enum: ['gmail', 'outlook', 'yahoo', 'custom'],
        required: true
    },
    host: {
        type: String,
        required: function() { return this.service === 'custom'; }
    },
    port: {
        type: Number,
        required: function() { return this.service === 'custom'; },
        validate: {
            validator: function(value) {
                return value > 0 && value <= 65535;
            },
            message: 'Port must be between 1 and 65535'
        }
    },
    secure: {
        type: Boolean,
        default: true
    },
    // Custom servers: refuse to send without STARTTLS (see utils/smtpHostPolicy)
    requireTLS: {
        type: Boolean
    },
    username: {
        type: String,
        required: true
    },
    // The SMTP password, encrypted (utils/secretBox: enc:v1:…). Never part
    // of a read unless selected; never in exports or API responses.
    rawPassword: {
        type: String,
        select: false,
        required: true
    },
    fromName: {
        type: String,
        default: function() { 
            return 'Gifty Notifications';
        }
    },
    enabled: {
        type: Boolean,
        default: true
    },
    lastTested: {
        type: Date,
        default: null
    },
    lastTestResult: {
        success: {
            type: Boolean,
            default: null
        },
        message: {
            type: String,
            default: null
        }
    }
}, {
    timestamps: true
});

const EmailConfig = mongoose.model('EmailConfig', emailConfigSchema);
module.exports = EmailConfig;