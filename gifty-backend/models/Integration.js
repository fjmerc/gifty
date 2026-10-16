const mongoose = require('mongoose');

const integrationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    platform: {
        type: String,
        required: true
    },
    integrationDetails: {
        type: String
    }
}, {
    timestamps: true // Adds createdAt and updatedAt timestamps
});

const Integration = mongoose.model('Integration', integrationSchema);

module.exports = Integration;
