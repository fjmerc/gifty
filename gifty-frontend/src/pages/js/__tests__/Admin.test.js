import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Admin from '../Admin';
import axiosInstance from '../../../axiosInstance';
import { useAuth } from '../../../AuthContext';

jest.mock('../../../axiosInstance', () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() }));
jest.mock('../../../AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const USERS = [
  { _id: 'o', username: 'owner', firstName: 'Olga', lastName: 'O', email: 'o@x', role: 'admin', active: true, isOwner: true, createdAt: '2026-01-01' },
  { _id: 'a', username: 'admin', firstName: 'Ann', lastName: 'A', email: 'a@x', role: 'admin', active: true, isOwner: false, createdAt: '2026-01-02' },
  { _id: 'm', username: 'member', firstName: 'Max', lastName: 'M', email: 'm@x', role: 'member', active: true, isOwner: false, createdAt: '2026-01-03' }
];
const SETTINGS = {
  signupMode: 'invite-only', defaultCountry: 'US', defaultCurrency: 'USD', setupCompletedAt: '2026-01-01', publicUrl: 'http://localhost',
  choices: { countries: ['US', 'DE'], currencies: ['USD', 'EUR'] },
  status: { features: { ai: true, email: false, webSearch: false }, timeZone: 'UTC', backups: { time: '02:30', keep: 7 } }
};
const BY_URL = { '/admin/users': USERS, '/instance': { setupComplete: true }, '/admin/invites': [], '/admin/settings': SETTINGS };
const usersLoads = () => axiosInstance.get.mock.calls.filter(([url]) => url === '/admin/users').length;
const row = (name) => screen.getByRole('row', { name: new RegExp(name) });
const renderAs = (me) => {
  const fetchUserProfile = jest.fn().mockResolvedValue(me);
  useAuth.mockReturnValue({ user: me, fetchUserProfile });
  render(<MemoryRouter><Admin /></MemoryRouter>);
  return { fetchUserProfile };
};

describe('Admin page', () => {
  beforeEach(() => {
    axiosInstance.get.mockImplementation((url) => Promise.resolve({ data: BY_URL[url] }));
    axiosInstance.patch.mockResolvedValue({ data: {} });
    axiosInstance.post.mockResolvedValue({ data: {} });
  });

  it('members see a notice and nothing is requested', () => {
    renderAs({ _id: 'm', role: 'member', isOwner: false });
    expect(screen.getByText(/only admins of this gifty/i)).toBeInTheDocument();
    expect(axiosInstance.get).not.toHaveBeenCalled();
  });

  it('an admin may deactivate members only, and never change roles', async () => {
    renderAs({ _id: 'a', role: 'admin', isOwner: false });
    await screen.findByText('Max M');
    expect(within(row('Max M')).getByRole('button', { name: /deactivate/i })).toBeInTheDocument();
    expect(within(row('Max M')).queryByRole('button', { name: /make admin/i })).toBeNull();
    expect(within(row('Max M')).queryByRole('button', { name: /make owner/i })).toBeNull();
    expect(within(row('Olga O')).queryByRole('button')).toBeNull();
    expect(within(row('Olga O')).getByText('Owner')).toBeInTheDocument();
    expect(within(row('Ann A')).getByText('You')).toBeInTheDocument();
  });

  it('the owner can promote, deactivate admins and hand over ownership', async () => {
    const { fetchUserProfile } = renderAs({ _id: 'o', role: 'admin', isOwner: true });
    await screen.findByText('Max M');
    expect(within(row('Ann A')).getByRole('button', { name: /make member/i })).toBeInTheDocument();
    expect(within(row('Ann A')).getByRole('button', { name: /deactivate/i })).toBeInTheDocument();
    await userEvent.click(within(row('Max M')).getByRole('button', { name: /make admin/i }));
    expect(axiosInstance.patch).toHaveBeenCalledWith('/admin/users/m/role', { role: 'admin' });

    await userEvent.click(within(row('Max M')).getByRole('button', { name: /make owner/i }));
    await userEvent.type(screen.getByLabelText(/current password/i), 'secret');
    await userEvent.click(screen.getByRole('button', { name: /hand over/i }));
    expect(axiosInstance.post).toHaveBeenCalledWith('/admin/owner', { userId: 'm', currentPassword: 'secret' });
    await waitFor(() => expect(fetchUserProfile).toHaveBeenCalled());
  });

  it('shows a wrong password in the dialog', async () => {
    renderAs({ _id: 'o', role: 'admin', isOwner: true });
    await screen.findByText('Max M');
    axiosInstance.post.mockRejectedValueOnce({ response: { status: 400, data: { message: 'Current password is incorrect', errors: [{ field: 'currentPassword' }] } } });
    await userEvent.click(within(row('Max M')).getByRole('button', { name: /make owner/i }));
    await userEvent.type(screen.getByLabelText(/current password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /hand over/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Current password is incorrect');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('reloads the list on 409', async () => {
    renderAs({ _id: 'o', role: 'admin', isOwner: true });
    await screen.findByText('Max M');
    axiosInstance.patch.mockRejectedValueOnce({ response: { status: 409, data: { code: 'CONFLICT', message: 'This changed. Reload and try again.' } } });
    await userEvent.click(within(row('Max M')).getByRole('button', { name: /deactivate/i }));
    await waitFor(() => expect(usersLoads()).toBe(2));
  });

  it('admins make a reset link for a member, never for the owner or an admin', async () => {
    axiosInstance.post.mockResolvedValue({ data: { link: 'http://localhost/reset/zz', expiresAt: '2030-01-01' } });
    renderAs({ _id: 'a', role: 'admin', isOwner: false });
    await screen.findByText('Max M');
    expect(within(row('Olga O')).queryByRole('button', { name: /reset password/i })).toBeNull();
    await userEvent.click(within(row('Max M')).getByRole('button', { name: /reset password/i }));
    expect(axiosInstance.post).toHaveBeenCalledWith('/admin/users/m/reset-link');
    expect(await screen.findByDisplayValue('http://localhost/reset/zz')).toBeInTheDocument();
  });

  it('the owner can make a reset link for an admin', async () => {
    renderAs({ _id: 'o', role: 'admin', isOwner: true });
    await screen.findByText('Ann A');
    expect(within(row('Ann A')).getByRole('button', { name: /reset password/i })).toBeInTheDocument();
  });

  it('tabs switch panels and the owner is reminded to finish setup', async () => {
    axiosInstance.get.mockImplementation((url) => Promise.resolve({ data: url === '/instance' ? { setupComplete: false } : url === '/admin/users' ? USERS : [] }));
    renderAs({ _id: 'o', role: 'admin', isOwner: true });
    expect(await screen.findByRole('link', { name: /finish setting up gifty/i })).toHaveAttribute('href', '/setup');
    await userEvent.click(screen.getByRole('tab', { name: 'Invites' }));
    expect(await screen.findByRole('button', { name: /create invite link/i })).toBeInTheDocument();
  });

  it('the Backups tab shows Database Management', async () => {
    axiosInstance.get.mockImplementation((url) => Promise.resolve({ data: url === '/admin/users' ? USERS : url === '/instance' ? { setupComplete: true } : [] }));
    renderAs({ _id: 'o', role: 'admin', isOwner: true });
    await userEvent.click(await screen.findByRole('tab', { name: 'Backups' }));
    expect(await screen.findByRole('heading', { name: /database management/i })).toBeInTheDocument();
  });
});
