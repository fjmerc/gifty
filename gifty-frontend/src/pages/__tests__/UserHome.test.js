import React from 'react';
import { render, screen, fireEvent, waitFor } from '../../test-utils';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import UserHome from '../js/UserHome';

// Mock CSS modules
// FontAwesome icons render as a span named after the icon
// Charts render as a div carrying what the component computed
jest.mock('react-chartjs-2', () => {
  const chart = (testId) => ({ data, options, ...rest }) => (
    <div data-testid={testId} data-chart-data={JSON.stringify(data)} data-chart-options={JSON.stringify(options)} {...rest} />
  );
  return { Line: chart('line-chart'), Bar: chart('bar-chart'), Pie: chart('pie-chart') };
});

jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: ({ icon, className, style }) => (
    <span data-testid={`${icon.iconName}-icon`} className={className} style={style} />
  ),
}));

jest.mock('../css/UserHome.module.css', () => ({
  'container': 'container',
  'header': 'header',
  'welcomeText': 'welcomeText',
  'statsGrid': 'statsGrid',
  'card': 'card',
  'statCard': 'statCard',
  'statLink': 'statLink',
  'emptyState': 'emptyState',
  'emptyAction': 'emptyAction',
  'clickable': 'clickable',
  'iconWrapper': 'iconWrapper',
  'blue': 'blue',
  'green': 'green',
  'purple': 'purple',
  'pink': 'pink',
  'statInfo': 'statInfo',
  'budgetHeader': 'budgetHeader',
  'budgetInfo': 'budgetInfo',
  'budgetAmount': 'budgetAmount',
  'remainingAmount': 'remainingAmount',
  'noBudget': 'noBudget',
  'recipientHeader': 'recipientHeader',
  'addEventButton': 'addEventButton',
  'mainGrid': 'mainGrid',
  'chartCard': 'chartCard',
  'chartTitle': 'chartTitle',
  'chartArea': 'chartArea',
  'eventsCard': 'eventsCard',
  'eventHeader': 'eventHeader',
  'titleWithFilter': 'titleWithFilter',
  'toggles': 'toggles',
  'holidayToggle': 'holidayToggle',
  'toggleLabel': 'toggleLabel',
  'regenerateButton': 'regenerateButton',
  'noEvents': 'noEvents',
  'eventItem': 'eventItem',
  'holidayEvent': 'holidayEvent',
  'eventInfo': 'eventInfo',
  'eventName': 'eventName',
  'eventDate': 'eventDate',
  'holidayLabel': 'holidayLabel',
  'chevronIcon': 'chevronIcon',
  'purchaseHistoryCard': 'purchaseHistoryCard',
  'viewAllButton': 'viewAllButton',
  'purchasePrice': 'purchasePrice',
  'modalOverlay': 'modalOverlay',
  'modalContent': 'modalContent'
}));

// Mock Form components
jest.mock('../../components/forms/js/EventForm', () => {
  return function MockEventForm({ onClose, onSubmit }) {
    return (
      <div data-testid="event-form">
        <button onClick={onClose}>Close Event Form</button>
        <button onClick={onSubmit}>Submit Event</button>
      </div>
    );
  };
});

jest.mock('../../components/forms/js/AddRecipientForm', () => {
  return function MockAddRecipientForm({ onSubmit, onCancel }) {
    return (
      <div data-testid="add-recipient-form">
        <button onClick={onCancel}>Cancel Recipient Form</button>
        <button onClick={() => onSubmit({})}>Submit Recipient</button>
      </div>
    );
  };
});

jest.mock('../../components/forms/js/OverallBudgetForm', () => {
  return function MockOverallBudgetForm({ onClose, onSubmit }) {
    return (
      <div data-testid="overall-budget-form">
        <button onClick={onClose}>Close Budget Form</button>
        <button onClick={() => onSubmit({})}>Submit Budget</button>
      </div>
    );
  };
});

// Mock react-toastify
jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn()
  }
}));

describe('UserHome Component', () => {
  const mockNavigate = jest.fn();
  
  // Mock react-router-dom
  jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => mockNavigate
  }));

  const defaultAuthContext = {
    isAuthenticated: true,
    isLoading: false,
    user: { firstName: 'Test', lastName: 'User' }
  };

  const renderUserHome = (authContext = defaultAuthContext) => {
    return render(<UserHome />, {
      routerProps: { initialEntries: ['/user-home'] },
      authContextValue: authContext
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render without crashing', async () => {
      renderUserHome();
      
      await waitFor(() => {
        expect(screen.getByText(/welcome/i)).toBeInTheDocument();
      });
    });

    it('should render welcome message when loading', () => {
      renderUserHome({ isAuthenticated: false, isLoading: true, user: null });

      expect(screen.getByText(/welcome to gifty/i)).toBeInTheDocument();
    });

    it('should render main sections', async () => {
      renderUserHome();

      await waitFor(() => {
        expect(screen.getAllByText(/upcoming events/i)).toHaveLength(3); // stat card + section title + "No upcoming events found"
        expect(screen.getByText(/purchased gifts/i)).toBeInTheDocument();
        expect(screen.getByText(/yearly budget/i)).toBeInTheDocument();
        expect(screen.getByText(/recipients/i)).toBeInTheDocument();
      });
    });

    it('should render spending chart', async () => {
      renderUserHome();

      await waitFor(() => {
        expect(screen.getByText(/gift spending overview/i)).toBeInTheDocument();
        expect(screen.getByTestId('line-chart')).toBeInTheDocument();
      });
    });

    it('should render upcoming events section', async () => {
      renderUserHome();

      await waitFor(() => {
        expect(screen.getAllByText(/upcoming events/i)).toHaveLength(3); // stat card + section title + "No upcoming events found"
        expect(screen.getByText(/holiday events/i)).toBeInTheDocument();
      });
    });

    it('shows a short empty state with a way to Gifts when nothing is purchased yet', async () => {
      renderUserHome();

      expect(await screen.findByText(/no purchases yet/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /go to gifts/i })).toHaveAttribute('href', '/gifts');
    });

    it('should render recent purchases section', async () => {
      renderUserHome();

      await waitFor(() => {
        expect(screen.getByText(/recent purchases/i)).toBeInTheDocument();
        expect(screen.getByText(/^view all$/i)).toBeInTheDocument();
      });
    });
  });

  describe('Interactive Elements', () => {
    it('should toggle holiday events visibility', async () => {
      renderUserHome();

      await waitFor(() => {
        const toggleButton = screen.getByText(/holiday events/i).closest('.holidayToggle');
        expect(toggleButton).toBeInTheDocument();
        
        // Should start with holiday events shown
        expect(screen.getByTestId('toggle-on-icon')).toBeInTheDocument();
        
        // Click to hide holiday events
        fireEvent.click(toggleButton);
        
        // Should now show toggle left (holiday events hidden)
        expect(screen.getByTestId('toggle-off-icon')).toBeInTheDocument();
      });
    });

    it('should open and close event form modal', async () => {
      renderUserHome();

      await waitFor(() => {
        // Find and click the add event button
        const addEventButtons = screen.getAllByTestId('plus-icon');
        const addEventButton = addEventButtons.find(button => 
          button.closest('button')?.getAttribute('title') === 'Add New Event'
        );
        
        if (addEventButton) {
          fireEvent.click(addEventButton.closest('button'));
          
          // Event form should be visible
          expect(screen.getByTestId('event-form')).toBeInTheDocument();
          
          // Close the form
          fireEvent.click(screen.getByText('Close Event Form'));
          
          // Event form should be hidden
          expect(screen.queryByTestId('event-form')).not.toBeInTheDocument();
        }
      });
    });

    it('should open and close recipient form modal', async () => {
      renderUserHome();

      await waitFor(() => {
        // Find and click the add recipient button
        const addRecipientButtons = screen.getAllByTestId('plus-icon');
        const addRecipientButton = addRecipientButtons.find(button => 
          button.closest('button')?.getAttribute('title') === 'Add New Recipient'
        );
        
        if (addRecipientButton) {
          fireEvent.click(addRecipientButton.closest('button'));
          
          // Recipient form should be visible
          expect(screen.getByTestId('add-recipient-form')).toBeInTheDocument();
          
          // Close the form
          fireEvent.click(screen.getByText('Cancel Recipient Form'));
          
          // Recipient form should be hidden
          expect(screen.queryByTestId('add-recipient-form')).not.toBeInTheDocument();
        }
      });
    });

    it('should open and close budget form modal', async () => {
      renderUserHome();

      await waitFor(() => {
        // Find and click the add/update budget button
        const addBudgetButtons = screen.getAllByTestId('plus-icon');
        const addBudgetButton = addBudgetButtons.find(button => 
          button.closest('button')?.getAttribute('title')?.includes('Budget')
        );
        
        if (addBudgetButton) {
          fireEvent.click(addBudgetButton.closest('button'));
          
          // Budget form should be visible
          expect(screen.getByTestId('overall-budget-form')).toBeInTheDocument();
          
          // Close the form
          fireEvent.click(screen.getByText('Close Budget Form'));
          
          // Budget form should be hidden
          expect(screen.queryByTestId('overall-budget-form')).not.toBeInTheDocument();
        }
      });
    });
  });

  describe('Data Display', () => {
    it('should display stat cards with numeric values', async () => {
      renderUserHome();

      await waitFor(() => {
        // Should display some numeric values in stat cards - check for multiple "0" values
        expect(screen.getAllByText('0')).toHaveLength(3); // Events, gifts, recipients all show 0
        
        // Check for presence of stat cards with specific text
        expect(screen.getAllByText(/upcoming events/i)).toHaveLength(3); // stat card + section title + "No upcoming events found"
        expect(screen.getByText(/purchased gifts/i)).toBeInTheDocument();
        expect(screen.getByText(/yearly budget/i)).toBeInTheDocument();
        expect(screen.getByText(/recipients/i)).toBeInTheDocument();
      });
    });

    it('should handle holiday events regeneration button', async () => {
      const { toast } = require('react-toastify');
      const axiosInstance = require('../../axiosInstance').default;
      const post = jest.spyOn(axiosInstance, 'post').mockResolvedValue({ data: { success: true, created: 5, removed: 2 } });
      
      renderUserHome();

      await waitFor(() => {
        const regenerateButton = screen.getByText(/refresh holidays/i);
        expect(regenerateButton).toBeInTheDocument();
        
      });
      fireEvent.click(screen.getByText(/refresh holidays/i));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Holidays refreshed: 5 added, 2 removed.');
      });
      expect(post).toHaveBeenCalledWith('/holidays/regenerate');
      post.mockRestore();
    });
  });

  describe('Responsive Layout', () => {
    it('should render chart within responsive container', async () => {
      renderUserHome();

      await waitFor(() => {
        expect(screen.getByTestId('line-chart').parentElement).toHaveClass('chartArea');
      });
    });

    it('should render grid layout for main sections', async () => {
      renderUserHome();

      await waitFor(() => {
        // Check for main layout elements using more flexible selectors
        const containers = screen.getAllByRole('generic');
        expect(containers.length).toBeGreaterThan(0);
        
        // Check that layout classes are present in the DOM
        expect(document.querySelector('.container')).toBeInTheDocument();
        expect(document.querySelector('.statsGrid')).toBeInTheDocument();
        expect(document.querySelector('.mainGrid')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle component mounting without errors', async () => {
      // Test that component doesn't crash during initialization
      renderUserHome();

      await waitFor(() => {
        expect(screen.getByText(/welcome/i)).toBeInTheDocument();
      });
    });

    it('should handle different authentication states', () => {
      // Test with unauthenticated state
      renderUserHome({ isAuthenticated: false, isLoading: false, user: null });

      expect(screen.getByText(/welcome to gifty/i)).toBeInTheDocument();
    });

    it('should handle loading state', () => {
      // Test with loading state
      renderUserHome({ isAuthenticated: false, isLoading: true, user: null });

      expect(screen.getByText(/welcome to gifty/i)).toBeInTheDocument();
    });
  });

  describe('Component Structure', () => {
    it('should render all main sections with correct hierarchy', async () => {
      renderUserHome();

      await waitFor(() => {
        // Check for main container structure using class selectors
        expect(document.querySelector('.container')).toBeInTheDocument();
        expect(document.querySelector('.header')).toBeInTheDocument();
        
        // Check for welcome text
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
        
        // Check for main content areas
        expect(document.querySelector('.statsGrid')).toBeInTheDocument();
        expect(document.querySelector('.mainGrid')).toBeInTheDocument();
      });
    });

    it('should render chart components correctly', async () => {
      renderUserHome();

      await waitFor(() => {
        const chart = screen.getByTestId('line-chart');
        const data = JSON.parse(chart.dataset.chartData);
        const options = JSON.parse(chart.dataset.chartOptions);
        expect(data.labels).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
        expect(data.datasets[0].data).toHaveLength(12);
        expect(options.scales.y.title.text).toMatch(/^Amount \(.+\)$/);
        // The canvas has a text alternative
        expect(chart).toHaveAttribute('role', 'img');
        expect(chart.getAttribute('aria-label')).toMatch(/^Gift spending by month: Jan /);
      });
    });

    it('should render icon components correctly', async () => {
      renderUserHome();

      await waitFor(() => {
        // Check for various icons
        expect(screen.getByTestId('calendar-days-icon')).toBeInTheDocument();
        expect(screen.getByTestId('gift-icon')).toBeInTheDocument();
        expect(screen.getByTestId('dollar-sign-icon')).toBeInTheDocument();
        expect(screen.getByTestId('users-icon')).toBeInTheDocument();
        expect(screen.getAllByTestId('plus-icon')).toHaveLength(3); // Add buttons for events, recipients, budget
      });
    });
  });

  describe('Keyboard access', () => {
    it('the stat cards are links to their pages', async () => {
      renderUserHome();
      await waitFor(() => expect(screen.getByText(/welcome/i)).toBeInTheDocument());
      expect(screen.getByRole('link', { name: /upcoming events/i })).toHaveAttribute('href', '/events');
      expect(screen.getByRole('link', { name: /purchased gifts/i })).toHaveAttribute('href', '/purchase-history');
      expect(screen.getByRole('link', { name: /yearly budget/i })).toHaveAttribute('href', '/budgets');
      expect(screen.getByRole('link', { name: /recipients/i })).toHaveAttribute('href', '/recipients');
    });

    it('the holiday filter is a toggle button', async () => {
      renderUserHome();
      const toggle = await screen.findByRole('button', { name: 'Holiday Events' });
      expect(toggle).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
    });

    it('the add buttons have names and open named dialogs', async () => {
      renderUserHome();
      fireEvent.click(await screen.findByRole('button', { name: 'Add new event' }));
      expect(screen.getByRole('dialog', { name: 'Create New Event' })).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Add new recipient' }));
      expect(screen.getByRole('dialog', { name: 'Add Recipient' })).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });

      fireEvent.click(screen.getByRole('button', { name: /^(Set|Update) budget$/ }));
      expect(screen.getByRole('dialog', { name: /Overall Budget for \d{4}/ })).toBeInTheDocument();
    });
  });
});
