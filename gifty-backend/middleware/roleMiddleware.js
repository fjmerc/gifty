const { isOwner } = require('../services/instanceSettings');

// Instance-wide tools (backups, restore, discovery, admin pages). `protect`
// runs first and loads req.user fresh on every request.
async function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Not authorized' });
  if (req.user.role === 'admin') return next();
  return res.status(403).json({ message: 'Only an admin of this Gifty can do this.', code: 'ADMIN_ONLY' });
}

// Owner-only actions (roles of admins, handing over ownership)
async function requireOwner(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Not authorized' });
  try {
    if (await isOwner(req.user._id)) return next();
    return res.status(403).json({ message: 'Only the owner of this Gifty can do this.', code: 'OWNER_ONLY' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireAdmin, requireOwner };
