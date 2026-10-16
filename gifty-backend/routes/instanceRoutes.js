const express = require('express');
const { getVersion } = require('../config/runtime');
const { getFeatures } = require('../config/validateEnv');
const { isSetupRequired } = require('../services/setupCodeService');
const { getInstanceDefaults } = require('../config/instanceDefaults');

const router = express.Router();

// Public: the UI needs these flags before login. setupRequired: no account
// exists yet, so registration asks for the first-run setup code. defaults:
// the holiday country and currency new accounts start with.
router.get('/', async (req, res, next) => {
  try {
    res.json({
      version: getVersion(),
      features: getFeatures(),
      setupRequired: await isSetupRequired(),
      defaults: getInstanceDefaults()
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
