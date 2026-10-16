// controllers/tagController.js
const mongoose = require('mongoose');
const Tag = require('../models/Tags');
const Recipient = require('../models/Recipient');
const User = require('../models/User');

// A user sees their own tags plus the legacy (un-owned) tags their own
// recipients reference. Un-owned tags were created by real users, so their
// names are never listed to everyone. (`user: null` also matches a missing field.)
const visibleTo = async (userId) => {
  const legacyIds = await Recipient.distinct('tags', { user: userId });
  return { $or: [{ user: userId }, { user: null, _id: { $in: legacyIds } }] };
};

// Only the owner may modify a tag; anything else is indistinguishable from
// a missing tag
const ownedBy = (id, userId) => ({ _id: id, user: userId });

const isDuplicateKey = (error) => error && error.code === 11000;

exports.getAllTags = async (req, res) => {
  try {
    const tags = await Tag.find(await visibleTo(req.user._id));
    res.json(tags);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.addTag = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Tag name is required' });
    }
    const existing = await Tag.findOne({ name, user: req.user._id });
    if (existing) {
      return res.json(existing);
    }
    const savedTag = await new Tag({ name, user: req.user._id }).save();
    res.json(savedTag);
  } catch (error) {
    if (isDuplicateKey(error)) {
      return res.status(409).json({ message: 'A tag with this name already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateTag = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Tag name is required for update' });
    }
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ message: 'Tag not found' });
    }
    const updatedTag = await Tag.findOneAndUpdate(
      ownedBy(id, req.user._id),
      { name },
      { new: true, runValidators: true }
    );
    if (!updatedTag) {
      return res.status(404).json({ message: 'Tag not found' });
    }
    res.json(updatedTag);
  } catch (error) {
    if (isDuplicateKey(error)) {
      return res.status(409).json({ message: 'A tag with this name already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteTag = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ message: 'Tag not found' });
    }
    const deleted = await Tag.findOneAndDelete(ownedBy(id, req.user._id));
    if (!deleted) {
      return res.status(404).json({ message: 'Tag not found' });
    }
    // Recipients carrying it would keep an id that points at nothing
    await Recipient.updateMany({ user: req.user._id, tags: deleted._id }, { $pull: { tags: deleted._id } });
    await User.updateOne({ _id: req.user._id }, { $pull: { tags: deleted._id } });
    res.json({ message: 'Tag deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
