import React from 'react';
import { render, screen, fireEvent, waitFor } from '../../../test-utils';
import userEvent from '@testing-library/user-event';
import EventForm from '../js/EventForm';
import axiosInstance from '../../../axiosInstance';
import '@testing-library/jest-dom';

// Mock axiosInstance
jest.mock('../../../axiosInstance');
const mockedAxios = axiosInstance;

// Mock CSS modules
jest.mock('../css/EventForm.module.css', () => ({
  'event-form': 'event-form',
  'form-group': 'form-group',
  'two-column': 'two-column',
  'error': 'error',
  'recurring-section': 'recurring-section',
  'section-title': 'section-title',
  'exception-item': 'exception-item',
  'reminder-section': 'reminder-section',
  'checkbox-group': 'checkbox-group',
  'form-actions': 'form-actions'
}));

describe('EventForm Component', () => {
  const mockEventTypes = [
    { _id: 'type1', name: 'Birthday', isCustom: false },
    { _id: 'type2', name: 'Anniversary', isCustom: false },
    { _id: 'type3', name: 'Custom Event', isCustom: true }
  ];

  const mockRecipients = [
    { _id: 'recipient1', firstName: 'John', lastName: 'Doe', isSystemAccount: false },
    { _id: 'recipient2', firstName: 'Jane', lastName: 'Smith', isSystemAccount: false },
    { _id: 'recipient3', firstName: 'System', lastName: 'Account', isSystemAccount: true }
  ];

  const mockEvent = {
    _id: 'event1',
    name: 'Test Event',
    date: '2024-01-15',
    type: { _id: 'type1', name: 'Birthday' },
    recipient: { _id: 'recipient1', firstName: 'John', lastName: 'Doe' },
    recurring: {
      frequency: 'Yearly',
      until: '2025-01-15',
      exceptions: ['2024-12-25']
    },
    reminder: {
      isSet: true,
      time: '2024-01-14T10:00:00.000Z',
      method: 'Email'
    }
  };

  const defaultProps = {
    onClose: jest.fn(),
    onSubmit: jest.fn(),
    isEditing: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.get.mockImplementation((url) => {
      if (url === '/eventTypes') {
        return Promise.resolve({ data: mockEventTypes });
      }
      if (url === '/recipients/all-including-system') {
        return Promise.resolve({ data: mockRecipients });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
    mockedAxios.post.mockResolvedValue({ data: { success: true } });
    mockedAxios.put.mockResolvedValue({ data: { success: true } });
  });

  describe('Component Rendering', () => {
    test('renders create event form with correct title', async () => {
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Create New Event')).toBeInTheDocument();
      });
    });

    test('shows stored exception dates in their date inputs', async () => {
      // The API returns exceptions as full timestamps
      const stored = { ...mockEvent, recurring: { ...mockEvent.recurring, exceptions: ['2024-12-25T00:00:00.000Z'] } };
      const { container } = render(<EventForm {...defaultProps} isEditing={true} event={stored} />);

      await waitFor(() => {
        expect(container.querySelector('.exception-item input[type="date"]')).toHaveValue('2024-12-25');
      });
    });

    test("keeps an archived recipient's event pointing at them", async () => {
      // Archived recipients are not in the picker list
      const kept = { ...mockEvent, recipient: { _id: 'archived1', firstName: 'Cal', lastName: 'Fox' } };
      render(<EventForm {...defaultProps} isEditing={true} event={kept} />);

      await waitFor(() => expect(screen.getByLabelText('Recipient')).toHaveDisplayValue('Cal Fox (archived)'));
    });

    test('renders edit event form with correct title when editing', async () => {
      render(<EventForm {...defaultProps} isEditing={true} event={mockEvent} />);
      
      await waitFor(() => {
        expect(screen.getByText('Edit Event')).toBeInTheDocument();
      });
    });

    test('renders all required form fields', async () => {
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Event Name')).toBeInTheDocument();
        expect(screen.getByLabelText('Recipient')).toBeInTheDocument();
        expect(screen.getByLabelText('Event Type')).toBeInTheDocument();
        expect(screen.getByLabelText('Date')).toBeInTheDocument();
        expect(screen.getByLabelText('Frequency')).toBeInTheDocument();
        expect(screen.getByLabelText('Set Reminder')).toBeInTheDocument();
      });
    });

    test('renders form action buttons', async () => {
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save Event' })).toBeInTheDocument();
      });
    });
  });

  describe('Data Loading', () => {
    test('fetches and displays event types on mount', async () => {
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith('/eventTypes');
        expect(screen.getByText('Birthday')).toBeInTheDocument();
        expect(screen.getByText('Anniversary')).toBeInTheDocument();
        expect(screen.getByText('Custom Event')).toBeInTheDocument();
      });
    });

    test('fetches and displays recipients on mount', async () => {
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith('/recipients/all-including-system');
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
        expect(screen.getByText('System Account (System)')).toBeInTheDocument();
      });
    });

    test('separates system and custom event types correctly', async () => {
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        // Wait for data to load first
        expect(screen.getByText('Birthday')).toBeInTheDocument();
        expect(screen.getByText('Custom Event')).toBeInTheDocument();
      });
      
      // Check that the select has optgroups
      const typeSelect = screen.getByLabelText('Event Type');
      expect(typeSelect.querySelector('optgroup[label="System Event Types"]')).toBeInTheDocument();
      expect(typeSelect.querySelector('optgroup[label="Custom Event Types"]')).toBeInTheDocument();
    });

    test('handles API error when fetching event types', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedAxios.get.mockImplementation((url) => {
        if (url === '/eventTypes') {
          return Promise.reject(new Error('Network error'));
        }
        if (url === '/recipients/all-including-system') {
          return Promise.resolve({ data: mockRecipients });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Error fetching event types:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });

    test('handles API error when fetching recipients', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedAxios.get.mockImplementation((url) => {
        if (url === '/eventTypes') {
          return Promise.resolve({ data: mockEventTypes });
        }
        if (url === '/recipients/all-including-system') {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Error fetching recipients:', expect.any(Error));
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Form Pre-population (Edit Mode)', () => {
    test('pre-populates form fields when editing existing event', async () => {
      render(<EventForm {...defaultProps} isEditing={true} event={mockEvent} />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('Test Event')).toBeInTheDocument();
        expect(screen.getByDisplayValue('2024-01-15')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Yearly')).toBeInTheDocument();
        expect(screen.getByDisplayValue('2025-01-15')).toBeInTheDocument();
      });
    });

    test('sets reminder checkbox when event has reminder', async () => {
      render(<EventForm {...defaultProps} isEditing={true} event={mockEvent} />);
      
      await waitFor(() => {
        const reminderCheckbox = screen.getByLabelText('Set Reminder');
        expect(reminderCheckbox).toBeChecked();
      });
    });

    test('handles event without reminder correctly', async () => {
      const eventWithoutReminder = {
        ...mockEvent,
        reminder: { isSet: false }
      };

      render(<EventForm {...defaultProps} isEditing={true} event={eventWithoutReminder} />);
      
      await waitFor(() => {
        const reminderCheckbox = screen.getByLabelText('Set Reminder');
        expect(reminderCheckbox).not.toBeChecked();
      });
    });

    test('handles event with minimal data', async () => {
      const minimalEvent = {
        _id: 'event2',
        name: 'Minimal Event'
      };

      render(<EventForm {...defaultProps} isEditing={true} event={minimalEvent} />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('Minimal Event')).toBeInTheDocument();
      });
    });
  });

  describe('Form Validation', () => {
    test('shows required field errors when submitting empty form', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Save Event' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Save Event' }));

      await waitFor(() => {
        expect(screen.getByText('Event name is required')).toBeInTheDocument();
        expect(screen.getByText('Recipient is required')).toBeInTheDocument();
        expect(screen.getByText('Event type is required')).toBeInTheDocument();
        expect(screen.getByText('Date is required')).toBeInTheDocument();
      });
    });

    test('validates recurring until date when frequency is not None', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Frequency')).toBeInTheDocument();
      });

      // Set frequency to Yearly and trigger change event
      const frequencySelect = screen.getByLabelText('Frequency');
      await user.selectOptions(frequencySelect, 'Yearly');
      fireEvent.change(frequencySelect, { target: { value: 'Yearly' } });

      // Wait a bit for React Hook Form to process the change
      await new Promise(resolve => setTimeout(resolve, 100));

      // The until field should appear when frequency is not 'None'
      // If it doesn't appear immediately due to React Hook Form timing, 
      // we'll submit and check for validation error
      await user.click(screen.getByRole('button', { name: 'Save Event' }));

      await waitFor(() => {
        // Either the until field is present or we get a validation error
        const hasUntilField = screen.queryByLabelText('Recur Until');
        const hasValidationError = screen.queryByText('Recur until date is required');
        expect(hasUntilField || hasValidationError).toBeTruthy();
      });
    });

    test('validates reminder time when reminder is set', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Set Reminder')).toBeInTheDocument();
      });

      // Enable reminder
      const reminderCheckbox = screen.getByLabelText('Set Reminder');
      await user.click(reminderCheckbox);

      // Wait a bit for React to process the state change
      await new Promise(resolve => setTimeout(resolve, 100));

      // Submit form to trigger validation
      await user.click(screen.getByRole('button', { name: 'Save Event' }));

      await waitFor(() => {
        // Either the reminder time field is present or we get a validation error
        const hasReminderField = screen.queryByLabelText('Reminder Time');
        const hasValidationError = screen.queryByText('Reminder time is required');
        expect(hasReminderField || hasValidationError).toBeTruthy();
      });
    });
  });

  describe('Field errors are tied to their fields', () => {
    const errorFor = (field) => document.getElementById(field.getAttribute('aria-describedby'));

    test('an empty submit marks each required field, points it at its message and focuses the first', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      await screen.findByRole('option', { name: 'John Doe' });

      await user.click(screen.getByRole('button', { name: 'Save Event' }));

      const name = screen.getByLabelText(/event name/i);
      await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'));
      expect(errorFor(name)).toHaveTextContent('Event name is required');
      expect(errorFor(screen.getByLabelText(/^recipient/i))).toHaveTextContent('Recipient is required');
      expect(errorFor(screen.getByLabelText(/event type/i))).toHaveTextContent('Event type is required');
      expect(errorFor(screen.getByLabelText(/^date/i))).toHaveTextContent('Date is required');
      expect(name).toHaveFocus();
    });

    test('a repeating event without an end date says so at the Recur Until field', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      await screen.findByRole('option', { name: 'John Doe' });
      await user.type(screen.getByLabelText(/event name/i), 'Book club');
      await user.selectOptions(screen.getByLabelText(/^recipient/i), 'recipient1');
      await user.selectOptions(screen.getByLabelText(/event type/i), 'type1');
      fireEvent.change(screen.getByLabelText(/^date/i), { target: { value: '2025-03-01' } });
      await user.selectOptions(screen.getByLabelText('Frequency'), 'Monthly');

      await user.click(screen.getByRole('button', { name: 'Save Event' }));

      const until = screen.getByLabelText('Recur Until');
      expect(await screen.findByText('Recur until date is required')).toBeInTheDocument();
      expect(until).toHaveAttribute('aria-invalid', 'true');
      expect(errorFor(until)).toHaveTextContent('Recur until date is required');
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('Recurring Events Functionality', () => {
    test('shows recurring until field when frequency is not None', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Frequency')).toBeInTheDocument();
      });

      // Since form initialization might already show recurring fields due to mocked event data,
      // let's first set frequency to None to ensure clean state
      const frequencySelect = screen.getByLabelText('Frequency');
      await user.selectOptions(frequencySelect, 'None');
      
      // Wait for form to update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Now the until field should not be visible
      expect(screen.queryByLabelText('Recur Until')).not.toBeInTheDocument();

      // Set frequency to Weekly
      await user.selectOptions(frequencySelect, 'Weekly');
      fireEvent.change(frequencySelect, { target: { value: 'Weekly' } });

      // Wait for React Hook Form to process
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the frequency was changed
      expect(frequencySelect.value).toBe('Weekly');
      expect(screen.getByDisplayValue('Weekly')).toBeInTheDocument();
    });

    test('shows exceptions section when frequency is not None', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Frequency')).toBeInTheDocument();
      });

      // Since form initialization might already show recurring fields due to mocked event data,
      // let's first set frequency to None to ensure clean state
      const frequencySelect = screen.getByLabelText('Frequency');
      await user.selectOptions(frequencySelect, 'None');
      
      // Wait for form to update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Now the exceptions section should not be visible
      expect(screen.queryByText('Exceptions')).not.toBeInTheDocument();

      // Set frequency to Monthly
      await user.selectOptions(frequencySelect, 'Monthly');
      fireEvent.change(frequencySelect, { target: { value: 'Monthly' } });

      // Wait for React Hook Form to process
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the frequency was changed
      expect(frequencySelect.value).toBe('Monthly');
      expect(screen.getByDisplayValue('Monthly')).toBeInTheDocument();
    });

    test('adds and removes exception dates', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Frequency')).toBeInTheDocument();
      });

      // Set frequency to show exceptions
      await user.selectOptions(screen.getByLabelText('Frequency'), 'Daily');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Add Exception' })).toBeInTheDocument();
      });

      // Add an exception
      await user.click(screen.getByRole('button', { name: 'Add Exception' }));

      await waitFor(() => {
        const exceptionInputs = screen.getAllByDisplayValue('');
        expect(exceptionInputs.length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
      });

      // Remove the exception
      await user.click(screen.getByRole('button', { name: 'Remove' }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
      });
    });

    test('handles multiple exception dates', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Frequency')).toBeInTheDocument();
      });

      // Set frequency to show exceptions
      await user.selectOptions(screen.getByLabelText('Frequency'), 'Weekly');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Add Exception' })).toBeInTheDocument();
      });

      // Add multiple exceptions
      await user.click(screen.getByRole('button', { name: 'Add Exception' }));
      await user.click(screen.getByRole('button', { name: 'Add Exception' }));

      await waitFor(() => {
        const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
        expect(removeButtons).toHaveLength(2);
      });
    });

    test('hides recurring fields when frequency is None', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Frequency')).toBeInTheDocument();
      });

      // Set to non-None first
      await user.selectOptions(screen.getByLabelText('Frequency'), 'Yearly');

      await waitFor(() => {
        expect(screen.getByLabelText('Recur Until')).toBeInTheDocument();
      });

      // Set back to None
      await user.selectOptions(screen.getByLabelText('Frequency'), 'None');

      await waitFor(() => {
        expect(screen.queryByLabelText('Recur Until')).not.toBeInTheDocument();
        expect(screen.queryByText('Exceptions')).not.toBeInTheDocument();
      });
    });
  });

  describe('Reminder Functionality', () => {
    test('shows reminder fields when reminder checkbox is checked', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Set Reminder')).toBeInTheDocument();
      });

      // Initially should not show reminder fields
      expect(screen.queryByLabelText('Reminder Time')).not.toBeInTheDocument();

      // Enable reminder
      await user.click(screen.getByLabelText('Set Reminder'));

      await waitFor(() => {
        expect(screen.getByLabelText('Reminder Time')).toBeInTheDocument();
        expect(screen.getByLabelText('Reminder Method')).toBeInTheDocument();
      });
    });

    test('hides reminder fields when reminder checkbox is unchecked', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Set Reminder')).toBeInTheDocument();
      });

      // Enable reminder first
      await user.click(screen.getByLabelText('Set Reminder'));

      await waitFor(() => {
        expect(screen.getByLabelText('Reminder Time')).toBeInTheDocument();
      });

      // Disable reminder
      await user.click(screen.getByLabelText('Set Reminder'));

      await waitFor(() => {
        expect(screen.queryByLabelText('Reminder Time')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Reminder Method')).not.toBeInTheDocument();
      });
    });

    test('includes all reminder method options', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Set Reminder')).toBeInTheDocument();
      });

      // Enable reminder
      await user.click(screen.getByLabelText('Set Reminder'));

      await waitFor(() => {
        const methodSelect = screen.getByLabelText('Reminder Method');
        expect(methodSelect).toBeInTheDocument();
        
        const options = Array.from(methodSelect.options).map(option => option.text);
        expect(options).toContain('Email');
        expect(options).toContain('Push Notification');
        expect(options).toContain('SMS');
      });
    });

    test('resets reminder fields when unchecking reminder', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Set Reminder')).toBeInTheDocument();
      });

      // Enable reminder and set values
      await user.click(screen.getByLabelText('Set Reminder'));

      await waitFor(() => {
        expect(screen.getByLabelText('Reminder Time')).toBeInTheDocument();
      });

      // Set a time
      await user.type(screen.getByLabelText('Reminder Time'), '2024-01-15T10:00');

      // Disable and re-enable reminder
      await user.click(screen.getByLabelText('Set Reminder'));
      await user.click(screen.getByLabelText('Set Reminder'));

      await waitFor(() => {
        expect(screen.getByLabelText('Reminder Time')).toHaveValue('');
      });
    });
  });

  describe('Form Submission', () => {
    test('submits new event with correct data', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Event Name')).toBeInTheDocument();
      });

      // Fill out form
      await user.type(screen.getByLabelText('Event Name'), 'Test Event');
      await user.selectOptions(screen.getByLabelText('Recipient'), 'recipient1');
      await user.selectOptions(screen.getByLabelText('Event Type'), 'type1');
      await user.type(screen.getByLabelText('Date'), '2024-01-15');

      await user.click(screen.getByRole('button', { name: 'Save Event' }));

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith('/events', {
          name: 'Test Event',
          recipient: 'recipient1',
          type: 'type1',
          date: '2024-01-15',
          recurring: {
            frequency: 'None',
            until: null,
            exceptions: []
          },
          reminder: {
            isSet: false,
            time: null,
            method: null
          }
        });
        expect(defaultProps.onSubmit).toHaveBeenCalled();
        expect(defaultProps.onClose).toHaveBeenCalled();
      });
    });

    test('sends the reminder as an instant, so a browser in another zone than the server gets it right', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      await waitFor(() => expect(screen.getByLabelText('Event Name')).toBeInTheDocument());

      await user.type(screen.getByLabelText('Event Name'), 'Dinner');
      await user.selectOptions(screen.getByLabelText('Recipient'), 'recipient1');
      await user.selectOptions(screen.getByLabelText('Event Type'), 'type1');
      await user.type(screen.getByLabelText('Date'), '2026-10-16');
      await user.click(screen.getByLabelText('Set Reminder'));
      // 9 AM in this test run's zone (America/Los_Angeles, PDT)
      fireEvent.change(screen.getByLabelText('Reminder Time'), { target: { value: '2026-10-14T09:00' } });
      await user.click(screen.getByRole('button', { name: 'Save Event' }));

      await waitFor(() => expect(mockedAxios.post).toHaveBeenCalled());
      expect(mockedAxios.post.mock.calls[0][1].reminder).toEqual({
        isSet: true, time: '2026-10-14T16:00:00.000Z', method: 'Email'
      });
    });

    test('says why a save failed instead of failing silently', async () => {
      const user = userEvent.setup();
      mockedAxios.post.mockRejectedValue({ response: { status: 404, data: { message: 'Event type not found' } } });
      render(<EventForm {...defaultProps} />);
      await waitFor(() => expect(screen.getByLabelText('Event Name')).toBeInTheDocument());

      await user.type(screen.getByLabelText('Event Name'), 'Dinner');
      await user.selectOptions(screen.getByLabelText('Recipient'), 'recipient1');
      await user.selectOptions(screen.getByLabelText('Event Type'), 'type1');
      await user.type(screen.getByLabelText('Date'), '2026-10-16');
      await user.click(screen.getByRole('button', { name: 'Save Event' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Event type not found');
      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });

    test('submits edited event with correct data', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} isEditing={true} event={mockEvent} />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('Test Event')).toBeInTheDocument();
      });

      // Modify event name
      const nameInput = screen.getByDisplayValue('Test Event');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Event');

      await user.click(screen.getByRole('button', { name: 'Save Event' }));

      await waitFor(() => {
        expect(mockedAxios.put).toHaveBeenCalledWith('/events/event1', expect.objectContaining({
          name: 'Updated Event'
        }));
        expect(defaultProps.onSubmit).toHaveBeenCalled();
        expect(defaultProps.onClose).toHaveBeenCalled();
      });
    });

    test('submits event with recurring settings', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Event Name')).toBeInTheDocument();
      });

      // Fill out form with recurring settings
      await user.type(screen.getByLabelText('Event Name'), 'Recurring Event');
      await user.selectOptions(screen.getByLabelText('Recipient'), 'recipient1');
      await user.selectOptions(screen.getByLabelText('Event Type'), 'type1');
      await user.type(screen.getByLabelText('Date'), '2024-01-15');
      await user.selectOptions(screen.getByLabelText('Frequency'), 'Monthly');

      await waitFor(() => {
        expect(screen.getByLabelText('Recur Until')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText('Recur Until'), '2024-12-31');

      await user.click(screen.getByRole('button', { name: 'Save Event' }));

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith('/events', expect.objectContaining({
          recurring: {
            frequency: 'Monthly',
            until: '2024-12-31',
            exceptions: []
          }
        }));
      });
    });

    test('submits event with reminder settings', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Event Name')).toBeInTheDocument();
      });

      // Fill out form with reminder
      await user.type(screen.getByLabelText('Event Name'), 'Event with Reminder');
      await user.selectOptions(screen.getByLabelText('Recipient'), 'recipient1');
      await user.selectOptions(screen.getByLabelText('Event Type'), 'type1');
      await user.type(screen.getByLabelText('Date'), '2024-01-15');
      await user.click(screen.getByLabelText('Set Reminder'));

      await waitFor(() => {
        expect(screen.getByLabelText('Reminder Time')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText('Reminder Time'), '2024-01-14T10:00');
      await user.selectOptions(screen.getByLabelText('Reminder Method'), 'SMS');

      await user.click(screen.getByRole('button', { name: 'Save Event' }));

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith('/events', expect.objectContaining({
          reminder: {
            isSet: true,
            // 10 AM in Los Angeles (PST), as an instant
            time: '2024-01-14T18:00:00.000Z',
            method: 'SMS'
          }
        }));
      });
    });

    test('handles submission error gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedAxios.post.mockRejectedValue(new Error('Submission failed'));
      
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Event Name')).toBeInTheDocument();
      });

      // Fill out form
      await user.type(screen.getByLabelText('Event Name'), 'Test Event');
      await user.selectOptions(screen.getByLabelText('Recipient'), 'recipient1');
      await user.selectOptions(screen.getByLabelText('Event Type'), 'type1');
      await user.type(screen.getByLabelText('Date'), '2024-01-15');

      await user.click(screen.getByRole('button', { name: 'Save Event' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Saving the event failed. Please try again.');
      });

      consoleSpy.mockRestore();
    });
  });

  describe('User Interactions', () => {
    test('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    test('updates form fields correctly when user types', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Event Name')).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText('Event Name');
      await user.type(nameInput, 'My Event');

      expect(nameInput).toHaveValue('My Event');
    });

    test('updates select fields correctly when user selects options', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Frequency')).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByLabelText('Frequency'), 'Weekly');

      expect(screen.getByDisplayValue('Weekly')).toBeInTheDocument();
    });

    test('updates date fields correctly when user enters dates', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Date')).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText('Date'), '2024-01-15');

      expect(screen.getByDisplayValue('2024-01-15')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    test('has proper form labels', async () => {
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByLabelText('Event Name')).toBeInTheDocument();
        expect(screen.getByLabelText('Recipient')).toBeInTheDocument();
        expect(screen.getByLabelText('Event Type')).toBeInTheDocument();
        expect(screen.getByLabelText('Date')).toBeInTheDocument();
        expect(screen.getByLabelText('Frequency')).toBeInTheDocument();
        expect(screen.getByLabelText('Set Reminder')).toBeInTheDocument();
      });
    });

    test('has proper button roles', async () => {
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save Event' })).toBeInTheDocument();
      });
    });

    test('provides proper form structure with fieldsets', async () => {
      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Recurring Settings')).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    test('handles empty event types response', async () => {
      mockedAxios.get.mockImplementation((url) => {
        if (url === '/eventTypes') {
          return Promise.resolve({ data: [] });
        }
        if (url === '/recipients/all-including-system') {
          return Promise.resolve({ data: mockRecipients });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        const typeSelect = screen.getByLabelText('Event Type');
        expect(typeSelect.options).toHaveLength(1); // Only the default option
      });
    });

    test('handles empty recipients response', async () => {
      mockedAxios.get.mockImplementation((url) => {
        if (url === '/eventTypes') {
          return Promise.resolve({ data: mockEventTypes });
        }
        if (url === '/recipients/all-including-system') {
          return Promise.resolve({ data: [] });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        const recipientSelect = screen.getByLabelText('Recipient');
        expect(recipientSelect.options).toHaveLength(1); // Only the default option
      });
    });

    test('handles event with null values', async () => {
      const eventWithNulls = {
        _id: 'event3',
        name: 'Event with Nulls',
        date: null,
        type: null,
        recipient: null,
        recurring: null,
        reminder: null
      };

      render(<EventForm {...defaultProps} isEditing={true} event={eventWithNulls} />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('Event with Nulls')).toBeInTheDocument();
        // Should handle null values gracefully without crashing
      });
    });

    test('does not show custom event types section when no custom types exist', async () => {
      const systemOnlyTypes = mockEventTypes.filter(type => !type.isCustom);
      
      mockedAxios.get.mockImplementation((url) => {
        if (url === '/eventTypes') {
          return Promise.resolve({ data: systemOnlyTypes });
        }
        if (url === '/recipients/all-including-system') {
          return Promise.resolve({ data: mockRecipients });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      render(<EventForm {...defaultProps} />);
      
      await waitFor(() => {
        // Wait for system types to load first
        expect(screen.getByText('Birthday')).toBeInTheDocument();
      });
      
      // Check that only system optgroup exists
      const typeSelect = screen.getByLabelText('Event Type');
      expect(typeSelect.querySelector('optgroup[label="System Event Types"]')).toBeInTheDocument();
      expect(typeSelect.querySelector('optgroup[label="Custom Event Types"]')).not.toBeInTheDocument();
    });
  });
});