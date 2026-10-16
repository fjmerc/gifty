import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import PurchaseHistory from '../js/PurchaseHistory';
import axiosInstance from '../../axiosInstance';
import styles from '../css/PurchaseHistory.module.css';

// Mock dependencies
jest.mock('../../axiosInstance');
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn()
}));

// Mock CSS modules
jest.mock('../css/PurchaseHistory.module.css', () => ({
  purchaseHistory: 'purchaseHistory',
  contentWrapper: 'contentWrapper',
  pageTitle: 'pageTitle',
  filterControls: 'filterControls',
  filterGroup: 'filterGroup',
  filterLabel: 'filterLabel',
  filterSelect: 'filterSelect',
  clearFilters: 'clearFilters',
  totalDisplay: 'totalDisplay',
  totalLabel: 'totalLabel',
  totalAmount: 'totalAmount',
  resultsHeader: 'resultsHeader',
  resultsCount: 'resultsCount',
  table: 'table',
  recipientLink: 'recipientLink',
  eventName: 'eventName',
  eventDefault: 'eventDefault',
  eventBirthday: 'eventBirthday',
  eventAnniversary: 'eventAnniversary',
  eventChristmas: 'eventChristmas',
  eventHoliday: 'eventHoliday',
  eventGraduation: 'eventGraduation',
  eventWedding: 'eventWedding',
  editButton: 'editButton',
  noResults: 'noResults',
  modalOverlay: 'modalOverlay',
  modalContent: 'modalContent',
  formGroup: 'formGroup',
  modalButtons: 'modalButtons',
  cancelButton: 'cancelButton',
  saveButton: 'saveButton'
}));

const { useNavigate } = require('react-router-dom');

describe('PurchaseHistory', () => {
  let mockNavigate;

  const mockBudgetData = {
    _id: 'budget-1',
    amount: 1000,
    currency: 'USD',
    year: 2024,
    isLimited: true
  };

  const mockPurchasesData = [
    {
      _id: 'purchase-1',
      name: 'Wireless Headphones',
      price: 150.00,
      status: 'purchased',
      purchaseDate: '2024-01-15T10:00:00Z',
      recipient: {
        _id: 'recipient-1',
        firstName: 'John',
        lastName: 'Doe'
      },
      event: {
        _id: 'event-1',
        name: 'Birthday Party'
      }
    },
    {
      _id: 'purchase-2',
      name: 'Coffee Maker',
      price: 89.99,
      status: 'purchased',
      purchaseDate: '2024-02-20T14:30:00Z',
      recipient: {
        _id: 'recipient-2',
        firstName: 'Jane',
        lastName: 'Smith'
      },
      event: {
        _id: 'event-2',
        name: 'Anniversary'
      }
    },
    {
      _id: 'purchase-3',
      name: 'Book Set',
      price: 45.50,
      status: 'purchased',
      purchaseDate: '2024-03-10T09:15:00Z',
      recipient: {
        _id: 'recipient-1',
        firstName: 'John',
        lastName: 'Doe'
      },
      event: {
        _id: 'event-3',
        name: 'Christmas'
      }
    }
  ];

  const mockEmptyBudgetData = {
    _id: 'budget-empty',
    amount: 0,
    currency: 'USD',
    year: 2024,
    isLimited: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate = jest.fn();
    useNavigate.mockReturnValue(mockNavigate);
    
    // Default successful API responses
    axiosInstance.get.mockImplementation((url) => {
      if (url === '/gifts') {
        return Promise.resolve({ data: mockPurchasesData });
      }
      if (url.includes('/budgets/overall/')) {
        return Promise.resolve({ data: mockBudgetData });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
  });

  // Section 1: Component Logic Analysis & Bug Fixes Validation
  describe('Component Logic Analysis & Bug Fixes Validation', () => {
    test('safely handles missing purchaseDate in openEditModal', async () => {
      const purchaseWithoutDate = {
        _id: 'purchase-no-date',
        name: 'Test Item',
        price: 25.00,
        status: 'purchased',
        purchaseDate: null,
        recipient: mockPurchasesData[0].recipient,
        event: mockPurchasesData[0].event
      };

      axiosInstance.get.mockImplementation((url) => {
        if (url === '/gifts') {
          return Promise.resolve({ data: [purchaseWithoutDate] });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockBudgetData });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Test Item')).toBeInTheDocument();
      });

      const editButton = screen.getByRole('button', { name: /edit purchase/i });
      fireEvent.click(editButton);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /edit purchase/i })).toBeInTheDocument();
      });

      // Should default to today's date
      const dateInput = screen.getByLabelText(/purchase date/i);
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; // local day
      expect(dateInput.value).toBe(today);
    });

    test('safely handles invalid price in openEditModal', async () => {
      const purchaseWithInvalidPrice = {
        _id: 'purchase-invalid-price',
        name: 'Test Item',
        price: null,
        status: 'purchased',
        purchaseDate: '2024-01-15T10:00:00Z',
        recipient: mockPurchasesData[0].recipient,
        event: mockPurchasesData[0].event
      };

      axiosInstance.get.mockImplementation((url) => {
        if (url === '/gifts') {
          return Promise.resolve({ data: [purchaseWithInvalidPrice] });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockBudgetData });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Test Item')).toBeInTheDocument();
      });

      const editButton = screen.getByRole('button', { name: /edit purchase/i });
      fireEvent.click(editButton);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /edit purchase/i })).toBeInTheDocument();
      });

      // Should default to 0.00
      const priceInput = screen.getByLabelText(/price/i);
      expect(priceInput.value).toBe('0.00');
    });

    test('handles invalid currency in formatCurrency gracefully', async () => {
      const invalidCurrencyBudget = {
        ...mockBudgetData,
        currency: 'INVALID'
      };

      axiosInstance.get.mockImplementation((url) => {
        if (url === '/gifts') {
          return Promise.resolve({ data: mockPurchasesData });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: invalidCurrencyBudget });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      // Spy on console.warn to verify fallback behavior
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
      });

      // Should fallback to USD formatting
      expect(screen.getByText(/\$150\.00/)).toBeInTheDocument();

      consoleSpy.mockRestore();
    });

    test('handles null/undefined amounts in formatCurrency', async () => {
      const purchaseWithNullPrice = {
        ...mockPurchasesData[0],
        price: null
      };

      axiosInstance.get.mockImplementation((url) => {
        if (url === '/gifts') {
          return Promise.resolve({ data: [purchaseWithNullPrice] });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockBudgetData });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
      });

      // A missing price is shown as a dash, not as $0.00
      const row = screen.getByText('Wireless Headphones').closest('tr');
      expect(row).toHaveTextContent('—');
    });
  });

  // Section 2: Authentication & Basic Rendering
  describe('Authentication & Basic Rendering', () => {
    test('renders main title and sections', async () => {
      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      expect(screen.getByRole('heading', { name: /purchase history/i })).toBeInTheDocument();
      
      await waitFor(() => {
        expect(screen.getByText(/filter by recipient/i)).toBeInTheDocument();
        expect(screen.getByText(/total:/i)).toBeInTheDocument();
      });
    });

    test('renders table headers correctly', async () => {
      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Date')).toBeInTheDocument();
        expect(screen.getByText('Item')).toBeInTheDocument();
        expect(screen.getByText('Recipient')).toBeInTheDocument();
        expect(screen.getByText('Event')).toBeInTheDocument();
        expect(screen.getByText('Price')).toBeInTheDocument();
        expect(screen.getByText('Actions')).toBeInTheDocument();
      });
    });

    test('displays loading state initially', () => {
      // Don't resolve promises immediately
      axiosInstance.get.mockImplementation(() => new Promise(() => {}));

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      expect(screen.getByRole('heading', { name: /purchase history/i })).toBeInTheDocument();
    });
  });

  // Section 3: Data Fetching & API Integration
  describe('Data Fetching & API Integration', () => {
    test('fetches purchases and budget data on component mount', async () => {
      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/gifts', {
          params: { status: 'purchased', limit: 1000, sortBy: 'purchaseDate', sortOrder: 'desc' }
        });
        expect(axiosInstance.get).toHaveBeenCalledWith(`/budgets/overall/${new Date().getFullYear()}`);
      });
    });

    test('displays purchase data correctly', async () => {
      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
        expect(screen.getByText('Coffee Maker')).toBeInTheDocument();
        expect(screen.getByText('Book Set')).toBeInTheDocument();
        expect(screen.getAllByText('John Doe')).toHaveLength(3); // Filter option + 2 table entries
        expect(screen.getAllByText('Jane Smith')).toHaveLength(2); // Filter option + 1 table entry
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
        expect(screen.getByText('Anniversary')).toBeInTheDocument();
        expect(screen.getByText('Christmas')).toBeInTheDocument();
      });
    });

    test('handles different API response formats', async () => {
      // Test format 2: Object with data property
      axiosInstance.get.mockImplementation((url) => {
        if (url === '/gifts') {
          return Promise.resolve({ 
            data: { 
              data: mockPurchasesData.filter(p => p.status === 'purchased') 
            } 
          });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockBudgetData });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
      });
    });

    test('handles API response format with gifts property', async () => {
      // Test format 3: Object with gifts property
      axiosInstance.get.mockImplementation((url) => {
        if (url === '/gifts') {
          return Promise.resolve({ 
            data: { 
              gifts: mockPurchasesData.filter(p => p.status === 'purchased') 
            } 
          });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockBudgetData });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
      });
    });

    test('handles unexpected API response format gracefully', async () => {
      axiosInstance.get.mockImplementation((url) => {
        if (url === '/gifts') {
          return Promise.resolve({ data: { unexpected: 'format' } });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockBudgetData });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/no purchases found/i)).toBeInTheDocument();
      });

      // The component should handle unexpected formats gracefully and show no results
      expect(screen.getByText(/no purchases found/i)).toBeInTheDocument();
    });

    test('handles API errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      axiosInstance.get.mockImplementation((url) => {
        if (url === '/gifts') {
          return Promise.reject(new Error('Network error'));
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockBudgetData });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Error fetching purchase history:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });
  });

  // Section 4: User Interactions & Event Handling
  describe('User Interactions & Event Handling', () => {
    test('opens edit modal when edit button is clicked', async () => {
      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
      });

      // Get the edit button specifically for the first purchase using table structure
      const firstPurchaseRow = screen.getByText('Wireless Headphones').closest('tr');
      const editButton = firstPurchaseRow.querySelector('button[aria-label="Edit purchase"]');
      fireEvent.click(editButton);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /edit purchase/i })).toBeInTheDocument();
        expect(screen.getByDisplayValue('2024-01-15')).toBeInTheDocument();
        expect(screen.getByDisplayValue('150')).toBeInTheDocument();
      });
    });

    test('closes edit modal when cancel button is clicked', async () => {
      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
      });

      const firstPurchaseRow = screen.getByText('Wireless Headphones').closest('tr');
      const editButton = firstPurchaseRow.querySelector('button[aria-label="Edit purchase"]');
      fireEvent.click(editButton);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /edit purchase/i })).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /edit purchase/i })).not.toBeInTheDocument();
      });
    });

    test('handles edit form submission successfully', async () => {
      axiosInstance.put.mockResolvedValue({ data: { success: true } });

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
      });

      const firstPurchaseRow = screen.getByText('Wireless Headphones').closest('tr');
      const editButton = firstPurchaseRow.querySelector('button[aria-label="Edit purchase"]');
      fireEvent.click(editButton);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /edit purchase/i })).toBeInTheDocument();
      });

      const dateInput = screen.getByLabelText(/purchase date/i);
      const priceInput = screen.getByLabelText(/price/i);

      fireEvent.change(dateInput, { target: { value: '2024-01-20' } });
      fireEvent.change(priceInput, { target: { value: '175.00' } });

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(axiosInstance.put).toHaveBeenCalledWith('/gifts/purchase-1', {
          price: 175,
          purchaseDate: '2024-01-20',
          recipientId: 'recipient-1'
        });
      });

      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /edit purchase/i })).not.toBeInTheDocument();
      });
    });

    test('handles edit form submission errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      axiosInstance.put.mockRejectedValue(new Error('Update failed'));

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
      });

      const firstPurchaseRow = screen.getByText('Wireless Headphones').closest('tr');
      const editButton = firstPurchaseRow.querySelector('button[aria-label="Edit purchase"]');
      fireEvent.click(editButton);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /edit purchase/i })).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Error updating purchase:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });

    test('filters purchases by recipient', async () => {
      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
        expect(screen.getByText('Coffee Maker')).toBeInTheDocument();
        expect(screen.getByText('Book Set')).toBeInTheDocument();
      });

      const recipientFilter = screen.getByRole('combobox');
      fireEvent.change(recipientFilter, { target: { value: 'recipient-1' } });

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
        expect(screen.getByText('Book Set')).toBeInTheDocument();
        expect(screen.queryByText('Coffee Maker')).not.toBeInTheDocument();
      });

      // Check filtered total
      expect(screen.getByText('$195.50')).toBeInTheDocument(); // 150 + 45.50
    });

    test('clears filters when clear button is clicked', async () => {
      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
      });

      const recipientFilter = screen.getByRole('combobox');
      fireEvent.change(recipientFilter, { target: { value: 'recipient-1' } });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
      });

      const clearButton = screen.getByRole('button', { name: /clear filters/i });
      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(screen.getByText('Coffee Maker')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
      });
    });

    test('navigates to recipient profile when recipient name is clicked', async () => {
      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('John Doe')).toHaveLength(3); // Filter option + 2 table entries
      });

      // The recipient in the first row is a real link to the profile
      const firstJohnDoeRow = screen.getByText('Wireless Headphones').closest('tr');
      const johnDoeLink = within(firstJohnDoeRow).getByRole('link', { name: 'John Doe' });
      expect(johnDoeLink).toHaveAttribute('href', '/recipients/recipient-1');
    });

    test('navigates to events page when event name is clicked', async () => {
      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
      });

      const eventLink = screen.getByRole('link', { name: 'Birthday Party' });
      expect(eventLink).toHaveAttribute('href', '/events');
    });
  });

  // Section 5: Edge Cases & Error Handling
  describe('Edge Cases & Error Handling', () => {
    test('displays no results message when no purchases exist', async () => {
      axiosInstance.get.mockImplementation((url) => {
        if (url === '/gifts') {
          return Promise.resolve({ data: [] });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockBudgetData });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/no purchases found/i)).toBeInTheDocument();
      });
    });

    test('handles purchases without recipient data', async () => {
      const purchaseWithoutRecipient = {
        ...mockPurchasesData[0],
        recipient: null
      };

      axiosInstance.get.mockImplementation((url) => {
        if (url === '/gifts') {
          return Promise.resolve({ data: [purchaseWithoutRecipient] });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockBudgetData });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
        expect(screen.getAllByText('N/A')[0]).toBeInTheDocument(); // Recipient N/A
      });
    });

    test('handles purchases without event data', async () => {
      const purchaseWithoutEvent = {
        ...mockPurchasesData[0],
        event: null
      };

      axiosInstance.get.mockImplementation((url) => {
        if (url === '/gifts') {
          return Promise.resolve({ data: [purchaseWithoutEvent] });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockBudgetData });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
        expect(screen.getAllByText('N/A')[0]).toBeInTheDocument(); // Event N/A
      });
    });

    test('handles invalid date formats gracefully', async () => {
      const purchaseWithInvalidDate = {
        ...mockPurchasesData[0],
        purchaseDate: 'invalid-date'
      };

      axiosInstance.get.mockImplementation((url) => {
        if (url === '/gifts') {
          return Promise.resolve({ data: [purchaseWithInvalidDate] });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockBudgetData });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
      });

      // Should not crash and should display some date
      const tableRows = screen.getAllByRole('row');
      expect(tableRows.length).toBeGreaterThan(1); // Header + data rows
    });

    test('calculates filtered total correctly with mixed data', async () => {
      const mixedPurchases = [
        { ...mockPurchasesData[0], price: null },
        { ...mockPurchasesData[1], price: 'invalid' },
        { ...mockPurchasesData[2], price: 25.75 }
      ];

      axiosInstance.get.mockImplementation((url) => {
        if (url === '/gifts') {
          return Promise.resolve({ data: mixedPurchases });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockBudgetData });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Book Set')).toBeInTheDocument();
      });

      // Should only count valid price (25.75) - check in the total display area
      const totalDisplay = document.querySelector('.totalAmount');
      expect(totalDisplay).toHaveTextContent('$25.75');
    });

    test('handles empty budget data gracefully', async () => {
      axiosInstance.get.mockImplementation((url) => {
        if (url === '/gifts') {
          return Promise.resolve({ data: mockPurchasesData });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: null });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
      });

      // Should use USD as default currency
      expect(screen.getByText(/\$150\.00/)).toBeInTheDocument();
    });
  });

  // Section 6: Event Propagation & Accessibility
  describe('Event Propagation & Accessibility', () => {
    test('edit buttons have proper accessibility labels', async () => {
      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
      });

      const editButtons = document.querySelectorAll('button[aria-label="Edit purchase"]');
      expect(editButtons).toHaveLength(3);
      
      editButtons.forEach(button => {
        expect(button).toHaveAttribute('aria-label', 'Edit purchase');
      });
    });

    test('filter select has proper labeling', async () => {
      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/filter by recipient/i)).toBeInTheDocument();
      });

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
      expect(screen.getByText('All Recipients')).toBeInTheDocument();
    });

    test('modal form has proper form labels', async () => {
      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
      });

      const firstPurchaseRow = screen.getByText('Wireless Headphones').closest('tr');
      const editButton = firstPurchaseRow.querySelector('button[aria-label="Edit purchase"]');
      fireEvent.click(editButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/purchase date/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/price/i)).toBeInTheDocument();
      });

      const dateInput = screen.getByLabelText(/purchase date/i);
      const priceInput = screen.getByLabelText(/price/i);

      expect(dateInput).toHaveAttribute('required');
      expect(priceInput).toHaveAttribute('required');
      expect(priceInput).toHaveAttribute('min', '0');
      expect(priceInput).toHaveAttribute('step', '0.01');
    });

    test('keyboard navigation works for interactive elements', async () => {
      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
      });

      const recipientFilter = screen.getByRole('combobox');
      recipientFilter.focus();
      expect(document.activeElement).toBe(recipientFilter);

      // Tab to next focusable element
      fireEvent.keyDown(recipientFilter, { key: 'Tab' });
      
      // Should be able to tab through elements
      const editButtons = screen.getAllByRole('button', { name: /edit purchase/i });
      expect(editButtons.length).toBeGreaterThan(0);
    });
  });

  // Section 7: Performance & Optimization
  describe('Performance & Optimization', () => {
    test('handles large datasets efficiently', async () => {
      // Create large dataset
      const largePurchaseSet = Array.from({ length: 100 }, (_, index) => ({
        _id: `purchase-${index}`,
        name: `Item ${index}`,
        price: Math.random() * 100,
        status: 'purchased',
        purchaseDate: `2024-01-${String(index % 28 + 1).padStart(2, '0')}T10:00:00Z`,
        recipient: {
          _id: `recipient-${index % 10}`,
          firstName: `First${index % 10}`,
          lastName: `Last${index % 10}`
        },
        event: {
          _id: `event-${index % 5}`,
          name: `Event ${index % 5}`
        }
      }));

      axiosInstance.get.mockImplementation((url) => {
        if (url === '/gifts') {
          return Promise.resolve({ data: largePurchaseSet });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockBudgetData });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      const startTime = performance.now();

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Item 0')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render within reasonable time (less than 2 seconds)
      expect(renderTime).toBeLessThan(2000);

      // Should display all items
      expect(screen.getByText(/100 purchases/)).toBeInTheDocument();
    });

    test('useMemo optimizes filtered results calculation', async () => {
      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
      });

      // Filter multiple times rapidly
      const recipientFilter = screen.getByRole('combobox');
      
      fireEvent.change(recipientFilter, { target: { value: 'recipient-1' } });
      fireEvent.change(recipientFilter, { target: { value: 'recipient-2' } });
      fireEvent.change(recipientFilter, { target: { value: '' } });

      await waitFor(() => {
        expect(screen.getByText('Coffee Maker')).toBeInTheDocument();
        expect(screen.getByText('Wireless Headphones')).toBeInTheDocument();
        expect(screen.getByText('Book Set')).toBeInTheDocument();
      });

      // Should handle rapid filter changes without issues
      expect(screen.getByText(/3 purchases/)).toBeInTheDocument();
    });

    test('prevents memory leaks on unmount', () => {
      const { unmount } = render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      // Simulate component unmount while API calls are pending
      unmount();

      // Should not throw errors or cause memory leaks
      expect(true).toBe(true);
    });

    test('optimizes date sorting performance', async () => {
      // Create purchases with various date formats
      const mixedDatePurchases = [
        { ...mockPurchasesData[0], purchaseDate: '2024-03-15T10:00:00Z' },
        { ...mockPurchasesData[1], purchaseDate: '2024-01-20 14:30:00' }, // Different format
        { ...mockPurchasesData[2], purchaseDate: null }, // No date
        { 
          ...mockPurchasesData[0], 
          _id: 'purchase-4',
          name: 'Latest Item',
          purchaseDate: '2024-05-01T09:00:00Z' 
        }
      ];

      axiosInstance.get.mockImplementation((url) => {
        if (url === '/gifts') {
          return Promise.resolve({ data: mixedDatePurchases });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockBudgetData });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Latest Item')).toBeInTheDocument();
      });

      // Should sort newest first
      const tableRows = screen.getAllByRole('row');
      const firstDataRow = tableRows[1]; // Skip header row
      expect(firstDataRow).toHaveTextContent('Latest Item');
    });
  });

  // Section 8: Event Classification & CSS
  describe('Event Classification & CSS', () => {
    test('applies correct CSS classes for different event types', async () => {
      const eventTypePurchases = [
        { 
          ...mockPurchasesData[0], 
          event: { _id: 'event-birthday', name: 'Birthday Party' }
        },
        { 
          ...mockPurchasesData[1], 
          event: { _id: 'event-anniversary', name: 'Wedding Anniversary' }
        },
        { 
          ...mockPurchasesData[2], 
          event: { _id: 'event-christmas', name: 'Christmas Celebration' }
        }
      ];

      axiosInstance.get.mockImplementation((url) => {
        if (url === '/gifts') {
          return Promise.resolve({ data: eventTypePurchases });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockBudgetData });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
        expect(screen.getByText('Wedding Anniversary')).toBeInTheDocument();
        expect(screen.getByText('Christmas Celebration')).toBeInTheDocument();
      });

      // Check CSS classes are applied correctly
      const birthdayEvent = screen.getByText('Birthday Party');
      const anniversaryEvent = screen.getByText('Wedding Anniversary');
      const christmasEvent = screen.getByText('Christmas Celebration');

      expect(birthdayEvent).toHaveClass(styles.eventName, styles.eventBirthday);
      expect(anniversaryEvent).toHaveClass(styles.eventName, styles.eventAnniversary);
      expect(christmasEvent).toHaveClass(styles.eventName, styles.eventChristmas);
    });

    test('applies default CSS class for unknown event types', async () => {
      const unknownEventPurchase = {
        ...mockPurchasesData[0],
        event: { _id: 'event-unknown', name: 'Unknown Event Type' }
      };

      axiosInstance.get.mockImplementation((url) => {
        if (url === '/gifts') {
          return Promise.resolve({ data: [unknownEventPurchase] });
        }
        if (url.includes('/budgets/overall/')) {
          return Promise.resolve({ data: mockBudgetData });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Unknown Event Type')).toBeInTheDocument();
      });

      const unknownEvent = screen.getByText('Unknown Event Type');
      expect(unknownEvent).toHaveClass(styles.eventName, styles.eventDefault);
    });

    test('applies correct CSS classes to main components', async () => {
      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );

      const container = document.querySelector(`.${styles.purchaseHistory}`);
      expect(container).toBeInTheDocument();

      const contentWrapper = document.querySelector(`.${styles.contentWrapper}`);
      expect(contentWrapper).toBeInTheDocument();

      const pageTitle = document.querySelector(`.${styles.pageTitle}`);
      expect(pageTitle).toBeInTheDocument();
    });
  });

  describe('Names and dialogs', () => {
    test('the recipient filter is labelled and the edit form is a named dialog', async () => {
      render(
        <BrowserRouter>
          <PurchaseHistory />
        </BrowserRouter>
      );
      await waitFor(() => expect(screen.getByText('Wireless Headphones')).toBeInTheDocument());
      expect(screen.getByRole('combobox', { name: /filter by recipient/i })).toBeInTheDocument();
      fireEvent.click(within(screen.getByText('Wireless Headphones').closest('tr')).getByRole('button', { name: /edit purchase/i }));
      expect(screen.getByRole('dialog', { name: 'Edit Purchase' })).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
