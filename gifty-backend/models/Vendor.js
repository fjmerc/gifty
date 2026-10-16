const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
    vendorName: {
        type: String,
        required: true
    },
    vendorDetails: {
        type: String,
        required: true
    },
    // Owner. Vendors created through the API belong to their creator; legacy
    // vendors without one are given to the instance owner at upgrade
    // (services/legacyOwnership.js).
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    }
}, {
    timestamps: true // Adds createdAt and updatedAt timestamps
});

const Vendor = mongoose.model('Vendor', vendorSchema);

module.exports = Vendor;
