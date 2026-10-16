/**
 * Date resolution for holidays, including floating holidays that fall on a
 * different calendar date each year (e.g. Thanksgiving, Easter-relative days).
 *
 * Floating holidays are described by a formula string:
 *   - "nth-weekday:{month}:{weekday}:{n}"  e.g. "nth-weekday:11:4:4" = 4th Thursday of November
 *     month is 1-12, weekday is 0 (Sunday) - 6 (Saturday), n is 1-4 or -1 for "last"
 *   - "easter{+|-}{days}"  offset in days from Easter Sunday (Gregorian),
 *     e.g. "easter-2" = Good Friday, "easter+39" = Ascension, "easter+50" = Whit Monday
 */

// Anonymous Gregorian (Meeus/Jones/Butcher) algorithm
const logger = require('../utils/logger');
function computeEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} weekday 0 (Sunday) - 6 (Saturday)
 * @param {number} n 1-4 for nth occurrence, -1 for last occurrence
 */
function nthWeekdayOfMonth(year, month, weekday, n) {
  if (n === -1) {
    const lastDay = new Date(year, month, 0); // day 0 of next month = last day
    const diff = (lastDay.getDay() - weekday + 7) % 7;
    return new Date(year, month - 1, lastDay.getDate() - diff);
  }
  const firstDay = new Date(year, month - 1, 1);
  const offset = (weekday - firstDay.getDay() + 7) % 7;
  return new Date(year, month - 1, 1 + offset + (n - 1) * 7);
}

function resolveFormula(formula, year) {
  const easterMatch = formula.match(/^easter([+-]\d+)?$/);
  if (easterMatch) {
    const date = computeEaster(year);
    if (easterMatch[1]) {
      date.setDate(date.getDate() + parseInt(easterMatch[1], 10));
    }
    return date;
  }

  const nthMatch = formula.match(/^nth-weekday:(\d{1,2}):(\d):(-?\d)$/);
  if (nthMatch) {
    return nthWeekdayOfMonth(
      year,
      parseInt(nthMatch[1], 10),
      parseInt(nthMatch[2], 10),
      parseInt(nthMatch[3], 10)
    );
  }

  throw new Error(`Unrecognized holiday formula: ${formula}`);
}

/**
 * Resolve the calendar date of a holiday for a given year.
 * Fixed-date holidays use month/day; floating holidays use their formula.
 * Falls back to month/day if a formula is missing or malformed.
 * @param {Object} holiday - Holiday doc or seed object ({ month, day, hasFixedDate, formula })
 * @param {number} year
 * @returns {Date}
 */
function resolveHolidayDate(holiday, year) {
  if (holiday.hasFixedDate === false && holiday.formula) {
    try {
      return resolveFormula(holiday.formula, year);
    } catch (error) {
      logger.error(`[holidayDates] ${error.message} — falling back to month/day for "${holiday.name}"`);
    }
  }
  return new Date(year, holiday.month - 1, holiday.day);
}

module.exports = {
  computeEaster,
  nthWeekdayOfMonth,
  resolveHolidayDate
};
