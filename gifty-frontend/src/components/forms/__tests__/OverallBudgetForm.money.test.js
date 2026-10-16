import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OverallBudgetForm from '../js/OverallBudgetForm';

const noop = () => {};

// Characterization test: these cases already passed on the old code
describe('OverallBudgetForm — exists flag (characterization)', () => {
  test('an { exists: false } view starts as a new, unlimited form with a 0 amount and the given currency', async () => {
    const user = userEvent.setup();
    render(
      <OverallBudgetForm
        budget={{ exists: false, year: 2025, amount: null, isLimited: false, currency: 'EUR', notes: '' }}
        onClose={noop}
        onSubmit={noop}
        year={2025}
      />
    );

    const limit = screen.getByLabelText('Enable Budget Limit');
    expect(limit).not.toBeChecked();
    expect(screen.getByLabelText('Currency')).toHaveValue('EUR');
    await user.click(limit);
    expect(screen.getByLabelText('Budget Amount')).toHaveValue(0);
  });

  test('an existing view pre-fills its amount and limit', () => {
    render(
      <OverallBudgetForm
        budget={{ exists: true, _id: 'o1', year: 2025, amount: 250, isLimited: true, currency: 'USD', notes: 'n' }}
        onClose={noop}
        onSubmit={noop}
        year={2025}
      />
    );

    expect(screen.getByLabelText('Enable Budget Limit')).toBeChecked();
    expect(screen.getByLabelText('Budget Amount')).toHaveValue(250);
  });
});
