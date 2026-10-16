const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        immutable: true
    },
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true,
        immutable: true
    },
    notificationType: {
        type: String,
        required: true,
        enum: ['info', 'warning', 'alert', 'email'], // Define relevant notification types
        immutable: true
    },
    notificationDate: {
        type: Date,
        required: true,
        immutable: true
    },
    read: {
        type: Boolean,
        default: false
    },
    snoozedUntil: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: ['sent', 'delivered', 'clicked', 'retroactive'],
        default: 'sent'
    },
    isRetroactive: {
        type: Boolean,
        default: false
    },
    scheduledTime: {
        type: Date,
        default: null
    },
    expiresAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true, // Adds createdAt and updatedAt timestamps
    optimisticConcurrency: true // Enables atomic operations
});

// Indexes
notificationSchema.index({ user: 1, notificationDate: 1 }, { unique: true });
notificationSchema.index({ user: 1, read: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
