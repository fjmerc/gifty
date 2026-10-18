// The instance's own settings on the Admin page and in the setup wizard (1b):
// sign-up mode and the defaults new accounts start with, plus what the
// server detected from .env (read-only here; secrets stay in .env).
const asyncHandler = require('express-async-handler');
const instanceSettings = require('../services/instanceSettings');
const { SUPPORTED_CURRENCIES } = require('../config/instanceDefaults');
const { getFeatures } = require('../config/validateEnv');
const { getPublicUrl } = require('../config/runtime');
const { recordAudit } = require('../services/auditLog');

const countries = () => require('../utils/dbInitializer').HOLIDAY_COUNTRIES;
const EDITABLE = ['signupMode', 'defaultCountry', 'defaultCurrency'];

const view = (s) => ({
  signupMode: s.signupMode,
  defaultCountry: s.defaultCountry,
  defaultCurrency: s.defaultCurrency,
  setupCompletedAt: s.setupCompletedAt,
  publicUrl: getPublicUrl(),
  choices: { countries: countries(), currencies: SUPPORTED_CURRENCIES },
  status: {
    features: getFeatures(),
    timeZone: process.env.TZ || 'UTC',
    backups: { time: '02:30', keep: parseInt(process.env.BACKUP_KEEP ?? '7', 10) }
  }
});

// @route GET /api/admin/settings (admin)
exports.getSettings = asyncHandler(async (req, res) => {
  res.json(view(await instanceSettings.getInstanceSettings()));
});

// @route PATCH /api/admin/settings (admin)
exports.updateSettings = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const unknown = Object.keys(body).filter((k) => !EDITABLE.includes(k));
  if (unknown.length) return res.status(400).json({ message: `These can't be changed here: ${unknown.join(', ')}` });
  if ('signupMode' in body && !instanceSettings.SIGNUP_MODES.includes(body.signupMode)) {
    return res.status(400).json({ message: 'Sign-up must be invite-only or open' });
  }
  if ('defaultCountry' in body && !countries().includes(body.defaultCountry)) {
    return res.status(400).json({ message: `Holidays are not available for that country. Choose one of: ${countries().join(', ')}` });
  }
  if ('defaultCurrency' in body && !SUPPORTED_CURRENCIES.includes(body.defaultCurrency)) {
    return res.status(400).json({ message: `Choose one of: ${SUPPORTED_CURRENCIES.join(', ')}` });
  }
  const before = await instanceSettings.getInstanceSettings();
  const after = await instanceSettings.updateInstanceSettings(Object.fromEntries(EDITABLE.filter((k) => k in body).map((k) => [k, body[k]])));
  if (before.signupMode !== after.signupMode) {
    await recordAudit('signup-mode.changed', { actor: req.user._id, details: { from: before.signupMode, to: after.signupMode } });
  }
  return res.json(view(after));
});

// @route POST /api/admin/setup-complete (owner): the wizard was finished or skipped
exports.completeSetup = asyncHandler(async (req, res) => {
  await instanceSettings.settingsCollection().updateOne(
    { _id: instanceSettings.SETTINGS_ID, setupCompletedAt: null },
    { $set: { setupCompletedAt: new Date() } }
  );
  res.json({ setupCompletedAt: (await instanceSettings.getInstanceSettings()).setupCompletedAt });
});
