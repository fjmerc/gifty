import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvitesPanel from '../InvitesPanel';
import axiosInstance from '../../../../axiosInstance';

jest.mock('../../../../axiosInstance', () => ({ get: jest.fn(), post: jest.fn(), delete: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const PENDING = [{ _id: 'i1', email: null, expiresAt: '2030-01-08T00:00:00Z', createdAt: '2030-01-01', createdBy: { firstName: 'Olga', lastName: 'O' } }];

describe('Invites panel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axiosInstance.get.mockResolvedValue({ data: PENDING });
    axiosInstance.delete.mockResolvedValue({});
  });

  it('creates an invite, shows the link once, and lists pending ones', async () => {
    axiosInstance.post.mockResolvedValue({ data: { link: `${window.location.origin}/invite/abc`, invite: { _id: 'i2' } } });
    render(<InvitesPanel />);
    expect(await screen.findByText('Anyone')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/email/i), 'gran@example.com');
    await userEvent.selectOptions(screen.getByLabelText(/expires/i), '30');
    await userEvent.click(screen.getByRole('button', { name: /create invite link/i }));
    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledWith('/admin/invites', { email: 'gran@example.com', days: 30 }));
    expect(await screen.findByDisplayValue(`${window.location.origin}/invite/abc`)).toBeInTheDocument();
    expect(axiosInstance.get).toHaveBeenCalledTimes(2);
  });

  it('revokes a pending invite', async () => {
    render(<InvitesPanel />);
    const row = (await screen.findByText('Anyone')).closest('tr');
    await userEvent.click(within(row).getByRole('button', { name: /revoke/i }));
    expect(axiosInstance.delete).toHaveBeenCalledWith('/admin/invites/i1');
  });

  it('defaults to 7 days and sends no email when none is given', async () => {
    axiosInstance.post.mockResolvedValue({ data: { link: 'http://x/invite/y', invite: {} } });
    render(<InvitesPanel />);
    await screen.findByText('Anyone');
    await userEvent.click(screen.getByRole('button', { name: /create invite link/i }));
    expect(axiosInstance.post).toHaveBeenCalledWith('/admin/invites', { days: 7 });
  });
});
