import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Invite from '../Invite';
import axiosInstance from '../../../axiosInstance';

jest.mock('../../../axiosInstance', () => ({ get: jest.fn(), post: jest.fn() }));
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ ...jest.requireActual('react-router-dom'), useNavigate: () => mockNavigate }));

const renderAt = (token) => render(
  <MemoryRouter initialEntries={[`/invite/${token}`]}>
    <Routes><Route path="/invite/:token" element={<Invite />} /></Routes>
  </MemoryRouter>
);
const fill = async (overrides = {}) => {
  // Every field is required, Date of Birth included (as in Register.test.js)
  const values = { Username: 'kid', Password: 'Passw0rd!x', 'Confirm Password': 'Passw0rd!x', 'First Name': 'Kid', 'Last Name': 'K', 'Date of Birth': '1990-01-01', ...overrides };
  for (const [label, value] of Object.entries(values)) await userEvent.type(screen.getByLabelText(label), value);
};

describe('Invite page', () => {
  beforeEach(() => jest.clearAllMocks());

  it('a tied invite fixes the email and registers with the token', async () => {
    axiosInstance.get.mockResolvedValue({ data: { email: 'kid@example.com', expiresAt: '2030-01-01' } });
    axiosInstance.post.mockResolvedValue({ data: {} });
    renderAt('tok123');
    const email = await screen.findByLabelText('Email');
    expect(email).toHaveValue('kid@example.com');
    expect(email).toHaveAttribute('readonly');
    await fill();
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledWith('/users/register', expect.objectContaining({ inviteToken: 'tok123', email: 'kid@example.com' })));
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it.each([
    [410, 'INVITE_EXPIRED', 'This invite link has expired. Ask for a new one.'],
    [410, 'INVITE_USED', 'This invite link was already used. Ask for a new one if you still need an account.'],
    [404, 'INVITE_UNKNOWN', "This invite link isn't valid. It may have been revoked. Ask for a new one."]
  ])('a %s %s link says so plainly and shows no form', async (status, code, message) => {
    axiosInstance.get.mockRejectedValue({ response: { status, data: { code, message } } });
    renderAt('bad');
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create account/i })).toBeNull();
  });
});
