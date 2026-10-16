import { budgetLeftLabel } from './money';

// This year's figures for a gift's recipient, straight from /budgets/all
export function getBudgetEntry(gift, recipientBudgets) {
  const id = gift?.recipient?._id;
  if (!id) return null;
  return (recipientBudgets || []).find(entry => entry._id === id) || null;
}

// The words to show for a gift's recipient budget, and which style family
// they belong to: 'none' | 'unlimited' | 'amount'
export function getBudgetDisplay(gift, recipientBudgets, currency) {
  const entry = getBudgetEntry(gift, recipientBudgets);
  const kind = !entry || entry.status === 'no_budget'
    ? 'none'
    : entry.status === 'unlimited' ? 'unlimited' : 'amount';
  return { label: budgetLeftLabel(entry, currency), kind };
}
