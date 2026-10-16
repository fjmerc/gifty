// Allowlist of preference keys clients may set (and a restored backup may
// bring back). Anything outside this list is dropped silently rather than
// persisted to the user document, which prevents typos and crafted requests
// from polluting the schema.
const ALLOWED_PREFERENCE_KEYS = new Set([
  'theme',
  'timezone',
  'allowRetroactiveNotifications',
  'suggestionMode',
  'aiProvider',
  'aiModel',
  'notificationSettings',
  'holidaySettings',
  'notifications',
  'currency',
]);

// The AI suggestion modes a user can choose on /gifts (saved as suggestionMode)
const SUGGESTION_MODES = ['basic', 'enhanced', 'web', 'hybrid'];

// Holiday categories a user can choose from
const HOLIDAY_CATEGORIES = ['national', 'religious', 'cultural', 'international'];

module.exports = { ALLOWED_PREFERENCE_KEYS, HOLIDAY_CATEGORIES, SUGGESTION_MODES };
