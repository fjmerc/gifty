const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    date: {
        type: Date,
        required: true
    },
    month: {
        type: Number,
        required: true,
        min: 1,
        max: 12
    },
    day: {
        type: Number,
        required: true,
        min: 1,
        max: 31
    },
    hasFixedDate: {
        type: Boolean,
        default: true
    },
    formula: {
        type: String,
        default: null
    },
    eventType: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EventType',
        required: true
    },
    countryCode: {
        type: String,
        required: true
    },
    remindDaysBefore: {
        type: Number,
        default: 7
    },
    isActive: {
        type: Boolean,
        default: true
    },
    tags: [{
        type: String
    }],
    category: {
        type: String,
        enum: ['national', 'religious', 'cultural', 'international'],
        default: 'national'
    }
}, { timestamps: true });

const Holiday = mongoose.model('Holiday', holidaySchema);
module.exports = Holiday;