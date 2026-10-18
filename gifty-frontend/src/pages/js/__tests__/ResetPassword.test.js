import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ResetPassword from '../ResetPassword';
import axiosInstance from '../../../axiosInstance';

jest.mock('../../../axiosInstance', () => ({ get: jest.fn(), post: jest.fn() }));

const renderAt = (token) => render(
  <MemoryRouter initialEntries={[`/reset/${token}`]}>
    <Routes><Route path="/reset/:token" element={<ResetPassword />} /></Routes>
  </MemoryRouter>
);

describe('Reset password page', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets a new password and then offers sign-in', async () => {
    axiosInstance.get.mockResolvedValue({ data: { expiresAt: '2030-01-01' } });
    axiosInstance.post.mockResolvedValue({ data: { message: 'Your password was changed. Sign in with the new one.' } });
    renderAt('rt1');
    await userEvent.type(await screen.findByLabelText('New password'), 'N3w!passw0rd');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'N3w!passw0rd');
    await userEvent.click(screen.getByRole('button', { name: /set password/i }));
    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledWith('/password-reset/rt1', { password: 'N3w!passw0rd' }));
    expect(await screen.findByText('Your password was changed. Sign in with the new one.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });

  it('refuses mismatched passwords without asking the server', async () => {
    axiosInstance.get.mockResolvedValue({ data: {} });
    renderAt('rt1');
    await userEvent.type(await screen.findByLabelText('New password'), 'N3w!passw0rd');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'Other!passw0rd');
    await userEvent.click(screen.getByRole('button', { name: /set password/i }));
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  it('shows the server message for a weak password and keeps the form', async () => {
    axiosInstance.get.mockResolvedValue({ data: {} });
    // What the server's validate() really sends: a generic message and the rule that failed
    axiosInstance.post.mockRejectedValue({ response: { status: 400, data: { message: 'Validation failed', errors: [{ field: 'password', message: 'Password must be at least 8 characters long' }] } } });
    renderAt('rt1');
    await userEvent.type(await screen.findByLabelText('New password'), 'short');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: /set password/i }));
    expect(await screen.findByText('Password must be at least 8 characters long')).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
  });

  it.each([
    [410, 'RESET_USED', "This reset link was already used. Ask an admin for a new one if you still can't sign in."],
    [403, 'ACCOUNT_DEACTIVATED', 'This account is deactivated. Ask an admin.']
  ])('a %s %s link says so plainly', async (status, code, message) => {
    axiosInstance.get.mockRejectedValue({ response: { status, data: { code, message } } });
    renderAt('bad');
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).toBeNull();
  });
});
