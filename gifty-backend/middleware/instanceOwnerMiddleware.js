const User = require('../models/User');

// Interim guard until 1b adds roles: instance-wide operations (backup,
// restore, discovery) are limited to the first account created on the
// instance — the same account 1b will promote to admin.
const isInstanceOwner = async (userId) => {
  // _id order, not createdAt: ObjectIds are server-generated and immutable,
  // while createdAt is missing on legacy users (which would sort first)
  const owner = await User.findOne({}, { _id: 1 }).sort({ _id: 1 }).lean();
  return Boolean(owner) && String(owner._id) === String(userId);
};

const requireInstanceOwner = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }
  try {
    if (!(await isInstanceOwner(req.user._id))) {
      return res.status(403).json({
        message: 'Only the instance owner (the first account created) can do this.',
        code: 'OWNER_ONLY'
      });
    }
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = { requireInstanceOwner, isInstanceOwner };
