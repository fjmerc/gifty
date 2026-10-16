import React from 'react';
import { render, screen } from '@testing-library/react';
import BudgetAnalytics from '../BudgetAnalytics';

jest.mock('chart.js', () => ({
  Chart: { register: () => {} },
  ArcElement: {},
  Tooltip: {},
  Legend: {}
}));
jest.mock('react-chartjs-2', () => ({
  Pie: ({ data }) => <div data-testid="pie">{data.labels.join('|')}</div>
}));

const baseAnalytics = {
  year: 2025,
  currency: 'USD',
  totalBudgets: 2,
  totalSpent: 330,
  monthlySpending: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 30, 300],
  budgetStatuses: { within: 2, warning: 1, over: 3, unlimited: 0, no_budget: 1 }
};

const overall = { exists: true, isLimited: true, amount: 1000, currency: 'USD', unallocated: 500 };

const recipientBudgets = [
  { _id: 'r1', firstName: 'Ann', lastName: 'Lee', limit: 300, budget: { exists: true, allocationType: 'percentage', percentageAllocation: 30 } },
  { _id: 'r2', firstName: 'Bo', lastName: 'Ng', limit: 200, budget: { exists: true, allocationType: 'fixed' } },
  { _id: 'r3', firstName: 'Cy', lastName: 'Ode', limit: null, budget: { exists: false } }
];

describe('BudgetAnalytics — server figures only', () => {
  test('counts Within, Warning and Over from the summary statuses', () => {
    render(<BudgetAnalytics analytics={baseAnalytics} recipientBudgets={recipientBudgets} overallBudget={overall} />);
    expect(screen.getByText('Within').parentElement).toHaveTextContent('Within2');
    expect(screen.getByText('Warning').parentElement).toHaveTextContent('Warning1');
    expect(screen.getByText('Over').parentElement).toHaveTextContent('Over3');
    expect(screen.queryByText('Normal')).not.toBeInTheDocument();
    expect(screen.queryByText('Critical')).not.toBeInTheDocument();
  });

  test('shows the server total spent in the overall currency', () => {
    render(<BudgetAnalytics analytics={{ ...baseAnalytics, currency: 'EUR' }} recipientBudgets={recipientBudgets} overallBudget={{ ...overall, currency: 'EUR' }} />);
    expect(screen.getByText('Spent:')).toBeInTheDocument();
    expect(screen.getByText('€330.00')).toBeInTheDocument();
  });

  test('pie shares come from server limits; recipients without a limit are left out', () => {
    render(<BudgetAnalytics analytics={baseAnalytics} recipientBudgets={recipientBudgets} overallBudget={overall} />);
    expect(screen.getByTestId('pie')).toHaveTextContent('Ann Lee (30.0%)|Bo Ng (20.0%)|Unallocated (50.0%)');
  });

  test('a user with zero purchases and no budgets renders zeros, not NaN', () => {
    const { container } = render(
      <BudgetAnalytics
        analytics={{
          year: 2025,
          currency: 'USD',
          totalBudgets: 0,
          totalSpent: 0,
          monthlySpending: Array(12).fill(0),
          budgetStatuses: { within: 0, warning: 0, over: 0, unlimited: 0, no_budget: 0 }
        }}
        recipientBudgets={[]}
        overallBudget={{ exists: false, isLimited: false, amount: null, currency: 'USD' }}
      />
    );
    expect(screen.getByText('$0.00')).toBeInTheDocument();
    expect(screen.getByText('Set a limited overall budget and recipient budgets to see the allocation.')).toBeInTheDocument();
    expect(screen.queryByTestId('pie')).not.toBeInTheDocument();
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].forEach((m) => {
      expect(screen.getByText(m)).toBeInTheDocument();
    });
    expect(container.textContent).not.toMatch(/NaN/);
  });
});
