const mongoose = require('mongoose');

const tagSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    // Owner. Tags created through the API belong to their creator; legacy
    // tags without an owner are readable by everyone but modifiable by no one.
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    }
});

// Names are unique per owner (legacy un-owned tags share the null owner).
// NOTE: databases created before this change still carry the old global
// unique index `name_1`; it must be dropped by a migration, not from code.
tagSchema.index({ user: 1, name: 1 }, { unique: true });

const Tag = mongoose.model('Tag', tagSchema);
module.exports = Tag;
