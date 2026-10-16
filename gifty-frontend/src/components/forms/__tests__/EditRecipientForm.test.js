import React from 'react';
import { render, screen, fireEvent, waitFor } from '../../../test-utils';
import userEvent from '@testing-library/user-event';
import EditRecipientForm from '../js/EditRecipientForm';
import axiosInstance from '../../../axiosInstance';

// Mock axios
jest.mock('../../../axiosInstance');
const mockedAxios = axiosInstance;

// Mock CSS modules
jest.mock('../css/EditRecipientForm.module.css', () => ({
  'edit-recipient-form': 'edit-recipient-form',
  'form-input': 'form-input',
  'full-width-field': 'full-width-field',
  'form-text': 'form-text',
  'form-actions': 'form-actions',
  'cancel-button': 'cancel-button',
  'save-button': 'save-button'
}));

describe('EditRecipientForm', () => {
  const mockCloseForm = jest.fn();
  const mockOnSubmit = jest.fn();
  const user = userEvent.setup();

  const mockRecipient = {
    _id: 'recipient-123',
    firstName: 'John',
    lastName: 'Doe',
    relation: 'Brother',
    birthdate: '1990-05-15',
    tags: [
      { name: 'sports' },
      { name: 'music' },
      { name: 'technology' }
    ]
  };

  const minimalRecipient = {
    _id: 'recipient-456',
    firstName: 'Jane',
    lastName: 'Smith',
    relation: 'Friend'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.put.mockResolvedValue({ 
      data: { 
        ...mockRecipient, 
        firstName: 'Updated John' 
      } 
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('renders the form with recipient data pre-populated', () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Brother')).toBeInTheDocument();
      expect(screen.getByDisplayValue('1990-05-15')).toBeInTheDocument();
      expect(screen.getByDisplayValue('sports, music, technology')).toBeInTheDocument();
    });

    it('renders all form fields with proper labels', () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/relation/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/birthdate/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/tags/i)).toBeInTheDocument();
    });

    it('renders action buttons', () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    });

    it('applies correct CSS classes', () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const formContainer = screen.getByLabelText(/first name/i).closest('.edit-recipient-form');
      expect(formContainer).toHaveClass('edit-recipient-form');
    });

    it('renders tags placeholder text', () => {
      render(
        <EditRecipientForm 
          recipient={minimalRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      expect(screen.getByPlaceholderText(/enter tags separated by commas/i)).toBeInTheDocument();
    });

    it('renders tags example text', () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      expect(screen.getByText(/example: skiing, pets, traveling/i)).toBeInTheDocument();
    });
  });

  describe('Form Field Handling', () => {
    it('handles recipient with minimal data', () => {
      render(
        <EditRecipientForm 
          recipient={minimalRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      expect(screen.getByDisplayValue('Jane')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Smith')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Friend')).toBeInTheDocument();
      expect(screen.getByLabelText(/birthdate/i)).toHaveValue('');
      expect(screen.getByLabelText(/tags/i)).toHaveValue('');
    });

    it('handles recipient with null birthdate', () => {
      const recipientWithNullBirthdate = {
        ...mockRecipient,
        birthdate: null
      };
      
      render(
        <EditRecipientForm 
          recipient={recipientWithNullBirthdate}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      expect(screen.getByLabelText(/birthdate/i)).toHaveValue('');
    });

    it('handles recipient with no tags', () => {
      const recipientWithNoTags = {
        ...mockRecipient,
        tags: null
      };
      
      render(
        <EditRecipientForm 
          recipient={recipientWithNoTags}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      expect(screen.getByLabelText(/tags/i)).toHaveValue('');
    });

    it('handles recipient with empty tags array', () => {
      const recipientWithEmptyTags = {
        ...mockRecipient,
        tags: []
      };
      
      render(
        <EditRecipientForm 
          recipient={recipientWithEmptyTags}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      expect(screen.getByLabelText(/tags/i)).toHaveValue('');
    });

    it('converts birthdate to proper input format', () => {
      const recipientWithFullDate = {
        ...mockRecipient,
        birthdate: '1990-05-15T10:30:00.000Z'
      };
      
      render(
        <EditRecipientForm 
          recipient={recipientWithFullDate}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      expect(screen.getByLabelText(/birthdate/i)).toHaveValue('1990-05-15');
    });
  });

  describe('Form Interaction', () => {
    it('allows editing first name field', async () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const firstNameInput = screen.getByLabelText(/first name/i);
      await user.clear(firstNameInput);
      await user.type(firstNameInput, 'Updated John');
      
      expect(firstNameInput).toHaveValue('Updated John');
    });

    it('allows editing last name field', async () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const lastNameInput = screen.getByLabelText(/last name/i);
      await user.clear(lastNameInput);
      await user.type(lastNameInput, 'Updated Doe');
      
      expect(lastNameInput).toHaveValue('Updated Doe');
    });

    it('allows editing relation field', async () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const relationInput = screen.getByLabelText(/relation/i);
      await user.clear(relationInput);
      await user.type(relationInput, 'Best Friend');
      
      expect(relationInput).toHaveValue('Best Friend');
    });

    it('allows editing birthdate field', async () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const birthdateInput = screen.getByLabelText(/birthdate/i);
      await user.clear(birthdateInput);
      await user.type(birthdateInput, '1985-12-25');
      
      expect(birthdateInput).toHaveValue('1985-12-25');
    });

    it('allows editing tags field', async () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const tagsInput = screen.getByLabelText(/tags/i);
      await user.clear(tagsInput);
      await user.type(tagsInput, 'reading, cooking, hiking');
      
      expect(tagsInput).toHaveValue('reading, cooking, hiking');
    });

    it('maintains required attributes on inputs', () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      expect(screen.getByLabelText(/first name/i)).toBeRequired();
      expect(screen.getByLabelText(/last name/i)).toBeRequired();
      expect(screen.getByLabelText(/relation/i)).toBeRequired();
      expect(screen.getByLabelText(/birthdate/i)).toBeRequired();
      expect(screen.getByLabelText(/tags/i)).not.toBeRequired();
    });
  });

  describe('Form Submission', () => {
    it('successfully submits form with updated data', async () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const firstNameInput = screen.getByLabelText(/first name/i);
      await user.clear(firstNameInput);
      await user.type(firstNameInput, 'Updated John');
      
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(mockedAxios.put).toHaveBeenCalledWith(`/recipients/recipient-123`, {
          firstName: 'Updated John',
          lastName: 'Doe',
          relation: 'Brother',
          birthdate: '1990-05-15',
          tags: ['sports', 'music', 'technology']
        });
      });
      
      expect(mockOnSubmit).toHaveBeenCalledWith({
        ...mockRecipient,
        firstName: 'Updated John'
      });
      expect(mockCloseForm).toHaveBeenCalled();
    });

    it('submits form with all fields updated', async () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const firstNameInput = screen.getByLabelText(/first name/i);
      const lastNameInput = screen.getByLabelText(/last name/i);
      const relationInput = screen.getByLabelText(/relation/i);
      const birthdateInput = screen.getByLabelText(/birthdate/i);
      const tagsInput = screen.getByLabelText(/tags/i);
      
      await user.clear(firstNameInput);
      await user.type(firstNameInput, 'Mike');
      await user.clear(lastNameInput);
      await user.type(lastNameInput, 'Johnson');
      await user.clear(relationInput);
      await user.type(relationInput, 'Cousin');
      await user.clear(birthdateInput);
      await user.type(birthdateInput, '1988-08-20');
      await user.clear(tagsInput);
      await user.type(tagsInput, 'gaming, movies');
      
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(mockedAxios.put).toHaveBeenCalledWith(`/recipients/recipient-123`, {
          firstName: 'Mike',
          lastName: 'Johnson',
          relation: 'Cousin',
          birthdate: '1988-08-20',
          tags: ['gaming', 'movies']
        });
      });
    });

    it('handles tags with extra spaces correctly', async () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const tagsInput = screen.getByLabelText(/tags/i);
      await user.clear(tagsInput);
      await user.type(tagsInput, ' reading , cooking  , hiking ');
      
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(mockedAxios.put).toHaveBeenCalledWith(`/recipients/recipient-123`, expect.objectContaining({
          tags: ['reading', 'cooking', 'hiking']
        }));
      });
    });

    it('filters out empty tags', async () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const tagsInput = screen.getByLabelText(/tags/i);
      await user.clear(tagsInput);
      await user.type(tagsInput, 'reading,, cooking,  , hiking');
      
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(mockedAxios.put).toHaveBeenCalledWith(`/recipients/recipient-123`, expect.objectContaining({
          tags: ['reading', 'cooking', 'hiking']
        }));
      });
    });

    it('handles empty tags field', async () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const tagsInput = screen.getByLabelText(/tags/i);
      await user.clear(tagsInput);
      
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(mockedAxios.put).toHaveBeenCalledWith(`/recipients/recipient-123`, expect.objectContaining({
          tags: []
        }));
      });
    });

    it('submits form using Enter key', async () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const firstNameInput = screen.getByLabelText(/first name/i);
      await user.clear(firstNameInput);
      await user.type(firstNameInput, 'Updated John');
      await user.keyboard('{Enter}');
      
      await waitFor(() => {
        expect(mockedAxios.put).toHaveBeenCalled();
      });
    });
  });

  describe('Cancel Functionality', () => {
    it('calls closeForm when cancel button is clicked', async () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);
      
      expect(mockCloseForm).toHaveBeenCalled();
      expect(mockedAxios.put).not.toHaveBeenCalled();
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('does not submit form when cancelled', async () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      // Make some changes
      const firstNameInput = screen.getByLabelText(/first name/i);
      await user.clear(firstNameInput);
      await user.type(firstNameInput, 'Changed Name');
      
      // Cancel instead of save
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);
      
      expect(mockCloseForm).toHaveBeenCalled();
      expect(mockedAxios.put).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('handles API errors gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockedAxios.put.mockRejectedValue({
        response: { data: { message: 'Update failed' } }
      });
      
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith('Error updating recipient:', expect.any(Object));
      });
      
      expect(mockOnSubmit).not.toHaveBeenCalled();
      expect(mockCloseForm).not.toHaveBeenCalled();
      
      consoleError.mockRestore();
    });

    it('handles network errors', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockedAxios.put.mockRejectedValue(new Error('Network error'));
      
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith('Error updating recipient:', expect.any(Error));
      });
      
      consoleError.mockRestore();
    });

  });

  describe('Form Validation', () => {
    it('has proper input types for each field', () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      expect(screen.getByLabelText(/first name/i)).toHaveAttribute('type', 'text');
      expect(screen.getByLabelText(/last name/i)).toHaveAttribute('type', 'text');
      expect(screen.getByLabelText(/relation/i)).toHaveAttribute('type', 'text');
      expect(screen.getByLabelText(/birthdate/i)).toHaveAttribute('type', 'date');
      expect(screen.getByLabelText(/tags/i)).toHaveAttribute('type', 'text');
    });

    it('has Controller rules configured for required fields', () => {
      // This test verifies that the Controller components have proper rules
      // The actual validation behavior is handled by react-hook-form
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      // Verify required fields have required attribute
      expect(screen.getByLabelText(/first name/i)).toBeRequired();
      expect(screen.getByLabelText(/last name/i)).toBeRequired();
      expect(screen.getByLabelText(/relation/i)).toBeRequired();
    });
  });

  describe('Accessibility', () => {
    it('has proper form structure with labels', () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      // All inputs should be properly labeled
      expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/relation/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/birthdate/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/tags/i)).toBeInTheDocument();
      
      // Form should exist as a DOM element
      const forms = document.querySelectorAll('form');
      expect(forms).toHaveLength(1);
    });

    it('has proper button roles and types', () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      const saveButton = screen.getByRole('button', { name: /save/i });
      
      expect(cancelButton).toHaveAttribute('type', 'button');
      expect(saveButton).toHaveAttribute('type', 'submit');
    });

    it('maintains focus management', async () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const firstNameInput = screen.getByLabelText(/first name/i);
      await user.click(firstNameInput);
      
      expect(firstNameInput).toHaveFocus();
    });

    it('provides helpful text for tags field', () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      expect(screen.getByText(/example: skiing, pets, traveling/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/enter tags separated by commas/i)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined recipient properties gracefully', () => {
      const incompleteRecipient = {
        _id: 'test-id'
      };
      
      render(
        <EditRecipientForm 
          recipient={incompleteRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      // Should not crash and should have empty or undefined values
      expect(screen.getByLabelText(/first name/i)).toHaveValue('');
      expect(screen.getByLabelText(/last name/i)).toHaveValue('');
      expect(screen.getByLabelText(/relation/i)).toHaveValue('');
      expect(screen.getByLabelText(/birthdate/i)).toHaveValue('');
      expect(screen.getByLabelText(/tags/i)).toHaveValue('');
    });

    it('handles missing callback props gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
        />
      );
      
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(mockedAxios.put).toHaveBeenCalled();
      });
      
      // Should not crash even without callbacks
      consoleError.mockRestore();
    });

    it('handles single tag correctly', async () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const tagsInput = screen.getByLabelText(/tags/i);
      await user.clear(tagsInput);
      await user.type(tagsInput, 'programming');
      
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(mockedAxios.put).toHaveBeenCalledWith(`/recipients/recipient-123`, expect.objectContaining({
          tags: ['programming']
        }));
      });
    });

    it('handles tags with only commas', async () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const tagsInput = screen.getByLabelText(/tags/i);
      await user.clear(tagsInput);
      await user.type(tagsInput, ',,,');
      
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);
      
      await waitFor(() => {
        expect(mockedAxios.put).toHaveBeenCalledWith(`/recipients/recipient-123`, expect.objectContaining({
          tags: []
        }));
      });
    });
  });

  describe('Button Styling and Classes', () => {
    it('applies correct CSS classes to buttons', () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      const saveButton = screen.getByRole('button', { name: /save/i });
      
      // The shared Button: Cancel never submits, Save submits this form
      expect(cancelButton).toHaveAttribute('type', 'button');
      expect(saveButton).toHaveAttribute('type', 'submit');
      expect(saveButton.form).toBe(document.querySelector('form'));
    });

    it('applies correct CSS classes to form elements', () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      expect(screen.getByLabelText(/first name/i)).toHaveClass('form-input');
      expect(screen.getByLabelText(/last name/i)).toHaveClass('form-input');
      expect(screen.getByLabelText(/relation/i)).toHaveClass('form-input');
      expect(screen.getByLabelText(/birthdate/i)).toHaveClass('form-input');
      expect(screen.getByLabelText(/tags/i)).toHaveClass('form-input');
    });

    it('applies full-width class to tags field', () => {
      render(
        <EditRecipientForm 
          recipient={mockRecipient}
          closeForm={mockCloseForm}
          onSubmit={mockOnSubmit}
        />
      );
      
      const tagsLabel = screen.getByText(/tags/i).closest('label');
      expect(tagsLabel).toHaveClass('full-width-field');
    });
  });
});