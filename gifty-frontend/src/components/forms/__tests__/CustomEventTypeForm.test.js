import React from 'react';
import { render, screen, fireEvent, waitFor } from '../../../test-utils';
import userEvent from '@testing-library/user-event';
import CustomEventTypeForm from '../js/CustomEventTypeForm';
import axiosInstance from '../../../axiosInstance';

// Mock axios
jest.mock('../../../axiosInstance');
const mockedAxios = axiosInstance;

// Mock CSS modules
jest.mock('../css/CustomEventTypeForm.module.css', () => ({
  formContainer: 'formContainer',
  formHeader: 'formHeader',
  closeButton: 'closeButton',
  formGroup: 'formGroup',
  fieldError: 'fieldError',
  errorMessage: 'errorMessage',
  formActions: 'formActions',
  cancelButton: 'cancelButton',
  submitButton: 'submitButton'
}));

// Mock FontAwesome
jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: ({ icon, ...props }) => <span data-testid="fa-icon" data-icon={icon.iconName} {...props} />
}));

jest.mock('@fortawesome/free-solid-svg-icons', () => ({
  faTimes: { iconName: 'times' }
}));

describe('CustomEventTypeForm', () => {
  const mockOnClose = jest.fn();
  const mockOnSuccess = jest.fn();
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ data: {} });
    mockedAxios.put.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('renders the form for creating a new event type', () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      expect(screen.getByRole('heading', { name: /create custom event type/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('renders the form for editing an existing event type', () => {
      const eventType = {
        _id: 'test-id',
        name: 'Test Event',
        description: 'Test Description'
      };

      render(
        <CustomEventTypeForm 
          onClose={mockOnClose} 
          onSuccess={mockOnSuccess} 
          eventType={eventType} 
        />
      );
      
      expect(screen.getByRole('heading', { name: /edit custom event type/i })).toBeInTheDocument();
      expect(screen.getByDisplayValue('Test Event')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Test Description')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
    });

    it('renders close button with correct icon', () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const closeButton = screen.getByRole('button', { name: /close/i });
      expect(closeButton).toBeInTheDocument();
      
      const icon = screen.getByTestId('fa-icon');
      expect(icon).toHaveAttribute('data-icon', 'times');
    });

    it('applies correct CSS classes', () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const container = screen.getByRole('heading').closest('.formContainer');
      expect(container).toHaveClass('formContainer');
    });
  });

  describe('Form Interaction', () => {
    it('handles name input changes', async () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'Anniversary');
      
      expect(nameInput).toHaveValue('Anniversary');
    });

    it('handles description input changes', async () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const descriptionInput = screen.getByLabelText(/description/i);
      await user.type(descriptionInput, 'Wedding anniversary celebration');
      
      expect(descriptionInput).toHaveValue('Wedding anniversary celebration');
    });

    it('allows clearing input fields', async () => {
      const eventType = {
        _id: 'test-id',
        name: 'Test Event',
        description: 'Test Description'
      };

      render(
        <CustomEventTypeForm 
          onClose={mockOnClose} 
          onSuccess={mockOnSuccess} 
          eventType={eventType} 
        />
      );
      
      const nameInput = screen.getByLabelText(/name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'New Name');
      
      expect(nameInput).toHaveValue('New Name');
    });

    it('handles textarea resize appropriately', () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const textarea = screen.getByLabelText(/description/i);
      expect(textarea).toHaveAttribute('rows', '3');
    });
  });

  describe('Form Validation', () => {
    it('shows required field error for empty name', async () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/name is required/i)).toBeInTheDocument();
      });
    });

    it('treats a name of only spaces as empty', async () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);

      await user.type(screen.getByLabelText(/name/i), '   ');
      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(screen.getByText(/name is required/i)).toBeInTheDocument();
      });
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('validates name length does not exceed 50 characters', async () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const nameInput = screen.getByLabelText(/name/i);
      const longName = 'a'.repeat(51);
      
      await user.type(nameInput, longName);
      
      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/name cannot exceed 50 characters/i)).toBeInTheDocument();
      });
    });

    it('validates description length does not exceed 200 characters', async () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const nameInput = screen.getByLabelText(/name/i);
      const descriptionInput = screen.getByLabelText(/description/i);
      const longDescription = 'a'.repeat(201);
      
      await user.type(nameInput, 'Valid Name');
      await user.type(descriptionInput, longDescription);
      
      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/description cannot exceed 200 characters/i)).toBeInTheDocument();
      });
    });

    it('allows form submission with valid data and empty description', async () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'Anniversary');
      
      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith('/eventTypes', {
          name: 'Anniversary',
          description: '',
          isCustom: true
        });
      });
    });

    it('shows field error styling for validation errors', async () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        const errorSpan = screen.getByText(/name is required/i);
        expect(errorSpan).toHaveClass('fieldError');
      });
    });
  });

  describe('Form Submission', () => {
    it('successfully creates a new event type', async () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const nameInput = screen.getByLabelText(/name/i);
      const descriptionInput = screen.getByLabelText(/description/i);
      
      await user.type(nameInput, 'Anniversary');
      await user.type(descriptionInput, 'Wedding anniversary celebration');
      
      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith('/eventTypes', {
          name: 'Anniversary',
          description: 'Wedding anniversary celebration',
          isCustom: true
        });
      });
      
      expect(mockOnSuccess).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('successfully updates an existing event type', async () => {
      const eventType = {
        _id: 'test-id-123',
        name: 'Original Name',
        description: 'Original Description'
      };

      render(
        <CustomEventTypeForm 
          onClose={mockOnClose} 
          onSuccess={mockOnSuccess} 
          eventType={eventType} 
        />
      );
      
      const nameInput = screen.getByLabelText(/name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Name');
      
      const submitButton = screen.getByRole('button', { name: /update/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockedAxios.put).toHaveBeenCalledWith('/eventTypes/test-id-123', {
          name: 'Updated Name',
          description: 'Original Description',
          isCustom: true
        });
      });
      
      expect(mockOnSuccess).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('shows loading state during submission', async () => {
      // Mock a delayed response
      mockedAxios.post.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'Test Event');
      
      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);
      
      // Should show loading state
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
      });
      
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });
    });

    it('disables submit button during submission', async () => {
      mockedAxios.post.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'Test Event');
      
      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
      });
      
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });
    });

    it('includes isCustom flag in submission data', async () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'Custom Event');
      
      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith('/eventTypes', {
          name: 'Custom Event',
          description: '',
          isCustom: true
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error message when submission fails', async () => {
      const errorMessage = 'Event type already exists';
      mockedAxios.post.mockRejectedValue({
        response: { data: { message: errorMessage } }
      });
      
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'Duplicate Event');
      
      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('displays generic error message when no specific error is provided', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Network error'));
      
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'Test Event');
      
      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText(/an error occurred while saving the event type/i)).toBeInTheDocument();
      });
    });

    it('applies error message styling', async () => {
      mockedAxios.post.mockRejectedValue({
        response: { data: { message: 'Test error' } }
      });
      
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'Test Event');
      
      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        const errorDiv = screen.getByText('Test error');
        expect(errorDiv).toHaveClass('errorMessage');
      });
    });

    it('clears error message on subsequent submission attempts', async () => {
      mockedAxios.post
        .mockRejectedValueOnce({
          response: { data: { message: 'First error' } }
        })
        .mockResolvedValueOnce({ data: {} });
      
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'Test Event');
      
      const submitButton = screen.getByRole('button', { name: /create/i });
      
      // First submission fails
      await user.click(submitButton);
      await waitFor(() => {
        expect(screen.getByText('First error')).toBeInTheDocument();
      });
      
      // Second submission succeeds
      await user.click(submitButton);
      await waitFor(() => {
        expect(screen.queryByText('First error')).not.toBeInTheDocument();
      });
    });

    it('re-enables submit button after error', async () => {
      mockedAxios.post.mockRejectedValue({
        response: { data: { message: 'Error' } }
      });
      
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'Test Event');
      
      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByText('Error')).toBeInTheDocument();
      });
      
      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('Cancel and Close Actions', () => {
    it('calls onClose when cancel button is clicked', async () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);
      
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when close (X) button is clicked', async () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);
      
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('does not call onSuccess when cancelled', async () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);
      
      expect(mockOnSuccess).not.toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has proper form labels associated with inputs', () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const nameInput = screen.getByLabelText(/name/i);
      const descriptionInput = screen.getByLabelText(/description/i);
      
      expect(nameInput).toHaveAttribute('id', 'name');
      expect(descriptionInput).toHaveAttribute('id', 'description');
    });

    it('has accessible close button with aria-label', () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const closeButton = screen.getByRole('button', { name: /close/i });
      expect(closeButton).toHaveAttribute('aria-label', 'Close');
    });

    it('maintains focus management during interactions', async () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const nameInput = screen.getByLabelText(/name/i);
      await user.click(nameInput);
      
      expect(nameInput).toHaveFocus();
    });

    it('provides proper button roles and states', () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const submitButton = screen.getByRole('button', { name: /create/i });
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      const closeButton = screen.getByRole('button', { name: /close/i });
      
      expect(submitButton).toHaveAttribute('type', 'submit');
      expect(cancelButton).toHaveAttribute('type', 'button');
      expect(closeButton).toHaveAttribute('type', 'button');
    });
  });

  describe('Edge Cases', () => {
    it('handles missing onSuccess callback gracefully', async () => {
      render(<CustomEventTypeForm onClose={mockOnClose} />);
      
      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'Test Event');
      
      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });
      
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('handles missing onClose callback gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      render(<CustomEventTypeForm onSuccess={mockOnSuccess} />);
      
      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'Test Event');
      
      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });
      
      expect(mockOnSuccess).toHaveBeenCalled();
      
      consoleError.mockRestore();
    });

    it('handles null eventType gracefully', () => {
      render(
        <CustomEventTypeForm 
          onClose={mockOnClose} 
          onSuccess={mockOnSuccess} 
          eventType={null} 
        />
      );
      
      expect(screen.getByRole('heading', { name: /create custom event type/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/name/i)).toHaveValue('');
      expect(screen.getByLabelText(/description/i)).toHaveValue('');
    });

    it('handles undefined eventType gracefully', () => {
      render(
        <CustomEventTypeForm 
          onClose={mockOnClose} 
          onSuccess={mockOnSuccess} 
          eventType={undefined} 
        />
      );
      
      expect(screen.getByRole('heading', { name: /create custom event type/i })).toBeInTheDocument();
    });

    it('handles eventType with missing properties', () => {
      const incompleteEventType = { _id: 'test-id' };
      
      render(
        <CustomEventTypeForm 
          onClose={mockOnClose} 
          onSuccess={mockOnSuccess} 
          eventType={incompleteEventType} 
        />
      );
      
      expect(screen.getByRole('heading', { name: /edit custom event type/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/name/i)).toHaveValue('');
      expect(screen.getByLabelText(/description/i)).toHaveValue('');
    });
  });

  describe('Button Text Updates', () => {
    it('displays correct button text for create mode', () => {
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /update/i })).not.toBeInTheDocument();
    });

    it('displays correct button text for edit mode', () => {
      const eventType = { _id: 'test-id', name: 'Test', description: 'Test' };
      
      render(
        <CustomEventTypeForm 
          onClose={mockOnClose} 
          onSuccess={mockOnSuccess} 
          eventType={eventType} 
        />
      );
      
      expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /create/i })).not.toBeInTheDocument();
    });

    it('updates button text to "Saving..." during submission', async () => {
      mockedAxios.post.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      
      render(<CustomEventTypeForm onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      
      const nameInput = screen.getByLabelText(/name/i);
      await user.type(nameInput, 'Test Event');
      
      const submitButton = screen.getByRole('button', { name: /create/i });
      await user.click(submitButton);
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();
      });
      
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalled();
      });
    });
  });
});