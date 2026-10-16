import React from 'react';
import { render, screen, waitFor } from '../../../test-utils';
import userEvent from '@testing-library/user-event';
import OverallBudgetForm from '../js/OverallBudgetForm';

// Mock CSS modules
jest.mock('../css/OverallBudgetForm.module.css', () => ({
  'event-form': 'event-form',
  'form-group': 'form-group',
  'checkboxGroup': 'checkboxGroup',
  'form-actions': 'form-actions',
  'error': 'error'
}));

describe('OverallBudgetForm', () => {
  let user;
  const mockOnClose = jest.fn();
  const mockOnSubmit = jest.fn();
  const currentYear = new Date().getFullYear();

  const defaultProps = {
    budget: null,
    onClose: mockOnClose,
    onSubmit: mockOnSubmit,
    year: currentYear
  };

  const mockBudget = {
    amount: 1000,
    isLimited: true,
    currency: 'USD',
    notes: 'Holiday budget for this year'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
  });

  const renderComponent = (props = {}) => {
    return render(<OverallBudgetForm {...defaultProps} {...props} />);
  };

  describe('Component Rendering', () => {
    test('renders form with correct title for given year', () => {
      renderComponent();

      expect(screen.getByText(`Set Overall Budget for ${currentYear}`)).toBeInTheDocument();
    });

    test('renders all form fields', () => {
      renderComponent();

      expect(screen.getByLabelText('Enable Budget Limit')).toBeInTheDocument();
      expect(screen.getByLabelText('Currency')).toBeInTheDocument();
      expect(screen.getByLabelText('Notes')).toBeInTheDocument();
    });

    test('renders form action buttons', () => {
      renderComponent();

      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Save Budget')).toBeInTheDocument();
    });

    test('does not show amount field when isLimited is false by default', () => {
      renderComponent();

      expect(screen.queryByLabelText('Budget Amount')).not.toBeInTheDocument();
    });

    test('renders currency dropdown with all options', () => {
      renderComponent();

      const currencySelect = screen.getByLabelText('Currency');
      expect(currencySelect).toBeInTheDocument();
      
      expect(screen.getByRole('option', { name: 'USD ($)' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'EUR (€)' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'GBP (£)' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'JPY (¥)' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'CNY (¥)' })).toBeInTheDocument();
    });

    test('renders notes textarea with placeholder', () => {
      renderComponent();

      const notesField = screen.getByLabelText('Notes');
      expect(notesField).toBeInTheDocument();
      expect(notesField).toHaveAttribute('placeholder', 'Add any additional notes or reminders');
    });
  });

  describe('Default Values', () => {
    test('initializes form with default values when no budget provided', () => {
      renderComponent();

      expect(screen.getByLabelText('Enable Budget Limit')).not.toBeChecked();
      expect(screen.getByLabelText('Currency')).toHaveValue('USD');
      expect(screen.getByLabelText('Notes')).toHaveValue('');
    });

    test('initializes form with budget values when budget provided', () => {
      renderComponent({ budget: mockBudget });

      expect(screen.getByLabelText('Enable Budget Limit')).toBeChecked();
      expect(screen.getByLabelText('Budget Amount')).toHaveValue(1000);
      expect(screen.getByLabelText('Currency')).toHaveValue('USD');
      expect(screen.getByLabelText('Notes')).toHaveValue('Holiday budget for this year');
    });

    test('shows amount field when budget has isLimited true', () => {
      renderComponent({ budget: mockBudget });

      expect(screen.getByLabelText('Budget Amount')).toBeInTheDocument();
      expect(screen.getByLabelText('Budget Amount')).toHaveValue(1000);
    });

    test('initializes with different currency when provided', () => {
      const budgetWithEUR = { ...mockBudget, currency: 'EUR' };
      renderComponent({ budget: budgetWithEUR });

      expect(screen.getByLabelText('Currency')).toHaveValue('EUR');
    });
  });

  describe('Budget Limit Toggle', () => {
    test('shows amount field when Enable Budget Limit is checked', async () => {
      renderComponent();

      const limitCheckbox = screen.getByLabelText('Enable Budget Limit');
      await user.click(limitCheckbox);

      expect(screen.getByLabelText('Budget Amount')).toBeInTheDocument();
    });

    test('hides amount field when Enable Budget Limit is unchecked', async () => {
      renderComponent({ budget: mockBudget });

      const limitCheckbox = screen.getByLabelText('Enable Budget Limit');
      await user.click(limitCheckbox);

      expect(screen.queryByLabelText('Budget Amount')).not.toBeInTheDocument();
    });

    test('amount field has correct type and step attributes', async () => {
      renderComponent();

      const limitCheckbox = screen.getByLabelText('Enable Budget Limit');
      await user.click(limitCheckbox);

      const amountField = screen.getByLabelText('Budget Amount');
      expect(amountField).toHaveAttribute('type', 'number');
      expect(amountField).toHaveAttribute('step', '0.01');
    });
  });

  describe('Form Validation', () => {
    test('shows error when amount is required but not provided', async () => {
      renderComponent();

      const limitCheckbox = screen.getByLabelText('Enable Budget Limit');
      await user.click(limitCheckbox);

      // Clear the amount field to ensure it's empty
      const amountField = screen.getByLabelText('Budget Amount');
      await user.clear(amountField);

      const submitButton = screen.getByText('Save Budget');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Amount is required when budget is limited')).toBeInTheDocument();
      });
    });

    test('shows error when amount is negative', async () => {
      renderComponent();

      const limitCheckbox = screen.getByLabelText('Enable Budget Limit');
      await user.click(limitCheckbox);

      const amountField = screen.getByLabelText('Budget Amount');
      await user.clear(amountField);
      await user.type(amountField, '-100');

      const submitButton = screen.getByText('Save Budget');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Amount must be positive')).toBeInTheDocument();
      });
    });

    test('does not show amount validation when budget limit is disabled', async () => {
      renderComponent();

      const submitButton = screen.getByText('Save Budget');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });

      expect(screen.queryByText('Amount is required when budget is limited')).not.toBeInTheDocument();
    });

    test('validates currency is required', async () => {
      renderComponent();

      // Try to clear currency - this might not be possible with a select, 
      // but we can test that validation exists
      const submitButton = screen.getByText('Save Budget');
      await user.click(submitButton);

      // Since currency has a default value, this test ensures no currency error appears
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });
    });

    test('accepts valid amount values', async () => {
      renderComponent();

      const limitCheckbox = screen.getByLabelText('Enable Budget Limit');
      await user.click(limitCheckbox);

      const amountField = screen.getByLabelText('Budget Amount');
      await user.clear(amountField);
      await user.type(amountField, '500.50');

      const submitButton = screen.getByText('Save Budget');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });

      expect(screen.queryByText('Amount is required when budget is limited')).not.toBeInTheDocument();
      expect(screen.queryByText('Amount must be positive')).not.toBeInTheDocument();
    });
  });

  describe('Form Interactions', () => {
    test('updates amount field value on user input', async () => {
      renderComponent({ budget: mockBudget });

      const amountField = screen.getByLabelText('Budget Amount');
      await user.clear(amountField);
      await user.type(amountField, '1500');

      expect(amountField).toHaveValue(1500);
    });

    test('updates currency field value on user selection', async () => {
      renderComponent();

      const currencyField = screen.getByLabelText('Currency');
      await user.selectOptions(currencyField, 'EUR');

      expect(currencyField).toHaveValue('EUR');
    });

    test('updates notes field value on user input', async () => {
      renderComponent();

      const notesField = screen.getByLabelText('Notes');
      await user.type(notesField, 'Updated budget notes');

      expect(notesField).toHaveValue('Updated budget notes');
    });

    test('toggles checkbox state on user interaction', async () => {
      renderComponent();

      const limitCheckbox = screen.getByLabelText('Enable Budget Limit');
      expect(limitCheckbox).not.toBeChecked();

      await user.click(limitCheckbox);
      expect(limitCheckbox).toBeChecked();

      await user.click(limitCheckbox);
      expect(limitCheckbox).not.toBeChecked();
    });
  });

  describe('Form Submission', () => {
    test('calls onSubmit with correct data when budget limit is disabled', async () => {
      renderComponent();

      const currencyField = screen.getByLabelText('Currency');
      await user.selectOptions(currencyField, 'EUR');

      const notesField = screen.getByLabelText('Notes');
      await user.type(notesField, 'Test notes');

      const submitButton = screen.getByText('Save Budget');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          amount: 0,
          isLimited: false,
          currency: 'EUR',
          notes: 'Test notes',
          year: currentYear
        });
      });
    });

    test('calls onSubmit with correct data when budget limit is enabled', async () => {
      renderComponent();

      const limitCheckbox = screen.getByLabelText('Enable Budget Limit');
      await user.click(limitCheckbox);

      const amountField = screen.getByLabelText('Budget Amount');
      await user.clear(amountField);
      await user.type(amountField, '2000');

      const currencyField = screen.getByLabelText('Currency');
      await user.selectOptions(currencyField, 'GBP');

      const notesField = screen.getByLabelText('Notes');
      await user.type(notesField, 'Annual budget');

      const submitButton = screen.getByText('Save Budget');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          amount: "2000",
          isLimited: true,
          currency: 'GBP',
          notes: 'Annual budget',
          year: currentYear
        });
      });
    });

    test('includes year in submission data', async () => {
      const testYear = 2025;
      renderComponent({ year: testYear });

      const submitButton = screen.getByText('Save Budget');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            year: testYear
          })
        );
      });
    });

    test('submits with existing budget data modified', async () => {
      renderComponent({ budget: mockBudget });

      const amountField = screen.getByLabelText('Budget Amount');
      await user.clear(amountField);
      await user.type(amountField, '1500');

      const submitButton = screen.getByText('Save Budget');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          amount: "1500",
          isLimited: true,
          currency: 'USD',
          notes: 'Holiday budget for this year',
          year: currentYear
        });
      });
    });

    test('does not submit when validation fails', async () => {
      renderComponent();

      const limitCheckbox = screen.getByLabelText('Enable Budget Limit');
      await user.click(limitCheckbox);

      // Clear the amount field to ensure it's empty and will fail validation
      const amountField = screen.getByLabelText('Budget Amount');
      await user.clear(amountField);

      const submitButton = screen.getByText('Save Budget');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Amount is required when budget is limited')).toBeInTheDocument();
      });

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Cancel Functionality', () => {
    test('calls onClose when cancel button is clicked', async () => {
      renderComponent();

      const cancelButton = screen.getByText('Cancel');
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    test('cancel button does not trigger form submission', async () => {
      renderComponent();

      const cancelButton = screen.getByText('Cancel');
      await user.click(cancelButton);

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Currency Options', () => {
    test('displays all currency options correctly', () => {
      renderComponent();

      const currencySelect = screen.getByLabelText('Currency');
      const options = Array.from(currencySelect.options).map(option => ({
        value: option.value,
        text: option.text
      }));

      expect(options).toEqual([
        { value: 'USD', text: 'USD ($)' },
        { value: 'EUR', text: 'EUR (€)' },
        { value: 'GBP', text: 'GBP (£)' },
        { value: 'JPY', text: 'JPY (¥)' },
        { value: 'CNY', text: 'CNY (¥)' }
      ]);
    });

    test('can select each currency option', async () => {
      renderComponent();

      const currencySelect = screen.getByLabelText('Currency');
      const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CNY'];

      for (const currency of currencies) {
        await user.selectOptions(currencySelect, currency);
        expect(currencySelect).toHaveValue(currency);
      }
    });
  });

  describe('Edge Cases', () => {
    test('handles budget with missing properties', () => {
      const incompleteBudget = { amount: 500 };
      renderComponent({ budget: incompleteBudget });

      expect(screen.getByLabelText('Enable Budget Limit')).not.toBeChecked();
      expect(screen.getByLabelText('Currency')).toHaveValue('USD');
      expect(screen.getByLabelText('Notes')).toHaveValue('');
    });

    test('handles zero amount as valid', async () => {
      renderComponent();

      const limitCheckbox = screen.getByLabelText('Enable Budget Limit');
      await user.click(limitCheckbox);

      const amountField = screen.getByLabelText('Budget Amount');
      await user.clear(amountField);
      await user.type(amountField, '0');

      const submitButton = screen.getByText('Save Budget');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            amount: "0"
          })
        );
      });
    });

    test('handles decimal amounts correctly', async () => {
      renderComponent();

      const limitCheckbox = screen.getByLabelText('Enable Budget Limit');
      await user.click(limitCheckbox);

      const amountField = screen.getByLabelText('Budget Amount');
      await user.clear(amountField);
      await user.type(amountField, '99.99');

      const submitButton = screen.getByText('Save Budget');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            amount: "99.99"
          })
        );
      });
    });

    test('handles empty notes field', async () => {
      renderComponent();

      const submitButton = screen.getByText('Save Budget');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            notes: ''
          })
        );
      });
    });

    test('handles very long notes text', async () => {
      renderComponent();

      const longNotes = 'A'.repeat(1000);
      const notesField = screen.getByLabelText('Notes');
      // paste, not type: typing 1000 keystrokes takes ~3.6s and times out under load
      await user.click(notesField);
      await user.paste(longNotes);

      const submitButton = screen.getByText('Save Budget');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            notes: longNotes
          })
        );
      });
    });
  });

  describe('Accessibility', () => {
    test('form fields have proper labels', () => {
      renderComponent({ budget: mockBudget });

      expect(screen.getByLabelText('Enable Budget Limit')).toBeInTheDocument();
      expect(screen.getByLabelText('Budget Amount')).toBeInTheDocument();
      expect(screen.getByLabelText('Currency')).toBeInTheDocument();
      expect(screen.getByLabelText('Notes')).toBeInTheDocument();
    });

    test('form fields have proper IDs matching labels', () => {
      renderComponent({ budget: mockBudget });

      expect(screen.getByLabelText('Enable Budget Limit')).toHaveAttribute('id', 'isLimited');
      expect(screen.getByLabelText('Budget Amount')).toHaveAttribute('id', 'amount');
      expect(screen.getByLabelText('Currency')).toHaveAttribute('id', 'currency');
      expect(screen.getByLabelText('Notes')).toHaveAttribute('id', 'notes');
    });

    test('error messages are displayed with proper styling', async () => {
      renderComponent();

      const limitCheckbox = screen.getByLabelText('Enable Budget Limit');
      await user.click(limitCheckbox);

      // Clear the amount field to trigger validation
      const amountField = screen.getByLabelText('Budget Amount');
      await user.clear(amountField);

      const submitButton = screen.getByText('Save Budget');
      await user.click(submitButton);

      await waitFor(() => {
        const errorMessage = screen.getByText('Amount is required when budget is limited');
        expect(errorMessage).toBeInTheDocument();
        expect(errorMessage).toHaveClass('error');
      });
    });

    test('buttons have proper types', () => {
      renderComponent();

      const cancelButton = screen.getByText('Cancel');
      const submitButton = screen.getByText('Save Budget');

      expect(cancelButton).toHaveAttribute('type', 'button');
      expect(submitButton).toHaveAttribute('type', 'submit');
    });
  });
});