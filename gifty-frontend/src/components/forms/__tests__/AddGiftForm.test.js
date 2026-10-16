import React from 'react';
import { render, screen, fireEvent, waitFor } from '../../../test-utils';
import userEvent from '@testing-library/user-event';
import AddGiftForm from '../js/AddGiftForm';

// Mock CSS modules
jest.mock('../css/AddGiftForm.module.css', () => ({
  formOverlay: 'formOverlay',
  formContainer: 'formContainer',
  formTitle: 'formTitle',
  formGroup: 'formGroup',
  formRow: 'formRow',
  formActions: 'formActions',
  submitButton: 'submitButton',
  cancelButton: 'cancelButton',
  checkboxGroup: 'checkboxGroup',
  budgetInfo: 'budgetInfo',
  noBudget: 'noBudget',
  priceOverBudget: 'priceOverBudget',
  overBudgetWarning: 'overBudgetWarning'
}));

describe('AddGiftForm Component', () => {
  // Mock data
  const mockRecipients = [
    {
      _id: 'recipient-1',
      firstName: 'John',
      lastName: 'Doe'
    },
    {
      _id: 'recipient-2', 
      firstName: 'Jane',
      lastName: 'Smith'
    }
  ];

  const mockEvents = [
    {
      _id: 'event-1',
      name: 'Birthday Party',
      date: '2099-03-01T00:00:00.000Z',
      recipient: { _id: 'recipient-1', firstName: 'John' }
    },
    {
      // A holiday: offered whoever the gift is for
      _id: 'event-2',
      name: 'Christmas',
      date: '2099-12-25T00:00:00.000Z',
      recipient: { _id: 'holidays', firstName: 'Gifty' },
      isSystemGenerated: true
    }
  ];

  const mockBudgets = [
    {
      _id: 'recipient-1',
      spent: 0,
      left: 100,
      status: 'within',
      limit: 100,
      budget: { exists: true }
    }
  ];

  // Mock functions
  const mockOnSubmit = jest.fn();
  const mockOnCancel = jest.fn();

  const defaultProps = {
    onSubmit: mockOnSubmit,
    onCancel: mockOnCancel,
    recipients: mockRecipients,
    events: mockEvents,
    budgets: mockBudgets
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Basic Rendering', () => {
    it('should render without crashing', () => {
      render(<AddGiftForm {...defaultProps} />);
      
      expect(screen.getByRole('form', { name: 'Add New Gift' })).toBeInTheDocument();
    });

    it('should render all required form fields', () => {
      render(<AddGiftForm {...defaultProps} />);
      
      // Check for all form inputs
      expect(screen.getByLabelText(/gift name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/tags/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/recipient/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/event/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^price$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/purchase date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/where to buy/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/favorite/i)).toBeInTheDocument();
    });

    it('should render action buttons', () => {
      render(<AddGiftForm {...defaultProps} />);
      
      expect(screen.getByRole('button', { name: /add gift/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  describe('Form Interactions', () => {
    it('should update gift name field on user input', async () => {
      const user = userEvent.setup();
      render(<AddGiftForm {...defaultProps} />);
      
      const nameInput = screen.getByLabelText(/gift name/i);
      await user.type(nameInput, 'Test Gift Name');
      
      expect(nameInput).toHaveValue('Test Gift Name');
    });

    it('should update description field on user input', async () => {
      const user = userEvent.setup();
      render(<AddGiftForm {...defaultProps} />);
      
      const descriptionInput = screen.getByLabelText(/description/i);
      await user.type(descriptionInput, 'Test description');
      
      expect(descriptionInput).toHaveValue('Test description');
    });

    it('should update price field on user input', async () => {
      const user = userEvent.setup();
      render(<AddGiftForm {...defaultProps} />);
      
      const priceInput = screen.getByLabelText(/^price$/i);
      await user.type(priceInput, '29.99');
      
      expect(priceInput).toHaveValue(29.99);
    });

    it('should handle recipient selection', async () => {
      const user = userEvent.setup();
      render(<AddGiftForm {...defaultProps} />);
      
      const recipientSelect = screen.getByLabelText(/recipient/i);
      await user.selectOptions(recipientSelect, 'recipient-1');
      
      expect(recipientSelect).toHaveValue('recipient-1');
    });

    it('should toggle favorite checkbox', async () => {
      const user = userEvent.setup();
      render(<AddGiftForm {...defaultProps} />);
      
      const favoriteCheckbox = screen.getByLabelText(/favorite/i);
      expect(favoriteCheckbox).not.toBeChecked();
      
      await user.click(favoriteCheckbox);
      expect(favoriteCheckbox).toBeChecked();
    });
  });

  describe('Budget Integration', () => {
    it('should show budget information when recipient is selected', async () => {
      const user = userEvent.setup();
      render(<AddGiftForm {...defaultProps} />);
      
      const recipientSelect = screen.getByLabelText(/recipient/i);
      await user.selectOptions(recipientSelect, 'recipient-1');
      
      await waitFor(() => {
        expect(screen.getByText(/budget: \$100\.00 left/i)).toBeInTheDocument();
      });
    });

    it('should show "No budget set" when recipient has no budget', async () => {
      const user = userEvent.setup();
      const propsWithoutBudgets = { ...defaultProps, budgets: [] };
      render(<AddGiftForm {...propsWithoutBudgets} />);
      
      const recipientSelect = screen.getByLabelText(/recipient/i);
      await user.selectOptions(recipientSelect, 'recipient-1');
      
      await waitFor(() => {
        expect(screen.getByText('No budget')).toBeInTheDocument();
      });
    });

    it('should show over-budget warning when price exceeds budget', async () => {
      const user = userEvent.setup();
      render(<AddGiftForm {...defaultProps} />);
      
      // Select recipient with $100 budget
      const recipientSelect = screen.getByLabelText(/recipient/i);
      await user.selectOptions(recipientSelect, 'recipient-1');
      
      // Enter price that exceeds budget
      const priceInput = screen.getByLabelText(/^price$/i);
      await user.type(priceInput, '150');
      
      await waitFor(() => {
        expect(screen.getByText(/warning: price is more than this recipient's budget left/i)).toBeInTheDocument();
      });
    });
  });

  describe('Required fields', () => {
    // The error text a field points at through aria-describedby
    const errorFor = (field) => document.getElementById(field.getAttribute('aria-describedby'));

    it('marks every empty required field, says why, and focuses the first one', async () => {
      const user = userEvent.setup();
      render(<AddGiftForm {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /add gift/i }));

      expect(mockOnSubmit).not.toHaveBeenCalled();
      const name = screen.getByLabelText(/gift name/i);
      expect(name).toHaveAttribute('aria-invalid', 'true');
      expect(errorFor(name)).toHaveTextContent('Enter a gift name.');
      expect(errorFor(screen.getByLabelText(/description/i))).toHaveTextContent('Enter a description.');
      expect(errorFor(screen.getByLabelText(/recipient/i))).toHaveTextContent('Choose who the gift is for.');
      expect(errorFor(screen.getByLabelText(/^price$/i))).toHaveTextContent('Enter a price.');
      expect(name).toHaveFocus();
    });

    it('asks for the event once a recipient is chosen, and focuses it', async () => {
      const user = userEvent.setup();
      render(<AddGiftForm {...defaultProps} />);
      await user.type(screen.getByLabelText(/gift name/i), 'Lamp');
      await user.type(screen.getByLabelText(/description/i), 'A desk lamp');
      await user.selectOptions(screen.getByLabelText(/recipient/i), 'recipient-1');
      await user.type(screen.getByLabelText(/^price$/i), '20');

      await user.click(screen.getByRole('button', { name: /add gift/i }));

      const event = screen.getByLabelText(/event/i);
      expect(event).toHaveAttribute('aria-invalid', 'true');
      expect(errorFor(event)).toHaveTextContent('Choose an event.');
      expect(event).toHaveFocus();
      expect(screen.getByLabelText(/gift name/i)).not.toHaveAttribute('aria-invalid');
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('clears a field\'s error once it is filled in', async () => {
      const user = userEvent.setup();
      render(<AddGiftForm {...defaultProps} />);
      await user.click(screen.getByRole('button', { name: /add gift/i }));

      await user.type(screen.getByLabelText(/gift name/i), 'Lamp');

      expect(screen.getByLabelText(/gift name/i)).not.toHaveAttribute('aria-invalid');
      expect(screen.queryByText('Enter a gift name.')).not.toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('should call onSubmit with correct data when form is submitted', async () => {
      const user = userEvent.setup();
      render(<AddGiftForm {...defaultProps} />);
      
      // Fill out the form
      await user.type(screen.getByLabelText(/gift name/i), 'Test Gift');
      await user.type(screen.getByLabelText(/description/i), 'Test Description');
      await user.type(screen.getByLabelText(/^price$/i), '29.99');
      await user.selectOptions(screen.getByLabelText(/recipient/i), 'recipient-1');
      await user.selectOptions(screen.getByLabelText(/event/i), 'event-1');
      await user.type(screen.getByLabelText(/tags/i), 'tech, gadget');
      await user.type(screen.getByLabelText(/where to buy/i), 'Amazon, Target');
      
      // Submit the form
      await user.click(screen.getByRole('button', { name: /add gift/i }));
      
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Gift',
          description: 'Test Description',
          price: 29.99,
          recipientId: 'recipient-1',
          eventId: 'event-1',
          tags: ['tech', 'gadget'],
          status: 'suggestion',
          favorite: false
        })
      );
    });

    it('should convert comma-separated tags to array on submission', async () => {
      const user = userEvent.setup();
      render(<AddGiftForm {...defaultProps} />);
      
      // Fill required fields
      await user.type(screen.getByLabelText(/gift name/i), 'Test Gift');
      await user.type(screen.getByLabelText(/description/i), 'Test Description');
      await user.type(screen.getByLabelText(/^price$/i), '29.99');
      await user.selectOptions(screen.getByLabelText(/recipient/i), 'recipient-1');
      await user.selectOptions(screen.getByLabelText(/event/i), 'event-1');
      await user.type(screen.getByLabelText(/tags/i), 'tech, gadget, portable');
      await user.type(screen.getByLabelText(/where to buy/i), 'Amazon');
      
      await user.click(screen.getByRole('button', { name: /add gift/i }));
      
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['tech', 'gadget', 'portable']
        })
      );
    });

    it('should call onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<AddGiftForm {...defaultProps} />);
      
      await user.click(screen.getByRole('button', { name: /cancel/i }));
      
      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });
  });
});