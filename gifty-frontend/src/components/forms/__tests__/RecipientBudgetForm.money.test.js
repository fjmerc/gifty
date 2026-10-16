import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecipientBudgetForm from '../js/RecipientBudgetForm';

const entry = (budget, overrides = {}) => ({
  _id: 'r1',
  firstName: 'Ann',
  lastName: 'Lee',
  giftStatus: 'active',
  spent: 40,
  left: 60,
  status: 'within',
  limit: 100,
  budget,
  ...overrides
});

const fixedBudget = {
  exists: true,
  _id: 'b1',
  allocationType: 'fixed',
  minimumAmount: 10,
  maximumAmount: 100,
  percentageAllocation: null,
  isLimited: true,
  notes: '',
  startDate: '2025-01-01T00:00:00.000Z',
  frequency: 'yearly',
  category: 'gifts'
};

const noop = () => {};

describe('RecipientBudgetForm — configuration only', () => {
  test('percentage mode submits only the percentage (no min/max, spent or currency)', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(<RecipientBudgetForm recipient={entry(fixedBudget)} onClose={noop} onSubmit={onSubmit} year={2025} currency="USD" />);

    await user.selectOptions(screen.getByLabelText('Allocation Type'), 'percentage');
    const percentage = screen.getByLabelText('Budget Percentage');
    await user.clear(percentage);
    await user.type(percentage, '25');
    await user.click(screen.getByRole('button', { name: 'Save Budget' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const sent = onSubmit.mock.calls[0][0];
    expect(sent).toMatchObject({ allocationType: 'percentage', percentageAllocation: 25, isLimited: true, giftStatus: 'active' });
    expect(sent).not.toHaveProperty('minimumAmount');
    expect(sent).not.toHaveProperty('maximumAmount');
    expect(sent).not.toHaveProperty('spentAmount');
    expect(sent).not.toHaveProperty('currency');
  });

  test('fixed mode submits min and max as numbers, without a percentage', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(<RecipientBudgetForm recipient={entry(fixedBudget)} onClose={noop} onSubmit={onSubmit} year={2025} currency="USD" />);

    await user.click(screen.getByRole('button', { name: 'Save Budget' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const sent = onSubmit.mock.calls[0][0];
    expect(sent).toMatchObject({ allocationType: 'fixed', minimumAmount: 10, maximumAmount: 100 });
    expect(sent).not.toHaveProperty('percentageAllocation');
    expect(sent).not.toHaveProperty('spentAmount');
    expect(sent).not.toHaveProperty('currency');
  });

  test('Spent is read-only, from the summary, in the overall currency', () => {
    render(<RecipientBudgetForm recipient={entry(fixedBudget)} onClose={noop} onSubmit={noop} year={2025} currency="EUR" />);

    expect(screen.getByText('Spent in 2025')).toBeInTheDocument();
    expect(screen.getByText('€40.00')).toBeInTheDocument();
    expect(screen.queryByLabelText(/spent amount/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/currency/i)).not.toBeInTheDocument();
  });

  test('a recipient without a budget starts as a new limited fixed budget', () => {
    const { container } = render(
      <RecipientBudgetForm
        recipient={entry({ exists: false, isLimited: false, limit: null }, { spent: 0, left: null, status: 'no_budget', limit: null })}
        onClose={noop}
        onSubmit={noop}
        year={2025}
        currency="USD"
      />
    );

    expect(screen.getByText('No budget yet for 2025.')).toBeInTheDocument();
    expect(screen.getByLabelText('Enable Budget Limit')).toBeChecked();
    expect(screen.getByLabelText('Allocation Type')).toHaveValue('fixed');
    expect(container.textContent).not.toMatch(/NaN/);
  });

  test('shows a save error passed by the page inside the form', () => {
    render(<RecipientBudgetForm recipient={entry(fixedBudget)} onClose={noop} onSubmit={noop} year={2025} currency="USD" error="Overall budget must be set first" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Overall budget must be set first');
  });

  test('a new budget defaults Gift Status to active even when the recipient is stored inactive, and submits it', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(
      <RecipientBudgetForm
        recipient={entry({ exists: false, isLimited: false, limit: null }, { giftStatus: 'inactive', spent: 0, left: null, status: 'no_budget', limit: null })}
        onClose={noop}
        onSubmit={onSubmit}
        year={2025}
        currency="USD"
      />
    );

    expect(screen.getByLabelText('Gift Status')).toHaveValue('active');
    await user.type(screen.getByLabelText('Minimum Amount'), '5');
    await user.clear(screen.getByLabelText('Maximum Amount'));
    await user.type(screen.getByLabelText('Maximum Amount'), '50');
    await user.click(screen.getByRole('button', { name: 'Save Budget' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ giftStatus: 'active' });
  });

  test('an existing budget keeps the recipient stored status', () => {
    render(<RecipientBudgetForm recipient={entry(fixedBudget, { giftStatus: 'paused' })} onClose={noop} onSubmit={noop} year={2025} currency="USD" />);
    expect(screen.getByLabelText('Gift Status')).toHaveValue('paused');
  });

  test('a new budget pre-fills Start and End Date with Jan 1 and Dec 31 of the budget year and submits without picking a date', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(
      <RecipientBudgetForm
        recipient={entry({ exists: false, isLimited: false, limit: null }, { spent: 0, left: null, status: 'no_budget', limit: null })}
        onClose={noop}
        onSubmit={onSubmit}
        year={2026}
        currency="USD"
      />
    );

    expect(screen.getByLabelText('Start Date')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('End Date')).toHaveValue('2026-12-31');
    await user.type(screen.getByLabelText('Minimum Amount'), '5');
    await user.clear(screen.getByLabelText('Maximum Amount'));
    await user.type(screen.getByLabelText('Maximum Amount'), '50');
    await user.click(screen.getByRole('button', { name: 'Save Budget' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ startDate: '2026-01-01', endDate: '2026-12-31' });
  });

  test('an existing budget keeps its stored dates', () => {
    render(<RecipientBudgetForm recipient={entry({ ...fixedBudget, endDate: '2025-06-30T00:00:00.000Z' })} onClose={noop} onSubmit={noop} year={2025} currency="USD" />);
    expect(screen.getByLabelText('Start Date')).toHaveValue('2025-01-01');
    expect(screen.getByLabelText('End Date')).toHaveValue('2025-06-30');
  });

  test('a percentage budget must be greater than 0 and at most 100, with an inline error', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(<RecipientBudgetForm recipient={entry(fixedBudget)} onClose={noop} onSubmit={onSubmit} year={2025} currency="USD" />);

    await user.selectOptions(screen.getByLabelText('Allocation Type'), 'percentage');
    const percentage = screen.getByLabelText('Budget Percentage');
    await user.clear(percentage);
    await user.type(percentage, '0');
    await user.click(screen.getByRole('button', { name: 'Save Budget' }));
    expect(await screen.findByText('Percentage must be greater than 0')).toBeInTheDocument();

    await user.clear(percentage);
    await user.type(percentage, '101');
    await user.click(screen.getByRole('button', { name: 'Save Budget' }));
    expect(await screen.findByText('Percentage cannot exceed 100')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(percentage);
    await user.type(percentage, '0.5');
    await user.click(screen.getByRole('button', { name: 'Save Budget' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ percentageAllocation: 0.5 });
  });
});
