#!/usr/bin/env node
// Prints a one-time password reset link for any account, the owner's too,
// for when nobody who could make one can sign in:
//   docker compose exec gifty node scripts/reset-link.js <email>
// The link is valid 24 hours and replaces earlier ones for that account.
require('dotenv').config();
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const { normalizeEmail } = require('validator');
const { createResetLink, linkFor, RESET_HOURS } = require('../services/instanceTokens');

const main = async (argv, { log = console.log, fail = console.error } = {}) => {
  const email = String(argv[0] || '').trim().toLowerCase();
  if (!email) { fail('Usage: node scripts/reset-link.js <email>'); return 1; }
  await connectDB();
  try {
    // Accounts are stored as registration normalised them (gmail drops dots
    // and +tags); older accounts may not be, so try both
    const normalised = normalizeEmail(email) || email;
    const user = await User.findOne({ email: { $in: [normalised, email] } }).select('_id active').lean();
    if (!user) { fail(`No account with the email ${email}.`); return 1; }
    if (user.active === false) { fail('That account is deactivated. Reactivate it on the Admin page first.'); return 1; }
    const { token } = await createResetLink({ userId: user._id, createdBy: null });
    log(`Reset link for ${email} (valid ${RESET_HOURS} hours): ${linkFor('reset', token)}`);
    return 0;
  } finally {
    await disconnectDB();
  }
};

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => { console.error(error.message); process.exit(1); });
}

module.exports = { main };
