import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddGiftForm from '../js/AddGiftForm';
import { todayLocalISO } from '../../../utils/dates';

const recipients = [
  { _id: 'r1', firstName: 'Ann', lastName: 'Lee' },
  { _id: 'r2', firstName: 'Bo', lastName: 'Ng' }
];
const events = [{ _id: 'e1', name: 'Birthday', date: '2099-05-01T00:00:00.000Z', recipient: { _id: 'r1', firstName: 'Ann' } }];

const entry = (overrides) => ({ spent: 40, left: 60, status: 'within', limit: 100, budget: { exists: true }, ...overrides });
const budgets = [
  entry({ _id: 'r1' }),
  entry({ _id: 'r2', spent: 0, left: null, status: 'no_budget', limit: null, budget: { exists: false } })
];

const renderForm = (props = {}) => {
  const onSubmit = jest.fn();
  render(
    <AddGiftForm
      onSubmit={onSubmit}
      onCancel={() => {}}
      recipients={recipients}
      events={events}
      budgets={budgets}
      {...props}
    />
  );
  return onSubmit;
};

const fillRequired = async (user) => {
  await user.type(screen.getByLabelText(/gift name/i), 'Lamp');
  await user.type(screen.getByLabelText(/description/i), 'Desk lamp');
  await user.type(screen.getByLabelText(/^price$/i), '20');
  await user.selectOptions(screen.getByLabelText(/recipient/i), 'r1');
  await user.selectOptions(screen.getByLabelText(/^event$/i), 'e1');
};

describe('AddGiftForm — money', () => {
  test('shows the selected recipient Left in the overall currency', async () => {
    const user = userEvent.setup();
    renderForm({ currency: 'EUR' });

    await user.selectOptions(screen.getByLabelText(/recipient/i), 'r1');
    expect(screen.getByText('Budget: €60.00 left')).toBeInTheDocument();
  });

  test('a recipient without a budget shows the words, never $0.00 or NaN', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AddGiftForm onSubmit={() => {}} onCancel={() => {}} recipients={recipients} events={events} budgets={budgets} />
    );

    await user.selectOptions(screen.getByLabelText(/recipient/i), 'r2');
    expect(screen.getByText('No budget')).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN/);
  });

  test('warns only when the price goes past Left, compared in cents', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText(/recipient/i), 'r1');
    const price = screen.getByLabelText(/^price$/i);
    await user.type(price, '60');
    expect(screen.queryByText(/warning: price is more than/i)).not.toBeInTheDocument();
    await user.clear(price);
    await user.type(price, '60.01');
    expect(screen.getByText(/warning: price is more than this recipient's budget left/i)).toBeInTheDocument();
  });

  test("editing an already-purchased gift does not count its own price twice", async () => {
    const user = userEvent.setup();
    renderForm({
      budgets: [entry({ _id: 'r1', spent: 70, left: 30 })],
      initialData: {
        _id: 'g1', name: 'Lamp', description: 'Desk lamp', price: 60, status: 'purchased',
        purchaseDate: new Date(2025, 2, 1, 12).toISOString(),
        recipient: { _id: 'r1' }, event: { _id: 'e1' }, tags: [], whereToBuy: []
      }
    });

    const price = screen.getByLabelText(/^price$/i);
    await user.clear(price);
    await user.type(price, '70');
    expect(screen.queryByText(/warning: price is more than/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/purchase date/i)).toHaveValue('2025-03-01');
  });

  test("choosing Purchased fills today's local date and submits it", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    await fillRequired(user);
    await user.selectOptions(screen.getByLabelText(/status/i), 'purchased');
    expect(screen.getByLabelText(/purchase date/i)).toHaveValue(todayLocalISO());
    await user.click(screen.getByRole('button', { name: /add gift/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ status: 'purchased', purchaseDate: todayLocalISO(), price: 20 });
  });

  test('a gift that is not purchased is submitted without a purchaseDate', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: /add gift/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('purchaseDate');
  });

  test("editing keeps the gift's own recipient and event when the pickers no longer list them", async () => {
    // An archived recipient and a past event are left out of the pickers
    const user = userEvent.setup();
    const onSubmit = renderForm({
      initialData: {
        _id: 'g1', name: 'Lamp', description: 'Desk lamp', price: 60, status: 'purchased',
        purchaseDate: new Date(2025, 2, 1, 12).toISOString(),
        recipient: { _id: 'r9', firstName: 'Cal', lastName: 'Fox' },
        event: { _id: 'e9', name: 'Graduation 2025' },
        tags: [], whereToBuy: []
      }
    });

    expect(screen.getByLabelText(/recipient/i)).toHaveDisplayValue('Cal Fox');
    expect(screen.getByLabelText(/^event$/i)).toHaveDisplayValue('Graduation 2025');
    await user.click(screen.getByRole('button', { name: /update gift/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ recipientId: 'r9', eventId: 'e9' });
  });
});
