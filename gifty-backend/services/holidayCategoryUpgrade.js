// One-time upgrade (2026-10): German public holidays that were filed as
// "religious" (off by default) are "national" now. German accounts with
// holidays switched on get the events they were missing, once: a marker in
// the migrations collection keeps a holiday the user deletes afterwards
// from coming back on the next start.
const mongoose = require('mongoose');
const User = require('../models/User');
const { generateHolidayEvents } = require('./holidayService');
const logger = require('../utils/logger');

const MIGRATION_ID = 'de-public-holidays-2026-10';
const MOVED = ['Karfreitag', 'Ostermontag', 'Christi Himmelfahrt', 'Pfingstmontag', 'Weihnachten', 'Zweiter Weihnachtsfeiertag'];

const addGermanPublicHolidays = async ({ now = new Date() } = {}) => {
  const markers = mongoose.connection.db.collection('migrations');
  if (await markers.findOne({ _id: MIGRATION_ID })) return { skipped: true };

  const users = await User.find({
    'preferences.holidaySettings.enabled': { $ne: false },
    'preferences.holidaySettings.countryCode': 'DE'
  }, { _id: 1 }).lean();
  let usersUpdated = 0;
  let created = 0;
  for (const { _id } of users) {
    const result = await generateHolidayEvents(_id, { now, only: MOVED });
    if (result.success && result.created > 0) {
      usersUpdated += 1;
      created += result.created;
    }
  }
  await markers.updateOne(
    { _id: MIGRATION_ID },
    { $set: { status: 'done', completedAt: new Date(), usersUpdated, created } },
    { upsert: true }
  );
  if (created) logger.info(`German public holidays: ${created} events added for ${usersUpdated} accounts`);
  return { skipped: false, usersUpdated, created };
};

module.exports = { addGermanPublicHolidays, MIGRATION_ID };
