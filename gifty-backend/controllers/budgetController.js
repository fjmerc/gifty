const { OverallBudget, Budget } = require('../models/Budget');
const Recipient = require('../models/Recipient');
const { findOwned, pickFields } = require('../utils/ownership');
const moneyService = require('../services/moneyService');
const { toCents, fromCents } = require('../utils/money');

// Budget configuration the client may set. Money figures (spent, left,
// allocated, …) are computed by moneyService and never stored or accepted;
// user/recipient/year come from the session and the route. Recipient
// budgets show the overall budget's currency, so they no longer take one.
const RECIPIENT_BUDGET_FIELDS = [
  'allocationType',
  'minimumAmount',
  'maximumAmount',
  'percentageAllocation',
  'isLimited',
  'startDate',
  'endDate',
  'frequency',
  'category',
  'notes',
  'isActive'
];
const OVERALL_BUDGET_FIELDS = ['amount', 'isLimited', 'currency', 'notes'];
const EMPTY_STATUSES = { within: 0, warning: 0, over: 0, unlimited: 0, no_budget: 0 };

// HttpErrors (e.g. findOwned's 404) carry their own status and message
const sendError = (res, error, fallbackMessage) => {
  if (error.statusCode) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  if (error.name === 'ValidationError') {
    const message = Object.values(error.errors || {}).map((e) => e.message).join('; ');
    return res.status(400).json({ message: message || error.message });
  }
  if (error.code === 11000) {
    return res.status(400).json({ message: 'Budget already exists for this year. Use PUT to update.' });
  }
  return res.status(500).json({ message: fallbackMessage });
};

const parseYear = (value) => {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 && year <= 9999 ? year : null;
};
const badYear = (res) => res.status(400).json({ message: 'Year must be a four-digit number' });

const toBool = (value) => value === true || value === 'true';
const isAmount = (value) =>
  value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;

// Only ever touch the caller's own recipient
const markRecipientActive = (recipientId, userId) =>
  Recipient.updateOne({ _id: recipientId, user: userId }, { giftStatus: 'active' });

// Allocated in cents: the year's limited budgets, with `replace` standing in
// for that recipient's current budget, each limit taken against `overall`.
const allocatedCents = (budgets, overall, replace = null) => {
  const rows = replace
    ? [...budgets.filter((b) => String(b.recipient) !== String(replace.recipient)), replace]
    : budgets;
  return rows.reduce((sum, budget) => {
    const limit = moneyService.budgetLimitCents(budget, overall);
    return limit === null ? sum : sum + limit;
  }, 0);
};

const countStatuses = (entries) => entries.reduce(
  (counts, entry) => ({ ...counts, [entry.status]: counts[entry.status] + 1 }),
  { ...EMPTY_STATUSES }
);

const overallView = (summary, overall) => {
  const o = summary.overall;
  return {
    exists: o.exists,
    ...(overall && { _id: overall._id }),
    year: summary.year,
    amount: o.amount,
    isLimited: o.isLimited,
    currency: summary.currency,
    notes: (overall && overall.notes) || '',
    allocated: o.allocated,
    unallocated: o.unallocated,
    spent: o.spent,
    leftToSpend: o.leftToSpend,
    // Legacy names carrying the new (unclamped) values; removable once every
    // page reads the names above
    allocatedAmount: o.allocated,
    totalAllocated: o.allocated,
    remainingAmount: o.unallocated,
    totalSpent: o.spent,
    unspentAmount: o.leftToSpend
  };
};

const recipientBudgetView = (summary, entry, budget) => {
  const base = budget
    ? {
      exists: true,
      _id: budget._id,
      year: summary.year,
      type: entry.budget.type,
      allocationType: budget.allocationType || 'fixed',
      minimumAmount: budget.minimumAmount ?? 0,
      maximumAmount: budget.allocationType === 'percentage' ? null : (budget.maximumAmount ?? null),
      percentageAllocation: budget.allocationType === 'percentage' ? (budget.percentageAllocation ?? null) : null,
      isLimited: budget.isLimited !== false,
      isActive: budget.isActive !== false,
      notes: budget.notes || '',
      startDate: budget.startDate || null,
      endDate: budget.endDate || null,
      frequency: budget.frequency || 'yearly',
      category: budget.category || 'gifts',
      limit: entry.budget.limit
    }
    : { exists: false, year: summary.year, type: null, allocationType: null, isLimited: false, limit: null };
  return {
    ...base,
    currency: summary.currency,
    // Legacy names carrying the derived values
    spentAmount: entry.spent,
    remainingAmount: entry.left,
    budgetStatus: entry.status
  };
};

const recipientResponse = ({ summary, budgets }, recipientId) => {
  const id = String(recipientId);
  const entry = summary.recipients.find((r) => r.recipientId === id);
  const budget = budgets.find((b) => String(b.recipient) === id) || null;
  return { ...recipientBudgetView(summary, entry, budget), spent: entry.spent, left: entry.left, status: entry.status };
};

// POST (create) and PUT (update) of a recipient budget. Validates the
// configuration for its allocation type and runs the allocation guard with
// the same Limit formula the summary uses.
const saveRecipientBudget = async (req, res, { recipientId, year, isUpdate }) => {
  const userId = req.user._id;
  const recipient = await findOwned(Recipient, recipientId, userId, { label: 'Recipient' });
  if (recipient.isSystemAccount) {
    return res.status(400).json({ message: `Cannot ${isUpdate ? 'update' : 'create'} budgets for system accounts` });
  }

  const { overall, budgets } = await moneyService.loadYear(userId, year);
  const existing = budgets.find((b) => String(b.recipient) === String(recipient._id)) || null;
  if (isUpdate && !existing) {
    return res.status(404).json({ message: 'Budget not found' });
  }
  if (!isUpdate && existing) {
    return res.status(400).json({ message: 'Budget already exists for this recipient and year. Use PUT to update.' });
  }

  const fields = pickFields(req.body, RECIPIENT_BUDGET_FIELDS);
  const allocationType = fields.allocationType || (existing && existing.allocationType) || 'fixed';
  if (!['fixed', 'percentage'].includes(allocationType)) {
    return res.status(400).json({ message: 'allocationType must be fixed or percentage' });
  }
  // An omitted isLimited keeps the stored value (new budgets are limited), so
  // the allocation guard can't be skipped by leaving the field out
  const isLimited = fields.isLimited !== undefined
    ? toBool(fields.isLimited)
    : (existing ? existing.isLimited !== false : true);
  const config = { ...fields, allocationType, isLimited };
  // The view reports a missing startDate as null; echoing it back must not
  // clear the required field
  if (config.startDate === null || config.startDate === '') delete config.startDate;

  if (allocationType === 'fixed') {
    if (!isAmount(fields.minimumAmount) || !isAmount(fields.maximumAmount)) {
      return res.status(400).json({ message: 'minimumAmount and maximumAmount are required and must be numbers' });
    }
    if (toCents(fields.minimumAmount) > toCents(fields.maximumAmount)) {
      return res.status(400).json({ message: 'Minimum amount cannot be greater than maximum amount' });
    }
    config.minimumAmount = Number(fields.minimumAmount);
    config.maximumAmount = Number(fields.maximumAmount);
    config.percentageAllocation = undefined;
  } else {
    // An omitted percentage keeps the stored one, so a save that only edits
    // other fields (e.g. the recipient profile form) doesn't fail
    const rawPercentage = fields.percentageAllocation !== undefined
      ? fields.percentageAllocation
      : (existing && existing.allocationType === 'percentage' ? existing.percentageAllocation : undefined);
    const percentage = Number(rawPercentage);
    if (!isAmount(rawPercentage) || percentage <= 0 || percentage > 100) {
      return res.status(400).json({ message: 'percentageAllocation must be a number greater than 0 and at most 100' });
    }
    config.percentageAllocation = percentage;
    config.minimumAmount = isAmount(fields.minimumAmount) ? Number(fields.minimumAmount) : 0;
    // The limit is derived from the overall amount on read; never store one
    config.maximumAmount = undefined;
  }

  if (isLimited) {
    if (!overall) {
      return res.status(400).json({ message: 'Overall budget must be set first' });
    }
    const overallCents = moneyService.overallLimitCents(overall);
    if (overallCents !== null) {
      const candidate = {
        recipient: recipient._id,
        allocationType,
        isLimited,
        maximumAmount: config.maximumAmount,
        percentageAllocation: config.percentageAllocation
      };
      if (allocatedCents(budgets, overall, candidate) > overallCents) {
        const others = budgets.filter((b) => String(b.recipient) !== String(recipient._id));
        return res.status(400).json({
          message: 'Total allocated amount would exceed overall budget',
          availableAmount: fromCents(overallCents - allocatedCents(others, overall))
        });
      }
    }
  }

  const doc = existing
    ? await Budget.findOne({ _id: existing._id, user: userId })
    : new Budget({ user: userId, recipient: recipient._id, year });
  doc.set(config);
  await doc.save();

  if (toBool(fields.isActive)) {
    await markRecipientActive(recipient._id, userId);
  }

  const fresh = await moneyService.loadYear(userId, year);
  return res.status(isUpdate ? 200 : 201).json(recipientResponse(fresh, recipient._id));
};

// POST (create) and PUT (create-or-update) of the overall budget. The
// allocation guard measures every limit against the NEW amount.
const saveOverallBudget = async (req, res, { year, createOnly }) => {
  const userId = req.user._id;
  const { overall, budgets } = await moneyService.loadYear(userId, year);
  if (createOnly && overall) {
    return res.status(400).json({ message: 'Budget already exists for this year. Use PUT to update.' });
  }

  const fields = pickFields(req.body, OVERALL_BUDGET_FIELDS);
  const isLimited = fields.isLimited !== undefined
    ? toBool(fields.isLimited)
    : (overall ? overall.isLimited !== false : true);
  const amount = fields.amount !== undefined ? fields.amount : (overall ? overall.amount : undefined);
  if (isLimited && !isAmount(amount)) {
    return res.status(400).json({ message: 'Valid amount required for limited budget' });
  }
  if (fields.currency !== undefined && !/^[A-Z]{3}$/.test(String(fields.currency))) {
    return res.status(400).json({ message: 'currency must be a three-letter code such as USD' });
  }

  const config = { isLimited };
  if (isAmount(amount)) config.amount = Number(amount);
  if (fields.currency !== undefined) config.currency = String(fields.currency);
  if (fields.notes !== undefined) config.notes = String(fields.notes);

  if (isLimited) {
    const total = allocatedCents(budgets, { isLimited: true, amount: Number(amount) });
    if (total > toCents(amount)) {
      return res.status(400).json({
        message: 'Overall budget cannot be less than total allocated amount',
        totalAllocated: fromCents(total)
      });
    }
  }

  const doc = overall
    ? await OverallBudget.findOne({ _id: overall._id, user: userId })
    : new OverallBudget({ user: userId, year });
  doc.set(config);
  await doc.save();

  const fresh = await moneyService.loadYear(userId, year);
  return res.status(createOnly ? 201 : 200).json(overallView(fresh.summary, fresh.overall));
};

const budgetController = {
  getOverallBudget: async (req, res) => {
    try {
      const year = parseYear(req.params.year);
      if (year === null) return badYear(res);
      const { summary, overall } = await moneyService.loadYear(req.user._id, year);
      res.json(overallView(summary, overall));
    } catch (error) {
      sendError(res, error, 'Error fetching overall budget');
    }
  },

  // Create overall budget (POST)
  setOverallBudget: async (req, res) => {
    try {
      const year = parseYear(req.body.year);
      if (year === null) return badYear(res);
      await saveOverallBudget(req, res, { year, createOnly: true });
    } catch (error) {
      sendError(res, error, 'Error creating overall budget');
    }
  },

  // Create or update overall budget (PUT)
  updateOverallBudget: async (req, res) => {
    try {
      const year = parseYear(req.params.year);
      if (year === null) return badYear(res);
      await saveOverallBudget(req, res, { year, createOnly: false });
    } catch (error) {
      sendError(res, error, 'Error updating overall budget');
    }
  },

  getRecipientBudget: async (req, res) => {
    try {
      const year = parseYear(req.params.year);
      if (year === null) return badYear(res);
      const recipient = await findOwned(Recipient, req.params.recipientId, req.user._id, { label: 'Recipient' });
      // Prevent accessing budgets for system accounts
      if (recipient.isSystemAccount) {
        return res.status(400).json({ message: 'Cannot access budgets for system accounts' });
      }
      const loaded = await moneyService.loadYear(req.user._id, year);
      res.json(recipientResponse(loaded, recipient._id));
    } catch (error) {
      sendError(res, error, 'Error fetching recipient budget');
    }
  },

  // Create recipient budget (POST)
  setRecipientBudget: async (req, res) => {
    try {
      const year = parseYear(req.body.year);
      if (year === null) return badYear(res);
      await saveRecipientBudget(req, res, { recipientId: req.body.recipientId, year, isUpdate: false });
    } catch (error) {
      sendError(res, error, 'Error creating recipient budget');
    }
  },

  // Update recipient budget (PUT)
  updateRecipientBudget: async (req, res) => {
    try {
      const year = parseYear(req.params.year);
      if (year === null) return badYear(res);
      await saveRecipientBudget(req, res, { recipientId: req.params.recipientId, year, isUpdate: true });
    } catch (error) {
      sendError(res, error, 'Error updating recipient budget');
    }
  },

  // The year's summary: overall figures and one entry per recipient
  getAllBudgets: async (req, res) => {
    try {
      const year = parseYear(req.params.year);
      if (year === null) return badYear(res);
      const { summary, overall, budgets, recipients } = await moneyService.loadYear(req.user._id, year);
      const recipientBudgets = summary.recipients.map((entry) => {
        const recipient = recipients.find((r) => String(r._id) === entry.recipientId);
        const budget = budgets.find((b) => String(b.recipient) === entry.recipientId) || null;
        return {
          _id: entry.recipientId,
          firstName: recipient.firstName,
          lastName: recipient.lastName,
          giftStatus: recipient.giftStatus,
          archived: entry.archived,
          spent: entry.spent,
          left: entry.left,
          status: entry.status,
          limit: entry.budget.limit,
          budget: recipientBudgetView(summary, entry, budget)
        };
      });
      res.json({
        year,
        currency: summary.currency,
        overallBudget: overallView(summary, overall),
        recipientBudgets,
        unbudgetedSpent: summary.unbudgetedSpent,
        budgetStatuses: countStatuses(summary.recipients)
      });
    } catch (error) {
      sendError(res, error, 'Error fetching all budgets');
    }
  },

  // Get available years
  getAvailableYears: async (req, res) => {
    try {
      const years = await OverallBudget.distinct('year', { user: req.user._id });
      const currentYear = new Date().getFullYear();
      const nextYear = currentYear + 1;

      if (!years.includes(currentYear)) {
        years.push(currentYear);
      }
      if (!years.includes(nextYear)) {
        years.push(nextYear);
      }

      years.sort((a, b) => b - a); // Sort in descending order
      res.json(years);
    } catch (error) {
      sendError(res, error, 'Error fetching available years');
    }
  },

  // Analytics: one definition of Spent (purchases), monthly in TZ
  getBudgetAnalytics: async (req, res) => {
    try {
      const year = parseYear(req.params.year);
      if (year === null) return badYear(res);
      const [summary, monthlySpending] = await Promise.all([
        moneyService.getYearSummary(req.user._id, year),
        moneyService.getMonthlySpend(req.user._id, year)
      ]);
      res.json({
        year,
        currency: summary.currency,
        totalBudgets: summary.recipients.filter((r) => r.budget.exists).length,
        totalSpent: summary.overall.spent,
        monthlySpending,
        budgetStatuses: countStatuses(summary.recipients)
      });
    } catch (error) {
      sendError(res, error, 'Error fetching budget analytics');
    }
  }
};

module.exports = budgetController;
