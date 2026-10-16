import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Budgets from '../js/Budgets';
import axiosInstance from '../../axiosInstance';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>
}));
// A stable auth object: a new logout function on every render would re-run the page's fetch effects forever
const mockAuth = { isAuthenticated: true, logout: () => {} };
jest.mock('../../AuthContext', () => ({
  useAuth: () => mockAuth
}));
jest.mock('../../axiosInstance');
jest.mock('../../components/js/BudgetAnalytics', () => () => <div data-testid="budget-analytics" />);
jest.mock('../../components/forms/js/RecipientBudgetForm', () => ({ onSubmit, currency, error }) => (
  <div data-testid="recipient-budget-form">
    <span data-testid="form-currency">{currency}</span>
    {error && <p data-testid="form-error">{error}</p>}
    <button
      onClick={() => onSubmit({
        allocationType: 'percentage',
        percentageAllocation: 25,
        isLimited: true,
        giftStatus: 'active'
      })}
    >
      Submit budget form
    </button>
  </div>
));

const overallView = (overrides = {}) => ({
  exists: true,
  _id: 'o1',
  year: 2025,
  amount: 1000,
  isLimited: true,
  currency: 'USD',
  notes: '',
  allocated: 600,
  unallocated: 400,
  spent: 330,
  leftToSpend: 670,
  allocatedAmount: 600,
  totalAllocated: 600,
  remainingAmount: 400,
  totalSpent: 330,
  unspentAmount: 670,
  ...overrides
});

const fixedEntry = (overrides = {}) => ({
  _id: 'r1',
  firstName: 'Ann',
  lastName: 'Lee',
  giftStatus: 'active',
  spent: 40,
  left: 60,
  status: 'within',
  limit: 100,
  budget: {
    exists: true,
    _id: 'b1',
    year: 2025,
    type: 'fixed',
    allocationType: 'fixed',
    minimumAmount: 0,
    maximumAmount: 100,
    percentageAllocation: null,
    isLimited: true,
    notes: '',
    limit: 100,
    currency: 'USD'
  },
  ...overrides
});

const noBudgetEntry = {
  _id: 'r2',
  firstName: 'Bo',
  lastName: 'Ng',
  giftStatus: 'inactive',
  spent: 0,
  left: null,
  status: 'no_budget',
  limit: null,
  budget: {
    exists: false,
    year: 2025,
    type: null,
    allocationType: null,
    isLimited: false,
    limit: null,
    currency: 'USD'
  }
};

const analytics = {
  year: 2025,
  currency: 'USD',
  totalBudgets: 1,
  totalSpent: 330,
  monthlySpending: Array(12).fill(0),
  budgetStatuses: { within: 1, warning: 0, over: 0, unlimited: 0, no_budget: 0 }
};

const mockApi = (allData) => {
  axiosInstance.get.mockImplementation((url) => {
    // The current year is in the list, so the page loads once and does not switch years
    if (url === '/budgets/available-years') return Promise.resolve({ data: [new Date().getFullYear()] });
    if (url.startsWith('/budgets/all/')) return Promise.resolve({ data: allData });
    if (url.startsWith('/budgets/analytics/')) return Promise.resolve({ data: analytics });
    return Promise.resolve({ data: {} });
  });
  axiosInstance.put.mockResolvedValue({ data: {} });
  axiosInstance.post.mockResolvedValue({ data: {} });
};

const renderLoaded = async () => {
  const utils = render(<Budgets />);
  await screen.findByText('Budget Dashboard');
  return utils;
};

describe('Budgets page — money summary', () => {
  test('shows Budget, Allocated, Unallocated, Spent and Left to spend, and never "Remaining"', async () => {
    mockApi({ year: 2025, currency: 'USD', overallBudget: overallView(), recipientBudgets: [fixedEntry()], unbudgetedSpent: 0 });
    await renderLoaded();

    expect(screen.getAllByText('Budget:').length).toBeGreaterThan(0);
    expect(screen.getByText('Allocated:')).toBeInTheDocument();
    expect(screen.getByText('Unallocated:')).toBeInTheDocument();
    expect(screen.getAllByText('Spent:').length).toBeGreaterThan(0);
    expect(screen.getByText('Left to spend:')).toBeInTheDocument();
    expect(screen.queryByText(/remaining/i)).not.toBeInTheDocument();

    expect(screen.getByText('$1,000.00')).toBeInTheDocument();
    expect(screen.getByText('$600.00')).toBeInTheDocument();
    expect(screen.getByText('$400.00')).toBeInTheDocument();
    expect(screen.getByText('$330.00')).toBeInTheDocument();
    expect(screen.getByText('$670.00')).toBeInTheDocument();
    expect(screen.getByText('$40.00')).toBeInTheDocument();
    // The Left line reads "Left: $60.00", not "Left: $60.00 left"
    expect(screen.getByText('Left:').nextSibling).toHaveTextContent(/^\$60\.00$/);
    expect(screen.queryByText(/\$60\.00 left/)).not.toBeInTheDocument();
  });

  test('negative figures are shown unclamped', async () => {
    mockApi({
      year: 2025,
      currency: 'USD',
      overallBudget: overallView({ allocated: 1050, unallocated: -50, spent: 1020, leftToSpend: -20 }),
      recipientBudgets: [fixedEntry({ spent: 105, left: -5, status: 'over' })],
      unbudgetedSpent: 0
    });
    await renderLoaded();

    expect(screen.getByText('Over-allocated by $50.00')).toBeInTheDocument();
    expect(screen.getByText('Over by $20.00')).toBeInTheDocument();
    expect(screen.getByText('Over by $5.00')).toBeInTheDocument();
    const card = screen.getByText('Ann Lee').closest('div[class*="recipientBudgetCard"]');
    expect(card.className).toContain('critical');
  });

  test('no overall budget and no recipient budget render words, never $0.00 or NaN', async () => {
    mockApi({
      year: 2025,
      currency: 'USD',
      overallBudget: {
        exists: false, year: 2025, amount: null, isLimited: false, currency: 'USD', notes: '',
        allocated: 0, unallocated: null, spent: 0, leftToSpend: null,
        allocatedAmount: 0, totalAllocated: 0, remainingAmount: null, totalSpent: 0, unspentAmount: null
      },
      recipientBudgets: [noBudgetEntry],
      unbudgetedSpent: 0
    });
    const { container } = render(<Budgets />);
    await screen.findByText('No overall budget set for this year.');
    expect(screen.getByText('No budget')).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN/);
  });

  test('a percentage budget with no usable overall budget shows Unlimited', async () => {
    mockApi({
      year: 2025,
      currency: 'USD',
      overallBudget: {
        exists: false, year: 2025, amount: null, isLimited: false, currency: 'USD', notes: '',
        allocated: 0, unallocated: null, spent: 0, leftToSpend: null
      },
      recipientBudgets: [fixedEntry({
        spent: 0,
        left: null,
        status: 'unlimited',
        limit: null,
        budget: {
          exists: true, _id: 'b1', year: 2025, type: 'percentage', allocationType: 'percentage',
          percentageAllocation: 10, isLimited: true, notes: '', limit: null, currency: 'USD'
        }
      })],
      unbudgetedSpent: 0
    });
    await renderLoaded();

    expect(screen.getAllByText('Unlimited').length).toBeGreaterThan(0);
    expect(screen.getByText('10% of Overall Budget')).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  test('saving an existing recipient budget sends configuration only', async () => {
    mockApi({ year: 2025, currency: 'USD', overallBudget: overallView(), recipientBudgets: [fixedEntry()], unbudgetedSpent: 0 });
    await renderLoaded();

    fireEvent.click(screen.getByText('Edit Budget'));
    expect(screen.getByTestId('form-currency')).toHaveTextContent('USD');
    fireEvent.click(screen.getByText('Submit budget form'));

    await waitFor(() => {
      expect(axiosInstance.put).toHaveBeenCalledWith(
        expect.stringMatching(/^\/budgets\/recipient\/r1\/\d{4}$/),
        { allocationType: 'percentage', percentageAllocation: 25, isLimited: true }
      );
    });
    expect(axiosInstance.put).toHaveBeenCalledWith('/recipients/r1', { giftStatus: 'active' });
    expect(axiosInstance.post).not.toHaveBeenCalledWith('/budgets/recipient', expect.anything());
  });

  test('setting a budget for a recipient without one POSTs the configuration', async () => {
    mockApi({ year: 2025, currency: 'USD', overallBudget: overallView(), recipientBudgets: [noBudgetEntry], unbudgetedSpent: 0 });
    await renderLoaded();

    fireEvent.click(screen.getByText('Set Budget'));
    fireEvent.click(screen.getByText('Submit budget form'));

    await waitFor(() => {
      expect(axiosInstance.post).toHaveBeenCalledWith('/budgets/recipient', {
        allocationType: 'percentage',
        percentageAllocation: 25,
        isLimited: true,
        recipientId: 'r2',
        year: expect.any(Number)
      });
    });
  });

  test('without an overall budget, Set Budget is disabled with a hint instead of a dead end', async () => {
    mockApi({
      year: 2025,
      currency: 'USD',
      overallBudget: {
        exists: false, year: 2025, amount: null, isLimited: false, currency: 'USD', notes: '',
        allocated: 0, unallocated: null, spent: 0, leftToSpend: null
      },
      recipientBudgets: [noBudgetEntry],
      unbudgetedSpent: 0
    });
    render(<Budgets />);
    await screen.findByText('No overall budget set for this year.');

    expect(screen.getByRole('button', { name: 'Set Budget' })).toBeDisabled();
    expect(screen.getByText(`Set your overall budget for ${new Date().getFullYear()} first`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set Budget' }));
    expect(screen.queryByTestId('recipient-budget-form')).not.toBeInTheDocument();
  });

  test('a refused budget save shows the server message in the form and keeps the page', async () => {
    mockApi({ year: 2025, currency: 'USD', overallBudget: overallView(), recipientBudgets: [noBudgetEntry], unbudgetedSpent: 0 });
    axiosInstance.post.mockRejectedValue({ response: { status: 400, data: { message: 'Allocations exceed the overall budget' } } });
    await renderLoaded();

    fireEvent.click(screen.getByText('Set Budget'));
    fireEvent.click(screen.getByText('Submit budget form'));

    expect(await screen.findByTestId('form-error')).toHaveTextContent('Allocations exceed the overall budget');
    expect(screen.getByTestId('recipient-budget-form')).toBeInTheDocument();
    expect(screen.getByText('Budget Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Bo Ng')).toBeInTheDocument();
  });

  test('an unlimited fixed budget shows no Budget Range', async () => {
    mockApi({
      year: 2025,
      currency: 'USD',
      overallBudget: overallView(),
      recipientBudgets: [fixedEntry({
        left: null,
        status: 'unlimited',
        limit: null,
        budget: { ...fixedEntry().budget, isLimited: false, limit: null }
      })],
      unbudgetedSpent: 0
    });
    await renderLoaded();

    expect(screen.getAllByText('Unlimited').length).toBeGreaterThan(0);
    expect(screen.queryByText('Budget Range:')).not.toBeInTheDocument();
  });

  test('an archived recipient keeps their spending row, marked archived, with no budget button', async () => {
    mockApi({
      year: 2025,
      currency: 'USD',
      overallBudget: overallView(),
      recipientBudgets: [{ ...noBudgetEntry, _id: 'r3', firstName: 'Cal', lastName: 'Fox', spent: 25, archived: true }],
      unbudgetedSpent: 25
    });
    await renderLoaded();

    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.queryByText('inactive')).not.toBeInTheDocument();
    expect(screen.getByText('$25.00', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set Budget' })).not.toBeInTheDocument();
  });

  test('the year select is named and the recipient budget form is a named dialog', async () => {
    mockApi({ year: 2025, currency: 'USD', overallBudget: overallView(), recipientBudgets: [fixedEntry()], unbudgetedSpent: 0 });
    await renderLoaded();

    expect(screen.getByRole('combobox', { name: 'Year' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Edit Budget'));
    const dialog = screen.getByRole('dialog', { name: /^Customize Budget for / });
    expect(dialog).toContainElement(screen.getByTestId('recipient-budget-form'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
