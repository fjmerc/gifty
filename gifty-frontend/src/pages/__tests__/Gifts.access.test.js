import React from 'react';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render, createAuthenticatedUser } from '../../test-utils';
import Gifts from '../js/Gifts';
import axiosInstance from '../../axiosInstance';
import { todayLocalISO } from '../../utils/dates';

jest.mock('../../axiosInstance');
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => () => {}
}));
jest.mock('react-tooltip', () => ({ Tooltip: () => null }));
jest.mock('../../components/ui/SuggestionModeSelector', () => () => <div />);
jest.mock('../../components/ui/GiftFeedback', () => () => <div />);
jest.mock('../../components/ui/SystemHealthIndicator', () => () => <div />);
jest.mock('../../components/ui/SourceBadge', () => () => <div />);
jest.mock('../../components/forms/js/AddGiftForm', () => ({ onSubmit, initialData, budgets, currency }) => (
  <div data-testid="add-gift-form">
    <span data-testid="form-currency">{currency}</span>
    <span data-testid="form-budgets">{(budgets || []).length}</span>
    <span data-testid="form-editing">{initialData ? initialData._id : 'new'}</span>
    <button
      onClick={() => onSubmit({
        name: 'Lamp',
        description: 'Desk lamp',
        price: 20,
        recipientId: 'r1',
        eventId: 'e1',
        status: 'purchased',
        purchaseDate: '2025-03-01'
      })}
    >
      Submit purchased
    </button>
  </div>
));

const gift = (overrides) => ({
  description: 'd',
  category: 'misc',
  tags: [],
  whereToBuy: [],
  status: 'saved',
  favorite: false,
  createdAt: '2025-01-01T00:00:00Z',
  event: { _id: 'e1', name: 'Birthday', date: '2025-06-01T00:00:00Z' },
  ...overrides
});

const gifts = [
  gift({ _id: 'g1', name: 'Within Gift', price: 25.99, recipient: { _id: 'r1', firstName: 'Ann', lastName: 'Lee' } }),
  gift({ _id: 'g2', name: 'No Budget Gift', price: 10, recipient: { _id: 'r2', firstName: 'Bo', lastName: 'Ng' } }),
  gift({ _id: 'g3', name: 'Unlimited Gift', price: 5, recipient: { _id: 'r3', firstName: 'Cy', lastName: 'Ode' } })
];

const allBudgets = (currency = 'USD') => ({
  year: 2025,
  currency,
  overallBudget: { exists: true, _id: 'o1', amount: 1000, isLimited: true, currency, allocated: 100, unallocated: 900, spent: 40, leftToSpend: 960 },
  recipientBudgets: [
    { _id: 'r1', firstName: 'Ann', lastName: 'Lee', spent: 40, left: 60, status: 'within', limit: 100, budget: { exists: true, allocationType: 'fixed' } },
    { _id: 'r2', firstName: 'Bo', lastName: 'Ng', spent: 0, left: null, status: 'no_budget', limit: null, budget: { exists: false } },
    { _id: 'r3', firstName: 'Cy', lastName: 'Ode', spent: 0, left: null, status: 'unlimited', limit: null, budget: { exists: true, isLimited: false } }
  ],
  unbudgetedSpent: 0,
  budgetStatuses: { within: 1, warning: 0, over: 0, unlimited: 1, no_budget: 1 }
});

const mockApi = (budgets = allBudgets()) => {
  axiosInstance.get.mockImplementation((url) => {
    if (url === '/gifts') return Promise.resolve({ data: { gifts } });
    if (url === '/recipients') return Promise.resolve({ data: [] });
    if (url.startsWith('/events')) return Promise.resolve({ data: [] });
    if (url.startsWith('/budgets/all/')) return Promise.resolve({ data: budgets });
    if (url === '/feedback/user') return Promise.resolve({ data: { feedback: [] } });
    if (url === '/feedback/analytics') return Promise.resolve({ data: { globalMetrics: { totalInteractions: 0 } } });
    if (url === '/settings/user-preferences') return Promise.resolve({ data: {} });
    return Promise.resolve({ data: {} });
  });
  axiosInstance.post.mockImplementation((url, data) => {
    if (url === '/gifts') return Promise.resolve({ data: { gift: { _id: 'new1', ...data }, warning: null, budgetCheck: null } });
    if (url.endsWith('/purchase')) {
      return Promise.resolve({
        data: {
          gift: { _id: 'g1', status: 'purchased' },
          message: 'Gift purchased successfully',
          warning: 'This purchase puts the recipient over budget by $5.00',
          budgetCheck: { status: 'over', left: -5, wouldExceedBy: 5, currency: 'USD' }
        }
      });
    }
    return Promise.resolve({ data: {} });
  });
  axiosInstance.put.mockImplementation((url, data) => Promise.resolve({ data: { gift: { _id: 'g1', ...data }, warning: null, budgetCheck: null } }));
  axiosInstance.patch.mockResolvedValue({ data: {} });
  axiosInstance.delete.mockResolvedValue({ data: {} });
};

const renderGifts = async () => {
  render(<Gifts />, { authContextValue: createAuthenticatedUser() });
  await screen.findByText('Within Gift');
};

const cardOf = (name) => screen.getByText(name).closest('div[class*="giftCard"]');


// Keyboard and screen-reader access, dialogs and confirmations
describe('Gifts page — access', () => {
  test('the add button, the pickers and the filter have names', async () => {
    mockApi();
    await renderGifts();
    expect(screen.getByRole('button', { name: 'Add gift' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Recipient' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Event' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filter gifts by recipient' })).toBeInTheDocument();
  });

  test('the add form opens in a named dialog that Escape closes', async () => {
    mockApi();
    await renderGifts();
    await userEvent.click(screen.getByRole('button', { name: 'Add gift' }));
    const dialog = screen.getByRole('dialog', { name: 'Add New Gift' });
    expect(within(dialog).getByTestId('add-gift-form')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('a gift card is selected with its own checkbox, from the keyboard', async () => {
    mockApi();
    await renderGifts();
    const box = screen.getByRole('checkbox', { name: 'Select Within Gift' });
    box.focus();
    await userEvent.keyboard(' ');
    expect(box).toBeChecked();
    expect(screen.getByRole('button', { name: /Delete Selected \(1\)/ })).toBeInTheDocument();
  });

  test('deleting asks in a dialog; Cancel deletes nothing', async () => {
    mockApi();
    await renderGifts();
    await userEvent.click(within(cardOf('Within Gift')).getByRole('button', { name: 'Delete gift' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete gift' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(axiosInstance.delete).not.toHaveBeenCalled();

    await userEvent.click(within(cardOf('Within Gift')).getByRole('button', { name: 'Delete gift' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(axiosInstance.delete).toHaveBeenCalledWith('/gifts/g1'));
  });

  test('purchasing asks in a dialog first', async () => {
    mockApi();
    await renderGifts();
    await userEvent.click(within(cardOf('Within Gift')).getByLabelText('Purchase gift'));
    const dialog = screen.getByRole('alertdialog', { name: 'Mark as purchased' });
    expect(dialog).toHaveTextContent('Within Gift');
    expect(axiosInstance.post).not.toHaveBeenCalledWith('/gifts/g1/purchase', expect.anything());
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark purchased' }));
    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledWith('/gifts/g1/purchase', expect.anything()));
  });

  // A failed load already explains the empty list; an ?edit= link must not hide it
  test('?edit= with an unknown gift keeps the load error', async () => {
    mockApi();
    axiosInstance.get.mockImplementation((url) => {
      if (url === '/gifts') return Promise.reject(new Error('down'));
      if (url.startsWith('/budgets/all/')) return Promise.resolve({ data: allBudgets() });
      if (url === '/feedback/user') return Promise.resolve({ data: { feedback: [] } });
      return Promise.resolve({ data: [] });
    });
    window.history.pushState({}, '', '/gifts?edit=missing');
    try {
      render(<Gifts />, { authContextValue: createAuthenticatedUser() });
      expect(await screen.findByText('Failed to load gifts. Please try again.')).toBeInTheDocument();
      await waitFor(() => expect(window.location.search).toBe(''));
      expect(screen.getByText('Failed to load gifts. Please try again.')).toBeInTheDocument();
      expect(screen.queryByText('That gift no longer exists.')).not.toBeInTheDocument();
    } finally {
      window.history.pushState({}, '', '/');
    }
  });
});
