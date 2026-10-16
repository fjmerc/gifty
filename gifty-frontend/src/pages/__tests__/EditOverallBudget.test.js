import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { act } from '@testing-library/react';
import { BrowserRouter, useParams } from 'react-router-dom';
import EditOverallBudget from '../js/EditOverallBudget';
import axiosInstance from '../../axiosInstance';

// Mock external dependencies
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: jest.fn()
}));

jest.mock('../../axiosInstance');

jest.mock('../css/EditOverallBudget.module.css', () => ({
  editBudgetPage: 'editBudgetPage',
  container: 'container',
  editBudget: 'editBudget',
  formGroup: 'formGroup',
  checkboxGroup: 'checkboxGroup',
  checkboxLabel: 'checkboxLabel',
  buttonGroup: 'buttonGroup',
  submitButton: 'submitButton',
  cancelButton: 'cancelButton',
  loading: 'loading',
  error: 'error'
}));

// Custom render function with Router
const renderWithRouter = (component) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('EditOverallBudget Component', () => {
  const mockBudgetData = {
    _id: 'budget123',
    amount: 1000,
    isLimited: true,
    currency: 'USD',
    year: '2024',
    allocatedAmount: 500,
    remainingAmount: 500,
    notes: 'Test budget'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useParams.mockReturnValue({ year: '2024' });
    axiosInstance.get.mockResolvedValue({ data: mockBudgetData });
    axiosInstance.put.mockResolvedValue({ data: mockBudgetData });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // Section 1: Authentication & Basic Rendering
  describe('Authentication & Basic Rendering', () => {
    test('renders loading state initially', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    test('renders component with correct title after loading', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        expect(screen.getByText('Edit Overall Budget for 2024')).toBeInTheDocument();
      });
    });

    test('applies correct CSS classes', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const container = screen.getByText('Edit Overall Budget for 2024').closest('.editBudgetPage');
        expect(container).toBeInTheDocument();
      });
    });
  });

  // Section 2: Data Fetching & API Integration
  describe('Data Fetching & API Integration', () => {
    test('fetches budget data on component mount', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/budgets/overall/2024');
      });
    });

    test('displays fetched budget data correctly', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
        expect(screen.getByDisplayValue('USD')).toBeInTheDocument();
      });
    });

    test('handles API error during fetch', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      axiosInstance.get.mockRejectedValue(new Error('Network error'));
      
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load budget. Please try again.')).toBeInTheDocument();
      });
      
      consoleError.mockRestore();
    });

    test('displays error state with correct styling', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      axiosInstance.get.mockRejectedValue(new Error('Network error'));
      
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const errorElement = screen.getByText('Failed to load budget. Please try again.');
        expect(errorElement).toHaveClass('error');
      });
      
      consoleError.mockRestore();
    });

    test('uses correct year from URL params', async () => {
      useParams.mockReturnValue({ year: '2025' });
      
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/budgets/overall/2025');
        expect(screen.getByText('Edit Overall Budget for 2025')).toBeInTheDocument();
      });
    });
  });

  // Section 3: Form Fields & User Interactions
  describe('Form Fields & User Interactions', () => {
    test('renders all form fields with correct initial values', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        // Amount field
        const amountInput = screen.getByLabelText('Amount:');
        expect(amountInput).toBeInTheDocument();
        expect(amountInput).toHaveValue(1000);
        expect(amountInput).toHaveAttribute('type', 'number');
        expect(amountInput).toHaveAttribute('min', '0');
        expect(amountInput).toHaveAttribute('step', '0.01');
        expect(amountInput).toBeRequired();
        
        // Currency field
        const currencySelect = screen.getByLabelText('Currency:');
        expect(currencySelect).toBeInTheDocument();
        expect(currencySelect).toHaveValue('USD');
        expect(currencySelect).toBeRequired();
        
        // Unlimited budget checkbox
        const unlimitedCheckbox = screen.getByLabelText('Unlimited Budget');
        expect(unlimitedCheckbox).toBeInTheDocument();
        expect(unlimitedCheckbox).not.toBeChecked(); // isLimited: true means unlimited is NOT checked
      });
    });

    test('displays all currency options', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const currencySelect = screen.getByLabelText('Currency:');
        const options = currencySelect.querySelectorAll('option');
        
        expect(options).toHaveLength(5);
        expect(options[0]).toHaveValue('USD');
        expect(options[1]).toHaveValue('EUR');
        expect(options[2]).toHaveValue('GBP');
        expect(options[3]).toHaveValue('JPY');
        expect(options[4]).toHaveValue('CNY');
      });
    });

    test('handles amount input change', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const amountInput = screen.getByLabelText('Amount:');
        fireEvent.change(amountInput, { target: { value: '1500' } });
        expect(amountInput).toHaveValue(1500);
      });
    });

    test('handles currency selection change', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const currencySelect = screen.getByLabelText('Currency:');
        fireEvent.change(currencySelect, { target: { value: 'EUR' } });
        expect(currencySelect).toHaveValue('EUR');
      });
    });

    test('handles unlimited budget checkbox toggle', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const unlimitedCheckbox = screen.getByLabelText('Unlimited Budget');
        
        // Initially not checked (isLimited: true)
        expect(unlimitedCheckbox).not.toBeChecked();
        
        // Click to make unlimited (isLimited: false)
        fireEvent.click(unlimitedCheckbox);
        expect(unlimitedCheckbox).toBeChecked();
        
        // Click again to make limited (isLimited: true)
        fireEvent.click(unlimitedCheckbox);
        expect(unlimitedCheckbox).not.toBeChecked();
      });
    });

    test('handles decimal amount input correctly', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const amountInput = screen.getByLabelText('Amount:');
        fireEvent.change(amountInput, { target: { value: '999.99' } });
        expect(amountInput).toHaveValue(999.99);
      });
    });

    test('handles zero amount input', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const amountInput = screen.getByLabelText('Amount:');
        fireEvent.change(amountInput, { target: { value: '0' } });
        expect(amountInput).toHaveValue(0);
      });
    });

    test('handles invalid amount input (non-numeric)', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const amountInput = screen.getByLabelText('Amount:');
        fireEvent.change(amountInput, { target: { value: 'invalid' } });
        expect(amountInput).toHaveValue(null); // non-numeric input leaves the field empty, not 0
      });
    });
  });

  // Section 4: Form Submission & Navigation
  describe('Form Submission & Navigation', () => {
    test('renders form buttons correctly', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const submitButton = screen.getByText('Update Budget');
        const cancelButton = screen.getByText('Cancel');
        
        expect(submitButton).toBeInTheDocument();
        expect(submitButton).toHaveAttribute('type', 'submit');
        expect(submitButton).toHaveClass('submitButton');
        
        expect(cancelButton).toBeInTheDocument();
        expect(cancelButton).toHaveAttribute('type', 'button');
        expect(cancelButton).toHaveClass('cancelButton');
      });
    });

    test('submits form with updated data', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        // Modify form fields
        const amountInput = screen.getByLabelText('Amount:');
        const currencySelect = screen.getByLabelText('Currency:');
        const unlimitedCheckbox = screen.getByLabelText('Unlimited Budget');
        
        fireEvent.change(amountInput, { target: { value: '2000' } });
        fireEvent.change(currencySelect, { target: { value: 'EUR' } });
        fireEvent.click(unlimitedCheckbox); // Make unlimited
      });
      
      // Submit form
      await act(async () => {
        const submitButton = screen.getByText('Update Budget');
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(axiosInstance.put).toHaveBeenCalledWith('/budgets/overall/2024', {
          amount: 2000,
          isLimited: false, // Checkbox was clicked
          currency: 'EUR',
          notes: 'Test budget'
        });
      });
    });

    test('navigates to budgets page after successful submission', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const submitButton = screen.getByText('Update Budget');
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/budgets');
      });
    });

    test('handles form submission error', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      axiosInstance.put.mockRejectedValue(new Error('Update failed'));
      
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const submitButton = screen.getByText('Update Budget');
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Failed to update budget. Please try again.')).toBeInTheDocument();
      });
      
      consoleError.mockRestore();
    });

    test('handles cancel button click', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const cancelButton = screen.getByText('Cancel');
        fireEvent.click(cancelButton);
      });
      
      expect(mockNavigate).toHaveBeenCalledWith('/budgets');
    });

    test('prevents default form submission behavior', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const submitButton = screen.getByText('Update Budget');
        fireEvent.click(submitButton);
        
        // If preventDefault worked, the API should be called
        expect(axiosInstance.put).toHaveBeenCalled();
      });
    });
  });

  // Section 5: Edge Cases & Error Handling
  describe('Edge Cases & Error Handling', () => {
    test('handles unlimited budget data correctly', async () => {
      const unlimitedBudgetData = {
        ...mockBudgetData,
        isLimited: false,
        amount: 0
      };
      axiosInstance.get.mockResolvedValue({ data: unlimitedBudgetData });
      
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const unlimitedCheckbox = screen.getByLabelText('Unlimited Budget');
        expect(unlimitedCheckbox).toBeChecked(); // !isLimited = !false = true
        
        const amountInput = screen.getByLabelText('Amount:');
        expect(amountInput).toHaveValue(0);
      });
    });

    test('handles missing budget data gracefully', async () => {
      // Backend returns default budget when none exists
      const defaultBudgetData = {
        amount: 0,
        isLimited: false,
        currency: 'USD',
        year: '2024',
        allocatedAmount: 0,
        remainingAmount: Infinity,
        notes: ''
      };
      axiosInstance.get.mockResolvedValue({ data: defaultBudgetData });
      
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        expect(screen.getByText('Edit Overall Budget for 2024')).toBeInTheDocument();
        expect(screen.getByDisplayValue('0')).toBeInTheDocument(); // amount field
        expect(screen.getByDisplayValue('USD')).toBeInTheDocument(); // currency field
        const unlimitedCheckbox = screen.getByLabelText('Unlimited Budget');
        expect(unlimitedCheckbox).toBeChecked(); // !isLimited = !false = true
      });
    });

    test('handles different year parameters', async () => {
      useParams.mockReturnValue({ year: '2023' });
      
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/budgets/overall/2023');
        expect(screen.getByText('Edit Overall Budget for 2023')).toBeInTheDocument();
      });
    });

    test('handles network timeout during fetch', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      axiosInstance.get.mockRejectedValue(new Error('timeout'));
      
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load budget. Please try again.')).toBeInTheDocument();
      });
      
      consoleError.mockRestore();
    });

    test('handles network timeout during submission', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      axiosInstance.put.mockRejectedValue(new Error('timeout'));
      
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const submitButton = screen.getByText('Update Budget');
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Failed to update budget. Please try again.')).toBeInTheDocument();
      });
      
      consoleError.mockRestore();
    });

    test('handles multiple rapid form submissions', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const submitButton = screen.getByText('Update Budget');
        
        // Submit multiple times rapidly
        fireEvent.click(submitButton);
        fireEvent.click(submitButton);
        fireEvent.click(submitButton);
      });
      
      // Should only call the API once or handle appropriately
      await waitFor(() => {
        expect(axiosInstance.put).toHaveBeenCalled();
      });
    });

    test('maintains form state during submission', async () => {
      // Make API call take longer to test loading state
      axiosInstance.put.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const amountInput = screen.getByLabelText('Amount:');
        fireEvent.change(amountInput, { target: { value: '3000' } });
        
        const submitButton = screen.getByText('Update Budget');
        fireEvent.click(submitButton);
        
        // Form field should still show the modified value during submission
        expect(amountInput).toHaveValue(3000);
      });
    });

    test('handles very large amount values', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const amountInput = screen.getByLabelText('Amount:');
        fireEvent.change(amountInput, { target: { value: '999999999.99' } });
        expect(amountInput).toHaveValue(999999999.99);
      });
    });

    test('handles form validation for required fields', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const amountInput = screen.getByLabelText('Amount:');
        const currencySelect = screen.getByLabelText('Currency:');
        
        expect(amountInput).toBeRequired();
        expect(currencySelect).toBeRequired();
      });
    });
  });

  // Section 6: Component Integration & Lifecycle
  describe('Component Integration & Lifecycle', () => {
    test('component unmounts cleanly', async () => {
      const { unmount } = renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        expect(screen.getByText('Edit Overall Budget for 2024')).toBeInTheDocument();
      });
      
      expect(() => unmount()).not.toThrow();
    });

    test('handles year parameter changes', async () => {
      // Start with 2024
      useParams.mockReturnValue({ year: '2024' });
      const { rerender } = renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/budgets/overall/2024');
      });
      
      // Change to 2025
      useParams.mockReturnValue({ year: '2025' });
      rerender(
        <BrowserRouter>
          <EditOverallBudget />
        </BrowserRouter>
      );
      
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/budgets/overall/2025');
      });
    });

    test('maintains component state consistency', async () => {
      renderWithRouter(<EditOverallBudget />);
      
      await waitFor(() => {
        const amountInput = screen.getByLabelText('Amount:');
        const currencySelect = screen.getByLabelText('Currency:');
        const unlimitedCheckbox = screen.getByLabelText('Unlimited Budget');
        
        // Make changes
        fireEvent.change(amountInput, { target: { value: '1500' } });
        fireEvent.change(currencySelect, { target: { value: 'GBP' } });
        fireEvent.click(unlimitedCheckbox);
        
        // Verify all changes persist
        expect(amountInput).toHaveValue(1500);
        expect(currencySelect).toHaveValue('GBP');
        expect(unlimitedCheckbox).toBeChecked();
      });
    });

    test('error state persists until page reload', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      axiosInstance.put.mockRejectedValue(new Error('Update failed'));
      
      renderWithRouter(<EditOverallBudget />);
      
      // Submit and get error
      await waitFor(() => {
        const submitButton = screen.getByText('Update Budget');
        fireEvent.click(submitButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Failed to update budget. Please try again.')).toBeInTheDocument();
        // A refused save keeps the form so the amount can be corrected
        expect(screen.getByLabelText('Amount:')).toBeInTheDocument();
      });
      
      consoleError.mockRestore();
    });
  });
});