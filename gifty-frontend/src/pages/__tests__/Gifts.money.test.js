import React from 'react';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { render, createAuthenticatedUser } from '../../test-utils';
import Gifts from '../js/Gifts';
import axiosInstance from '../../axiosInstance';
import { todayLocalISO } from '../../utils/dates';

// Deletes and purchases ask first in the shared ConfirmDialog: accept it
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

describe('Gifts page — loading', () => {
  test('loads the feedback list once, alongside the other requests', async () => {
    mockApi();
    await renderGifts();
    await waitFor(() => expect(axiosInstance.get).toHaveBeenCalledWith('/feedback/analytics'));
    // Give a late second request the chance to show up
    await new Promise((r) => setTimeout(r, 50));

    const feedbackCalls = axiosInstance.get.mock.calls.filter(([url]) => url === '/feedback/user');
    expect(feedbackCalls).toHaveLength(1);
  });
});

describe('Gifts page — money', () => {

  test('each card shows the recipient Left from the summary, as words when there is no limit', async () => {
    mockApi();
    await renderGifts();

    expect(within(cardOf('Within Gift')).getByText('$60.00 left')).toBeInTheDocument();
    expect(within(cardOf('No Budget Gift')).getByText('No budget')).toBeInTheDocument();
    expect(within(cardOf('Unlimited Gift')).getByText('Unlimited')).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  test('prices use the overall budget currency', async () => {
    mockApi(allBudgets('EUR'));
    await renderGifts();

    expect(within(cardOf('Within Gift')).getByText(/€25\.99/)).toBeInTheDocument();
  });

  test("the purchase button sends today's local date and shows the server's warning", async () => {
    mockApi();
    await renderGifts();

    fireEvent.click(within(cardOf('Within Gift')).getByLabelText('Purchase gift'));
    await acceptConfirm();

    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledWith('/gifts/g1/purchase', { purchaseDate: todayLocalISO() }));
    expect(await screen.findByText('Gift purchased. This purchase puts the recipient over budget by $5.00')).toBeInTheDocument();
  });

  test('adding a gift as purchased is a single POST /gifts', async () => {
    mockApi();
    await renderGifts();

    fireEvent.click(document.querySelector('[class*="fab"]'));
    expect(screen.getByTestId('form-currency')).toHaveTextContent('USD');
    expect(screen.getByTestId('form-budgets')).toHaveTextContent('3');
    fireEvent.click(screen.getByText('Submit purchased'));

    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledWith('/gifts', expect.objectContaining({
      status: 'purchased',
      purchaseDate: '2025-03-01',
      price: 20
    })));
    expect(axiosInstance.post).toHaveBeenCalledTimes(1);
    expect(axiosInstance.put).not.toHaveBeenCalled();
  });

  test('editing a gift into purchased is a single PUT /gifts/:id', async () => {
    mockApi();
    await renderGifts();

    fireEvent.click(within(cardOf('Within Gift')).getByLabelText('Edit gift details'));
    expect(screen.getByTestId('form-editing')).toHaveTextContent('g1');
    fireEvent.click(screen.getByText('Submit purchased'));

    await waitFor(() => expect(axiosInstance.put).toHaveBeenCalledWith('/gifts/g1', expect.objectContaining({
      status: 'purchased',
      purchaseDate: '2025-03-01'
    })));
    expect(axiosInstance.put).toHaveBeenCalledTimes(1);
    expect(axiosInstance.post).not.toHaveBeenCalledWith(expect.stringMatching(/\/purchase$/), expect.anything());
  });

  // Audit bug: saving an edit of a gift the server already has as purchased used to
  // PUT and then POST /purchase, which answers 400, so the page said "Failed to save gift".
  // (Purchased gifts are not listed on this page, so the card here is stale: the gift
  // was purchased elsewhere, e.g. another tab.)
  test('editing a gift the server already has as purchased is one PUT and saves without an error', async () => {
    mockApi();
    axiosInstance.post.mockImplementation((url) => (url.endsWith('/purchase')
      ? Promise.reject({ response: { status: 400, data: { message: 'Gift is already purchased' } } })
      : Promise.resolve({ data: {} })));
    await renderGifts();

    fireEvent.click(within(cardOf('Within Gift')).getByLabelText('Edit gift details'));
    fireEvent.click(screen.getByText('Submit purchased'));

    await waitFor(() => expect(axiosInstance.put).toHaveBeenCalledTimes(1));
    expect(axiosInstance.put).toHaveBeenCalledWith('/gifts/g1', expect.objectContaining({ status: 'purchased' }));
    await waitFor(() => expect(screen.queryByTestId('add-gift-form')).not.toBeInTheDocument());
    expect(axiosInstance.post).not.toHaveBeenCalledWith(expect.stringMatching(/\/purchase$/), expect.anything());
    expect(screen.queryByText(/Failed to save gift/)).not.toBeInTheDocument();
  });

  // Favorites' Edit button links here with the gift to edit
  test('opens the edit form for ?edit=<gift id>', async () => {
    mockApi();
    window.history.pushState({}, '', '/gifts?edit=g2');
    try {
      await renderGifts();
      expect(await screen.findByTestId('form-editing')).toHaveTextContent('g2');
      expect(window.location.search).toBe('');
    } finally {
      window.history.pushState({}, '', '/');
    }
  });
});
