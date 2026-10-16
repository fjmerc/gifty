const { formatMoney } = require('./money');

// The suggestion code reads a recipient's minimum/maximumPriceBudget. When the
// controller computed a price guide (what is left of the budget, in the
// year's currency) the AI request sees that instead. In memory only: the
// recipient document is never saved here.
const applyPriceGuide = (recipient, guide) => {
  if (!recipient || !guide) return recipient;
  recipient.minimumPriceBudget = guide.min ?? 0;
  recipient.maximumPriceBudget = guide.max ?? null;
  if (recipient.$locals) recipient.$locals.priceCurrency = guide.currency;
  return recipient;
};

// An amount for a prompt, in the guide's currency (USD without a guide)
const formatGuidePrice = (recipient, amount) =>
  formatMoney(amount, (recipient && recipient.$locals && recipient.$locals.priceCurrency) || 'USD');

module.exports = { applyPriceGuide, formatGuidePrice };
