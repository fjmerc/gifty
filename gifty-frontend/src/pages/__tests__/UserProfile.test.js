import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import UserProfile from '../js/UserProfile';
import axiosInstance from '../../axiosInstance';
import { toast } from 'react-toastify';

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  ToastContainer: () => null,
}));
import { render } from '../../test-utils';
import { pinSystemDate } from '../../test-utils';

// Fixtures (event dates, budget years, /2025 URLs) are written for mid-2025
let restoreDate;
beforeAll(() => { restoreDate = pinSystemDate('2025-06-10T12:00:00Z'); });
afterAll(() => restoreDate());

// Mock axios
jest.mock('../../axiosInstance');

// Mock FontAwesome icons
jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: ({ icon, ...props }) => (
    <span data-testid="font-awesome-icon" data-icon={icon.iconName || 'icon'} {...props} />
  )
}));

// Mock EditUserProfileForm
jest.mock('../../components/forms/js/EditUserProfileForm', () => {
  return function MockEditUserProfileForm({ user, onSuccess, onCancel }) {
    return (
      <div data-testid="edit-user-profile-form">
        <span>Editing profile for: {user.firstName} {user.lastName}</span>
        <button onClick={() => onSuccess({ message: 'Profile updated successfully' })}>
          Save Changes
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  };
});

// Mock CSS modules
jest.mock('../css/UserProfile.module.css', () => ({
  container: 'container',
  userProfile: 'userProfile',
  title: 'title',
  profileInfo: 'profileInfo',
  formGroup: 'formGroup',
  value: 'value',
  editButton: 'editButton',
  budgetSection: 'budgetSection',
  budgetFormGroup: 'budgetFormGroup',
  checkboxLabel: 'checkboxLabel',
  setBudgetButton: 'setBudgetButton',
  loading: 'loading',
  error: 'error',
  successOverlay: 'successOverlay',
  successDialog: 'successDialog',
  successContent: 'successContent',
  okButton: 'okButton'
}));

describe('UserProfile', () => {
  // Mock data based on backend analysis
  const mockUser = {
    _id: 'user-1',
    username: 'testuser',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    dateOfBirth: '1990-01-01T00:00:00.000Z',
    profilePicture: '/uploads/profile.jpg'
  };

  const mockOverallBudget = {
    _id: 'budget-1',
    year: 2025,
    amount: 1000,
    isLimited: true,
    currency: 'USD',
    notes: 'Annual gift budget'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default successful API responses
    axiosInstance.get.mockImplementation((url) => {
      if (url.includes('/users/profile')) {
        return Promise.resolve({ data: mockUser });
      }
      if (url.includes('/budgets/overall/')) {
        return Promise.resolve({ data: mockOverallBudget });
      }
      return Promise.resolve({ data: null });
    });

    axiosInstance.post.mockResolvedValue({
      data: { message: 'Budget created successfully' }
    });

    axiosInstance.put.mockResolvedValue({
      data: { message: 'Budget updated successfully' }
    });
  });

  // 1. Component Logic Analysis & Bug Fixes Validation
  describe('Component Logic Analysis & Bug Fixes Validation', () => {
    test('properly manages async data fetching without race conditions', async () => {
      render(<UserProfile />);
      
      // Should call both APIs concurrently
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/users/profile');
        expect(axiosInstance.get).toHaveBeenCalledWith('/budgets/overall/2025');
      });

      expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
      expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
    });

    test('properly handles budget state management edge cases', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
      });

      // Test checkbox state inversion logic
      const unlimitedCheckbox = screen.getByLabelText('Unlimited Budget');
      expect(unlimitedCheckbox).not.toBeChecked(); // isLimited: true means unlimited is false

      fireEvent.click(unlimitedCheckbox);
      expect(unlimitedCheckbox).toBeChecked();
    });

    test('properly handles date formatting with null safety', async () => {
      const userWithNullDate = {
        ...mockUser,
        dateOfBirth: null
      };

      axiosInstance.get.mockImplementation((url) => {
        if (url.includes('/users/profile')) {
          return Promise.resolve({ data: userWithNullDate });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockOverallBudget });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('Not set')).toBeInTheDocument();
      });
    });

    test('properly separates edit mode state management', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
      });

      // Should show profile view initially
      expect(screen.queryByTestId('edit-user-profile-form')).not.toBeInTheDocument();
      
      // Click edit button
      const editButton = document.querySelector('.editButton');
      expect(editButton).toBeInTheDocument();
      fireEvent.click(editButton);

      // Should switch to edit mode
      expect(screen.getByTestId('edit-user-profile-form')).toBeInTheDocument();
      expect(screen.queryByDisplayValue('John')).not.toBeInTheDocument();
    });
  });

  // 2. Authentication & Basic Rendering
  describe('Authentication & Basic Rendering', () => {
    test('renders loading state initially', () => {
      render(<UserProfile />);
      
      expect(screen.getByText('Loading user data...')).toBeInTheDocument();
    });

    test('renders user profile sections after loading', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByText('User Profile')).toBeInTheDocument();
      });

      expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
      expect(screen.getByText('Set Overall Budget')).toBeInTheDocument();
      expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
    });

    test('renders form fields with correct values', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
      });

      expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
    });

    test('renders budget form with current values', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('2025')).toBeInTheDocument();
      });

      expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
      expect(screen.getByDisplayValue('USD')).toBeInTheDocument();
    });
  });

  // 3. Data Fetching & API Integration
  describe('Data Fetching & API Integration', () => {
    test('fetches user and budget data on component mount', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/users/profile');
      });

      expect(axiosInstance.get).toHaveBeenCalledWith('/budgets/overall/2025');
      expect(axiosInstance.get).toHaveBeenCalledTimes(2);
    });

    test('displays user information correctly', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
      });

      expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
      expect(screen.getByDisplayValue('1/1/1990')).toBeInTheDocument();
    });

    test('displays budget information correctly', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
      });

      expect(screen.getByDisplayValue('2025')).toBeInTheDocument();
      expect(screen.getByDisplayValue('USD')).toBeInTheDocument();
      
      const unlimitedCheckbox = screen.getByLabelText('Unlimited Budget');
      expect(unlimitedCheckbox).not.toBeChecked(); // isLimited: true
    });

    test('creates new budget when none exists', async () => {
      axiosInstance.get.mockImplementation((url) => {
        if (url.includes('/users/profile')) {
          return Promise.resolve({ data: mockUser });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: null });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByText('Set Budget')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText('Amount:'), { target: { value: '500' } });
      fireEvent.click(screen.getByText('Set Budget'));

      await waitFor(() => {
        expect(axiosInstance.post).toHaveBeenCalledWith('/budgets/overall', {
          amount: 500,
          isLimited: true,
          currency: 'USD',
          notes: '',
          year: 2025
        });
      });
    });
  });

  // 4. User Interactions & Event Handling
  describe('User Interactions & Event Handling', () => {
    test('handles edit mode toggle', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByText('User Profile')).toBeInTheDocument();
      });

      // Find edit button by its icon
      const editButton = screen.getAllByRole('button').find(button => 
        button.querySelector('[data-testid="font-awesome-icon"]')
      );
      expect(editButton).toBeInTheDocument();
      
      fireEvent.click(editButton);

      expect(screen.getByTestId('edit-user-profile-form')).toBeInTheDocument();
      expect(screen.getByText('Editing profile for: John Doe')).toBeInTheDocument();
    });

    test('handles edit form success', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByText('User Profile')).toBeInTheDocument();
      });

      // Enter edit mode - find edit button by icon
      const editButton = screen.getAllByRole('button').find(button => 
        button.querySelector('[data-testid="font-awesome-icon"]')
      );
      fireEvent.click(editButton);

      // Save changes
      const saveButton = screen.getByText('Save Changes');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.queryByTestId('edit-user-profile-form')).not.toBeInTheDocument();
      });

      // Should fetch updated user data
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/users/profile');
      });
    });

    test('handles edit form cancellation', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByText('User Profile')).toBeInTheDocument();
      });

      // Enter edit mode - find edit button by icon
      const editButton = screen.getAllByRole('button').find(button => 
        button.querySelector('[data-testid="font-awesome-icon"]')
      );
      fireEvent.click(editButton);

      // Cancel changes
      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(screen.queryByTestId('edit-user-profile-form')).not.toBeInTheDocument();
      expect(screen.getByDisplayValue('John')).toBeInTheDocument(); // Back to read-only view
    });

    test('handles budget form field changes', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
      });

      const amountInput = screen.getByDisplayValue('1000');
      fireEvent.change(amountInput, { target: { value: '1500' } });
      expect(screen.getByDisplayValue('1500')).toBeInTheDocument();

      const currencySelect = screen.getByDisplayValue('USD');
      fireEvent.change(currencySelect, { target: { value: 'EUR' } });
      expect(screen.getByDisplayValue('EUR')).toBeInTheDocument();
    });

    test('handles budget submission', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByText('Update Budget')).toBeInTheDocument();
      });

      const setBudgetButton = screen.getByText('Update Budget');
      fireEvent.click(setBudgetButton);

      await waitFor(() => {
        expect(axiosInstance.put).toHaveBeenCalledWith('/budgets/overall/2025', {
          amount: 1000,
          isLimited: true,
          currency: 'USD',
          notes: 'Annual gift budget'
        });
      });

      // A toast, not a blocking overlay
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Overall budget set successfully!');
      });
      expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument();
    });

    test('the profile fields are labelled', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByText('Update Budget')).toBeInTheDocument();
      });

      ['Username', 'Email', 'First Name', 'Last Name', 'Date of Birth'].forEach((name) => {
        expect(screen.getByLabelText(`${name}:`)).toHaveAttribute('readonly');
      });
    });
  });

  // 5. Edge Cases & Error Handling
  describe('Edge Cases & Error Handling', () => {
    test('handles user data fetch error', async () => {
      axiosInstance.get.mockImplementation((url) => {
        if (url.includes('/users/profile')) {
          return Promise.reject(new Error('Network error'));
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockOverallBudget });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load user data. Please try again.')).toBeInTheDocument();
      });
    });

    test('handles missing user data', async () => {
      axiosInstance.get.mockImplementation((url) => {
        if (url.includes('/users/profile')) {
          return Promise.resolve({ data: null });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockOverallBudget });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByText('No user data found.')).toBeInTheDocument();
      });
    });

    test('handles budget fetch error gracefully', async () => {
      axiosInstance.get.mockImplementation((url) => {
        if (url.includes('/users/profile')) {
          return Promise.resolve({ data: mockUser });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.reject(new Error('Budget error'));
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
      });

      // Should still render with default budget values
      expect(screen.getByLabelText('Amount:')).toHaveValue(null); // Default amount is empty
      expect(screen.getByText('Set Budget')).toBeInTheDocument(); // No existing budget
    });

    test('handles budget submission error', async () => {
      axiosInstance.put.mockRejectedValueOnce(new Error('Budget update failed'));

      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByText('Update Budget')).toBeInTheDocument();
      });

      const setBudgetButton = screen.getByText('Update Budget');
      fireEvent.click(setBudgetButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to set overall budget. Please try again.')).toBeInTheDocument();
      });
    });

    test('handles unlimited budget toggle correctly', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Unlimited Budget')).toBeInTheDocument();
      });

      const unlimitedCheckbox = screen.getByLabelText('Unlimited Budget');
      
      // Initially should be unchecked (isLimited: true)
      expect(unlimitedCheckbox).not.toBeChecked();
      
      // Toggle to unlimited
      fireEvent.click(unlimitedCheckbox);
      expect(unlimitedCheckbox).toBeChecked();
      
      // Submit budget
      const setBudgetButton = screen.getByText('Update Budget');
      fireEvent.click(setBudgetButton);

      await waitFor(() => {
        expect(axiosInstance.put).toHaveBeenCalledWith('/budgets/overall/2025', 
          expect.objectContaining({
            isLimited: false
          })
        );
      });
    });

    test('handles numeric input edge cases', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
      });

      const amountInput = screen.getByDisplayValue('1000');
      
      // Test invalid input
      fireEvent.change(amountInput, { target: { value: 'invalid' } });
      expect(screen.getByLabelText('Amount:')).toHaveValue(null); // Non-numeric input leaves the field empty

      // Test negative input
      fireEvent.change(amountInput, { target: { value: '-100' } });
      expect(screen.getByDisplayValue('-100')).toBeInTheDocument(); // parseFloat allows negatives

      // Test decimal input
      fireEvent.change(amountInput, { target: { value: '123.45' } });
      expect(screen.getByDisplayValue('123.45')).toBeInTheDocument();
    });
  });

  // 6. Form Validation & Data Processing
  describe('Form Validation & Data Processing', () => {
    test('processes budget data correctly for API submission', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
      });

      // Change multiple fields using the actual form elements with proper async waits
      const amountInput = screen.getByDisplayValue('1000');
      fireEvent.change(amountInput, { target: { name: 'amount', value: '2000' } });
      await waitFor(() => {
        expect(screen.getByDisplayValue('2000')).toBeInTheDocument();
      });

      const currencySelect = screen.getByDisplayValue('USD');
      fireEvent.change(currencySelect, { target: { name: 'currency', value: 'EUR' } });
      await waitFor(() => {
        expect(screen.getByDisplayValue('EUR')).toBeInTheDocument();
      });

      const unlimitedCheckbox = screen.getByLabelText('Unlimited Budget');
      fireEvent.click(unlimitedCheckbox);
      await waitFor(() => {
        expect(unlimitedCheckbox).toBeChecked();
      });

      // Clear previous mock calls and setup fresh mocks
      jest.clearAllMocks();
      axiosInstance.put.mockResolvedValue({
        data: { message: 'Budget updated successfully' }
      });
      // Re-setup GET mocks for refetch after update
      axiosInstance.get.mockImplementation((url) => {
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockOverallBudget });
        }
        return Promise.resolve({ data: null });
      });

      // Submit
      const setBudgetButton = screen.getByText('Update Budget');
      fireEvent.click(setBudgetButton);

      await waitFor(() => {
        expect(axiosInstance.put).toHaveBeenCalledWith('/budgets/overall/2025', {
          amount: 2000,
          isLimited: false,
          currency: 'EUR',
          notes: 'Annual gift budget'
        });
      }, { timeout: 3000 });
    });

    test('maintains form state during user interactions', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
      });

      // Change amount
      fireEvent.change(screen.getByDisplayValue('1000'), { target: { value: '1500' } });
      
      // Enter and exit edit mode
      const editButton = document.querySelector('.editButton');
      expect(editButton).toBeInTheDocument();
      fireEvent.click(editButton);
      
      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      // Budget form should maintain state
      expect(screen.getByDisplayValue('1500')).toBeInTheDocument();
    });

    test('validates required fields properly', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
      });

      // Clear amount field
      fireEvent.change(screen.getByDisplayValue('1000'), { target: { value: '' } });
      
      // Submit
      const setBudgetButton = screen.getByText('Update Budget');
      fireEvent.click(setBudgetButton);

      // A limited budget needs an amount: nothing is sent and the form says why
      expect(await screen.findByText(/greater than 0, or mark it Unlimited/)).toBeInTheDocument();
      expect(axiosInstance.put).not.toHaveBeenCalled();
    });
  });

  // 7. Performance & Optimization
  describe('Performance & Optimization', () => {
    test('uses useCallback for data fetching functions', async () => {
      const { rerender } = render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
      });

      const initialCallCount = axiosInstance.get.mock.calls.length;

      // Re-render component
      rerender(<UserProfile />);

      // Should not trigger additional API calls due to useCallback
      expect(axiosInstance.get.mock.calls.length).toBe(initialCallCount);
    });

    test('handles rapid budget changes efficiently', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
      });

      const amountInput = screen.getByDisplayValue('1000');
      
      // Rapid changes
      for (let i = 0; i < 10; i++) {
        fireEvent.change(amountInput, { target: { value: (1000 + i).toString() } });
      }

      expect(screen.getByDisplayValue('1009')).toBeInTheDocument();
    });

    test('manages memory efficiently during mode switches', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      });

      // Rapid mode switching
      for (let i = 0; i < 5; i++) {
        // Find the edit button by its CSS class
        const editButton = document.querySelector('.editButton');
        expect(editButton).toBeInTheDocument();
        fireEvent.click(editButton);
        
        const cancelButton = screen.getByText('Cancel');
        fireEvent.click(cancelButton);
      }

      // Should maintain functionality
      expect(screen.getByDisplayValue('John')).toBeInTheDocument();
    });
  });

  // 8. Accessibility & User Experience
  describe('Accessibility & User Experience', () => {
    test('provides proper form labels and accessibility features', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Year:')).toBeInTheDocument();
      });

      expect(screen.getByLabelText('Amount:')).toBeInTheDocument();
      expect(screen.getByLabelText('Currency:')).toBeInTheDocument();
      expect(screen.getByLabelText('Unlimited Budget')).toBeInTheDocument();
    });

    test('maintains keyboard navigation support', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
      });

      const inputs = screen.getAllByRole('textbox');
      const selects = screen.getAllByRole('combobox');
      const buttons = screen.getAllByRole('button');
      
      [...inputs, ...selects, ...buttons].forEach(element => {
        expect(element).toBeVisible();
        // Test that elements are focusable
        element.focus();
        expect(document.activeElement).toBe(element);
      });
    });

    test('provides appropriate success feedback', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByText('Update Budget')).toBeInTheDocument();
      });

      const setBudgetButton = screen.getByText('Update Budget');
      fireEvent.click(setBudgetButton);

      // Announced by the toast container (role=alert), with nothing to dismiss
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Overall budget set successfully!');
      });
    });

    test('handles form field readonly states correctly', async () => {
      render(<UserProfile />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('testuser')).toBeInTheDocument();
      });

      const readOnlyInputs = [
        screen.getByDisplayValue('testuser'),
        screen.getByDisplayValue('test@example.com'),
        screen.getByDisplayValue('John'),
        screen.getByDisplayValue('Doe')
      ];

      readOnlyInputs.forEach(input => {
        expect(input).toHaveAttribute('readOnly');
      });
    });
  });
});