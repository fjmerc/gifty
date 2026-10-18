import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Setup from '../Setup';
import axiosInstance from '../../../axiosInstance';
import { useAuth } from '../../../AuthContext';

jest.mock('../../../axiosInstance', () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn() }));
jest.mock('../../../AuthContext', () => ({ useAuth: jest.fn() }));

// A real router: a redirect unmounts the wizard, as it would in the app
const renderSetup = () => render(
  <MemoryRouter initialEntries={['/setup']}>
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route path="/admin" element={<p>Admin page</p>} />
      <Route path="/userhome" element={<p>Home page</p>} />
      <Route path="/login" element={<p>Login page</p>} />
    </Routes>
  </MemoryRouter>
);

const SETTINGS = {
  signupMode: 'invite-only', defaultCountry: 'US', defaultCurrency: 'USD', setupCompletedAt: null, publicUrl: 'http://localhost',
  choices: { countries: ['US', 'DE'], currencies: ['USD', 'EUR', 'GBP', 'JPY', 'CNY'] },
  status: { features: { ai: true, email: false, webSearch: false }, timeZone: 'Europe/Berlin', backups: { time: '02:30', keep: 7 } }
};
const OWNER = { _id: 'o', role: 'admin', isOwner: true };
const routeGets = (instance) => axiosInstance.get.mockImplementation((url) => Promise.resolve({ data: url === '/instance' ? instance : SETTINGS }));

describe('Setup wizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axiosInstance.patch.mockResolvedValue({ data: SETTINGS });
    axiosInstance.put.mockResolvedValue({ data: {} });
    axiosInstance.post.mockResolvedValue({ data: {} });
  });

  it('step 1 on a fresh instance creates the owner and moves on signed in', async () => {
    const fetchUserProfile = jest.fn().mockResolvedValue(OWNER);
    useAuth.mockReturnValue({ user: null, isLoading: false, fetchUserProfile });
    routeGets({ setupRequired: true, setupComplete: false });
    renderSetup();
    expect(await screen.findByLabelText('Setup code')).toBeInTheDocument();
    // RegisterForm's own tests cover the fields; submit through it here
    for (const [label, value] of Object.entries({ Username: 'boss', Email: 'b@x.org', Password: 'Passw0rd!x', 'Confirm Password': 'Passw0rd!x', 'First Name': 'B', 'Last Name': 'B', 'Date of Birth': '1990-01-01', 'Setup code': 'ABCD' })) {
      await userEvent.type(screen.getByLabelText(label), value);
    }
    await userEvent.click(screen.getByRole('button', { name: /create owner account/i }));
    await waitFor(() => expect(fetchUserProfile).toHaveBeenCalled());
    expect(await screen.findByRole('heading', { name: /household defaults/i })).toBeInTheDocument();
  });

  it('step 2 saves the instance and the owner\'s own country and currency', async () => {
    useAuth.mockReturnValue({ user: OWNER, isLoading: false, fetchUserProfile: jest.fn() });
    routeGets({ setupRequired: false, setupComplete: false });
    renderSetup();
    expect(await screen.findByRole('heading', { name: /household defaults/i })).toBeInTheDocument();
    expect(screen.queryByText('Admin page')).toBeNull();
    await userEvent.selectOptions(await screen.findByLabelText('Holiday country'), 'DE');
    await userEvent.selectOptions(screen.getByLabelText('Currency'), 'EUR');
    await userEvent.click(screen.getByRole('button', { name: /save and continue/i }));
    await waitFor(() => expect(axiosInstance.patch).toHaveBeenCalledWith('/admin/settings', { signupMode: 'invite-only', defaultCountry: 'DE', defaultCurrency: 'EUR' }));
    expect(axiosInstance.put).toHaveBeenCalledWith('/users/preferences', { preferences: { currency: 'EUR', holidaySettings: { countryCode: 'DE' } } });
    expect(await screen.findByRole('heading', { name: /check your server/i })).toBeInTheDocument();
  });

  it('step 2 says plainly when only the owner\'s own settings failed, and stays', async () => {
    useAuth.mockReturnValue({ user: OWNER, isLoading: false, fetchUserProfile: jest.fn() });
    routeGets({ setupRequired: false, setupComplete: false });
    axiosInstance.put.mockRejectedValue({ response: { data: { message: 'Server busy' } } });
    renderSetup();
    await userEvent.click(await screen.findByRole('button', { name: /save and continue/i }));
    expect(await screen.findByText("Saved for new accounts, but your own account's country and currency weren't changed: Server busy. Try again, or change them later in Settings.")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /household defaults/i })).toBeInTheDocument();
  });

  it('step 3 finishes setup either way and shows the status', async () => {
    useAuth.mockReturnValue({ user: OWNER, isLoading: false, fetchUserProfile: jest.fn() });
    routeGets({ setupRequired: false, setupComplete: false });
    renderSetup();
    await userEvent.click(await screen.findByRole('button', { name: /skip/i }));
    expect(await screen.findByText('Europe/Berlin')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /go to gifty/i }));
    await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledWith('/admin/setup-complete'));
    expect(await screen.findByText('Home page')).toBeInTheDocument();
  });

  it('an owner reloading /setup waits for the sign-in check instead of going to login', async () => {
    useAuth.mockReturnValue({ user: null, isLoading: true, fetchUserProfile: jest.fn() });
    routeGets({ setupRequired: false, setupComplete: false });
    renderSetup();
    expect(await screen.findByRole('status')).toHaveTextContent('Loading');
    expect(screen.queryByText('Login page')).toBeNull();
  });

  it('a finished instance sends the owner to the Admin page', async () => {
    useAuth.mockReturnValue({ user: OWNER, isLoading: false, fetchUserProfile: jest.fn() });
    routeGets({ setupRequired: false, setupComplete: true });
    renderSetup();
    expect(await screen.findByText('Admin page')).toBeInTheDocument();
  });

  it('a member who opens /setup is sent home', async () => {
    useAuth.mockReturnValue({ user: { _id: 'm', role: 'member', isOwner: false }, isLoading: false, fetchUserProfile: jest.fn() });
    routeGets({ setupRequired: false, setupComplete: false });
    renderSetup();
    expect(await screen.findByText('Home page')).toBeInTheDocument();
  });
});
