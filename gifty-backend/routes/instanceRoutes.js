const express = require('express');
const { getVersion, getPublicUrl } = require('../config/runtime');
const { getFeatures } = require('../config/validateEnv');
const { isSetupRequired } = require('../services/setupCodeService');
const { getInstanceSettings } = require('../services/instanceSettings');

const router = express.Router();

// Public: the UI needs these before login. setupRequired: no account yet
// (the first one needs the setup code); setupComplete: the owner finished or
// skipped the wizard; signupMode: whether /register needs an invite;
// publicUrl: the address links are built from (GIFTY_URL), deliberately
// public: it is the address people open; defaults: what new accounts start with
router.get('/', async (req, res, next) => {
  try {
    const settings = await getInstanceSettings();
    res.json({
      version: getVersion(),
      features: getFeatures(),
      setupRequired: await isSetupRequired(),
      setupComplete: Boolean(settings.setupCompletedAt),
      signupMode: settings.signupMode,
      publicUrl: getPublicUrl(),
      defaults: { country: settings.defaultCountry, currency: settings.defaultCurrency }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
