const mongoose = require('mongoose');

const eventTypeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Event type name is required'],
        trim: true,
        maxlength: [50, 'Event type names can be at most 50 characters']
    },
    description: {
        type: String
    },
    isCustom: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        // Required only if isCustom is true, handle in validation
    }
}, {
    timestamps: true // Add timestamps for when types were created
});

// Custom validation to ensure createdBy is required for custom event types
eventTypeSchema.pre('validate', function(next) {
    if (this.isCustom === true && !this.createdBy) {
        this.invalidate('createdBy', 'CreatedBy field is required for custom event types');
    }
    next();
});

// Names are unique per creator. System types have no createdBy, so they stay
// unique among themselves, and a user may reuse a system or another user's
// name for a custom type. Existing databases still carry the old global
// index name_1, which the money-model migration drops.
eventTypeSchema.index({ createdBy: 1, name: 1 }, { unique: true, name: 'creator_name_unique' });

const EventType = mongoose.model('EventType', eventTypeSchema);
module.exports = EventType;
