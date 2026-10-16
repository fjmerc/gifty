const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    name: {
        type: String,
        required: true
    },
    relationship: {
        type: String,
        required: true
    },
    birthday: {
        type: Date
    },
    address: {
        type: String
    }
}, {
    timestamps: true // Adds createdAt and updatedAt timestamps
});

const Profile = mongoose.model('Profile', profileSchema);

module.exports = Profile;
