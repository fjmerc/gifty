import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EditOverallBudget from '../js/EditOverallBudget';
import axiosInstance from '../../axiosInstance';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => ({ year: '2025' })
}));
jest.mock('../../axiosInstance');

const view = (overrides = {}) => ({
  exists: true, _id: 'o1', year: 2025, amount: 1000, isLimited: true, currency: 'USD', notes: '',
  allocated: 600, unallocated: 400, spent: 330, leftToSpend: 670,
  allocatedAmount: 600, totalAllocated: 600, remainingAmount: 400, totalSpent: 330, unspentAmount: 670,
  ...overrides
});

const renderPage = () => render(<MemoryRouter><EditOverallBudget /></MemoryRouter>);

describe('EditOverallBudget — configuration only', () => {
  test('an { exists: false } view starts limited, with an empty amount and the view currency', async () => {
    axiosInstance.get.mockResolvedValue({
      data: { exists: false, year: 2025, amount: null, isLimited: false, currency: 'EUR', notes: '', allocated: 0, unallocated: null, spent: 0, leftToSpend: null }
    });
    renderPage();

    const amount = await screen.findByLabelText('Amount:');
    expect(amount).toHaveValue(null);
    expect(screen.getByLabelText('Currency:')).toHaveValue('EUR');
    expect(screen.getByLabelText('Unlimited Budget')).not.toBeChecked();
  });

  test('an { exists: false } view is titled Set Overall Budget with a Save Budget button', async () => {
    axiosInstance.get.mockResolvedValue({
      data: { exists: false, year: 2025, amount: null, isLimited: false, currency: 'USD', notes: '', allocated: 0, unallocated: null, spent: 0, leftToSpend: null }
    });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Set Overall Budget for 2025' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Budget' })).toBeInTheDocument();
    expect(screen.queryByText('Update Budget')).not.toBeInTheDocument();
  });

  test('an existing budget keeps the Edit title and Update Budget button', async () => {
    axiosInstance.get.mockResolvedValue({ data: view() });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Edit Overall Budget for 2025' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update Budget' })).toBeInTheDocument();
  });

  test('saving sends only amount, isLimited, currency and notes', async () => {
    axiosInstance.get.mockResolvedValue({ data: view() });
    axiosInstance.put.mockResolvedValue({ data: view() });
    renderPage();

    await screen.findByLabelText('Amount:');
    fireEvent.click(screen.getByText('Update Budget'));

    await waitFor(() => {
      expect(axiosInstance.put).toHaveBeenCalledWith('/budgets/overall/2025', {
        amount: 1000,
        isLimited: true,
        currency: 'USD',
        notes: ''
      });
    });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/budgets'));
  });

  test('a refused save shows the server message and keeps the form', async () => {
    axiosInstance.get.mockResolvedValue({ data: view() });
    axiosInstance.put.mockRejectedValue({
      response: { status: 400, data: { message: 'Overall budget cannot be less than total allocated amount', totalAllocated: 600 } }
    });
    renderPage();

    const amount = await screen.findByLabelText('Amount:');
    fireEvent.change(amount, { target: { value: '500' } });
    fireEvent.click(screen.getByText('Update Budget'));

    expect(await screen.findByText('Overall budget cannot be less than total allocated amount')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount:')).toHaveValue(500);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('the Amount field can be cleared', async () => {
    axiosInstance.get.mockResolvedValue({ data: view() });
    renderPage();
    fireEvent.change(await screen.findByLabelText('Amount:'), { target: { value: '' } });
    expect(screen.getByLabelText('Amount:')).toHaveValue(null);
  });

  test('a limited budget with an empty or zero amount is not sent', async () => {
    axiosInstance.get.mockResolvedValue({ data: view() });
    renderPage();
    const amount = await screen.findByLabelText('Amount:');

    fireEvent.change(amount, { target: { value: '' } });
    fireEvent.click(screen.getByText('Update Budget'));
    expect(await screen.findByText(/greater than 0, or mark it Unlimited/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Amount:'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Update Budget'));
    expect(screen.getByText(/greater than 0, or mark it Unlimited/)).toBeInTheDocument();
    expect(axiosInstance.put).not.toHaveBeenCalled();
  });

  test('an unlimited budget with an empty amount saves without an amount', async () => {
    axiosInstance.get.mockResolvedValue({ data: view() });
    axiosInstance.put.mockResolvedValue({ data: view() });
    renderPage();
    fireEvent.change(await screen.findByLabelText('Amount:'), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('Unlimited Budget'));
    fireEvent.click(screen.getByText('Update Budget'));
    await waitFor(() => {
      expect(axiosInstance.put).toHaveBeenCalledWith('/budgets/overall/2025', {
        isLimited: false, currency: 'USD', notes: ''
      });
    });
  });
});
