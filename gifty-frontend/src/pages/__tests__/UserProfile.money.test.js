import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UserProfile from '../js/UserProfile';
import axiosInstance from '../../axiosInstance';

jest.mock('../../axiosInstance');
jest.mock('../../components/forms/js/EditUserProfileForm', () => () => <div data-testid="edit-user-profile-form" />);

const THIS_YEAR = new Date().getFullYear();
const user = {
  _id: 'u1', username: 'ann', email: 'ann@example.com', firstName: 'Ann', lastName: 'Lee',
  dateOfBirth: '1990-01-01T00:00:00.000Z'
};

const mockApi = (overallView) => {
  axiosInstance.get.mockImplementation((url) => {
    if (url === '/users/profile') return Promise.resolve({ data: user });
    if (url.startsWith('/budgets/overall/')) return Promise.resolve({ data: overallView });
    return Promise.resolve({ data: null });
  });
  axiosInstance.post.mockResolvedValue({ data: {} });
  axiosInstance.put.mockResolvedValue({ data: {} });
};

describe('UserProfile — overall budget', () => {
  test('an { exists: false } view is a new budget: empty amount, POSTed with the view currency', async () => {
    mockApi({ exists: false, year: THIS_YEAR, amount: null, isLimited: false, currency: 'EUR', notes: '', spent: 0 });
    render(<UserProfile />);

    expect(await screen.findByText('Set Budget')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount:')).toHaveValue(null);
    fireEvent.change(screen.getByLabelText('Amount:'), { target: { value: '250' } });
    fireEvent.click(screen.getByText('Set Budget'));

    await waitFor(() => {
      expect(axiosInstance.post).toHaveBeenCalledWith('/budgets/overall', {
        amount: 250,
        isLimited: true,
        currency: 'EUR',
        notes: '',
        year: THIS_YEAR
      });
    });
  });

  test('an existing budget PUTs configuration only', async () => {
    mockApi({
      exists: true, _id: 'o1', year: THIS_YEAR, amount: 1000, isLimited: true, currency: 'USD', notes: 'n',
      allocated: 600, unallocated: 400, spent: 330, leftToSpend: 670
    });
    render(<UserProfile />);

    fireEvent.click(await screen.findByText('Update Budget'));
    await waitFor(() => {
      expect(axiosInstance.put).toHaveBeenCalledWith(`/budgets/overall/${THIS_YEAR}`, {
        amount: 1000,
        isLimited: true,
        currency: 'USD',
        notes: 'n'
      });
    });
  });

  test('a refused save shows the server message without hiding the profile', async () => {
    mockApi({ exists: true, _id: 'o1', year: THIS_YEAR, amount: 1000, isLimited: true, currency: 'USD', notes: '' });
    axiosInstance.put.mockRejectedValue({
      response: { status: 400, data: { message: 'Overall budget cannot be less than total allocated amount' } }
    });
    render(<UserProfile />);

    fireEvent.click(await screen.findByText('Update Budget'));
    expect(await screen.findByText('Overall budget cannot be less than total allocated amount')).toBeInTheDocument();
    expect(screen.getByText('User Profile')).toBeInTheDocument();
  });

  test('date of birth shows the stored day', async () => {
    mockApi({ exists: false, year: THIS_YEAR, amount: null, isLimited: false, currency: 'USD', notes: '' });
    render(<UserProfile />);

    expect(await screen.findByDisplayValue(new Date(1990, 0, 1).toLocaleDateString())).toBeInTheDocument();
  });

  test('changing the year refetches that year and saves its own values to its own URL', async () => {
    const NEXT = THIS_YEAR + 1;
    axiosInstance.get.mockImplementation((url) => {
      if (url === '/users/profile') return Promise.resolve({ data: user });
      if (url === `/budgets/overall/${THIS_YEAR}`) {
        return Promise.resolve({ data: { exists: true, _id: 'o1', year: THIS_YEAR, amount: 1000, isLimited: true, currency: 'USD', notes: 'old' } });
      }
      if (url === `/budgets/overall/${NEXT}`) {
        return Promise.resolve({ data: { exists: false, year: NEXT, amount: null, isLimited: false, currency: 'GBP', notes: '' } });
      }
      return Promise.resolve({ data: null });
    });
    axiosInstance.post.mockResolvedValue({ data: {} });
    axiosInstance.put.mockResolvedValue({ data: {} });
    render(<UserProfile />);

    await screen.findByText('Update Budget');
    fireEvent.change(screen.getByLabelText('Year:'), { target: { value: String(NEXT) } });

    await waitFor(() => expect(axiosInstance.get).toHaveBeenCalledWith(`/budgets/overall/${NEXT}`));
    await waitFor(() => expect(screen.getByLabelText('Currency:')).toHaveValue('GBP'));
    expect(screen.getByText('Set Budget')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount:')).toHaveValue(null);

    fireEvent.change(screen.getByLabelText('Amount:'), { target: { value: '300' } });
    fireEvent.click(screen.getByText('Set Budget'));
    await waitFor(() => {
      expect(axiosInstance.post).toHaveBeenCalledWith('/budgets/overall', {
        amount: 300, isLimited: true, currency: 'GBP', notes: '', year: NEXT
      });
    });
    expect(axiosInstance.put).not.toHaveBeenCalled();
  });

  test('the Amount field can be cleared', async () => {
    mockApi({ exists: true, _id: 'o1', year: THIS_YEAR, amount: 1000, isLimited: true, currency: 'USD', notes: '' });
    render(<UserProfile />);
    const amount = await screen.findByLabelText('Amount:');
    fireEvent.change(amount, { target: { value: '' } });
    expect(screen.getByLabelText('Amount:')).toHaveValue(null);
  });

  test('a limited budget with an empty or zero amount is not sent', async () => {
    mockApi({ exists: true, _id: 'o1', year: THIS_YEAR, amount: 1000, isLimited: true, currency: 'USD', notes: '' });
    render(<UserProfile />);
    const amount = await screen.findByLabelText('Amount:');

    fireEvent.change(amount, { target: { value: '' } });
    fireEvent.click(screen.getByText('Update Budget'));
    expect(await screen.findByText(/greater than 0, or mark it Unlimited/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Amount:'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Update Budget'));
    expect(screen.getByText(/greater than 0, or mark it Unlimited/)).toBeInTheDocument();
    expect(axiosInstance.put).not.toHaveBeenCalled();
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  test('an unlimited budget with an empty amount saves without an amount', async () => {
    mockApi({ exists: true, _id: 'o1', year: THIS_YEAR, amount: 1000, isLimited: true, currency: 'USD', notes: '' });
    render(<UserProfile />);
    const amount = await screen.findByLabelText('Amount:');
    fireEvent.change(amount, { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('Unlimited Budget'));
    fireEvent.click(screen.getByText('Update Budget'));
    await waitFor(() => {
      expect(axiosInstance.put).toHaveBeenCalledWith(`/budgets/overall/${THIS_YEAR}`, {
        isLimited: false, currency: 'USD', notes: ''
      });
    });
  });

  const NEXT_YEAR = THIS_YEAR + 1;
  const mockYearApi = (nextYear) => {
    axiosInstance.get.mockImplementation((url) => {
      if (url === '/users/profile') return Promise.resolve({ data: user });
      if (url === `/budgets/overall/${THIS_YEAR}`) {
        return Promise.resolve({ data: { exists: true, _id: 'o1', year: THIS_YEAR, amount: 1000, isLimited: true, currency: 'USD', notes: 'old' } });
      }
      return nextYear(url);
    });
    axiosInstance.post.mockResolvedValue({ data: {} });
    axiosInstance.put.mockResolvedValue({ data: {} });
  };

  test('saving before the new year has loaded sends nothing', async () => {
    mockYearApi(() => new Promise(() => {})); // never resolves
    render(<UserProfile />);
    await screen.findByText('Update Budget');

    fireEvent.change(screen.getByLabelText('Year:'), { target: { value: String(NEXT_YEAR) } });
    expect(screen.getByLabelText('Amount:')).toHaveValue(null);
    fireEvent.click(screen.getByRole('button', { name: /budget$/i }));

    expect(axiosInstance.put).not.toHaveBeenCalled();
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  test('a failed fetch for the new year shows an error and never saves the old values', async () => {
    mockYearApi(() => Promise.reject(new Error('boom')));
    render(<UserProfile />);
    await screen.findByText('Update Budget');

    fireEvent.change(screen.getByLabelText('Year:'), { target: { value: String(NEXT_YEAR) } });
    expect(await screen.findByText(`Could not load the ${NEXT_YEAR} budget. Try again.`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /budget$/i }));

    expect(axiosInstance.put).not.toHaveBeenCalled();
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });
});
