import React from 'react';
import { render, screen } from '@testing-library/react';
import RecipientProfile from '../js/RecipientProfile';
import axiosInstance from '../../axiosInstance';
import { todayLocalISO } from '../../utils/dates';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => () => {},
  useParams: () => ({ id: 'r1' })
}));
jest.mock('../../axiosInstance');

const THIS_YEAR = new Date().getFullYear();

const recipient = {
  _id: 'r1',
  firstName: 'John',
  lastName: 'Doe',
  relation: 'Friend',
  relationship: 'friendship',
  birthdate: '1990-01-01T00:00:00.000Z'
};

const budgetView = (overrides = {}) => ({
  exists: true, _id: 'b1', year: THIS_YEAR, type: 'fixed', allocationType: 'fixed',
  minimumAmount: 50, maximumAmount: 200, percentageAllocation: null, isLimited: true, isActive: true,
  notes: '', limit: 200, currency: 'USD',
  spentAmount: 75, remainingAmount: 125, budgetStatus: 'within',
  spent: 75, left: 125, status: 'within',
  ...overrides
});

const noBudgetView = (spent = 0) => ({
  exists: false, year: THIS_YEAR, type: null, allocationType: null, isLimited: false, limit: null, currency: 'USD',
  spentAmount: spent, remainingAmount: null, budgetStatus: 'no_budget', spent, left: null, status: 'no_budget'
});

const mockApi = ({ budget, events = [] }) => {
  axiosInstance.get.mockImplementation((url) => {
    if (url.includes('/navigation')) return Promise.resolve({ data: { prevId: null, nextId: null } });
    if (url.startsWith('/events')) return Promise.resolve({ data: events });
    if (url.startsWith('/budgets/recipient/')) return Promise.resolve({ data: budget });
    if (url === '/recipients/r1') return Promise.resolve({ data: recipient });
    return Promise.resolve({ data: null });
  });
};

describe('RecipientProfile — money and dates', () => {
  test('shows Budget, Spent and Left from the server', async () => {
    mockApi({ budget: budgetView() });
    render(<RecipientProfile />);

    expect(await screen.findByText('$200.00')).toBeInTheDocument();
    expect(screen.getByText('$75.00')).toBeInTheDocument();
    expect(screen.getByText('Left:').closest('p')).toHaveTextContent(/^Left: \$125\.00$/);
    expect(screen.queryByText(/remaining/i)).not.toBeInTheDocument();
  });

  test('overspending is "Over by", not clamped', async () => {
    mockApi({ budget: budgetView({ spent: 205, left: -5, status: 'over' }) });
    render(<RecipientProfile />);

    expect(await screen.findByText('Over by $5.00')).toBeInTheDocument();
    expect(screen.getByText('Left:').closest('p')).toHaveTextContent(/^Left: Over by \$5\.00$/);
  });

  test('an unlimited budget says Unlimited and has no Left line', async () => {
    mockApi({ budget: budgetView({ isLimited: false, limit: null, left: null, status: 'unlimited' }) });
    render(<RecipientProfile />);

    expect(await screen.findByText('Unlimited')).toBeInTheDocument();
    expect(screen.queryByText(/left$/)).not.toBeInTheDocument();
  });

  test('no budget renders the word, never $0.00 or NaN', async () => {
    mockApi({ budget: noBudgetView(0) });
    const { container } = render(<RecipientProfile />);

    expect(await screen.findByText('No budget')).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN/);
  });

  test('purchases without a budget still show Spent', async () => {
    mockApi({ budget: noBudgetView(30) });
    render(<RecipientProfile />);

    expect(await screen.findByText('No budget')).toBeInTheDocument();
    expect(screen.getByText('$30.00')).toBeInTheDocument();
  });

  test('event dates and the birthdate show their stored day; an event today is upcoming', async () => {
    mockApi({
      budget: noBudgetView(0),
      events: [
        { _id: 'e1', name: 'Next Year Party', date: `${THIS_YEAR + 1}-01-15T00:00:00.000Z`, type: { name: 'Other' } },
        { _id: 'e2', name: 'Today Party', date: `${todayLocalISO()}T00:00:00.000Z`, type: { name: 'Other' } }
      ]
    });
    render(<RecipientProfile />);

    expect(await screen.findByText('Next Year Party')).toBeInTheDocument();
    expect(screen.getByText(new Date(THIS_YEAR + 1, 0, 15).toLocaleDateString())).toBeInTheDocument();
    expect(screen.getByText('Today Party')).toBeInTheDocument();
    expect(screen.queryByText('Show Past Events')).not.toBeInTheDocument();
    expect(screen.getByText(new Date(1990, 0, 1).toLocaleDateString())).toBeInTheDocument();
  });
});
