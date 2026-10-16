const asyncHandler = require('express-async-handler');
const Recipient = require('../models/Recipient');
const Tag = require('../models/Tags');
const { HttpError, findOwned, pickFields } = require('../utils/ownership');
const { removeUnreferencedUpload } = require('../utils/uploads');
const { syncBirthdayEvent } = require('../services/birthdayEventService');
const { purchasedGiftCounts, removeRecipient } = require('../services/recipientRemovalService');
const logger = require('../utils/logger');

// The birthday event is a convenience: failing to sync it must not fail the
// recipient write (the monthly event job retries)
const syncBirthday = async (recipient, previous) => {
  try {
    await syncBirthdayEvent(recipient, previous);
  } catch (error) {
    logger.error(`Birthday event for recipient ${recipient._id} failed: ${error.message}`);
  }
};

// Fields a client may set on its own recipients (the add/edit/profile forms).
// Ownership (user), isSystemAccount and isSelf are server-controlled, and
// profilePicture has its own upload route.
const RECIPIENT_FIELDS = [
  'firstName', 'lastName', 'relation', 'relationship', 'birthdate', 'tags',
  'minimumPriceBudget', 'maximumPriceBudget', 'giftStatus', 'visibility',
  'address', 'interests', 'hobbies', 'favoriteColors', 'favoriteBooks',
  'favoriteMovies', 'favoriteMusic', 'personalityTraits', 'occupation',
  'workSchedule', 'relationshipLength', 'relationshipCloseness',
  'giftPreferences', 'dietaryRestrictions', 'clothingSizes', 'wishList'
];

// A recipient as the lists send it: tags as { _id, name }
const withTagNames = (recipient) => {
  const formatted = recipient.toObject();
  formatted.tags = formatted.tags.map(tag => ({ _id: tag._id, name: tag.name }));
  return formatted;
};

exports.getAllRecipients = asyncHandler(async (req, res) => {
  // System accounts like "Gifty Holidays" never show; archived recipients
  // only when asked for (?archived=true)
  const recipients = await Recipient.find({
    user: req.user.id,
    isSystemAccount: { $ne: true },
    archived: req.query.archived === 'true' ? true : { $ne: true }
  }).populate('tags', 'name');
  // The delete dialog says whether deleting archives them instead
  const purchased = await purchasedGiftCounts(req.user.id, recipients.map((recipient) => recipient._id));

  res.json(recipients.map(recipient => ({
    ...withTagNames(recipient),
    purchasedGiftCount: purchased.get(String(recipient._id)) || 0
  })));
});

// The event pickers: every active recipient, the holidays account included
exports.getRecipientsForEvents = asyncHandler(async (req, res) => {
  const recipients = await Recipient.find({ user: req.user.id, archived: { $ne: true } })
    .populate('tags', 'name');
  res.json(recipients.map(withTagNames));
});

exports.getRecipientById = asyncHandler(async (req, res) => {
  const recipient = await findOwned(Recipient, req.params.id, req.user.id, {
    label: 'Recipient',
    populate: { path: 'tags', select: 'name' }
  });

  res.json(recipient);
});

exports.addRecipient = asyncHandler(async (req, res) => {
  const { tags, ...fields } = pickFields(req.body, RECIPIENT_FIELDS);

  // Map the relation to a valid relationship value
  const relationshipMap = {
    'Family': 'family',
    'Friend': 'friendship',
    'Colleague': 'professional',
    'Other': 'acquaintance'
  };

  const newRecipient = new Recipient({
    giftStatus: 'inactive', // Inactive until address info is provided
    ...fields,
    relationship: fields.relationship || relationshipMap[fields.relation] || 'acquaintance',
    // Always the caller's account; never taken from the body
    user: req.user.id,
    isSystemAccount: false
  });

  if (tags && Array.isArray(tags)) {
    const tagIds = await processTags(tags, req.user.id);
    newRecipient.tags = tagIds;
  }

  const recipient = await newRecipient.save();
  await syncBirthday(recipient);

  // No automatic budget: a new recipient shows "No budget" until the user
  // sets one, so creating recipients can't over-allocate the overall budget.

  // Populate tags so the client receives tag objects (with .name) rather than
  // bare ObjectIds, matching the shape from getAllRecipients/updateRecipient.
  await recipient.populate('tags', 'name');

  res.status(201).json(recipient);
});

exports.updateRecipient = asyncHandler(async (req, res) => {
  const recipient = await findOwned(Recipient, req.params.id, req.user.id, { label: 'Recipient' });

  const previous = { firstName: recipient.firstName };
  const updateData = pickFields(req.body, RECIPIENT_FIELDS);

  if (updateData.tags && Array.isArray(updateData.tags)) {
    updateData.tags = await processTags(updateData.tags, req.user.id);
  }

  ['interests', 'hobbies', 'favoriteColors', 'favoriteBooks', 'favoriteMovies', 'favoriteMusic', 'personalityTraits', 'dietaryRestrictions'].forEach(field => {
    if (typeof updateData[field] === 'string') {
      updateData[field] = updateData[field].split(',').map(item => item.trim()).filter(Boolean);
    }
  });

  if (typeof updateData.wishList === 'string') {
    updateData.wishList = updateData.wishList.split(',').map(item => {
      const [itemName, priority] = item.split(':');
      return { item: itemName.trim(), priority: priority ? priority.trim() : 'medium' };
    }).filter(item => item.item);
  }

  // Validate the changed paths on the merged document. Unlike update
  // validators this also runs the schema's pre('validate') min/max price
  // check against the stored values.
  recipient.set(updateData);
  await recipient.validate(Object.keys(updateData));

  const updated = await Recipient.findOneAndUpdate(
    { _id: recipient._id, user: req.user.id },
    { $set: { ...updateData, updatedAt: new Date() } },
    { new: true, runValidators: true }
  ).populate('tags', 'name');

  if (!updated) throw new HttpError(404, 'Recipient not found');
  if ('birthdate' in updateData || 'firstName' in updateData) {
    await syncBirthday(updated, previous);
  }
  res.json(updated);
});

exports.deleteRecipient = asyncHandler(async (req, res) => {
  const recipient = await findOwned(Recipient, req.params.id, req.user.id, { label: 'Recipient' });

  if (recipient.isSystemAccount) {
    throw new HttpError(400, 'The holidays account can\'t be deleted');
  }

  const result = await removeRecipient(recipient, { permanent: req.query.permanent === 'true' });
  res.json({
    ...result,
    message: result.archived
      ? 'Recipient archived; their purchased gifts are kept'
      : 'Recipient and associated data removed'
  });
});

exports.restoreRecipient = asyncHandler(async (req, res) => {
  const recipient = await findOwned(Recipient, req.params.id, req.user.id, { label: 'Recipient' });
  const restored = await Recipient.findOneAndUpdate(
    { _id: recipient._id, user: req.user.id },
    { $set: { archived: false, archivedAt: null } },
    { new: true, runValidators: false }
  ).populate('tags', 'name');
  await syncBirthday(restored);
  res.json(restored);
});

exports.getNavigation = asyncHandler(async (req, res) => {
  const currentId = req.params.id;
  // Filter out system accounts to maintain consistent navigation
  // Same recipients as the list: no system accounts, no archived ones
  const allRecipients = await Recipient.find({
    user: req.user._id,
    isSystemAccount: { $ne: true },
    archived: { $ne: true }
  }).sort({ firstName: 1, lastName: 1 }).select('_id');
  
  const currentIndex = allRecipients.findIndex(r => r._id.toString() === currentId);
  
  const prevId = currentIndex > 0 ? allRecipients[currentIndex - 1]._id : null;
  // An archived (or unknown) recipient is not in the list: no neighbours
  const nextId = currentIndex >= 0 && currentIndex < allRecipients.length - 1 ? allRecipients[currentIndex + 1]._id : null;

  res.json({ prevId, nextId });
});

exports.uploadProfilePicture = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  let recipient;
  try {
    recipient = await findOwned(Recipient, req.params.id, req.user.id, { label: 'Recipient' });
  } catch (error) {
    await removeUnreferencedUpload(`/uploads/${req.file.filename}`);
    throw error;
  }

  // Store a host-independent path (like user profile pictures do). The
  // frontend resolves it against whatever backend origin it talks to,
  // so uploads keep working when the app is reached via a LAN IP.
  const picturePath = `/uploads/${req.file.filename}`;

  const updatedRecipient = await Recipient.findOneAndUpdate(
    { _id: recipient._id, user: req.user.id },
    { profilePicture: picturePath },
    { new: true, runValidators: false }
  );
  if (recipient.profilePicture && recipient.profilePicture !== picturePath) {
    await removeUnreferencedUpload(recipient.profilePicture);
  }

  res.json({ 
    message: 'Profile picture uploaded successfully', 
    profilePicture: updatedRecipient.profilePicture 
  });
});

// Resolve tag names to the caller's own Tag ids, creating missing ones.
// Tags are per-user: another user's tag (or a legacy un-owned tag) with the
// same name is never linked, since its owner could rename or delete it.
async function processTags(tags, userId) {
  const tagPromises = tags.map(async (tagInput) => {
    let tagName;
    if (typeof tagInput === 'string') {
      tagName = tagInput.trim().toLowerCase();
    } else if (tagInput && typeof tagInput === 'object' && typeof tagInput.name === 'string') {
      tagName = tagInput.name.trim().toLowerCase();
    } else {
      return null;
    }

    if (!tagName) {
      return null;
    }

    const owned = { name: tagName, user: userId };
    let tag = await Tag.findOne(owned);
    if (!tag) {
      try {
        tag = await Tag.create(owned);
      } catch (err) {
        if (err && err.code === 11000) {
          // Lost a race with a concurrent create of the same name...
          tag = await Tag.findOne(owned);
          // ...or the database still has the pre-ownership global unique
          // index on name and a legacy un-owned tag holds the name. Legacy
          // tags are read-only for everyone, so linking it is safe.
          if (!tag) tag = await Tag.findOne({ name: tagName, user: null });
        }
        if (!tag) throw err;
      }
    }
    return tag._id;
  });

  const tagIds = await Promise.all(tagPromises);
  return tagIds.filter(id => id !== null);
}

// Export for testing
exports.processTags = processTags;
