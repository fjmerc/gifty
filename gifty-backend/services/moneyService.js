// The only code that computes money figures (spec: "The money service").
// Spent is derived from purchased gifts on every read. Budget and
// OverallBudget documents hold configuration only, and any legacy
// bookkeeping fields still stored on them are ignored.
const mongoose = require('mongoose');
const Gift = require('../models/Gift');
const Recipient = require('../models/Recipient');
const User = require('../models/User');
const { Budget, OverallBudget, UserPreferences } = require('../models/Budget');
const { toCents, fromCents } = require('../utils/money');
const { getTimeZone, yearInTimeZone } = require('../utils/dates');

const { FALLBACK_CURRENCY } = require('../config/instanceDefaults');
const DEFAULT_WARNING_PERCENT = 80;
const DAY_MS = 24 * 60 * 60 * 1000;

const asObjectId = (id) =>
  (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)));

// Prices are stored rounded to cents, so price × 100 is (within float noise)
// an integer; $round removes the noise before summing integer cents.
const CENTS_OF_PRICE = { $round: [{ $multiply: [{ $ifNull: ['$price', 0] }, 100] }, 0] };

// Purchases of userId whose purchaseDate falls in `year` in the instance time
// zone. The UTC window is two days wider than the year on each side, so the
// {user, status, purchaseDate} index narrows the scan for any UTC offset;
// the $year comparison makes the year boundary exact.
const purchasesInYear = (userId, year, extraMatch = {}) => {
  const timezone = getTimeZone();
  return [
    {
      $match: {
        user: asObjectId(userId),
        status: 'purchased',
        purchaseDate: {
          $gte: new Date(Date.UTC(year, 0, 1) - 2 * DAY_MS),
          $lt: new Date(Date.UTC(year + 1, 0, 1) + 2 * DAY_MS)
        },
        ...extraMatch
      }
    },
    {
      $addFields: {
        _year: { $year: { date: '$purchaseDate', timezone } },
        _month: { $month: { date: '$purchaseDate', timezone } },
        _cents: CENTS_OF_PRICE
      }
    },
    { $match: { _year: year } }
  ];
};

// A year without an overall budget shows the account's own currency (set
// at registration from DEFAULT_CURRENCY; accounts from before it: USD)
const yearCurrency = async (userId, overall) => {
  if (overall && overall.currency) return overall.currency;
  const user = await User.findById(userId).select('preferences.currency').lean();
  return (user && user.preferences && user.preferences.currency) || FALLBACK_CURRENCY;
};

const loadWarningPercent = async (userId) => {
  const prefs = await UserPreferences.findOne({ user: userId }).lean();
  const warning = prefs && prefs.alertThresholds && prefs.alertThresholds.warning;
  return Number.isFinite(warning) ? warning : DEFAULT_WARNING_PERCENT;
};

// The overall amount in cents when it is a usable limit, else null
const overallLimitCents = (overall) =>
  (overall && overall.isLimited !== false && Number.isFinite(overall.amount) ? toCents(overall.amount) : null);

// Limit of one recipient budget in cents, or null when it has none: unlimited,
// or a percentage of an overall budget that is missing or unlimited.
const budgetLimitCents = (budget, overall) => {
  if (!budget || budget.isLimited === false) return null;
  if (budget.allocationType === 'percentage') {
    const base = overallLimitCents(overall);
    const percentage = Number(budget.percentageAllocation);
    if (base === null || budget.percentageAllocation === null || !Number.isFinite(percentage)) return null;
    return Math.round((base * percentage) / 100);
  }
  return Number.isFinite(budget.maximumAmount) ? toCents(budget.maximumAmount) : null;
};

const statusFor = (hasBudget, limitCents, spentCents, warningPercent) => {
  if (!hasBudget) return 'no_budget';
  if (limitCents === null) return 'unlimited';
  if (spentCents > limitCents) return 'over';
  if (spentCents > 0 && spentCents * 100 >= limitCents * warningPercent) return 'warning';
  return 'within';
};

const fromNullableCents = (cents) => (cents === null ? null : fromCents(cents));

const loadYear = async (userId, year) => {
  const y = Number(year);
  const [overall, budgets, recipients, spentRows, warningPercent] = await Promise.all([
    OverallBudget.findOne({ user: userId, year: y }).lean(),
    Budget.find({ user: userId, year: y }).lean(),
    Recipient.find({ user: userId, isSystemAccount: { $ne: true } })
      .select('firstName lastName giftStatus archived')
      .sort({ firstName: 1, lastName: 1 })
      .lean(),
    Gift.aggregate([
      ...purchasesInYear(userId, y),
      { $group: { _id: '$recipient', cents: { $sum: '$_cents' } } }
    ]),
    loadWarningPercent(userId)
  ]);

  const spentByRecipient = new Map(spentRows.map((row) => [String(row._id), row.cents]));
  const budgetByRecipient = new Map(budgets.map((budget) => [String(budget.recipient), budget]));
  const totalSpentCents = spentRows.reduce((sum, row) => sum + row.cents, 0);
  const unbudgetedCents = spentRows
    .filter((row) => !budgetByRecipient.has(String(row._id)))
    .reduce((sum, row) => sum + row.cents, 0);
  // Archived recipients keep a row only in years with spending or a budget,
  // so the rows still add up to the year's total
  const shown = recipients.filter((recipient) => !recipient.archived
    || spentByRecipient.has(String(recipient._id)) || budgetByRecipient.has(String(recipient._id)));
  const allocatedCents = budgets.reduce((sum, budget) => {
    const limit = budgetLimitCents(budget, overall);
    return limit === null ? sum : sum + limit;
  }, 0);
  const overallCents = overallLimitCents(overall);

  const summary = {
    year: y,
    currency: await yearCurrency(userId, overall),
    overall: {
      exists: Boolean(overall),
      amount: fromNullableCents(overallCents),
      isLimited: Boolean(overall) && overall.isLimited !== false,
      allocated: fromCents(allocatedCents),
      unallocated: overallCents === null ? null : fromCents(overallCents - allocatedCents),
      spent: fromCents(totalSpentCents),
      leftToSpend: overallCents === null ? null : fromCents(overallCents - totalSpentCents)
    },
    recipients: shown.map((recipient) => {
      const id = String(recipient._id);
      const budget = budgetByRecipient.get(id);
      const limitCents = budgetLimitCents(budget, overall);
      const spentCents = spentByRecipient.get(id) || 0;
      return {
        recipientId: id,
        name: [recipient.firstName, recipient.lastName].filter(Boolean).join(' '),
        archived: Boolean(recipient.archived),
        budget: budget
          ? {
            exists: true,
            type: budget.allocationType || 'fixed',
            limit: fromNullableCents(limitCents),
            isLimited: budget.isLimited !== false,
            percentage: budget.allocationType === 'percentage' && budget.percentageAllocation != null
              ? Number(budget.percentageAllocation)
              : null
          }
          : { exists: false, type: null, limit: null, isLimited: false, percentage: null },
        spent: fromCents(spentCents),
        left: limitCents === null ? null : fromCents(limitCents - spentCents),
        status: statusFor(Boolean(budget), limitCents, spentCents, warningPercent)
      };
    }),
    unbudgetedSpent: fromCents(unbudgetedCents)
  };

  return { summary, overall, budgets, recipients };
};

const getYearSummary = async (userId, year) => (await loadYear(userId, year)).summary;

const getMonthlySpend = async (userId, year) => {
  const rows = await Gift.aggregate([
    ...purchasesInYear(userId, Number(year)),
    { $group: { _id: '$_month', cents: { $sum: '$_cents' } } }
  ]);
  const months = Array(12).fill(0);
  rows.forEach((row) => { months[row._id - 1] = row.cents; });
  return months.map(fromCents);
};

const getRecipientSpend = async (userId, recipientId, { year } = {}) => {
  const recipient = asObjectId(recipientId);
  const pipeline = year !== undefined && year !== null
    ? purchasesInYear(userId, Number(year), { recipient })
    : [
      {
        $match: {
          user: asObjectId(userId), recipient, status: 'purchased', purchaseDate: { $type: 'date' }
        }
      },
      {
        $addFields: {
          _year: { $year: { date: '$purchaseDate', timezone: getTimeZone() } },
          _cents: CENTS_OF_PRICE
        }
      }
    ];
  const rows = await Gift.aggregate([
    ...pipeline,
    { $group: { _id: '$_year', cents: { $sum: '$_cents' } } },
    { $sort: { _id: 1 } }
  ]);
  const byYear = {};
  let totalCents = 0;
  rows.forEach((row) => {
    byYear[row._id] = fromCents(row.cents);
    totalCents += row.cents;
  });
  return { total: fromCents(totalCents), byYear };
};

// Warning figures for buying a gift. `left` counts the gift (and excludes any
// purchase of the same gift already counted, so a re-priced purchase is
// counted once).
const checkPurchase = async (userId, target) => {
  let recipientId;
  let priceCents;
  let when;
  let excludeId = null;

  if (target && typeof target === 'object' && 'recipientId' in target) {
    recipientId = target.recipientId;
    priceCents = toCents(target.price);
    when = target.date ? new Date(target.date) : new Date();
  } else {
    if (!mongoose.isValidObjectId(target)) return null;
    const gift = await Gift.findOne({ _id: target, user: userId }).lean();
    if (!gift) return null;
    recipientId = gift.recipient;
    priceCents = toCents(gift.price);
    when = gift.status === 'purchased' && gift.purchaseDate ? gift.purchaseDate : new Date();
    excludeId = gift._id;
  }
  if (Number.isNaN(priceCents)) priceCents = 0;

  const year = yearInTimeZone(when);
  const recipient = asObjectId(recipientId);
  const extraMatch = excludeId ? { recipient, _id: { $ne: excludeId } } : { recipient };
  const [overall, budget, warningPercent, rows] = await Promise.all([
    OverallBudget.findOne({ user: userId, year }).lean(),
    Budget.findOne({ user: userId, recipient, year }).lean(),
    loadWarningPercent(userId),
    Gift.aggregate([
      ...purchasesInYear(userId, year, extraMatch),
      { $group: { _id: null, cents: { $sum: '$_cents' } } }
    ])
  ]);

  const spentCents = (rows[0] ? rows[0].cents : 0) + priceCents;
  const limitCents = budgetLimitCents(budget, overall);
  const leftCents = limitCents === null ? null : limitCents - spentCents;
  return {
    status: statusFor(Boolean(budget), limitCents, spentCents, warningPercent),
    left: fromNullableCents(leftCents),
    wouldExceedBy: leftCents !== null && leftCents < 0 ? fromCents(-leftCents) : 0,
    currency: await yearCurrency(userId, overall)
  };
};

/**
 * The price range AI suggestions for a recipient must fit, in the year's
 * currency: what is left of the recipient's limited budget for that year,
 * otherwise the recipient's own per-gift range (max null = no limit).
 * A budget already used up falls back the same way rather than asking for
 * gifts costing nothing; buying over budget is warned about at purchase.
 */
const getSuggestionPriceGuide = async (userId, recipient, year) => {
  const summary = await getYearSummary(userId, year);
  const row = summary.recipients.find((entry) => entry.recipientId === String(recipient._id));
  const left = row && row.budget.isLimited && row.left !== null && row.left > 0 ? row.left : null;
  const ownMax = recipient.maximumPriceBudget > 0 ? recipient.maximumPriceBudget : null;
  const max = left !== null ? left : ownMax;
  const ownMin = recipient.minimumPriceBudget > 0 ? recipient.minimumPriceBudget : 0;
  return { min: max !== null ? Math.min(ownMin, max) : ownMin, max, currency: summary.currency };
};

module.exports = {
  getYearSummary,
  getSuggestionPriceGuide,
  getMonthlySpend,
  getRecipientSpend,
  checkPurchase,
  loadYear,
  budgetLimitCents,
  overallLimitCents
};
