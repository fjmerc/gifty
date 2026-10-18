import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InstanceSettingsForm from '../InstanceSettingsForm';

const SETTINGS = { signupMode: 'invite-only', defaultCountry: 'US', defaultCurrency: 'USD', choices: { countries: ['US', 'DE'], currencies: ['USD', 'EUR'] } };

it('warns when sign-up is opened and saves the chosen values', async () => {
  const onSave = jest.fn();
  render(<InstanceSettingsForm settings={SETTINGS} onSave={onSave} />);
  expect(screen.queryByText(/anyone who can open this address/i)).toBeNull();
  await userEvent.click(screen.getByLabelText(/^open/i));
  expect(screen.getByText('Anyone who can open this address can create an account. Use this only on a private network.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith({ signupMode: 'open', defaultCountry: 'US', defaultCurrency: 'USD' });
});
