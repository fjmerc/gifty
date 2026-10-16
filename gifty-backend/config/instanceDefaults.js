// What a new account starts with on this instance: the country of its
// holidays and the currency money is shown in before any budget exists.
// Read on each use, so tests (and a restart with new env) see changes.
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY'];
const FALLBACK = { country: 'US', currency: 'USD' };

// The countries the built-in holiday list covers. Required lazily: the
// list lives with the database seed data.
const holidayCountries = () => require('../utils/dbInitializer').HOLIDAY_COUNTRIES;

const normalise = (value) => (typeof value === 'string' ? value.trim().toUpperCase() : '');

const getInstanceDefaults = (env = process.env) => ({
  country: normalise(env.DEFAULT_COUNTRY) || FALLBACK.country,
  currency: normalise(env.DEFAULT_CURRENCY) || FALLBACK.currency
});

// Messages for settings this instance can't use (empty when all is well)
const validateInstanceDefaults = (env = process.env) => {
  const errors = [];
  const country = normalise(env.DEFAULT_COUNTRY);
  if (country && !holidayCountries().includes(country)) {
    errors.push(`DEFAULT_COUNTRY "${env.DEFAULT_COUNTRY}" has no holiday list; use one of: ${holidayCountries().join(', ')}`);
  }
  const currency = normalise(env.DEFAULT_CURRENCY);
  if (currency && !SUPPORTED_CURRENCIES.includes(currency)) {
    errors.push(`DEFAULT_CURRENCY "${env.DEFAULT_CURRENCY}" is not supported; use one of: ${SUPPORTED_CURRENCIES.join(', ')}`);
  }
  return errors;
};

module.exports = { SUPPORTED_CURRENCIES, FALLBACK_CURRENCY: FALLBACK.currency, getInstanceDefaults, validateInstanceDefaults };
