import React from 'react';
import { render, screen, fireEvent, waitFor } from '../../../test-utils';
import userEvent from '@testing-library/user-event';
import AddRecipientForm from '../js/AddRecipientForm';

// Mock CSS modules
jest.mock('../css/AddRecipientForm.module.css', () => ({
  'event-form-container': 'event-form-container',
  'event-form': 'event-form',
  'form-group': 'form-group',
  'form-actions': 'form-actions',
  'error': 'error'
}));

describe('AddRecipientForm Component', () => {
  // Mock functions
  const mockOnSubmit = jest.fn();
  const mockOnCancel = jest.fn();

  const defaultProps = {
    onSubmit: mockOnSubmit,
    onCancel: mockOnCancel
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render without crashing', () => {
      render(<AddRecipientForm {...defaultProps} />);
      
      expect(screen.getByRole('heading', { name: 'Add Recipient' })).toBeInTheDocument();
    });

    it('should render all form fields', () => {
      render(<AddRecipientForm {...defaultProps} />);
      
      // Check for all form inputs
      expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/relation/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/birthdate/i)).toBeInTheDocument();
    });

    it('should render action buttons', () => {
      render(<AddRecipientForm {...defaultProps} />);
      
      expect(screen.getByRole('button', { name: /add recipient/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('should render relation dropdown with all options', () => {
      render(<AddRecipientForm {...defaultProps} />);
      
      expect(screen.getByRole('option', { name: /select a relation/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /family/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /friend/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /colleague/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /other/i })).toBeInTheDocument();
    });
  });

  describe('Form Interactions', () => {
    it('should update first name field on user input', async () => {
      const user = userEvent.setup();
      render(<AddRecipientForm {...defaultProps} />);
      
      const firstNameInput = screen.getByLabelText(/first name/i);
      await user.type(firstNameInput, 'John');
      
      expect(firstNameInput).toHaveValue('John');
    });

    it('should update last name field on user input', async () => {
      const user = userEvent.setup();
      render(<AddRecipientForm {...defaultProps} />);
      
      const lastNameInput = screen.getByLabelText(/last name/i);
      await user.type(lastNameInput, 'Doe');
      
      expect(lastNameInput).toHaveValue('Doe');
    });

    it('should handle relation selection', async () => {
      const user = userEvent.setup();
      render(<AddRecipientForm {...defaultProps} />);
      
      const relationSelect = screen.getByLabelText(/relation/i);
      await user.selectOptions(relationSelect, 'Family');
      
      expect(relationSelect).toHaveValue('Family');
    });

    it('should update birthdate field on user input', async () => {
      const user = userEvent.setup();
      render(<AddRecipientForm {...defaultProps} />);
      
      const birthdateInput = screen.getByLabelText(/birthdate/i);
      await user.type(birthdateInput, '1990-05-15');
      
      expect(birthdateInput).toHaveValue('1990-05-15');
    });
  });

  describe('Form Validation', () => {
    it('should show validation errors for empty required fields on submit', async () => {
      const user = userEvent.setup();
      render(<AddRecipientForm {...defaultProps} />);
      
      // Try to submit empty form
      await user.click(screen.getByRole('button', { name: /add recipient/i }));
      
      // Check for validation errors
      await waitFor(() => {
        expect(screen.getByText('First name is required')).toBeInTheDocument();
        expect(screen.getByText('Last name is required')).toBeInTheDocument();
        expect(screen.getByText('Relation is required')).toBeInTheDocument();
        expect(screen.getByText('Birthdate is required')).toBeInTheDocument();
      });
      
      // onSubmit should not have been called
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('ties each error to its field and focuses the first invalid one', async () => {
      const user = userEvent.setup();
      render(<AddRecipientForm {...defaultProps} />);
      await user.type(screen.getByLabelText(/first name/i), 'Ann');

      await user.click(screen.getByRole('button', { name: /add recipient/i }));

      const errorFor = (field) => document.getElementById(field.getAttribute('aria-describedby'));
      const lastName = screen.getByLabelText(/last name/i);
      expect(screen.getByLabelText(/first name/i)).not.toHaveAttribute('aria-invalid');
      expect(lastName).toHaveAttribute('aria-invalid', 'true');
      expect(errorFor(lastName)).toHaveTextContent('Last name is required');
      expect(errorFor(screen.getByLabelText(/relation/i))).toHaveTextContent('Relation is required');
      expect(errorFor(screen.getByLabelText(/birthdate/i))).toHaveTextContent('Birthdate is required');
      expect(lastName).toHaveFocus();
    });

    it('should clear validation errors when user starts typing', async () => {
      const user = userEvent.setup();
      render(<AddRecipientForm {...defaultProps} />);
      
      // Trigger validation errors
      await user.click(screen.getByRole('button', { name: /add recipient/i }));
      
      await waitFor(() => {
        expect(screen.getByText('First name is required')).toBeInTheDocument();
      });
      
      // Start typing in first name field
      const firstNameInput = screen.getByLabelText(/first name/i);
      await user.type(firstNameInput, 'John');
      
      // Error should be cleared
      expect(screen.queryByText('First name is required')).not.toBeInTheDocument();
    });

    it('should validate whitespace-only input as empty', async () => {
      const user = userEvent.setup();
      render(<AddRecipientForm {...defaultProps} />);
      
      // Fill fields with whitespace only
      await user.type(screen.getByLabelText(/first name/i), '   ');
      await user.type(screen.getByLabelText(/last name/i), '   ');
      await user.selectOptions(screen.getByLabelText(/relation/i), '');
      
      // Try to submit
      await user.click(screen.getByRole('button', { name: /add recipient/i }));
      
      // Should show validation errors
      await waitFor(() => {
        expect(screen.getByText('First name is required')).toBeInTheDocument();
        expect(screen.getByText('Last name is required')).toBeInTheDocument();
      });
    });

    it('should not show validation errors for valid form data', async () => {
      const user = userEvent.setup();
      render(<AddRecipientForm {...defaultProps} />);
      
      // Fill valid form data
      await user.type(screen.getByLabelText(/first name/i), 'John');
      await user.type(screen.getByLabelText(/last name/i), 'Doe');
      await user.selectOptions(screen.getByLabelText(/relation/i), 'Family');
      await user.type(screen.getByLabelText(/birthdate/i), '1990-05-15');
      
      // Submit form
      await user.click(screen.getByRole('button', { name: /add recipient/i }));
      
      // Should not show validation errors
      expect(screen.queryByText('First name is required')).not.toBeInTheDocument();
      expect(screen.queryByText('Last name is required')).not.toBeInTheDocument();
      expect(screen.queryByText('Relation is required')).not.toBeInTheDocument();
      expect(screen.queryByText('Birthdate is required')).not.toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('should call onSubmit with correct data when form is valid', async () => {
      const user = userEvent.setup();
      render(<AddRecipientForm {...defaultProps} />);
      
      // Fill valid form data
      await user.type(screen.getByLabelText(/first name/i), 'John');
      await user.type(screen.getByLabelText(/last name/i), 'Doe');
      await user.selectOptions(screen.getByLabelText(/relation/i), 'Family');
      await user.type(screen.getByLabelText(/birthdate/i), '1990-05-15');
      
      // Submit form
      await user.click(screen.getByRole('button', { name: /add recipient/i }));
      
      // Should call onSubmit with form data
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          firstName: 'John',
          lastName: 'Doe',
          relation: 'Family',
          birthdate: '1990-05-15'
        });
      });
    });

    it('should reset form after successful submission', async () => {
      const user = userEvent.setup();
      mockOnSubmit.mockResolvedValue(); // Simulate successful submission
      render(<AddRecipientForm {...defaultProps} />);
      
      // Fill and submit form
      await user.type(screen.getByLabelText(/first name/i), 'John');
      await user.type(screen.getByLabelText(/last name/i), 'Doe');
      await user.selectOptions(screen.getByLabelText(/relation/i), 'Family');
      await user.type(screen.getByLabelText(/birthdate/i), '1990-05-15');
      
      await user.click(screen.getByRole('button', { name: /add recipient/i }));
      
      // Form should be reset
      await waitFor(() => {
        expect(screen.getByLabelText(/first name/i)).toHaveValue('');
        expect(screen.getByLabelText(/last name/i)).toHaveValue('');
        expect(screen.getByLabelText(/relation/i)).toHaveValue('');
        expect(screen.getByLabelText(/birthdate/i)).toHaveValue('');
      });
    });

    it('should handle submission error gracefully', async () => {
      const user = userEvent.setup();
      const errorMessage = 'Network error';
      mockOnSubmit.mockRejectedValue(new Error(errorMessage));
      render(<AddRecipientForm {...defaultProps} />);
      
      // Fill and submit form
      await user.type(screen.getByLabelText(/first name/i), 'John');
      await user.type(screen.getByLabelText(/last name/i), 'Doe');
      await user.selectOptions(screen.getByLabelText(/relation/i), 'Family');
      await user.type(screen.getByLabelText(/birthdate/i), '1990-05-15');
      
      await user.click(screen.getByRole('button', { name: /add recipient/i }));
      
      // Should show error message
      await waitFor(() => {
        expect(screen.getByText('Failed to add recipient. Please try again.')).toBeInTheDocument();
      });
      
      // Form should not be reset on error
      expect(screen.getByLabelText(/first name/i)).toHaveValue('John');
      expect(screen.getByLabelText(/last name/i)).toHaveValue('Doe');
    });

    it('should call onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<AddRecipientForm {...defaultProps} />);
      
      await user.click(screen.getByRole('button', { name: /cancel/i }));
      
      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing onSubmit prop gracefully', async () => {
      const user = userEvent.setup();
      const propsWithoutOnSubmit = { onCancel: mockOnCancel };
      
      expect(() => {
        render(<AddRecipientForm {...propsWithoutOnSubmit} />);
      }).not.toThrow();
    });

    it('should handle missing onCancel prop gracefully', async () => {
      const user = userEvent.setup();
      const propsWithoutOnCancel = { onSubmit: mockOnSubmit };
      
      expect(() => {
        render(<AddRecipientForm {...propsWithoutOnCancel} />);
      }).not.toThrow();
    });

    it('should trim whitespace from input values before validation', async () => {
      const user = userEvent.setup();
      render(<AddRecipientForm {...defaultProps} />);
      
      // Fill with values that have leading/trailing spaces
      await user.type(screen.getByLabelText(/first name/i), '  John  ');
      await user.type(screen.getByLabelText(/last name/i), '  Doe  ');
      await user.selectOptions(screen.getByLabelText(/relation/i), 'Family');
      await user.type(screen.getByLabelText(/birthdate/i), '1990-05-15');
      
      await user.click(screen.getByRole('button', { name: /add recipient/i }));
      
      // Should not show validation errors (whitespace should be trimmed)
      expect(screen.queryByText('First name is required')).not.toBeInTheDocument();
      expect(screen.queryByText('Last name is required')).not.toBeInTheDocument();
    });

    it('should handle special characters in names', async () => {
      const user = userEvent.setup();
      render(<AddRecipientForm {...defaultProps} />);
      
      // Fill with names containing special characters
      await user.type(screen.getByLabelText(/first name/i), "José-María");
      await user.type(screen.getByLabelText(/last name/i), "O'Connor");
      await user.selectOptions(screen.getByLabelText(/relation/i), 'Family');
      await user.type(screen.getByLabelText(/birthdate/i), '1990-05-15');
      
      await user.click(screen.getByRole('button', { name: /add recipient/i }));
      
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          firstName: "José-María",
          lastName: "O'Connor",
          relation: 'Family',
          birthdate: '1990-05-15'
        });
      });
    });
  });
});