import React from 'react';
import { render, screen, waitFor } from '../../../test-utils';
import EditRecipientProfileWrapper from '../js/EditRecipientProfileWrapper';
import axiosInstance from '../../../axiosInstance';

// Mock axiosInstance
jest.mock('../../../axiosInstance');

// Mock EditRecipientProfileForm component
jest.mock('../js/EditRecipientProfileForm', () => {
  return function MockEditRecipientProfileForm({ recipient }) {
    return (
      <div data-testid="edit-recipient-profile-form">
        <span data-testid="recipient-id">{recipient?.id}</span>
        <span data-testid="recipient-name">{recipient?.firstName} {recipient?.lastName}</span>
      </div>
    );
  };
});

// Mock useParams hook
const mockUseParams = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => mockUseParams()
}));

describe('EditRecipientProfileWrapper', () => {
  const mockRecipientData = {
    id: 1,
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phoneNumber: '555-0123',
    dateOfBirth: '1990-05-15',
    personalityTraits: ['thoughtful', 'creative'],
    wishList: ['book', 'gadget'],
    budget: {
      allocationType: 'fixed',
      minimumAmount: 50,
      maximumAmount: 200
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset console.error mock
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('Component Rendering', () => {
    test('renders loading state initially', () => {
      mockUseParams.mockReturnValue({ id: '1' });
      axiosInstance.get.mockReturnValue(new Promise(() => {})); // Never resolves

      render(<EditRecipientProfileWrapper />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    test('renders EditRecipientProfileForm when recipient data is loaded', async () => {
      mockUseParams.mockReturnValue({ id: '1' });
      axiosInstance.get.mockResolvedValue({ data: mockRecipientData });

      render(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('edit-recipient-profile-form')).toBeInTheDocument();
      });

      expect(screen.getByTestId('recipient-id')).toHaveTextContent('1');
      expect(screen.getByTestId('recipient-name')).toHaveTextContent('John Doe');
    });

    test('passes correct recipient data to EditRecipientProfileForm', async () => {
      mockUseParams.mockReturnValue({ id: '2' });
      const customRecipient = {
        ...mockRecipientData,
        id: 2,
        firstName: 'Jane',
        lastName: 'Smith'
      };
      axiosInstance.get.mockResolvedValue({ data: customRecipient });

      render(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('edit-recipient-profile-form')).toBeInTheDocument();
      });

      expect(screen.getByTestId('recipient-id')).toHaveTextContent('2');
      expect(screen.getByTestId('recipient-name')).toHaveTextContent('Jane Smith');
    });
  });

  describe('Data Fetching', () => {
    test('makes API call with correct recipient ID from params', async () => {
      mockUseParams.mockReturnValue({ id: '123' });
      axiosInstance.get.mockResolvedValue({ data: mockRecipientData });

      render(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/recipients/123');
      });
    });

    test('makes API call with string ID parameter', async () => {
      mockUseParams.mockReturnValue({ id: 'abc-123' });
      axiosInstance.get.mockResolvedValue({ data: mockRecipientData });

      render(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/recipients/abc-123');
      });
    });

    test('refetches data when ID parameter changes', async () => {
      // First render with ID 1
      mockUseParams.mockReturnValue({ id: '1' });
      axiosInstance.get.mockResolvedValue({ data: mockRecipientData });

      const { rerender } = render(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/recipients/1');
      });

      // Change ID to 2
      mockUseParams.mockReturnValue({ id: '2' });
      axiosInstance.get.mockClear();
      axiosInstance.get.mockResolvedValue({ data: { ...mockRecipientData, id: 2 } });

      rerender(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/recipients/2');
      });
    });
  });

  describe('Error Handling', () => {
    test('a failed request offers a retry instead of loading forever', async () => {
      mockUseParams.mockReturnValue({ id: '1' });
      axiosInstance.get.mockRejectedValue(new Error('Network Error'));

      render(<EditRecipientProfileWrapper />);

      expect(await screen.findByText('Failed to load data. Please try again.')).toBeInTheDocument();
      expect(console.error).toHaveBeenCalledWith('Error fetching recipient:', expect.any(Error));
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    test('an unknown or malformed id shows "Recipient not found" with a link back to Recipients', async () => {
      mockUseParams.mockReturnValue({ id: 'not-an-id' });
      axiosInstance.get.mockRejectedValue({ response: { status: 404, data: { message: 'Recipient not found' } } });

      render(<EditRecipientProfileWrapper />);

      expect(await screen.findByRole('heading', { name: 'Recipient not found' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /back to recipients/i })).toHaveAttribute('href', '/recipients');
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    test('a timeout offers a retry', async () => {
      mockUseParams.mockReturnValue({ id: '1' });
      axiosInstance.get.mockRejectedValue({ code: 'ECONNABORTED', message: 'timeout of 5000ms exceeded' });

      render(<EditRecipientProfileWrapper />);

      expect(await screen.findByText('Failed to load data. Please try again.')).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    test('shows loading state while API call is pending', () => {
      mockUseParams.mockReturnValue({ id: '1' });
      // Create a promise that won't resolve immediately
      let resolvePromise;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      axiosInstance.get.mockReturnValue(pendingPromise);

      render(<EditRecipientProfileWrapper />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-recipient-profile-form')).not.toBeInTheDocument();

      // Cleanup
      resolvePromise({ data: mockRecipientData });
    });

    test('transitions from loading to form when data loads', async () => {
      mockUseParams.mockReturnValue({ id: '1' });
      axiosInstance.get.mockResolvedValue({ data: mockRecipientData });

      render(<EditRecipientProfileWrapper />);

      // Initially loading
      expect(screen.getByText('Loading...')).toBeInTheDocument();

      // After data loads
      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
        expect(screen.getByTestId('edit-recipient-profile-form')).toBeInTheDocument();
      });
    });

    test('remains in loading state when recipient data is null', async () => {
      mockUseParams.mockReturnValue({ id: '1' });
      axiosInstance.get.mockResolvedValue({ data: null });

      render(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalled();
      });

      // Should still show loading when data is null
      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-recipient-profile-form')).not.toBeInTheDocument();
    });

    test('remains in loading state when recipient data is undefined', async () => {
      mockUseParams.mockReturnValue({ id: '1' });
      axiosInstance.get.mockResolvedValue({ data: undefined });

      render(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalled();
      });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-recipient-profile-form')).not.toBeInTheDocument();
    });
  });

  describe('useParams Integration', () => {
    test('handles missing ID parameter', async () => {
      mockUseParams.mockReturnValue({});
      axiosInstance.get.mockResolvedValue({ data: mockRecipientData });

      render(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/recipients/undefined');
      });
    });

    test('handles null ID parameter', async () => {
      mockUseParams.mockReturnValue({ id: null });
      axiosInstance.get.mockResolvedValue({ data: mockRecipientData });

      render(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/recipients/null');
      });
    });

    test('handles empty string ID parameter', async () => {
      mockUseParams.mockReturnValue({ id: '' });
      axiosInstance.get.mockResolvedValue({ data: mockRecipientData });

      render(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/recipients/');
      });
    });
  });

  describe('Component Lifecycle', () => {
    test('calls fetchRecipient on mount', async () => {
      mockUseParams.mockReturnValue({ id: '1' });
      axiosInstance.get.mockResolvedValue({ data: mockRecipientData });

      render(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledTimes(1);
        expect(axiosInstance.get).toHaveBeenCalledWith('/recipients/1');
      });
    });

    test('does not call fetchRecipient on re-render with same ID', async () => {
      mockUseParams.mockReturnValue({ id: '1' });
      axiosInstance.get.mockResolvedValue({ data: mockRecipientData });

      const { rerender } = render(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledTimes(1);
      });

      // Re-render with same ID
      rerender(<EditRecipientProfileWrapper />);

      // Should not call API again
      expect(axiosInstance.get).toHaveBeenCalledTimes(1);
    });

    test('cleans up properly on unmount', async () => {
      mockUseParams.mockReturnValue({ id: '1' });
      axiosInstance.get.mockResolvedValue({ data: mockRecipientData });

      const { unmount } = render(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('edit-recipient-profile-form')).toBeInTheDocument();
      });

      // Unmount should not cause errors
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Data Structure Validation', () => {
    test('handles recipient with minimal required data', async () => {
      mockUseParams.mockReturnValue({ id: '1' });
      const minimalRecipient = { id: 1, firstName: 'John' };
      axiosInstance.get.mockResolvedValue({ data: minimalRecipient });

      render(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('edit-recipient-profile-form')).toBeInTheDocument();
      });

      expect(screen.getByTestId('recipient-id')).toHaveTextContent('1');
      expect(screen.getByTestId('recipient-name')).toHaveTextContent('John'); // Only firstName is present
    });

    test('handles recipient with complete data structure', async () => {
      mockUseParams.mockReturnValue({ id: '1' });
      const completeRecipient = {
        ...mockRecipientData,
        relationships: ['friend'],
        interests: ['technology', 'sports'],
        tags: ['birthday', 'holiday']
      };
      axiosInstance.get.mockResolvedValue({ data: completeRecipient });

      render(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('edit-recipient-profile-form')).toBeInTheDocument();
      });

      expect(screen.getByTestId('recipient-id')).toHaveTextContent('1');
      expect(screen.getByTestId('recipient-name')).toHaveTextContent('John Doe');
    });

    test('handles recipient with nested object properties', async () => {
      mockUseParams.mockReturnValue({ id: '1' });
      const recipientWithNested = {
        ...mockRecipientData,
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345'
        },
        preferences: {
          colorScheme: 'blue',
          categories: ['electronics', 'books']
        }
      };
      axiosInstance.get.mockResolvedValue({ data: recipientWithNested });

      render(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('edit-recipient-profile-form')).toBeInTheDocument();
      });

      expect(screen.getByTestId('recipient-id')).toHaveTextContent('1');
      expect(screen.getByTestId('recipient-name')).toHaveTextContent('John Doe');
    });
  });

  describe('Integration with React Router', () => {
    test('works within Router context', async () => {
      mockUseParams.mockReturnValue({ id: '1' });
      axiosInstance.get.mockResolvedValue({ data: mockRecipientData });

      expect(() => {
        render(<EditRecipientProfileWrapper />);
      }).not.toThrow();

      await waitFor(() => {
        expect(screen.getByTestId('edit-recipient-profile-form')).toBeInTheDocument();
      });
    });

    test('handles route parameter changes correctly', async () => {
      // Start with initial route
      mockUseParams.mockReturnValue({ id: '1' });
      axiosInstance.get.mockResolvedValue({ data: mockRecipientData });

      const { rerender } = render(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/recipients/1');
      });

      // Change route parameter
      mockUseParams.mockReturnValue({ id: '2' });
      axiosInstance.get.mockClear();
      axiosInstance.get.mockResolvedValue({ data: { ...mockRecipientData, id: 2 } });

      rerender(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/recipients/2');
      });
    });
  });

  describe('Performance Considerations', () => {
    test('does not cause infinite re-renders', async () => {
      mockUseParams.mockReturnValue({ id: '1' });
      axiosInstance.get.mockResolvedValue({ data: mockRecipientData });

      render(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(screen.getByTestId('edit-recipient-profile-form')).toBeInTheDocument();
      });

      // Wait a bit more to ensure no additional calls
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(axiosInstance.get).toHaveBeenCalledTimes(1);
    });

    test('handles rapid ID changes without race conditions', async () => {
      // Start with first ID
      mockUseParams.mockReturnValue({ id: '1' });
      axiosInstance.get.mockResolvedValue({ data: { ...mockRecipientData, id: 1 } });
      
      const { rerender } = render(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/recipients/1');
      });

      // Change to second ID
      mockUseParams.mockReturnValue({ id: '2' });
      axiosInstance.get.mockResolvedValue({ data: { ...mockRecipientData, id: 2 } });
      
      rerender(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/recipients/2');
      });

      // Change to third ID
      mockUseParams.mockReturnValue({ id: '3' });
      axiosInstance.get.mockResolvedValue({ data: { ...mockRecipientData, id: 3 } });
      
      rerender(<EditRecipientProfileWrapper />);

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/recipients/3');
      });

      // Should have been called for each ID
      expect(axiosInstance.get).toHaveBeenCalledTimes(3);
    });
  });
});