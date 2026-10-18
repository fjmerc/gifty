const Vendor = require('../models/Vendor');
const { getOwnerId } = require('./instanceSettings');

/**
 * Vendors created before accounts were separated carry no owner. They were
 * the household's that ran the app then, so they go to the instance owner
 * instead of being listed for every account. Runs at every start; a no-op
 * once done.
 * @returns {Promise<number>} Vendors given an owner
 */
const assignOwnerlessVendors = async () => {
    const ownerId = await getOwnerId();
    if (!ownerId) return 0;
    const result = await Vendor.updateMany({ user: null }, { $set: { user: ownerId } });
    return result.modifiedCount || 0;
};

module.exports = { assignOwnerlessVendors };
