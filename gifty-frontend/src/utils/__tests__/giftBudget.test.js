import { getBudgetEntry, getBudgetDisplay } from '../giftBudget';

const rbs = [
  { _id: 'r1', status: 'within', left: 60 },
  { _id: 'r2', status: 'over', left: -30 },
  { _id: 'r3', status: 'unlimited', left: null },
  { _id: 'r4', status: 'no_budget', left: null }
];
const g = (id) => ({ recipient: { _id: id } });

describe('giftBudget helper', () => {
  test('finds the recipient entry, or null', () => {
    expect(getBudgetEntry(g('r1'), rbs)).toBe(rbs[0]);
    expect(getBudgetEntry(g('zz'), rbs)).toBeNull();
    expect(getBudgetEntry({}, rbs)).toBeNull();
    expect(getBudgetEntry(g('r1'), undefined)).toBeNull();
  });

  test('labels and kinds', () => {
    expect(getBudgetDisplay(g('r1'), rbs, 'USD')).toEqual({ label: '$60.00 left', kind: 'amount' });
    expect(getBudgetDisplay(g('r2'), rbs, 'USD')).toEqual({ label: 'Over by $30.00', kind: 'amount' });
    expect(getBudgetDisplay(g('r3'), rbs, 'USD')).toEqual({ label: 'Unlimited', kind: 'unlimited' });
    expect(getBudgetDisplay(g('r4'), rbs, 'USD')).toEqual({ label: 'No budget', kind: 'none' });
    expect(getBudgetDisplay(g('zz'), rbs, 'USD')).toEqual({ label: 'No budget', kind: 'none' });
  });
});
