import React from 'react';
import { render, screen, fireEvent, waitFor } from '../../../test-utils';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import RecipientBudgetForm from '../js/RecipientBudgetForm';

// Mock CSS modules
jest.mock('../css/RecipientBudgetForm.module.css', () => ({
  budgetFormOverlay: 'budgetFormOverlay',
  budgetFormContainer: 'budgetFormContainer',
  budgetForm: 'budgetForm',
  formTitle: 'formTitle',
  formSection: 'formSection',
  sectionTitle: 'sectionTitle',
  sectionContent: 'sectionContent',
  formGroup: 'formGroup',
  error: 'error',
  percentageInput: 'percentageInput',
  checkboxGroup: 'checkboxGroup',
  notes: 'notes',
  formActions: 'formActions',
  cancelButton: 'cancelButton',
  submitButton: 'submitButton'
}));

// Mock react-hook-form
jest.mock('react-hook-form', () => ({
  useForm: jest.fn()
}));

describe('RecipientBudgetForm', () => {
  // Mock functions for react-hook-form
  const mockRegister = jest.fn((name, options) => ({
    name,
    onChange: jest.fn(),
    onBlur: jest.fn(),
    ref: jest.fn()
  }));

  const mockHandleSubmit = jest.fn((fn) => (e) => {
    e.preventDefault();
    fn({
      allocationType: 'fixed',
      minimumAmount: '100',
      maximumAmount: '200',
      currency: 'USD',
      isLimited: true,
      giftStatus: 'active',
      spentAmount: '0',
      frequency: 'yearly',
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      category: 'gifts',
      notes: 'Test notes'
    });
  });

  const mockWatch = jest.fn((field) => {
    if (field === 'allocationType') return 'fixed';
    return '';
  });

  const mockFormState = { errors: {} };

  const mockRecipient = {
    id: 1,
    firstName: 'John',
    lastName: 'Doe',
    budget: {
      allocationType: 'fixed',
      minimumAmount: 100,
      maximumAmount: 200,
      currency: 'USD',
      isLimited: true,
      spentAmount: 50,
      frequency: 'yearly',
      category: 'gifts',
      notes: 'Test budget'
    },
    giftStatus: 'active'
  };

  const mockOnClose = jest.fn();
  const mockOnSubmit = jest.fn();
  const mockYear = 2025;

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup mock implementation for useForm
    useForm.mockReturnValue({
      register: mockRegister,
      handleSubmit: mockHandleSubmit,
      watch: mockWatch,
      formState: mockFormState
    });
    // Reset mocks to default state
    mockWatch.mockImplementation((field) => {
      if (field === 'allocationType') return 'fixed';
      return '';
    });
    mockFormState.errors = {};
  });

  describe('Component Rendering', () => {
    test('renders budget form with recipient name in title', () => {
      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      expect(screen.getByText(/Customize Budget for John Doe/)).toBeInTheDocument();
    });

    test('renders all form sections', () => {
      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      expect(screen.getByText('Primary Budget Configuration')).toBeInTheDocument();
      expect(screen.getByText('Budget Status & Tracking')).toBeInTheDocument();
      expect(screen.getByText('Timing & Frequency')).toBeInTheDocument();
      expect(screen.getByText('Categorization & Notes')).toBeInTheDocument();
    });

    test('renders form overlay and container with correct CSS classes', () => {
      const { container } = render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      expect(container.querySelector('.budgetFormOverlay')).toBeInTheDocument();
      expect(container.querySelector('.budgetFormContainer')).toBeInTheDocument();
      expect(container.querySelector('.budgetForm')).toBeInTheDocument();
    });

    test('renders action buttons', () => {
      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save budget/i })).toBeInTheDocument();
    });
  });

  describe('Primary Budget Configuration', () => {
    test('renders allocation type select with options', () => {
      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      const allocationSelect = screen.getByLabelText(/allocation type/i);
      expect(allocationSelect).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /fixed amount/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /percentage of overall budget/i })).toBeInTheDocument();
    });

    test('renders budget limit checkbox', () => {
      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      expect(screen.getByLabelText(/enable budget limit/i)).toBeInTheDocument();
    });
  });

  describe('Conditional Field Rendering', () => {
    test('renders fixed amount fields when allocation type is fixed', () => {
      // Mock watch to return 'fixed'
      mockWatch.mockImplementation((field) => field === 'allocationType' ? 'fixed' : '');

      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      expect(screen.getByLabelText(/minimum amount/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/maximum amount/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/budget percentage/i)).not.toBeInTheDocument();
    });

    test('renders percentage field when allocation type is percentage', () => {
      // Mock watch to return 'percentage'
      mockWatch.mockImplementation((field) => field === 'allocationType' ? 'percentage' : '');

      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      expect(screen.getByLabelText(/budget percentage/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/minimum amount/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/maximum amount/i)).not.toBeInTheDocument();
    });
  });

  describe('Budget Status & Tracking', () => {
    test('renders gift status select with options', () => {
      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      const giftStatusSelect = screen.getByLabelText(/gift status/i);
      expect(giftStatusSelect).toBeInTheDocument();
      
      // Check that the select contains the expected options using within
      const options = screen.getAllByRole('option');
      const giftStatusOptions = options.filter(option => 
        ['Active', 'Inactive', 'Paused', 'Seasonal'].includes(option.textContent)
      );
      
      expect(giftStatusOptions).toHaveLength(4);
      expect(giftStatusOptions.some(option => option.textContent === 'Active')).toBe(true);
      expect(giftStatusOptions.some(option => option.textContent === 'Inactive')).toBe(true);
      expect(giftStatusOptions.some(option => option.textContent === 'Paused')).toBe(true);
      expect(giftStatusOptions.some(option => option.textContent === 'Seasonal')).toBe(true);
    });

    test("shows the year's Spent read-only from the summary", () => {
      render(
        <RecipientBudgetForm
          recipient={{ ...mockRecipient, spent: 50 }}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
          currency="USD"
        />
      );

      expect(screen.getByText('Spent in 2025')).toBeInTheDocument();
      expect(screen.getByText('$50.00')).toBeInTheDocument();
      expect(screen.queryByLabelText(/spent amount/i)).not.toBeInTheDocument();
    });
  });

  describe('Timing & Frequency', () => {
    test('renders frequency select with options', () => {
      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      const frequencySelect = screen.getByLabelText(/frequency/i);
      expect(frequencySelect).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /yearly/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /monthly/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /weekly/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /one-time/i })).toBeInTheDocument();
    });

    test('renders date inputs', () => {
      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/end date/i)).toBeInTheDocument();
    });
  });

  describe('Categorization & Notes', () => {
    test('renders category select with options', () => {
      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      const categorySelect = screen.getByLabelText(/category/i);
      expect(categorySelect).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /gifts/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /events/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /general/i })).toBeInTheDocument();
    });

    test('renders notes textarea with placeholder', () => {
      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      const notesTextarea = screen.getByLabelText(/notes/i);
      expect(notesTextarea).toBeInTheDocument();
      expect(notesTextarea).toHaveAttribute('placeholder', 'Add any additional notes or reminders');
    });
  });

  describe('Form Actions', () => {
    test('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    test('calls onSubmit with processed data when form is submitted', async () => {
      const user = userEvent.setup();
      
      // Mock form submission with complete data including conversion to numbers
      mockHandleSubmit.mockImplementation((fn) => (e) => {
        e.preventDefault();
        fn({
          allocationType: 'fixed',
          minimumAmount: '100',
          maximumAmount: '200',
          currency: 'USD',
          isLimited: true,
          giftStatus: 'active',
          spentAmount: '50',
          frequency: 'yearly',
          startDate: '2025-01-01',
          category: 'gifts',
          notes: 'Test notes',
          percentageAllocation: '0',
          endDate: '',
          recipient: mockRecipient
        });
      });

      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      const submitButton = screen.getByRole('button', { name: /save budget/i });
      await user.click(submitButton);

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          allocationType: 'fixed',
          minimumAmount: 100,
          maximumAmount: 200,
          isLimited: true,
          giftStatus: 'active',
          frequency: 'yearly',
          startDate: '2025-01-01',
          category: 'gifts',
          notes: 'Test notes'
        })
      );
      // Configuration only: no client-side spent, currency, or percentage on a fixed budget
      const sent = mockOnSubmit.mock.calls[0][0];
      expect(sent).not.toHaveProperty('spentAmount');
      expect(sent).not.toHaveProperty('currency');
      expect(sent).not.toHaveProperty('percentageAllocation');
      
      // Should not contain recipient property
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.not.objectContaining({
          recipient: expect.anything()
        })
      );
    });
  });

  describe('Default Values', () => {
    test('loads default values from recipient budget', () => {
      const recipientWithBudget = {
        id: 1,
        firstName: 'Jane',
        lastName: 'Smith',
        budget: {
          allocationType: 'percentage',
          percentageAllocation: 25,
          isLimited: false,
          frequency: 'monthly',
          category: 'events',
          notes: 'Special budget',
          startDate: '2025-06-01',
          endDate: '2025-12-31'
        },
        giftStatus: 'seasonal'
      };

      render(
        <RecipientBudgetForm
          recipient={recipientWithBudget}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      // Verify useForm was called with correct default values
      expect(useForm).toHaveBeenCalledWith({
        defaultValues: expect.objectContaining({
          allocationType: 'percentage',
          percentageAllocation: 25,
          isLimited: false,
          frequency: 'monthly',
          category: 'events',
          notes: 'Special budget',
          giftStatus: 'seasonal'
        })
      });
    });

    test('uses fallback default values when recipient has no budget', () => {
      const recipientWithoutBudget = {
        id: 2,
        firstName: 'Bob',
        lastName: 'Wilson'
      };

      render(
        <RecipientBudgetForm
          recipient={recipientWithoutBudget}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      expect(useForm).toHaveBeenCalledWith({
        defaultValues: expect.objectContaining({
          allocationType: 'fixed',
          percentageAllocation: 0,
          minimumAmount: 0,
          maximumAmount: 0,
          isLimited: true,
          notes: '',
          frequency: 'yearly',
          category: 'gifts',
          giftStatus: 'active'
        })
      });
    });
  });

  describe('Data Processing', () => {
    test('converts string numbers to actual numbers in form data', async () => {
      const user = userEvent.setup();
      
      mockHandleSubmit.mockImplementation((fn) => (e) => {
        e.preventDefault();
        fn({
          allocationType: 'percentage',
          percentageAllocation: '15.5',
          minimumAmount: '50',
          maximumAmount: '150',
          spentAmount: '25.75',
          currency: 'USD',
          giftStatus: 'active'
        });
      });

      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      const submitButton = screen.getByRole('button', { name: /save budget/i });
      await user.click(submitButton);

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          percentageAllocation: 15.5
        })
      );
      // A percentage budget carries no min/max; the server derives its limit
      const sent = mockOnSubmit.mock.calls[0][0];
      expect(sent).not.toHaveProperty('minimumAmount');
      expect(sent).not.toHaveProperty('maximumAmount');
      expect(sent).not.toHaveProperty('spentAmount');
    });

    test('excludes recipient property from submitted data', async () => {
      const user = userEvent.setup();
      
      mockHandleSubmit.mockImplementation((fn) => (e) => {
        e.preventDefault();
        fn({
          allocationType: 'fixed',
          minimumAmount: '100',
          recipient: 'should be excluded',
          currency: 'USD'
        });
      });

      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      const submitButton = screen.getByRole('button', { name: /save budget/i });
      await user.click(submitButton);

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.not.objectContaining({
          recipient: expect.anything()
        })
      );
    });
  });

  describe('Date Handling', () => {
    test('formats existing dates correctly for date inputs', () => {
      const recipientWithDates = {
        ...mockRecipient,
        budget: {
          ...mockRecipient.budget,
          startDate: new Date('2025-03-15'),
          endDate: new Date('2025-11-30')
        }
      };

      render(
        <RecipientBudgetForm
          recipient={recipientWithDates}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      expect(useForm).toHaveBeenCalledWith({
        defaultValues: expect.objectContaining({
          startDate: '2025-03-15',
          endDate: '2025-11-30'
        })
      });
    });

    test('handles missing dates with empty strings', () => {
      const recipientWithoutDates = {
        ...mockRecipient,
        budget: {
          ...mockRecipient.budget,
          startDate: undefined,
          endDate: null
        }
      };

      render(
        <RecipientBudgetForm
          recipient={recipientWithoutDates}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      expect(useForm).toHaveBeenCalledWith({
        defaultValues: expect.objectContaining({
          startDate: '',
          endDate: ''
        })
      });
    });
  });

  describe('Form Validation', () => {
    test('shows validation messages for required fields', () => {
      mockFormState.errors = {
        allocationType: { message: 'Allocation type is required' },
        minimumAmount: { message: 'Minimum amount is required' }
      };

      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      expect(screen.getByText('Allocation type is required')).toBeInTheDocument();
      expect(screen.getByText('Minimum amount is required')).toBeInTheDocument();
    });

    test('validates percentage range for percentage allocation', () => {
      mockWatch.mockImplementation((field) => field === 'allocationType' ? 'percentage' : '');
      mockFormState.errors = {
        percentageAllocation: { message: 'Percentage cannot exceed 100' }
      };

      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      expect(screen.getByText('Percentage cannot exceed 100')).toBeInTheDocument();
    });

    test('validates positive amounts', () => {
      mockFormState.errors = {
        minimumAmount: { message: 'Amount must be positive' }
      };

      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      expect(screen.getByText('Amount must be positive')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    test('has proper labels for all form inputs', () => {
      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      expect(screen.getByLabelText(/allocation type/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/enable budget limit/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/gift status/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/frequency/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/end date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    });

    test('form has proper semantic structure', () => {
      const { container } = render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      const form = container.querySelector('form');
      expect(form).toBeInTheDocument();
      
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2);
      
      const cancelButton = buttons.find(btn => btn.textContent.toLowerCase().includes('cancel'));
      const submitButton = buttons.find(btn => btn.textContent.toLowerCase().includes('save'));
      
      expect(cancelButton).toBeInTheDocument();
      expect(submitButton).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    test('handles recipient without firstName and lastName', () => {
      const incompleteRecipient = {
        id: 3
      };

      render(
        <RecipientBudgetForm
          recipient={incompleteRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      expect(screen.getByText(/Customize Budget for/)).toBeInTheDocument();
    });

    test('handles undefined recipient properties gracefully', () => {
      const minimalRecipient = {
        id: 4,
        firstName: 'Test'
      };

      expect(() => {
        render(
          <RecipientBudgetForm
            recipient={minimalRecipient}
            onClose={mockOnClose}
            onSubmit={mockOnSubmit}
            year={mockYear}
          />
        );
      }).not.toThrow();
    });

    test('handles form submission with minimal data', async () => {
      const user = userEvent.setup();
      
      mockHandleSubmit.mockImplementation((fn) => (e) => {
        e.preventDefault();
        fn({
          allocationType: 'fixed',
          currency: 'USD'
        });
      });

      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={mockYear}
        />
      );

      const submitButton = screen.getByRole('button', { name: /save budget/i });
      await user.click(submitButton);

      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          allocationType: 'fixed'
        })
      );
    });
  });

  describe('Props Interface', () => {
    test('accepts all required props', () => {
      expect(() => {
        render(
          <RecipientBudgetForm
            recipient={mockRecipient}
            onClose={mockOnClose}
            onSubmit={mockOnSubmit}
            year={mockYear}
          />
        );
      }).not.toThrow();
    });

    test('handles different year prop values', () => {
      render(
        <RecipientBudgetForm
          recipient={mockRecipient}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          year={2024}
        />
      );

      expect(screen.getByText(/Customize Budget for John Doe/)).toBeInTheDocument();
    });
  });
});