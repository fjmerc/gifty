/**
 * Helpers for building AI prompts that only mention what is known: a field
 * that is empty, unset or an empty list is left out, never printed as
 * "undefined" or "Not specified" (which invites the model to make it up).
 */

// A value worth printing: a non-empty string/number, or a list with entries
const present = (value) => {
  if (Array.isArray(value)) return value.some((item) => present(item));
  if (value === null || value === undefined) return false;
  return String(value).trim().length > 0;
};

// One line of user text: newlines and runs of spaces become one space, so a
// stored value can never start a new prompt line or section
const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const asText = (value) => (Array.isArray(value) ? value.filter(present).map(oneLine).join(', ') : oneLine(value));

/**
 * Lines "Label: value" for the fields that are present.
 * @param {Array<[String, *]>} fields - [label, value] pairs
 * @param {String} indent - prefix for each line
 */
const fieldLines = (fields, indent = '') => fields
  .filter(([, value]) => present(value))
  .map(([label, value]) => `${indent}${label}: ${asText(value)}`)
  .join('\n');

// Country name from an ISO code ("DE" -> "Germany"); the code when unknown
const countryName = (code) => {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(String(code).toUpperCase()) || code;
  } catch {
    return code;
  }
};

/**
 * Where the giver shops: the household's country and currency, so shops and
 * prices fit (EUR users were sent to US-only stores).
 */
const localeLine = ({ country, currency } = {}) => {
  const name = countryName(country);
  if (!name && !currency) return '';
  const where = name ? `I live in ${name}` : 'I';
  const money = currency ? `${name ? ' and ' : ' '}pay in ${currency}` : '';
  const shops = name
    ? ` Suggest shops that sell in ${name} (local stores or online shops that deliver there), not shops that only serve other countries.`
    : '';
  return `${where}${money}.${shops}`;
};

module.exports = { present, oneLine, fieldLines, countryName, localeLine };
