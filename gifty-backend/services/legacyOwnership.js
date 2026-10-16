const User = require('../models/User');
const Vendor = require('../models/Vendor');

/**
 * Vendors created before accounts were separated carry no owner. They were
 * the household's that ran the app then, so they go to the instance owner
 * (the oldest account, the same rule as requireInstanceOwner) instead of
 * being listed for every account. Runs at every start; a no-op once done.
 * @returns {Promise<number>} Vendors given an owner
 */
const assignOwnerlessVendors = async () => {
    const owner = await User.findOne({}, { _id: 1 }).sort({ _id: 1 }).lean();
    if (!owner) return 0;
    const result = await Vendor.updateMany({ user: null }, { $set: { user: owner._id } });
    return result.modifiedCount || 0;
};

module.exports = { assignOwnerlessVendors };
