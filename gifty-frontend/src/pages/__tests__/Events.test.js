import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { toast } from 'react-toastify';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import Events from '../js/Events';
import axiosInstance from '../../axiosInstance';
import { pinSystemDate } from '../../test-utils';

// Fixtures (event dates, budget years, /2025 URLs) are written for mid-2025
let restoreDate;
beforeAll(() => { restoreDate = pinSystemDate('2025-06-10T12:00:00Z'); });
afterAll(() => restoreDate());

// Mock external dependencies
jest.mock('../../axiosInstance');
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  ToastContainer: () => null,
}));
jest.mock('@fullcalendar/react', () => {
  return function MockFullCalendar({ eventClick, dateClick, eventDidMount, events, initialDate }) {
    return (
      <div data-testid="mock-fullcalendar" data-initial-date={initialDate}>
        <div>Mock FullCalendar</div>
        {events && events.map(event => (
          <div 
            key={event.id} 
            data-testid={`calendar-event-${event.id}`}
            data-start={String(event.start)}
            onClick={() => eventClick && eventClick({ event: { extendedProps: event.extendedProps } })}
          >
            {event.title}
          </div>
        ))}
      </div>
    );
  };
});

jest.mock('@fullcalendar/daygrid', () => ({}));
jest.mock('@fullcalendar/interaction', () => ({}));

jest.mock('tippy.js', () => {
  const mockTippy = jest.fn(() => ({
    destroy: jest.fn()
  }));
  return mockTippy;
});

// Mock CSS modules
jest.mock('../css/Events.module.css', () => ({
  'events-page': 'events-page',
  'events-header': 'events-header',
  'title-row': 'title-row',
  'header-actions': 'header-actions',
  'event-actions': 'event-actions',
  'btn-add': 'btn-add',
  'btn-filters': 'btn-filters',
  'view-toggle': 'view-toggle',
  'btn-toggle': 'btn-toggle',
  'active': 'active',
  'filters': 'filters',
  'filter-actions': 'filter-actions',
  'btn-clear-filters': 'btn-clear-filters',
  'event-form-overlay': 'event-form-overlay',
  'event-form-container': 'event-form-container',
  'events-content': 'events-content',
  'custom-event-types-section': 'custom-event-types-section',
  'custom-event-types-grid': 'custom-event-types-grid',
  'custom-event-type-card': 'custom-event-type-card',
  'custom-event-type-content': 'custom-event-type-content',
  'custom-event-type-actions': 'custom-event-type-actions',
  'edit-button': 'edit-button',
  'delete-button': 'delete-button',
  'list-view': 'list-view',
  'toggle-container': 'toggle-container',
  'toggle-switch': 'toggle-switch',
  'toggle-slider': 'toggle-slider',
  'toggle-label': 'toggle-label',
  'toggle-icon': 'toggle-icon',
  'month-group': 'month-group',
  'past-month': 'past-month',
  'month-header': 'month-header',
  'event-grid': 'event-grid',
  'event-card': 'event-card',
  'system-event-card': 'system-event-card',
  'event-content': 'event-content',
  'event-card-header': 'event-card-header',
  'system-tag': 'system-tag',
  'days-countdown': 'days-countdown',
  'event-actions': 'event-actions',
  'reminder-button': 'reminder-button',
  'calendar-container': 'calendar-container'
}));

jest.mock('../css/FullCalendarOverrides.css', () => ({}));

// Mock form components
jest.mock('../../components/forms/js/EventForm', () => {
  return function MockEventForm({ event, onClose, onSubmit, isEditing }) {
    return (
      <div data-testid="mock-event-form">
        <h3>Mock Event Form</h3>
        <p>Editing: {isEditing ? 'true' : 'false'}</p>
        <p>Event ID: {event?._id || 'new'}</p>
        <button onClick={onClose}>Close</button>
        <button onClick={onSubmit}>Submit</button>
      </div>
    );
  };
});

jest.mock('../../components/forms/js/CustomEventTypeForm', () => {
  return function MockCustomEventTypeForm({ eventType, onClose, onSuccess }) {
    return (
      <div data-testid="mock-custom-event-type-form">
        <h3>Mock Custom Event Type Form</h3>
        <p>Event Type ID: {eventType?._id || 'new'}</p>
        <button onClick={onClose}>Close</button>
        <button onClick={onSuccess}>Success</button>
      </div>
    );
  };
});

// Mock FontAwesome icons
jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: ({ icon, ...props }) => <span data-testid={`icon-${icon.iconName}`} {...props} />
}));

jest.mock('@fortawesome/free-solid-svg-icons', () => ({
  faCalendarAlt: { iconName: 'calendar-alt' },
  faList: { iconName: 'list' },
  faPlus: { iconName: 'plus' },
  faBell: { iconName: 'bell' },
  faFilter: { iconName: 'filter' },
  faFilterCircleXmark: { iconName: 'filter-circle-xmark' },
  faEdit: { iconName: 'edit' },
  faTrash: { iconName: 'trash' },
  faTags: { iconName: 'tags' },
  faSearch: { iconName: 'search' },
  faCalendarCheck: { iconName: 'calendar-check' },
  faGift: { iconName: 'gift' },
  faStar: { iconName: 'star' },
  faXmark: { iconName: 'xmark' }
}));

// Mock data
const mockEvents = [
  {
    _id: '507f1f77bcf86cd799439011',
    name: 'Birthday Party',
    date: '2025-06-15T00:00:00.000Z',
    recipient: {
      _id: '507f1f77bcf86cd799439012',
      firstName: 'John',
      lastName: 'Doe'
    },
    type: {
      _id: '507f1f77bcf86cd799439013',
      name: 'Birthday'
    },
    isSystemGenerated: false,
    reminder: {
      isSet: true,
      time: '2025-06-14T10:00:00.000Z',
      method: 'Email'
    }
  },
  {
    _id: '507f1f77bcf86cd799439014',
    name: 'Wedding Anniversary',
    date: '2025-07-20T00:00:00.000Z',
    recipient: {
      _id: '507f1f77bcf86cd799439015',
      firstName: 'Jane',
      lastName: 'Smith'
    },
    type: {
      _id: '507f1f77bcf86cd799439016',
      name: 'Anniversary'
    },
    isSystemGenerated: true,
    reminder: {
      isSet: false,
      time: null,
      method: null
    }
  }
];

const mockRecipients = [
  {
    _id: '507f1f77bcf86cd799439012',
    firstName: 'John',
    lastName: 'Doe',
    isSystemAccount: false
  },
  {
    _id: '507f1f77bcf86cd799439015',
    firstName: 'Jane',
    lastName: 'Smith',
    isSystemAccount: false
  },
  {
    _id: '507f1f77bcf86cd799439017',
    firstName: 'System',
    lastName: 'Account',
    isSystemAccount: true
  }
];

const mockEventTypes = [
  {
    _id: '507f1f77bcf86cd799439013',
    name: 'Birthday',
    isCustom: false
  },
  {
    _id: '507f1f77bcf86cd799439016',
    name: 'Anniversary',
    isCustom: false
  },
  {
    _id: '507f1f77bcf86cd799439018',
    name: 'Custom Event',
    isCustom: true,
    description: 'A custom event type'
  }
];

// Test utilities
const mockStore = createStore(() => ({
  user: {
    userInfo: {
      _id: '507f1f77bcf86cd799439019',
      firstName: 'Test',
      lastName: 'User'
    }
  }
}));

const renderWithProviders = (component) => {
  return render(
    <Provider store={mockStore}>
      <BrowserRouter>
        {component}
      </BrowserRouter>
    </Provider>
  );
};

describe('Events Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default axios mock responses
    axiosInstance.get.mockImplementation((url) => {
      if (url === '/events') {
        return Promise.resolve({ data: mockEvents });
      }
      if (url === '/recipients/all-including-system') {
        return Promise.resolve({ data: mockRecipients });
      }
      if (url === '/eventTypes') {
        return Promise.resolve({ data: mockEventTypes });
      }
      if (url.startsWith('/recipients/')) {
        const recipientId = url.split('/')[2];
        const recipient = mockRecipients.find(r => r._id === recipientId);
        return Promise.resolve({ data: recipient });
      }
      return Promise.reject(new Error('Unexpected API call'));
    });

    axiosInstance.put.mockResolvedValue({ data: {} });
    axiosInstance.delete.mockResolvedValue({ data: {} });
  });

  describe('Component Rendering', () => {
    test('renders Events page with header and basic elements', async () => {
      renderWithProviders(<Events />);
      
      expect(screen.getByRole('heading', { name: /events management/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add event/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /add custom event type/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /advanced/i })).toBeInTheDocument();
    });

    test('renders view toggle buttons', async () => {
      renderWithProviders(<Events />);
      
      expect(screen.getByRole('button', { name: /list/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /calendar/i })).toBeInTheDocument();
    });

    test('initially shows list view as default', async () => {
      renderWithProviders(<Events />);
      
      const listButton = screen.getByRole('button', { name: /list/i });
      expect(listButton).toHaveClass('active');
    });
  });

  describe('API Integration', () => {
    test('fetches events, recipients, and event types on component mount', async () => {
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/events');
        expect(axiosInstance.get).toHaveBeenCalledWith('/recipients/all-including-system');
        expect(axiosInstance.get).toHaveBeenCalledWith('/eventTypes');
      });
    });

    test('names recipients from the loaded lists, without one request per event', async () => {
      renderWithProviders(<Events />);

      expect(await screen.findByText('Recipient: John Doe')).toBeInTheDocument();
      expect(screen.getByText('Recipient: Jane Smith')).toBeInTheDocument();
      const perRecipient = axiosInstance.get.mock.calls
        .map(([url]) => url)
        .filter((url) => /^\/recipients\/[0-9a-f]{24}$/.test(url));
      expect(perRecipient).toEqual([]);
    });

    test('an archived recipient (missing from the list) keeps the name the event carries', async () => {
      axiosInstance.get.mockImplementation((url) => {
        if (url === '/events') return Promise.resolve({ data: mockEvents });
        if (url === '/recipients/all-including-system') return Promise.resolve({ data: mockRecipients.slice(1) });
        if (url === '/eventTypes') return Promise.resolve({ data: mockEventTypes });
        return Promise.reject(new Error('Unexpected API call ' + url));
      });
      renderWithProviders(<Events />);

      expect(await screen.findByText('Recipient: John Doe')).toBeInTheDocument();
    });

    test('handles API error gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      axiosInstance.get.mockRejectedValue(new Error('API Error'));
      
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching events:', expect.any(Error));
      });
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('View Toggle Functionality', () => {
    test('switches between list and calendar views', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      // Initially in list view
      const listButton = screen.getByRole('button', { name: /list/i });
      const calendarButton = screen.getByRole('button', { name: /calendar/i });
      expect(listButton).toHaveClass('active');
      
      // Switch to calendar view
      await user.click(calendarButton);
      expect(calendarButton).toHaveClass('active');
      expect(listButton).not.toHaveClass('active');
      
      // Switch back to list view
      await user.click(listButton);
      expect(listButton).toHaveClass('active');
      expect(calendarButton).not.toHaveClass('active');
    });

    test('shows FullCalendar component in calendar view', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      const calendarButton = screen.getByRole('button', { name: /calendar/i });
      await user.click(calendarButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('mock-fullcalendar')).toBeInTheDocument();
      });
    });

    test("opens the calendar on today's local date, not UTC's", async () => {
      // 9 PM on Oct 31 in Los Angeles is already Nov 1 in UTC
      const restore = pinSystemDate('2026-11-01T04:00:00Z');
      try {
        const user = userEvent.setup();
        renderWithProviders(<Events />);
        await user.click(screen.getByRole('button', { name: /calendar/i }));
        expect(await screen.findByTestId('mock-fullcalendar')).toHaveAttribute('data-initial-date', '2026-10-31');
      } finally {
        restore();
      }
    });

    test('shows list view component by default', async () => {
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        expect(screen.getByText(/show past events/i)).toBeInTheDocument();
      });
    });
  });

  describe('Event Display', () => {
    test('displays events in list view', async () => {
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
        expect(screen.getByText('Wedding Anniversary')).toBeInTheDocument();
      });
    });

    test('shows each event on its calendar day, also west of UTC', async () => {
      // Stored as UTC midnight; Jest runs in Los Angeles, where that instant is the evening before
      const firstOfJune = { ...mockEvents[0], date: '2025-06-01T00:00:00.000Z' };
      axiosInstance.get.mockImplementation((url) => {
        if (url === '/events') return Promise.resolve({ data: [firstOfJune] });
        if (url === '/recipients/all-including-system') return Promise.resolve({ data: mockRecipients });
        if (url === '/eventTypes') return Promise.resolve({ data: mockEventTypes });
        if (url.startsWith('/recipients/')) return Promise.resolve({ data: mockRecipients[0] });
        return Promise.reject(new Error('Unexpected API call'));
      });
      renderWithProviders(<Events />);

      await waitFor(() => {
        expect(screen.getByText(new Date(2025, 5, 1).toLocaleDateString())).toBeInTheDocument();
      });
      expect(screen.getByText('June 2025')).toBeInTheDocument();
      expect(screen.queryByText('May 2025')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /calendar/i }));
      await waitFor(() => {
        expect(screen.getByTestId(`calendar-event-${firstOfJune._id}`)).toHaveAttribute('data-start', '2025-06-01');
      });
    });

    test("keeps today's event in the This Week filter", async () => {
      const now = new Date();
      const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString();
      const todays = { ...mockEvents[0], _id: 'today-event', name: 'Happening today', date: today };
      axiosInstance.get.mockImplementation((url) => {
        if (url === '/events') return Promise.resolve({ data: [todays] });
        if (url === '/recipients/all-including-system') return Promise.resolve({ data: mockRecipients });
        if (url === '/eventTypes') return Promise.resolve({ data: mockEventTypes });
        if (url.startsWith('/recipients/')) return Promise.resolve({ data: mockRecipients[0] });
        return Promise.reject(new Error('Unexpected API call'));
      });
      renderWithProviders(<Events />);
      await waitFor(() => expect(screen.getByText('Happening today')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /^This Week$/ }));

      expect(screen.getByText('Happening today')).toBeInTheDocument();
    });

    test('displays system event tag for system-generated events', async () => {
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        expect(screen.getByText('System Event')).toBeInTheDocument();
      });
    });

    test('groups events by month and year', async () => {
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        expect(screen.getByText('June 2025')).toBeInTheDocument();
        expect(screen.getByText('July 2025')).toBeInTheDocument();
      });
    });

    test('displays recipient information for events', async () => {
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        expect(screen.getByText('Recipient: John Doe')).toBeInTheDocument();
        expect(screen.getByText('Recipient: Jane Smith')).toBeInTheDocument();
      });
    });
  });

  describe('Event Actions', () => {
    test('displays edit and delete buttons for events', async () => {
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        const editButtons = screen.getAllByTestId('icon-edit');
        const deleteButtons = screen.getAllByTestId('icon-trash');
        const reminderButtons = screen.getAllByTestId('icon-bell');
        
        // 2 events + 1 custom event type = 3 edit buttons total
        expect(editButtons).toHaveLength(3);
        // 2 events + 1 custom event type = 3 delete buttons total 
        expect(deleteButtons).toHaveLength(3);
        // 2 events only = 2 reminder buttons (custom types don't have reminders)
        expect(reminderButtons).toHaveLength(2);
      });
    });

    test('shows reminder status with different colors', async () => {
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        const reminderButtons = screen.getAllByTestId('icon-bell');
        expect(reminderButtons[0]).toHaveStyle('color: var(--color-warning)'); // Active reminder
        expect(reminderButtons[1]).toHaveStyle('color: var(--color-ink-muted)'); // No reminder
      });
    });
  });

  describe('Page header actions', () => {
    // The event cards' hover-only, absolutely positioned actions share no
    // class with these: sharing one put the buttons under the fixed app header
    test('puts Add Event and Add Custom Event Type next to the heading, and both open their forms', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);

      const titleRow = screen.getByRole('heading', { name: /events management/i }).parentElement;
      const addEvent = within(titleRow).getByRole('button', { name: /add event/i });
      const addType = within(titleRow).getByRole('button', { name: /add custom event type/i });
      expect(addEvent.closest('.event-actions')).toBeNull();
      expect(addType.closest('.event-actions')).toBeNull();

      await user.click(addEvent);
      expect(screen.getByTestId('mock-event-form')).toBeInTheDocument();
      await user.click(within(screen.getByTestId('mock-event-form')).getByRole('button', { name: 'Close' }));

      await user.click(addType);
      expect(screen.getByTestId('mock-custom-event-type-form')).toBeInTheDocument();
    });
  });

  describe('Form Management', () => {
    test('opens event form when Add Event is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      const addButton = screen.getByRole('button', { name: /add event/i });
      await user.click(addButton);
      
      expect(screen.getByTestId('mock-event-form')).toBeInTheDocument();
      expect(screen.getByText('Editing: false')).toBeInTheDocument();
      expect(screen.getByText('Event ID: new')).toBeInTheDocument();
    });

    test('opens custom event type form when Add Custom Event Type is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      const addCustomButton = screen.getByRole('button', { name: /add custom event type/i });
      await user.click(addCustomButton);
      
      expect(screen.getByTestId('mock-custom-event-type-form')).toBeInTheDocument();
      expect(screen.getByText('Event Type ID: new')).toBeInTheDocument();
    });

    test('closes event form when close button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      // Open form
      const addButton = screen.getByRole('button', { name: /add event/i });
      await user.click(addButton);
      expect(screen.getByTestId('mock-event-form')).toBeInTheDocument();
      
      // Close form (the form's own close, not the dialog's)
      const closeButton = within(screen.getByTestId('mock-event-form')).getByRole('button', { name: /close/i });
      await user.click(closeButton);
      expect(screen.queryByTestId('mock-event-form')).not.toBeInTheDocument();
    });

    test('closes custom event type form when close button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      // Open form
      const addCustomButton = screen.getByRole('button', { name: /add custom event type/i });
      await user.click(addCustomButton);
      expect(screen.getByTestId('mock-custom-event-type-form')).toBeInTheDocument();
      
      // Close form (the form's own close, not the dialog's)
      const closeButton = within(screen.getByTestId('mock-custom-event-type-form')).getByRole('button', { name: /close/i });
      await user.click(closeButton);
      expect(screen.queryByTestId('mock-custom-event-type-form')).not.toBeInTheDocument();
    });

    test('refreshes events when event form is submitted', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      // Open form
      const addButton = screen.getByRole('button', { name: /add event/i });
      await user.click(addButton);
      
      // Submit form
      const submitButton = screen.getByRole('button', { name: /submit/i });
      await user.click(submitButton);
      
      // Should call fetchEvents again and close form
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/events');
        expect(screen.queryByTestId('mock-event-form')).not.toBeInTheDocument();
      });
    });

    test('refreshes event types when custom event type form is successful', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      // Open form
      const addCustomButton = screen.getByRole('button', { name: /add custom event type/i });
      await user.click(addCustomButton);
      
      // Submit form
      const successButton = screen.getByRole('button', { name: /success/i });
      await user.click(successButton);
      
      // Should call fetchEventTypes again
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/eventTypes');
      });
    });
  });

  describe('Event Editing', () => {
    test('opens event form in edit mode when edit button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
      });
      
      const editButtons = screen.getAllByTestId('icon-edit');
      await user.click(editButtons[0]);
      
      expect(screen.getByTestId('mock-event-form')).toBeInTheDocument();
      expect(screen.getByText('Editing: true')).toBeInTheDocument();
      expect(screen.getByText('Event ID: 507f1f77bcf86cd799439011')).toBeInTheDocument();
    });

    test('handles reminder toggle', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
      });
      
      const reminderButtons = screen.getAllByTestId('icon-bell');
      await user.click(reminderButtons[0]);
      
      // Only the reminder changes: sending the whole event back sent the
      // populated recipient and type, which the server refused (404)
      await waitFor(() => {
        expect(axiosInstance.put).toHaveBeenCalledWith('/events/507f1f77bcf86cd799439011', {
          reminder: { isSet: false, time: '2025-06-14T10:00:00.000Z', method: 'Email' }
        });
      });
    });

    test('a new reminder from the bell defaults to 9:00 the day before the event', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      await waitFor(() => expect(screen.getByText('Wedding Anniversary')).toBeInTheDocument());

      await user.click(screen.getAllByTestId('icon-bell')[1]);

      // Jul 19, 9:00 in Los Angeles (PDT)
      await waitFor(() => expect(axiosInstance.put).toHaveBeenCalledWith('/events/507f1f77bcf86cd799439014', {
        reminder: { isSet: true, time: '2025-07-19T16:00:00.000Z', method: 'Email' }
      }));
    });

    test('handles event deletion with confirmation', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
      });
      
      const deleteButtons = screen.getAllByTestId('icon-trash');
      await user.click(deleteButtons[0]);
      
      const dialog = screen.getByRole('alertdialog', { name: 'Delete event' });
      expect(dialog).toHaveTextContent('Delete this event? Gifts saved or suggested for it are deleted too. Purchased gifts must be moved to another event or deleted first.');
      expect(axiosInstance.delete).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
      await waitFor(() => {
        expect(axiosInstance.delete).toHaveBeenCalledWith('/events/507f1f77bcf86cd799439011');
      });
    });

    test('cancels event deletion when confirmation is declined', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
      });
      
      const deleteButtons = screen.getAllByTestId('icon-trash');
      await user.click(deleteButtons[0]);
      
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(axiosInstance.delete).not.toHaveBeenCalled();
    });
  });

  describe('Filtering Functionality', () => {
    test('shows and hides filters when filter button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      const filterButton = screen.getByRole('button', { name: /advanced/i });
      
      // Filters should be hidden initially
      expect(screen.queryByText('All Months')).not.toBeInTheDocument();
      
      // Show filters
      await user.click(filterButton);
      expect(screen.getByText('All Months')).toBeInTheDocument();
      expect(screen.getByText('All Years')).toBeInTheDocument();
      expect(screen.getByText('All Recipients')).toBeInTheDocument();
      expect(screen.getByText('All Event Types')).toBeInTheDocument();
      
      // Hide filters
      await user.click(filterButton);
      expect(screen.queryByText('All Months')).not.toBeInTheDocument();
    });

    test('populates filter dropdowns with correct options', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      const filterButton = screen.getByRole('button', { name: /advanced/i });
      await user.click(filterButton);
      
      await waitFor(() => {
        // Wait for data to load first
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
      });
      
      // Check month options
      expect(screen.getByText('January')).toBeInTheDocument();
      expect(screen.getByText('December')).toBeInTheDocument();
      
      // Check recipient options - need to wait for API data
      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
        expect(screen.getByText('System Account (System)')).toBeInTheDocument();
      });
      
      // Check event type options in dropdown (using getAllByText since "Custom Event" appears twice)
      expect(screen.getByText('Birthday')).toBeInTheDocument();
      expect(screen.getByText('Anniversary')).toBeInTheDocument();
      const customEventOptions = screen.getAllByText('Custom Event');
      expect(customEventOptions.length).toBeGreaterThanOrEqual(1);
    });

    test('filters events by month', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      const filterButton = screen.getByRole('button', { name: /advanced/i });
      await user.click(filterButton);
      
      await waitFor(() => {
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
        expect(screen.getByText('Wedding Anniversary')).toBeInTheDocument();
      });
      
      // Filter by June (month 6)
      const monthSelect = screen.getByDisplayValue('All Months');
      await user.selectOptions(monthSelect, '6');
      
      await waitFor(() => {
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
        expect(screen.queryByText('Wedding Anniversary')).not.toBeInTheDocument();
      });
    });

    test('filters events by recipient', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      const filterButton = screen.getByRole('button', { name: /advanced/i });
      await user.click(filterButton);
      
      await waitFor(() => {
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
        expect(screen.getByText('Wedding Anniversary')).toBeInTheDocument();
      });
      
      // Filter by John Doe
      const recipientSelect = screen.getByDisplayValue('All Recipients');
      await user.selectOptions(recipientSelect, '507f1f77bcf86cd799439012');
      
      await waitFor(() => {
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
        expect(screen.queryByText('Wedding Anniversary')).not.toBeInTheDocument();
      });
    });

    test('filters events by upcoming only', async () => {
      const user = userEvent.setup();
      
      // Mock events with past and future dates
      const pastEvent = {
        ...mockEvents[0],
        _id: 'past-event',
        name: 'Past Event',
        date: '2024-01-01T00:00:00.000Z',
        recipient: mockEvents[0].recipient,
        type: mockEvents[0].type,
        reminder: mockEvents[0].reminder
      };
      
      axiosInstance.get.mockImplementation((url) => {
        if (url === '/events') {
          return Promise.resolve({ data: [...mockEvents, pastEvent] });
        }
        if (url === '/recipients/all-including-system') {
          return Promise.resolve({ data: mockRecipients });
        }
        if (url === '/eventTypes') {
          return Promise.resolve({ data: mockEventTypes });
        }
        if (url.startsWith('/recipients/')) {
          const recipientId = url.split('/')[2];
          const recipient = mockRecipients.find(r => r._id === recipientId);
          return Promise.resolve({ data: recipient });
        }
        return Promise.reject(new Error('Unexpected API call'));
      });
      
      renderWithProviders(<Events />);
      
      // Wait for data to load by checking for both events and the toggle
      await waitFor(() => {
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
      });
      
      // Initially, past events should be hidden by the component's logic
      // Show past events first by clicking the toggle
      const showPastToggle = screen.getByLabelText(/show past events/i);
      await user.click(showPastToggle);
      
      await waitFor(() => {
        expect(screen.getByText('Past Event')).toBeInTheDocument();
      });
      
      // Now apply the upcoming filter
      const filterButton = screen.getByRole('button', { name: /advanced/i });
      await user.click(filterButton);
      
      const upcomingCheckbox = screen.getByLabelText(/upcoming events only/i);
      await user.click(upcomingCheckbox);
      
      await waitFor(() => {
        expect(screen.queryByText('Past Event')).not.toBeInTheDocument();
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
      });
    });

    test('clears all filters when clear button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      const filterButton = screen.getByRole('button', { name: /advanced/i });
      await user.click(filterButton);
      
      // Apply some filters
      const monthSelect = screen.getByDisplayValue('All Months');
      await user.selectOptions(monthSelect, '6');
      
      const upcomingCheckbox = screen.getByLabelText(/upcoming events only/i);
      await user.click(upcomingCheckbox);
      
      // Clear filters
      const clearButton = screen.getByTestId('icon-filter-circle-xmark');
      await user.click(clearButton);
      
      await waitFor(() => {
        expect(monthSelect).toHaveValue('');
        expect(upcomingCheckbox).not.toBeChecked();
      });
    });
  });

  describe('Custom Event Types Management', () => {
    test('displays custom event types section when custom types exist', async () => {
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        expect(screen.getByText('Your Custom Event Types')).toBeInTheDocument();
        expect(screen.getByText('Custom Event')).toBeInTheDocument();
        expect(screen.getByText('A custom event type')).toBeInTheDocument();
      });
    });

    test('does not display custom event types section when no custom types exist', async () => {
      // Mock event types without custom types
      axiosInstance.get.mockImplementation((url) => {
        if (url === '/events') {
          return Promise.resolve({ data: mockEvents });
        }
        if (url === '/recipients/all-including-system') {
          return Promise.resolve({ data: mockRecipients });
        }
        if (url === '/eventTypes') {
          return Promise.resolve({ data: mockEventTypes.filter(type => !type.isCustom) });
        }
        if (url.startsWith('/recipients/')) {
          const recipientId = url.split('/')[2];
          const recipient = mockRecipients.find(r => r._id === recipientId);
          return Promise.resolve({ data: recipient });
        }
        return Promise.reject(new Error('Unexpected API call'));
      });
      
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        expect(screen.queryByText('Your Custom Event Types')).not.toBeInTheDocument();
      });
    });

    test('opens edit form when custom event type edit button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        expect(screen.getByText('Custom Event')).toBeInTheDocument();
      });
      
      const editButtons = screen.getAllByTestId('icon-edit');
      const customTypeEditButton = editButtons[editButtons.length - 1]; // Last edit button should be for custom type
      await user.click(customTypeEditButton);
      
      expect(screen.getByTestId('mock-custom-event-type-form')).toBeInTheDocument();
      expect(screen.getByText('Event Type ID: 507f1f77bcf86cd799439018')).toBeInTheDocument();
    });

    test('deletes custom event type with confirmation', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        expect(screen.getByText('Custom Event')).toBeInTheDocument();
      });
      
      const deleteButtons = screen.getAllByTestId('icon-trash');
      const customTypeDeleteButton = deleteButtons[deleteButtons.length - 1]; // Last delete button should be for custom type
      await user.click(customTypeDeleteButton);
      
      const dialog = screen.getByRole('alertdialog', { name: 'Delete event type' });
      expect(dialog).toHaveTextContent('Are you sure you want to delete this custom event type?');
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
      await waitFor(() => {
        expect(axiosInstance.delete).toHaveBeenCalledWith('/eventTypes/507f1f77bcf86cd799439018');
      });
    });
  });

  describe('Calendar View Integration', () => {
    test('displays events in calendar format', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      const calendarButton = screen.getByRole('button', { name: /calendar/i });
      await user.click(calendarButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('calendar-event-507f1f77bcf86cd799439011')).toBeInTheDocument();
        expect(screen.getByTestId('calendar-event-507f1f77bcf86cd799439014')).toBeInTheDocument();
      });
    });

    test('handles calendar event click to edit event', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      const calendarButton = screen.getByRole('button', { name: /calendar/i });
      await user.click(calendarButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('calendar-event-507f1f77bcf86cd799439011')).toBeInTheDocument();
      });
      
      const calendarEvent = screen.getByTestId('calendar-event-507f1f77bcf86cd799439011');
      await user.click(calendarEvent);
      
      expect(screen.getByTestId('mock-event-form')).toBeInTheDocument();
      expect(screen.getByText('Editing: true')).toBeInTheDocument();
    });
  });

  describe('List View Features', () => {
    test('toggles past events visibility', async () => {
      const user = userEvent.setup();
      
      // Add a past event to test with
      const pastEvent = {
        ...mockEvents[0],
        _id: 'past-event',
        name: 'Past Birthday',
        date: '2024-01-15T00:00:00.000Z'
      };
      
      axiosInstance.get.mockImplementation((url) => {
        if (url === '/events') {
          return Promise.resolve({ data: [...mockEvents, pastEvent] });
        }
        if (url === '/recipients/all-including-system') {
          return Promise.resolve({ data: mockRecipients });
        }
        if (url === '/eventTypes') {
          return Promise.resolve({ data: mockEventTypes });
        }
        if (url.startsWith('/recipients/')) {
          const recipientId = url.split('/')[2];
          const recipient = mockRecipients.find(r => r._id === recipientId);
          return Promise.resolve({ data: recipient });
        }
        return Promise.reject(new Error('Unexpected API call'));
      });
      
      renderWithProviders(<Events />);
      
      // Past events should be hidden initially
      await waitFor(() => {
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
        expect(screen.queryByText('Past Birthday')).not.toBeInTheDocument();
      });
      
      // Toggle to show past events
      const showPastToggle = screen.getByLabelText(/show past events/i);
      await user.click(showPastToggle);
      
      await waitFor(() => {
        expect(screen.getByText('Past Birthday')).toBeInTheDocument();
        expect(screen.getByText(/hide past events/i)).toBeInTheDocument();
      });
      
      // Toggle back to hide past events
      await user.click(showPastToggle);
      
      await waitFor(() => {
        expect(screen.queryByText('Past Birthday')).not.toBeInTheDocument();
        expect(screen.getByText(/show past events/i)).toBeInTheDocument();
      });
    });

    test('displays correct countdown text for events', async () => {
      const user = userEvent.setup();
      
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const inThreeDays = new Date(today);
      inThreeDays.setDate(inThreeDays.getDate() + 3);
      
      const testEvents = [
        {
          ...mockEvents[0],
          _id: 'today-event',
          name: 'Today Event',
          date: today.toISOString()
        },
        {
          ...mockEvents[0],
          _id: 'tomorrow-event',
          name: 'Tomorrow Event',
          date: tomorrow.toISOString()
        },
        {
          ...mockEvents[0],
          _id: 'future-event',
          name: 'Future Event',
          date: inThreeDays.toISOString()
        }
      ];
      
      axiosInstance.get.mockImplementation((url) => {
        if (url === '/events') {
          return Promise.resolve({ data: testEvents });
        }
        if (url === '/recipients/all-including-system') {
          return Promise.resolve({ data: mockRecipients });
        }
        if (url === '/eventTypes') {
          return Promise.resolve({ data: mockEventTypes });
        }
        if (url.startsWith('/recipients/')) {
          const recipientId = url.split('/')[2];
          const recipient = mockRecipients.find(r => r._id === recipientId);
          return Promise.resolve({ data: recipient });
        }
        return Promise.reject(new Error('Unexpected API call'));
      });
      
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        // Scoped to the countdown <p>: the quick-filter bar also has a "Today" button
        expect(screen.getByText('Today', { selector: 'p' })).toBeInTheDocument();
        expect(screen.getByText('Tomorrow', { selector: 'p' })).toBeInTheDocument();
        expect(screen.getByText('3 days away', { selector: 'p' })).toBeInTheDocument();
      });
    });

    test('handles events without recipients', async () => {
      const eventWithoutRecipient = {
        ...mockEvents[0],
        _id: 'no-recipient-event',
        name: 'No Recipient Event',
        recipient: null
      };
      
      axiosInstance.get.mockImplementation((url) => {
        if (url === '/events') {
          return Promise.resolve({ data: [eventWithoutRecipient] });
        }
        if (url === '/recipients/all-including-system') {
          return Promise.resolve({ data: mockRecipients });
        }
        if (url === '/eventTypes') {
          return Promise.resolve({ data: mockEventTypes });
        }
        if (url.startsWith('/recipients/')) {
          return Promise.resolve({ data: null });
        }
        return Promise.reject(new Error('Unexpected API call'));
      });
      
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        expect(screen.getByText('No Recipient Event')).toBeInTheDocument();
        expect(screen.getByText('Recipient: No recipient')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    test('a failed recipients list still shows events with the names they carry', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      axiosInstance.get.mockImplementation((url) => {
        if (url === '/events') return Promise.resolve({ data: mockEvents });
        if (url === '/eventTypes') return Promise.resolve({ data: mockEventTypes });
        return Promise.reject(new Error('Recipients fetch failed'));
      });

      renderWithProviders(<Events />);

      expect(await screen.findByText('Birthday Party')).toBeInTheDocument();
      expect(screen.getByText('Recipient: John Doe')).toBeInTheDocument();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching recipients:', expect.any(Error));

      consoleErrorSpy.mockRestore();
    });

    test('handles event update errors gracefully', async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      axiosInstance.put.mockRejectedValue(new Error('Update failed'));
      
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
      });
      
      const reminderButtons = screen.getAllByTestId('icon-bell');
      await user.click(reminderButtons[0]);
      
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Could not change the reminder: Update failed');
      });
      
      consoleErrorSpy.mockRestore();
    });

    test('handles event deletion errors gracefully', async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      axiosInstance.delete.mockRejectedValue(new Error('Delete failed'));

      renderWithProviders(<Events />);

      await waitFor(() => {
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByTestId('icon-trash');
      await user.click(deleteButtons[0]);
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error deleting event:', expect.any(Error));
      });

      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/^Failed to delete event/));
      consoleErrorSpy.mockRestore();
    });

    test('handles custom event type deletion errors gracefully', async () => {
      const user = userEvent.setup();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      axiosInstance.delete.mockRejectedValue(new Error('Delete failed'));

      renderWithProviders(<Events />);

      await waitFor(() => {
        expect(screen.getByText('Custom Event')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByTestId('icon-trash');
      const customTypeDeleteButton = deleteButtons[deleteButtons.length - 1];
      await user.click(customTypeDeleteButton);
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error deleting custom event type:', expect.any(Error));
      });

      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/^Failed to delete event/));
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    test('handles empty events list', async () => {
      axiosInstance.get.mockImplementation((url) => {
        if (url === '/events') {
          return Promise.resolve({ data: [] });
        }
        if (url === '/recipients/all-including-system') {
          return Promise.resolve({ data: mockRecipients });
        }
        if (url === '/eventTypes') {
          return Promise.resolve({ data: mockEventTypes });
        }
        return Promise.reject(new Error('Unexpected API call'));
      });
      
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /events management/i })).toBeInTheDocument();
        expect(screen.queryByText('Birthday Party')).not.toBeInTheDocument();
      });
    });

    test('handles object-type recipient IDs in events', async () => {
      const eventWithObjectRecipient = {
        ...mockEvents[0],
        recipient: {
          _id: '507f1f77bcf86cd799439012',
          firstName: 'John',
          lastName: 'Doe'
        }
      };
      
      axiosInstance.get.mockImplementation((url) => {
        if (url === '/events') {
          return Promise.resolve({ data: [eventWithObjectRecipient] });
        }
        if (url === '/recipients/all-including-system') {
          return Promise.resolve({ data: mockRecipients });
        }
        if (url === '/eventTypes') {
          return Promise.resolve({ data: mockEventTypes });
        }
        if (url.startsWith('/recipients/')) {
          const recipientId = url.split('/')[2];
          const recipient = mockRecipients.find(r => r._id === recipientId);
          return Promise.resolve({ data: recipient });
        }
        return Promise.reject(new Error('Unexpected API call'));
      });
      
      renderWithProviders(<Events />);
      
      await waitFor(() => {
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
        expect(screen.getByText('Recipient: John Doe')).toBeInTheDocument();
      });
    });

    test('handles complex filtering combinations', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      
      const filterButton = screen.getByRole('button', { name: /advanced/i });
      await user.click(filterButton);
      
      // Apply multiple filters
      const monthSelect = screen.getByDisplayValue('All Months');
      await user.selectOptions(monthSelect, '6'); // June
      
      const recipientSelect = screen.getByDisplayValue('All Recipients');
      await user.selectOptions(recipientSelect, '507f1f77bcf86cd799439012'); // John Doe
      
      const upcomingCheckbox = screen.getByLabelText(/upcoming events only/i);
      await user.click(upcomingCheckbox);
      
      await waitFor(() => {
        expect(screen.getByText('Birthday Party')).toBeInTheDocument();
        expect(screen.queryByText('Wedding Anniversary')).not.toBeInTheDocument();
      });
    });
  });

  describe('Dialogs and keyboard access', () => {
    test('the event form is a named dialog that Escape closes', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      await user.click(screen.getByRole('button', { name: /add event/i }));
      const dialog = screen.getByRole('dialog', { name: 'Create New Event' });
      expect(within(dialog).getByTestId('mock-event-form')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('the custom event type form is a named dialog', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      await user.click(screen.getByRole('button', { name: /add custom event type/i }));
      expect(screen.getByRole('dialog', { name: 'Create Custom Event Type' })).toBeInTheDocument();
    });

    test('the search box and the advanced filters have names', async () => {
      const user = userEvent.setup();
      renderWithProviders(<Events />);
      expect(screen.getByRole('textbox', { name: 'Search events' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /advanced/i }));
      ['Month', 'Year', 'Recipient', 'Event type'].forEach((name) => {
        expect(screen.getByRole('combobox', { name })).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    });
  });
});
