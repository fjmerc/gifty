// Tests that register more than one account without invites: let anyone sign up
const { settingsCollection, SETTINGS_ID } = require('../../services/instanceSettings');

const openSignup = () => settingsCollection().updateOne({ _id: SETTINGS_ID }, { $set: { signupMode: 'open' } }, { upsert: true });

module.exports = { openSignup };
