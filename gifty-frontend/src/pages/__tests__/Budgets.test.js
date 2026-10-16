import React from 'react';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import { act } from '@testing-library/react';
import Budgets from '../js/Budgets';
import axiosInstance from '../../axiosInstance';
import { pinSystemDate } from '../../test-utils';

// Fixtures (event dates, budget years, /2025 URLs) are written for mid-2025
let restoreDate;
beforeAll(() => { restoreDate = pinSystemDate('2025-06-10T12:00:00Z'); });
afterAll(() => restoreDate());

// Mock external dependencies
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>
}));

const mockAuthContext = {
  isAuthenticated: true,
  logout: jest.fn()
};
jest.mock('../../AuthContext', () => ({
  useAuth: () => mockAuthContext
}));

jest.mock('../../axiosInstance');

jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: ({ icon, spin, ...props }) => (
    <span data-testid="font-awesome-icon" data-icon={icon.iconName} data-spin={spin} {...props} />
  )
}));

jest.mock('@fortawesome/free-solid-svg-icons', () => ({
  faSpinner: { iconName: 'spinner' },
  faXmark: { iconName: 'xmark' }
}));

jest.mock('../css/Budgets.module.css', () => ({
  container: 'container',
  budgetDashboard: 'budgetDashboard',
  contentContainer: 'contentContainer',
  header: 'header',
  title: 'title',
  yearSelector: 'yearSelector',
  refreshButton: 'refreshButton',
  loading: 'loading',
  error: 'error',
  overallBudget: 'overallBudget',
  overallBudgetDetails: 'overallBudgetDetails',
  budgetAmount: 'budgetAmount',
  budgetStatus: 'budgetStatus',
  notes: 'notes',
  editButton: 'editButton',
  addButton: 'addButton',
  noBudget: 'noBudget',
  recipientBudgets: 'recipientBudgets',
  recipientBudgetsGrid: 'recipientBudgetsGrid',
  recipientBudgetCard: 'recipientBudgetCard',
  warning: 'warning',
  critical: 'critical',
  recipientHeader: 'recipientHeader',
  recipientName: 'recipientName',
  recipientStatus: 'recipientStatus',
  statusCompleted: 'statusCompleted',
  statusInProgress: 'statusInProgress',
  statusPending: 'statusPending',
  statusOverdue: 'statusOverdue',
  budgetDetails: 'budgetDetails',
  budgetType: 'budgetType',
  percentageAllocation: 'percentageAllocation',
  fixedAllocation: 'fixedAllocation',
  spendingDetails: 'spendingDetails',
  spent: 'spent',
  remaining: 'remaining',
  noBudgets: 'noBudgets'
}));

jest.mock('../../components/forms/js/RecipientBudgetForm', () => 
  ({ recipient, onClose, onSubmit, year }) => (
    <div data-testid="recipient-budget-form">
      <div data-testid="form-recipient-id">{recipient?._id}</div>
      <div data-testid="form-year">{year}</div>
      <button data-testid="form-close" onClick={onClose}>Close</button>
      <button data-testid="form-submit" onClick={() => onSubmit({ 
        allocationType: 'percentage', 
        percentageAllocation: 25,
        giftStatus: 'active'
      })}>Submit</button>
    </div>
  )
);

jest.mock('../../components/js/BudgetAnalytics', () => 
  ({ analytics, recipientBudgets, overallBudget, onUpdateAllocations }) => (
    <div data-testid="budget-analytics">
      <div data-testid="analytics-data">{JSON.stringify(analytics)}</div>
      <button data-testid="update-allocations" onClick={() => onUpdateAllocations([
        { id: 'recipient1', percentage: 30 },
        { id: 'recipient2', percentage: 20 }
      ])}>Update Allocations</button>
    </div>
  )
);

describe('Budgets Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthContext.isAuthenticated = true;
    axiosInstance.get.mockClear();
    axiosInstance.post.mockClear();
    axiosInstance.put.mockClear();
  });

  // ===== SECTION 1: UTILITY FUNCTIONS =====
  describe('getStatusClassName utility function', () => {
    const getStatusClassName = (status) => {
      switch (status?.toLowerCase()) {
        case 'active':
          return 'statusInProgress';
        case 'inactive':
          return 'statusPending';
        case 'paused':
          return 'statusOverdue';
        case 'seasonal':
          return 'statusCompleted';
        default:
          return 'statusPending';
      }
    };

    test('should return statusInProgress for active status', () => {
      expect(getStatusClassName('active')).toBe('statusInProgress');
    });

    test('should return statusPending for inactive status', () => {
      expect(getStatusClassName('inactive')).toBe('statusPending');
    });

    test('should return statusOverdue for paused status', () => {
      expect(getStatusClassName('paused')).toBe('statusOverdue');
    });

    test('should return statusCompleted for seasonal status', () => {
      expect(getStatusClassName('seasonal')).toBe('statusCompleted');
    });

    test('should return statusPending for unknown status', () => {
      expect(getStatusClassName('unknown')).toBe('statusPending');
    });

    test('should return statusPending for null status', () => {
      expect(getStatusClassName(null)).toBe('statusPending');
    });

    test('should handle case insensitive status values', () => {
      expect(getStatusClassName('ACTIVE')).toBe('statusInProgress');
    });
  });

  // ===== SECTION 2: AUTHENTICATION & BASIC RENDERING =====
  describe('Authentication and Basic Rendering', () => {
    const mockAvailableYears = [2023, 2024, 2025];
    const mockBudgetData = {
      overallBudget: {
        _id: 'budget1',
        exists: true,
        amount: 1000,
        currency: 'USD',
        isLimited: true,
        allocatedAmount: 600,
        remainingAmount: 400,
        notes: 'Holiday budget for 2024'
      },
      recipientBudgets: []
    };
    const mockAnalytics = {
      totalBudget: 1000,
      totalAllocated: 600,
      totalSpent: 330
    };

    test('should redirect to login when not authenticated', () => {
      mockAuthContext.isAuthenticated = false;
      
      rtlRender(<Budgets />);
      
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });

    test('should render loading state initially', async () => {
      axiosInstance.get
        .mockResolvedValueOnce({ data: mockAvailableYears })
        .mockResolvedValueOnce({ data: mockBudgetData })
        .mockResolvedValueOnce({ data: mockAnalytics });

      rtlRender(<Budgets />);
      
      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.getByTestId('font-awesome-icon')).toHaveAttribute('data-icon', 'spinner');
      expect(screen.getByTestId('font-awesome-icon')).toHaveAttribute('data-spin', 'true');
    });

    test('should handle 401 authentication error and logout', async () => {
      const authError = { 
        response: { status: 401 } 
      };
      axiosInstance.get.mockRejectedValueOnce(authError);

      rtlRender(<Budgets />);
      
      await waitFor(() => {
        expect(mockAuthContext.logout).toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith('/login');
      });
    });

    test('should render budget dashboard when data loads successfully', async () => {
      axiosInstance.get
        .mockResolvedValueOnce({ data: mockAvailableYears })
        .mockResolvedValueOnce({ data: mockBudgetData })
        .mockResolvedValueOnce({ data: mockAnalytics });

      rtlRender(<Budgets />);
      
      await waitFor(() => {
        expect(screen.getByText('Budget Dashboard')).toBeInTheDocument();
      });
      
      expect(screen.getByText('Overall Budget')).toBeInTheDocument();
      expect(screen.getByText('Recipient Budgets')).toBeInTheDocument();
    });

    test('should make API call to fetch available years on mount', async () => {
      axiosInstance.get
        .mockResolvedValueOnce({ data: mockAvailableYears })
        .mockResolvedValueOnce({ data: mockBudgetData })
        .mockResolvedValueOnce({ data: mockAnalytics });

      rtlRender(<Budgets />);
      
      // API call should be made immediately
      expect(axiosInstance.get).toHaveBeenCalledWith('/budgets/available-years');
    });

    test('should render year selector with available years', async () => {
      // The component sorts years in descending order and defaults to the first one (highest)
      axiosInstance.get
        .mockResolvedValueOnce({ data: mockAvailableYears })
        .mockResolvedValueOnce({ data: mockBudgetData })
        .mockResolvedValueOnce({ data: mockAnalytics });

      rtlRender(<Budgets />);
      
      await waitFor(() => {
        const yearSelect = screen.getByDisplayValue('2025'); // Should be highest year
        expect(yearSelect).toBeInTheDocument();
      });
      
      // Check that all years are in the selector
      mockAvailableYears.forEach(year => {
        expect(screen.getByText(year.toString())).toBeInTheDocument();
      });
    });

    test('should render refresh button', async () => {
      axiosInstance.get
        .mockResolvedValueOnce({ data: mockAvailableYears })
        .mockResolvedValueOnce({ data: mockBudgetData })
        .mockResolvedValueOnce({ data: mockAnalytics });

      rtlRender(<Budgets />);
      
      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });
    });

    test('should call fetchAvailableYears on mount when authenticated', async () => {
      axiosInstance.get
        .mockResolvedValueOnce({ data: mockAvailableYears })
        .mockResolvedValueOnce({ data: mockBudgetData })
        .mockResolvedValueOnce({ data: mockAnalytics });

      rtlRender(<Budgets />);
      
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/budgets/available-years');
      });
    });

    test('should call fetchBudgetData after years are loaded', async () => {
      axiosInstance.get
        .mockResolvedValueOnce({ data: mockAvailableYears })
        .mockResolvedValueOnce({ data: mockBudgetData })
        .mockResolvedValueOnce({ data: mockAnalytics });

      rtlRender(<Budgets />);
      
      await waitFor(() => {
        // Year will be set to first (highest) in sorted array: 2025
        expect(axiosInstance.get).toHaveBeenCalledWith('/budgets/all/2025');
        expect(axiosInstance.get).toHaveBeenCalledWith('/budgets/analytics/2025');
      });
    });

    test('should add next year when available years is empty', async () => {
      const currentYear = new Date().getFullYear();
      const nextYear = currentYear + 1;
      
      // Mock successful responses for all API calls
      axiosInstance.get
        .mockResolvedValueOnce({ data: [] }) // empty years - should add next year
        .mockResolvedValueOnce({ data: mockBudgetData }) // budget data for next year
        .mockResolvedValueOnce({ data: mockAnalytics }); // analytics for next year

      rtlRender(<Budgets />);
      
      // Check that the API is called with the empty array
      expect(axiosInstance.get).toHaveBeenCalledWith('/budgets/available-years');
      
      await waitFor(() => {
        // Should eventually make calls for the next year
        expect(axiosInstance.get).toHaveBeenCalledWith(`/budgets/all/${nextYear}`);
      });
    });

    test('should not render anything when not authenticated', () => {
      mockAuthContext.isAuthenticated = false;
      
      const { container } = rtlRender(<Budgets />);
      
      expect(container.firstChild).toBeNull();
    });

    test('should add next year to available years if not present', async () => {
      const currentYear = new Date().getFullYear();
      const yearsWithoutNext = [currentYear - 1, currentYear];
      const nextYear = currentYear + 1;
      
      axiosInstance.get
        .mockResolvedValueOnce({ data: yearsWithoutNext })
        .mockResolvedValueOnce({ data: mockBudgetData })
        .mockResolvedValueOnce({ data: mockAnalytics });

      rtlRender(<Budgets />);
      
      await waitFor(() => {
        expect(screen.getByText(nextYear.toString())).toBeInTheDocument();
      });
    });

    test('should sort available years in descending order', async () => {
      const unsortedYears = [2023, 2025, 2024];
      
      axiosInstance.get
        .mockResolvedValueOnce({ data: unsortedYears })
        .mockResolvedValueOnce({ data: mockBudgetData })
        .mockResolvedValueOnce({ data: mockAnalytics });

      rtlRender(<Budgets />);
      
      await waitFor(() => {
        const yearSelect = screen.getByDisplayValue('2025'); // Should default to first (highest) year
        expect(yearSelect).toBeInTheDocument();
      });
    });

    test('should handle analytics fetch error separately from budget data', async () => {
      axiosInstance.get
        .mockResolvedValueOnce({ data: mockAvailableYears })
        .mockResolvedValueOnce({ data: mockBudgetData })
        .mockRejectedValueOnce(new Error('Analytics error'));

      rtlRender(<Budgets />);
      
      await waitFor(() => {
        // Analytics error shows error message instead of dashboard
        expect(screen.getByText('Failed to load budget analytics. Please try again.')).toBeInTheDocument();
      });
      
      // Component should show error state when analytics fails
      expect(screen.queryByText('Budget Dashboard')).not.toBeInTheDocument();
    });
  });

  // ===== SECTION 3: DATA FETCHING & API INTEGRATION =====
  describe('Data Fetching and API Integration', () => {
    // Backend-accurate mock data structures
    const mockOverallBudget = {
      exists: true,
      _id: 'budget1',
      amount: 1000,
      isLimited: true,
      currency: 'USD',
      year: 2024,
      notes: 'Holiday budget for 2024',
      allocated: 600,
      unallocated: 400,
      spent: 150,
      leftToSpend: 850,
      allocatedAmount: 600,
      totalAllocated: 600,
      remainingAmount: 400,
      totalSpent: 150,
      unspentAmount: 850
    };

    const mockRecipientBudgets = [
      {
        _id: 'recipient1',
        firstName: 'John',
        lastName: 'Doe',
        giftStatus: 'active',
        spent: 150,
        left: 150,
        status: 'warning',
        limit: 300,
        budget: {
          exists: true,
          _id: 'budget_recipient1',
          type: 'percentage',
          allocationType: 'percentage',
          percentageAllocation: 30,
          isLimited: true,
          limit: 300,
          currency: 'USD',
          notes: 'Brother budget'
        }
      }
    ];

    const mockAnalytics = {
      totalBudgets: 1,
      totalSpent: 150,
      budgetStatuses: {
        normal: 1,
        warning: 0,
        critical: 0
      },
      monthlySpending: [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65]
    };

    const mockBudgetDataResponse = {
      overallBudget: mockOverallBudget,
      recipientBudgets: mockRecipientBudgets,
      budgetStatuses: {
        normal: 1,
        warning: 0,
        critical: 0
      }
    };

    beforeEach(() => {
      jest.clearAllMocks();
      mockAuthContext.isAuthenticated = true;
    });

    test('should successfully load and display budget data', async () => {
      // Mock the exact API call sequence: years → budget data → analytics
      axiosInstance.get
        .mockResolvedValueOnce({ data: [2023, 2024, 2025] }) // /budgets/available-years
        .mockResolvedValueOnce({ data: mockBudgetDataResponse }) // /budgets/all/2025
        .mockResolvedValueOnce({ data: mockAnalytics }); // /budgets/analytics/2025

      rtlRender(<Budgets />);
      
      await waitFor(() => {
        expect(screen.getByText('Budget Dashboard')).toBeInTheDocument();
      });

      // Verify API calls were made in correct order
      expect(axiosInstance.get).toHaveBeenNthCalledWith(1, '/budgets/available-years');
      expect(axiosInstance.get).toHaveBeenNthCalledWith(2, '/budgets/all/2025'); // First/highest year
      expect(axiosInstance.get).toHaveBeenNthCalledWith(3, '/budgets/analytics/2025');
    });

    test('should display overall budget details', async () => {
      // Use consistent years - component will pick first year (2025)
      axiosInstance.get
        .mockResolvedValueOnce({ data: [2023, 2024, 2025] }) // available years
        .mockResolvedValueOnce({ data: mockBudgetDataResponse }) // /budgets/all/2025
        .mockResolvedValueOnce({ data: mockAnalytics }); // /budgets/analytics/2025

      rtlRender(<Budgets />);
      
      await waitFor(() => {
        expect(screen.getByText('$1,000.00')).toBeInTheDocument(); // Total amount
        expect(screen.getByText('$600.00')).toBeInTheDocument(); // Allocated amount
        expect(screen.getByText('$400.00')).toBeInTheDocument(); // Remaining amount
        expect(screen.getByText('Limited')).toBeInTheDocument(); // Budget status
        expect(screen.getByText('Holiday budget for 2024')).toBeInTheDocument(); // Notes
      });
    });

    test('should display recipient budget information', async () => {
      axiosInstance.get
        .mockResolvedValueOnce({ data: [2023, 2024, 2025] })
        .mockResolvedValueOnce({ data: mockBudgetDataResponse })
        .mockResolvedValueOnce({ data: mockAnalytics });

      rtlRender(<Budgets />);
      
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('30% of Overall Budget')).toBeInTheDocument();
        expect(screen.getAllByText('Left:').map((label) => label.nextSibling.textContent)).toContain('$150.00'); // Left, without a repeated "left"
        expect(screen.getByText('Brother budget')).toBeInTheDocument(); // Notes
      });
    });

    test('should handle no overall budget state', async () => {
      const noBudgetResponse = {
        overallBudget: null,
        recipientBudgets: [],
        budgetStatuses: { normal: 0, warning: 0, critical: 0 }
      };

      axiosInstance.get
        .mockResolvedValueOnce({ data: [2023, 2024, 2025] })
        .mockResolvedValueOnce({ data: noBudgetResponse })
        .mockResolvedValueOnce({ data: mockAnalytics });

      rtlRender(<Budgets />);
      
      await waitFor(() => {
        expect(screen.getByText('No overall budget set for this year.')).toBeInTheDocument();
        expect(screen.getByText('Add Overall Budget')).toBeInTheDocument();
      });
    });
  });

  // ===== SECTION 4: USER INTERACTIONS & FORMS =====
  describe('User Interactions and Forms', () => {
    const mockBudgetData = {
      overallBudget: {
        _id: 'budget1',
        exists: true,
        amount: 1000,
        currency: 'USD',
        isLimited: true,
        allocatedAmount: 600,
        remainingAmount: 400,
        notes: 'Holiday budget for 2024'
      },
      recipientBudgets: [
        {
          _id: 'recipient1',
          firstName: 'John',
          lastName: 'Doe',
          giftStatus: 'active',
          budget: {
            _id: 'budget_recipient1',
            allocationType: 'percentage',
            percentageAllocation: 30,
            maximumAmount: 300,
            spentAmount: 150,
            remainingAmount: 150,
            currency: 'USD',
            isLimited: true,
            budgetStatus: 'normal',
            notes: 'Brother budget'
          }
        }
      ],
      budgetStatuses: { normal: 1, warning: 0, critical: 0 }
    };

    const mockAnalytics = {
      totalBudgets: 1,
      totalSpent: 150,
      budgetStatuses: { normal: 1, warning: 0, critical: 0 },
      monthlySpending: [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65]
    };

    test('should navigate to edit overall budget when button clicked', async () => {
      axiosInstance.get
        .mockResolvedValueOnce({ data: [2023, 2024, 2025] })
        .mockResolvedValueOnce({ data: mockBudgetData })
        .mockResolvedValueOnce({ data: mockAnalytics });

      rtlRender(<Budgets />);
      
      await waitFor(() => {
        expect(screen.getByText('Edit Overall Budget')).toBeInTheDocument();
      });

      const editButton = screen.getByText('Edit Overall Budget');
      fireEvent.click(editButton);

      expect(mockNavigate).toHaveBeenCalledWith('/budgets/overall/2025');
    });

    test('should navigate to add overall budget when no budget exists', async () => {
      const noBudgetData = {
        overallBudget: null,
        recipientBudgets: [],
        budgetStatuses: { normal: 0, warning: 0, critical: 0 }
      };

      axiosInstance.get
        .mockResolvedValueOnce({ data: [2023, 2024, 2025] })
        .mockResolvedValueOnce({ data: noBudgetData })
        .mockResolvedValueOnce({ data: mockAnalytics });

      rtlRender(<Budgets />);
      
      await waitFor(() => {
        expect(screen.getByText('Add Overall Budget')).toBeInTheDocument();
      });

      const addButton = screen.getByText('Add Overall Budget');
      fireEvent.click(addButton);

      expect(mockNavigate).toHaveBeenCalledWith('/budgets/overall/2025');
    });
  });
});