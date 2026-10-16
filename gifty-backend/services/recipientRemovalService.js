const mongoose = require('mongoose');
const { Budget } = require('../models/Budget');
const Event = require('../models/Event');
const Gift = require('../models/Gift');
const Notification = require('../models/Notification');
const Recipient = require('../models/Recipient');
const { removeUnreferencedUpload } = require('../utils/uploads');
const { HttpError } = require('../utils/ownership');

// Deleting a recipient you have bought gifts for archives them: purchased
// gifts are the spending history, so they stay, and so do the events they
// belong to (a gift always needs its event, and its recipient's events may
// hold purchases for other people too). Everything else about the recipient
// goes, including gift ideas on their removed events. A permanent delete
// removes their purchases as well.

/**
 * Remove the given events, except those still holding purchased gifts
 * (any recipient's). Kept events stop reminding and repeating.
 * @param {ObjectId} userId
 * @param {ObjectId[]} eventIds
 */
const clearEvents = async (userId, eventIds) => {
    if (eventIds.length === 0) return;

    const kept = await Gift.distinct('event', { user: userId, event: { $in: eventIds }, status: 'purchased' });
    const keptKeys = new Set(kept.map(String));
    const dropped = eventIds.filter((id) => !keptKeys.has(String(id)));

    await Gift.deleteMany({ user: userId, event: { $in: dropped } });
    await Notification.deleteMany({ user: userId, event: { $in: eventIds } });
    await Event.deleteMany({ user: userId, _id: { $in: dropped } });
    await Event.updateMany(
        { user: userId, _id: { $in: kept } },
        { $set: { 'reminder.isSet': false, 'recurring.frequency': 'None' } }
    );
};

/**
 * Number of purchased gifts per recipient
 * @param {ObjectId} userId
 * @param {ObjectId[]} recipientIds
 * @returns {Promise<Map<string, number>>}
 */
const purchasedGiftCounts = async (userId, recipientIds) => {
    const rows = await Gift.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(String(userId)), recipient: { $in: recipientIds }, status: 'purchased' } },
        { $group: { _id: '$recipient', count: { $sum: 1 } } }
    ]);
    return new Map(rows.map((row) => [String(row._id), row.count]));
};

/**
 * Archive the recipient, or delete them when nothing was bought for them
 * (or when `permanent`)
 * @param {Object} recipient - Owned recipient document
 * @param {{permanent?: boolean}} [options]
 * @returns {Promise<{archived: boolean, purchasedGifts: number}>}
 */
const removeRecipient = async (recipient, { permanent = false } = {}) => {
    const { user: userId, _id: recipientId } = recipient;
    const eventIds = (await Event.find({ user: userId, recipient: recipientId }).select('_id').lean())
        .map((event) => event._id);
    const purchasedGifts = await Gift.countDocuments({ user: userId, recipient: recipientId, status: 'purchased' });
    const othersPurchases = await Gift.exists({
        user: userId, event: { $in: eventIds }, recipient: { $ne: recipientId }, status: 'purchased'
    });

    if (permanent && othersPurchases) {
        throw new HttpError(409, 'Some of their events hold purchased gifts for other recipients. Move those gifts to another event first.');
    }

    if (!permanent && (purchasedGifts > 0 || othersPurchases)) {
        await Gift.deleteMany({ user: userId, recipient: recipientId, status: { $ne: 'purchased' } });
        await clearEvents(userId, eventIds);
        await Recipient.updateOne(
            { _id: recipientId, user: userId },
            { $set: { archived: true, archivedAt: new Date() } }
        );
        return { archived: true, purchasedGifts };
    }

    await Gift.deleteMany({ user: userId, recipient: recipientId });
    await clearEvents(userId, eventIds);
    await Budget.deleteMany({ user: userId, recipient: recipientId });
    await Recipient.deleteOne({ _id: recipientId, user: userId });
    if (recipient.profilePicture) await removeUnreferencedUpload(recipient.profilePicture);
    return { archived: false, purchasedGifts };
};

module.exports = { purchasedGiftCounts, removeRecipient };
