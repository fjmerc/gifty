import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UserHome from '../js/UserHome';
import axiosInstance from '../../axiosInstance';

// Charts render as a div carrying what the component computed
jest.mock('react-chartjs-2', () => {
  const chart = (testId) => ({ data, options, ...rest }) => (
    <div data-testid={testId} data-chart-data={JSON.stringify(data)} data-chart-options={JSON.stringify(options)} {...rest} />
  );
  return { Line: chart('line-chart'), Bar: chart('bar-chart'), Pie: chart('pie-chart') };
});

jest.mock('../../axiosInstance');
// The signed-in user comes from AuthContext, which already fetched the profile
const mockAuthUser = { firstName: 'Ann', lastName: 'Lee' };
jest.mock('../../AuthContext', () => ({ useAuth: () => ({ user: mockAuthUser, isAuthenticated: true }) }));
const THIS_YEAR = new Date().getFullYear();

const noOverall = {
  exists: false, year: THIS_YEAR, amount: null, isLimited: false, currency: 'USD', notes: '',
  allocated: 0, unallocated: null, spent: 0, leftToSpend: null
};

const overall = (overrides = {}) => ({
  exists: true, _id: 'o1', year: THIS_YEAR, amount: 1000, isLimited: true, currency: 'USD', notes: '',
  allocated: 600, unallocated: 400, spent: 330, leftToSpend: 670,
  ...overrides
});

const zeroAnalytics = {
  year: THIS_YEAR,
  currency: 'USD',
  totalBudgets: 0,
  totalSpent: 0,
  monthlySpending: Array(12).fill(0),
  budgetStatuses: { within: 0, warning: 0, over: 0, unlimited: 0, no_budget: 0 }
};

const mockApi = ({ overallView = noOverall, events = [], gifts = [] } = {}) => {
  axiosInstance.get.mockImplementation((url) => {
    if (url === '/users/profile') return Promise.resolve({ data: { firstName: 'Ann', lastName: 'Lee' } });
    if (url === '/events') return Promise.resolve({ data: events });
    if (url.startsWith('/budgets/overall/')) return Promise.resolve({ data: overallView });
    if (url.startsWith('/budgets/analytics/')) return Promise.resolve({ data: zeroAnalytics });
    if (url === '/recipients') return Promise.resolve({ data: [] });
    if (url === '/gifts') {
      return Promise.resolve({ data: { gifts, pagination: { total: gifts.length, page: 1, limit: 1000, totalPages: 1 } } });
    }
    return Promise.resolve({ data: {} });
  });
  axiosInstance.post.mockResolvedValue({ data: {} });
  axiosInstance.put.mockResolvedValue({ data: {} });
};

// A row of the budget card's Spent / Left list
const budgetRow = (term) => screen.getAllByRole('term').find((dt) => dt.textContent === term).parentElement;

const renderHome = () => render(<MemoryRouter><UserHome /></MemoryRouter>);

describe('Home — profile', () => {
  test('greets the signed-in user from AuthContext without fetching the profile again', async () => {
    mockApi();
    renderHome();

    expect(await screen.findByText('Welcome back, Ann!')).toBeInTheDocument();
    await screen.findByText(`No budget set for ${THIS_YEAR}`);
    expect(axiosInstance.get).not.toHaveBeenCalledWith('/users/profile');
  });
});

describe('Home — money summary', () => {
  test('does not claim "No budget set" while the budget is still loading', async () => {
    mockApi();
    const base = axiosInstance.get.getMockImplementation();
    axiosInstance.get.mockImplementation((url) => (
      url.startsWith('/budgets/overall/') ? new Promise(() => {}) : base(url)
    ));
    renderHome();

    expect(await screen.findByText('Welcome back, Ann!')).toBeInTheDocument();
    expect(screen.getByText('Yearly Budget')).toBeInTheDocument();
    expect(screen.queryByText(/no budget set/i)).not.toBeInTheDocument();
  });

  test('a user with zero purchases and no overall budget sees "No budget set", never NaN or "Remaining"', async () => {
    mockApi();
    const { container } = renderHome();

    expect(await screen.findByText(`No budget set for ${THIS_YEAR}`)).toBeInTheDocument();
    expect(screen.getByTitle('Set Budget')).toBeInTheDocument();
    expect(screen.queryByText(/remaining/i)).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN/);
  });

  test('shows Budget, Spent and Left to spend from the server', async () => {
    mockApi({ overallView: overall() });
    renderHome();

    // Label above a one-line amount, then compact Spent / Left rows (a <dl>)
    const amount = await screen.findByText('$1,000.00');
    expect(amount.previousElementSibling).toHaveTextContent('Yearly Budget');
    expect(budgetRow('Spent')).toHaveTextContent(/^Spent\$330\.00$/);
    expect(budgetRow('Left')).toHaveTextContent(/^Left\$670\.00$/);
    expect(screen.getByRole('link', { name: /yearly budget/i })).toHaveTextContent('Yearly Budget$1,000.00Spent$330.00Left$670.00');
    expect(screen.getByTitle('Update Budget')).toBeInTheDocument();
  });

  test('overspending is shown, not clamped to $0.00', async () => {
    mockApi({ overallView: overall({ spent: 1020, leftToSpend: -20 }) });
    renderHome();

    expect(await screen.findByText('Over by $20.00')).toBeInTheDocument();
    expect(budgetRow('Left')).toHaveTextContent(/^LeftOver by \$20\.00$/);
  });

  test('an unlimited overall budget says so instead of showing an amount', async () => {
    mockApi({ overallView: overall({ isLimited: false, amount: null, unallocated: null, leftToSpend: null }) });
    renderHome();

    expect((await screen.findByText('Unlimited')).previousElementSibling).toHaveTextContent('Yearly Budget');
    expect(budgetRow('Spent')).toHaveTextContent(/^Spent\$330\.00$/);
    expect(screen.getAllByRole('term').map((dt) => dt.textContent)).toEqual(['Spent']);
  });

  test('event dates show the stored calendar day', async () => {
    mockApi({ events: [{ _id: 'e1', name: 'Party', date: `${THIS_YEAR + 1}-01-15T00:00:00.000Z`, type: 'other' }] });
    renderHome();

    expect(await screen.findByText('Party')).toBeInTheDocument();
    expect(screen.getByText(new Date(THIS_YEAR + 1, 0, 15).toLocaleDateString())).toBeInTheDocument();
  });

  test('upcoming events show whole rows (at most four) and a link to all events', async () => {
    const events = Array.from({ length: 6 }, (_, i) => ({
      _id: `e${i}`, name: `Event ${i}`, date: `${THIS_YEAR + 1}-0${i + 1}-15T00:00:00.000Z`, type: 'other',
    }));
    mockApi({ events });
    renderHome();

    expect(await screen.findByText('Event 3')).toBeInTheDocument();
    expect(screen.queryByText('Event 4')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all events' })).toHaveAttribute('href', '/events');
  });

  test('recent purchases use the shared money formatter', async () => {
    const purchaseDate = new Date(THIS_YEAR, 2, 10, 15, 0).toISOString();
    mockApi({
      gifts: [{
        _id: 'g1', name: 'Book', price: 12.5, status: 'purchased', purchaseDate,
        recipient: { _id: 'r1', firstName: 'Ann', lastName: 'Lee' }
      }]
    });
    renderHome();

    expect(await screen.findByText('$12.50')).toBeInTheDocument();
  });

  test('a refused overall budget save shows the server message and keeps the form open', async () => {
    mockApi({ overallView: overall() });
    axiosInstance.put.mockRejectedValue({ response: { status: 400, data: { message: 'Overall budget cannot be less than total allocated ($600.00)' } } });
    renderHome();

    fireEvent.click(await screen.findByTitle('Update Budget'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Budget' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Overall budget cannot be less than total allocated ($600.00)');
    expect(screen.getByRole('button', { name: 'Save Budget' })).toBeInTheDocument();
  });
});

describe('Home — currency before any budget', () => {
  test("labels the spending chart in the account's currency when no budget exists yet", async () => {
    mockApi({ overallView: { ...noOverall, currency: 'EUR' } });
    renderHome();
    await screen.findByText(`No budget set for ${THIS_YEAR}`);
    const charts = [...document.querySelectorAll('[data-chart-options]')].map((el) => el.getAttribute('data-chart-options'));
    expect(charts.some((options) => options.includes('Amount (€)'))).toBe(true);
    expect(charts.some((options) => options.includes('Amount ($)'))).toBe(false);
  });
});
