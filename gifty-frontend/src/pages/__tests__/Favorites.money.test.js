import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Favorites from '../js/Favorites';
import axiosInstance from '../../axiosInstance';
import { todayLocalISO } from '../../utils/dates';

// Deletes and purchases ask first in the shared ConfirmDialog
const acceptConfirm = async () => {
  const dialog = await screen.findByRole('alertdialog');
  const buttons = within(dialog).getAllByRole('button');
  fireEvent.click(buttons[buttons.length - 1]);
};

jest.mock('../../axiosInstance');
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => () => {}
}));
jest.mock('react-tooltip', () => ({ Tooltip: () => null }));

const favorites = [
  {
    _id: 'g1', name: 'Within Gift', description: 'd', price: 50, favorite: true, status: 'saved',
    recipient: { _id: 'r1', firstName: 'Ann', lastName: 'Lee' },
    event: { _id: 'e1', name: 'Birthday', date: '2024-06-15T00:00:00.000Z' }
  },
  {
    _id: 'g2', name: 'No Budget Gift', description: 'd', price: 75, favorite: true, status: 'saved',
    recipient: { _id: 'r2', firstName: 'Bo', lastName: 'Ng' },
    event: { _id: 'e2', name: 'Christmas', date: '2024-12-25T00:00:00.000Z' }
  }
];

const allBudgets = (overrides = {}) => ({
  year: 2025,
  currency: 'USD',
  overallBudget: { exists: true, amount: 1000, isLimited: true, currency: 'USD' },
  recipientBudgets: [
    { _id: 'r1', firstName: 'Ann', lastName: 'Lee', spent: 40, left: 60, status: 'within', limit: 100, budget: { exists: true } },
    { _id: 'r2', firstName: 'Bo', lastName: 'Ng', spent: 0, left: null, status: 'no_budget', limit: null, budget: { exists: false } }
  ],
  ...overrides
});

const mockApi = (budgets = allBudgets()) => {
  axiosInstance.get.mockImplementation((url) => {
    if (url === '/gifts/favorites') return Promise.resolve({ data: favorites });
    if (url === '/recipients') return Promise.resolve({ data: [] });
    if (url.startsWith('/budgets/all/')) return Promise.resolve({ data: budgets });
    return Promise.resolve({ data: {} });
  });
  axiosInstance.post.mockResolvedValue({ data: { gift: { status: 'purchased' }, warning: null, budgetCheck: null } });
  axiosInstance.patch.mockResolvedValue({ data: {} });
  axiosInstance.delete.mockResolvedValue({ data: {} });
};

const cardOf = (name) => screen.getByText(name).closest('div[class*="giftCard"]');

describe('Favorites — money', () => {
  test('each favorite shows its recipient Left, or the words when there is no limit', async () => {
    mockApi();
    const { container } = render(<MemoryRouter><Favorites /></MemoryRouter>);

    await screen.findByText('Within Gift');
    expect(within(cardOf('Within Gift')).getByText('$60.00 left')).toBeInTheDocument();
    expect(within(cardOf('No Budget Gift')).getByText('No budget')).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN/);
  });

  test('overspending is shown as "Over by"', async () => {
    mockApi(allBudgets({
      recipientBudgets: [{ _id: 'r1', spent: 130, left: -30, status: 'over', limit: 100, budget: { exists: true } }]
    }));
    render(<MemoryRouter><Favorites /></MemoryRouter>);

    await screen.findByText('Within Gift');
    expect(within(cardOf('Within Gift')).getByText('Over by $30.00')).toBeInTheDocument();
  });

  test('prices use the overall budget currency', async () => {
    mockApi(allBudgets({ currency: 'EUR', overallBudget: { exists: true, amount: 1000, isLimited: true, currency: 'EUR' } }));
    render(<MemoryRouter><Favorites /></MemoryRouter>);

    await screen.findByText('Within Gift');
    expect(within(cardOf('No Budget Gift')).getByText(/€75\.00/)).toBeInTheDocument();
  });

  test("purchasing sends today's local date, never the event's date", async () => {
    mockApi();
    render(<MemoryRouter><Favorites /></MemoryRouter>);

    await screen.findByText('Within Gift');
    fireEvent.click(cardOf('Within Gift').querySelector('[data-tooltip-id="purchase-g1"]'));
    await acceptConfirm();

    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledWith('/gifts/g1/purchase', { purchaseDate: todayLocalISO() }));
  });

  test('a purchase is confirmed first, as on the Gifts page', async () => {
    mockApi();
    render(<MemoryRouter><Favorites /></MemoryRouter>);

    await screen.findByText('Within Gift');
    fireEvent.click(cardOf('Within Gift').querySelector('[data-tooltip-id="purchase-g1"]'));

    const dialog = await screen.findByRole('alertdialog', { name: 'Mark as purchased' });
    expect(dialog).toHaveTextContent(/Within Gift/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  test('cards are selected with a named checkbox; the filter and buttons have names', async () => {
    mockApi();
    render(<MemoryRouter><Favorites /></MemoryRouter>);

    await screen.findByText('Within Gift');
    expect(screen.getByRole('combobox', { name: 'Filter favorites by recipient' })).toBeInTheDocument();
    const card = cardOf('Within Gift');
    expect(within(card).getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Delete gift' })).toBeInTheDocument();
    const box = within(card).getByRole('checkbox', { name: 'Select Within Gift' });
    fireEvent.click(box);
    expect(box).toBeChecked();
    expect(screen.getByText('Delete Selected (1)')).toBeInTheDocument();
  });
});
