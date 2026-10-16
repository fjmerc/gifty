import React from 'react';
import { render, screen, waitFor } from '../../../test-utils';
import userEvent from '@testing-library/user-event';
import EditRecipientProfileForm from '../js/EditRecipientProfileForm';
import axiosInstance from '../../../axiosInstance';

// Mock axios
jest.mock('../../../axiosInstance');
const mockedAxios = axiosInstance;

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Mock CSS modules
jest.mock('../css/EditRecipientProfileForm.module.css', () => ({
  'edit-recipient-page': 'edit-recipient-page',
  'edit-recipient-form': 'edit-recipient-form',
  'row': 'row',
  'form-group': 'form-group',
  'input': 'input',
  'error': 'error',
  'errorMessage': 'errorMessage',
  'successMessage': 'successMessage',
  'personality-traits': 'personality-traits',
  'personality-trait': 'personality-trait',
  'wish-list-item': 'wish-list-item',
  'wish-list-actions': 'wish-list-actions',
  'remove-button': 'remove-button',
  'add-button': 'add-button',
  'form-actions': 'form-actions',
  'cancel-button': 'cancel-button',
  'submit-button': 'submit-button'
}));

describe('EditRecipientProfileForm', () => {
  let user;

  const mockRecipient = {
    _id: 'recipient-123',
    firstName: 'John',
    lastName: 'Doe',
    relation: 'Brother',
    relationship: 'family',
    birthdate: '1990-05-15T00:00:00.000Z',
    tags: [
      { name: 'sports' },
      { name: 'music' }
    ],
    minimumPriceBudget: 50,
    maximumPriceBudget: 200,
    giftStatus: 'active',
    visibility: true,
    address: {
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
      country: 'USA',
      zipCode: '10001'
    },
    interests: ['reading', 'hiking'],
    hobbies: ['guitar', 'photography'],
    favoriteColors: ['blue', 'green'],
    favoriteBooks: ['1984', 'To Kill a Mockingbird'],
    favoriteMovies: ['Inception', 'The Matrix'],
    favoriteMusic: ['rock', 'jazz'],
    personalityTraits: ['extroverted', 'creative'],
    occupation: 'Engineer',
    workSchedule: '9-5',
    relationshipLength: '25',
    relationshipCloseness: 'very close',
    giftPreferences: 'practical',
    dietaryRestrictions: ['vegetarian'],
    clothingSizes: {
      shirt: 'L',
      pants: '32',
      shoe: '10'
    },
    wishList: [
      { item: 'New laptop', priority: 'high' },
      { item: 'Concert tickets', priority: 'medium' }
    ]
  };

  const mockBudgetData = {
    _id: 'budget-123',
    minimumAmount: 100,
    maximumAmount: 300,
    isActive: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
    mockNavigate.mockReset();
    mockedAxios.get.mockResolvedValue({ data: mockBudgetData });
    mockedAxios.put.mockResolvedValue({ data: { success: true } });
    mockedAxios.post.mockResolvedValue({ data: { success: true } });
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockReset();
  });

  const renderComponent = (recipient = mockRecipient) => {
    return render(<EditRecipientProfileForm recipient={recipient} />);
  };

  describe('Component Rendering', () => {
    test('renders the form with basic sections when recipient is provided', () => {
      renderComponent();

      expect(screen.getByText('Recipient Profile')).toBeInTheDocument();
      expect(screen.getByText('Basic Information')).toBeInTheDocument();
      expect(screen.getByText('Gift Information')).toBeInTheDocument();
    });

    test('renders loading state when no recipient is provided', () => {
      renderComponent(null);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    test('renders basic form fields', () => {
      renderComponent();

      expect(screen.getByText('First Name')).toBeInTheDocument();
      expect(screen.getByText('Last Name')).toBeInTheDocument();
      expect(screen.getByText('Relation')).toBeInTheDocument();
    });
  });

  describe('Wish list buttons', () => {
    test('add and remove are named buttons, not bare + and − glyphs', async () => {
      renderComponent();

      expect(screen.getByRole('button', { name: 'Remove wish list item 1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove wish list item 2' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Add wish list item' }));
      expect(screen.getByRole('button', { name: 'Remove wish list item 3' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Remove wish list item 1' }));
      expect(screen.queryByDisplayValue('New laptop')).not.toBeInTheDocument();
    });
  });

  describe('Form Field Population', () => {
    test('populates basic information fields with recipient data', () => {
      renderComponent();

      expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Brother')).toBeInTheDocument();
    });
  });

  describe('Budget Integration', () => {
    test('fetches budget data on component mount', async () => {
      renderComponent();

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(`/budgets/recipient/${mockRecipient._id}/${new Date().getFullYear()}`);
      });
    });

    test('does not fetch budget if recipient has no ID', () => {
      const recipientWithoutId = { ...mockRecipient, _id: undefined };
      renderComponent(recipientWithoutId);

      expect(mockedAxios.get).not.toHaveBeenCalled();
    });
  });

  describe('Form Submission', () => {
    test('submits form with basic recipient data', async () => {
      renderComponent();

      const submitButton = screen.getByText('Save Changes');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockedAxios.put).toHaveBeenCalledWith(`/recipients/${mockRecipient._id}`, expect.objectContaining({
          firstName: 'John',
          lastName: 'Doe',
          relation: 'Brother'
        }));
      });
    });

    test('navigates to recipient profile after successful submission', async () => {
      renderComponent();

      const submitButton = screen.getByText('Save Changes');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(`/recipients/${mockRecipient._id}`);
      });
    });
  });

  describe('Form Validation', () => {
    test('renders form fields with validation', () => {
      renderComponent();

      // Check that validation rules are in place by verifying required fields exist
      expect(screen.getByDisplayValue('John')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Brother')).toBeInTheDocument();
      
      // Check that relationship type field exists
      expect(screen.getByText('Relationship Type')).toBeInTheDocument();
    });
  });

  describe('No automatic budgets', () => {
    test('never creates an overall budget, even when none exists', async () => {
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes('/budgets/overall/')) {
          return Promise.reject({ response: { status: 404 } });
        }
        return Promise.resolve({ data: mockBudgetData });
      });

      renderComponent();

      const submitButton = screen.getByText('Save Changes');
      await user.click(submitButton);

      await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
      expect(mockedAxios.post).not.toHaveBeenCalledWith('/budgets/overall', expect.anything());
    });
  });

  describe('Enhanced Error Handling', () => {
    test('shows specific error message for overall budget requirement', async () => {
      mockedAxios.put.mockRejectedValue({
        response: {
          status: 400,
          data: { message: 'Overall budget must be set first' }
        }
      });

      renderComponent();

      const submitButton = screen.getByText('Save Changes');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/An overall budget is required before setting recipient budgets/)).toBeInTheDocument();
      });
    });

    test('shows budget-specific error messages', async () => {
      mockedAxios.put.mockRejectedValue({
        response: {
          status: 400,
          data: { message: 'Budget allocation exceeds overall budget limit' }
        }
      });

      renderComponent();

      const submitButton = screen.getByText('Save Changes');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Budget Error: Budget allocation exceeds overall budget limit/)).toBeInTheDocument();
      });
    });

    test('handles field-specific server errors', async () => {
      mockedAxios.put.mockRejectedValue({
        response: {
          status: 400,
          data: {
            errors: {
              firstName: 'First name already exists'
            }
          }
        }
      });

      renderComponent();

      const submitButton = screen.getByText('Save Changes');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('First name already exists')).toBeInTheDocument();
      });
    });
  });

  describe('Cross-field Validation', () => {
    test('renders relationship length field with validation constraints', () => {
      renderComponent();

      const relationshipLengthInput = screen.getByDisplayValue('25');
      expect(relationshipLengthInput).toBeInTheDocument();
      expect(relationshipLengthInput.getAttribute('type')).toBe('number');
    });
  });

  describe('Navigation', () => {
    test('navigates back to recipient profile when cancel button is clicked', async () => {
      renderComponent();

      const cancelButton = screen.getByText('Cancel');
      await user.click(cancelButton);

      expect(mockNavigate).toHaveBeenCalledWith(`/recipients/${mockRecipient._id}`);
    });

    test('has correct button labels', () => {
      renderComponent();

      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });
  });
});