import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ExportReminder from '../ExportReminder';
import { useAuth } from '../../../AuthContext';

// Mock react-router-dom navigate
const mockNavigate = jest.fn();
// FontAwesome icons render as a span named after the icon
jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: ({ icon, className, style }) => (
    <span data-testid={`${icon.iconName}-icon`} className={className} style={style} />
  ),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

// Mock CSS modules
jest.mock('../../css/ExportReminder.module.css', () => ({
  reminderContainer: 'reminderContainer',
  reminderContent: 'reminderContent',
  reminderActions: 'reminderActions',
  exportButton: 'exportButton',
  laterButton: 'laterButton',
  closeButton: 'closeButton'
}));

// Mock useAuth hook
jest.mock('../../../AuthContext', () => ({
  useAuth: jest.fn()
}));

// Helper to render component with required providers
// An account well past the reminder interval that holds recipients
const ESTABLISHED = { createdAt: '2023-01-01T00:00:00.000Z', hasRecipients: true };
const renderWithProviders = (isAuthenticated = true, account = ESTABLISHED) => {
  // Mock the useAuth hook to return our test values
  useAuth.mockReturnValue({
    isAuthenticated,
    user: isAuthenticated ? { id: 'test-user', firstName: 'Test', ...account } : null,
    login: jest.fn(),
    logout: jest.fn(),
    loading: false
  });

  return render(
    <BrowserRouter>
      <ExportReminder />
    </BrowserRouter>
  );
};

describe('ExportReminder Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
    
    // Clear localStorage
    localStorage.clear();
    
    // Mock Date.now() for consistent testing
    const mockDate = new Date('2024-01-15T10:00:00Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(mockDate);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('Basic Rendering', () => {
    it('does not render when user is not authenticated', () => {
      renderWithProviders(false);
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      
      expect(screen.queryByText(/It's been a while since your last backup/)).not.toBeInTheDocument();
    });

    it('shows at once when a backup is due, so the page below does not jump down seconds later', () => {
      renderWithProviders();

      expect(screen.getByText(/It's been a while since your last backup/)).toBeInTheDocument();
    });

    it('does not use up the reminder while signed out', () => {
      renderWithProviders(false);
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(localStorage.getItem('lastReminderDate')).toBeNull();
    });

    it('renders reminder when conditions are met after timer', async () => {
      renderWithProviders();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(screen.getByText(/It's been a while since your last backup/)).toBeInTheDocument();
      });
    });

    it('renders all required elements when shown', async () => {
      renderWithProviders();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(screen.getByText(/It's been a while since your last backup/)).toBeInTheDocument();
      });

      expect(screen.getByText('Export Now')).toBeInTheDocument();
      expect(screen.getByText('Remind Me Later')).toBeInTheDocument();
      expect(screen.getByLabelText('Close reminder')).toBeInTheDocument();
      expect(screen.getByTestId('xmark-icon')).toBeInTheDocument();
    });
  });

  describe('Reminder Logic', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const daysAgo = (days) => new Date(Date.now() - days * DAY).toISOString();

    it('does not show on a brand-new account', () => {
      renderWithProviders(true, { createdAt: daysAgo(0), hasRecipients: false });

      expect(screen.queryByText(/It's been a while since your last backup/)).not.toBeInTheDocument();
      expect(localStorage.getItem('lastReminderDate')).toBeNull();
    });

    it('waits until a never-exported account is 30 days old, even with recipients', () => {
      renderWithProviders(true, { createdAt: daysAgo(29), hasRecipients: true });

      expect(screen.queryByText(/It's been a while since your last backup/)).not.toBeInTheDocument();
    });

    it('does not show on an old account with nothing to back up', () => {
      renderWithProviders(true, { createdAt: daysAgo(90), hasRecipients: false });

      expect(screen.queryByText(/It's been a while since your last backup/)).not.toBeInTheDocument();
    });

    it('shows once a never-exported account with recipients is over 30 days old', () => {
      renderWithProviders(true, { createdAt: daysAgo(31), hasRecipients: true });

      expect(screen.getByText(/It's been a while since your last backup/)).toBeInTheDocument();
    });

    it('shows reminder when no previous export exists', async () => {
      renderWithProviders();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(screen.getByText(/It's been a while since your last backup/)).toBeInTheDocument();
      });
    });

    it('shows reminder when last export was more than 30 days ago', async () => {
      const thirtyOneDaysAgo = Date.now() - (31 * 24 * 60 * 60 * 1000);
      localStorage.setItem('lastExportDate', thirtyOneDaysAgo.toString());
      
      renderWithProviders();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(screen.getByText(/It's been a while since your last backup/)).toBeInTheDocument();
      });
    });

    it('does not show reminder when last export was within 30 days', async () => {
      const twentyDaysAgo = Date.now() - (20 * 24 * 60 * 60 * 1000);
      localStorage.setItem('lastExportDate', twentyDaysAgo.toString());
      
      renderWithProviders();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });


      expect(screen.queryByText(/It's been a while since your last backup/)).not.toBeInTheDocument();
    });

    it('does not show reminder when already reminded within 7 days', async () => {
      const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
      localStorage.setItem('lastReminderDate', threeDaysAgo.toString());
      
      renderWithProviders();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });


      expect(screen.queryByText(/It's been a while since your last backup/)).not.toBeInTheDocument();
    });

    it('shows reminder when last reminder was more than 7 days ago', async () => {
      const eightDaysAgo = Date.now() - (8 * 24 * 60 * 60 * 1000);
      localStorage.setItem('lastReminderDate', eightDaysAgo.toString());
      
      renderWithProviders();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(screen.getByText(/It's been a while since your last backup/)).toBeInTheDocument();
      });
    });

    it('sets lastReminderDate when reminder is shown', async () => {
      renderWithProviders();
      
      const beforeTime = Date.now();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(screen.getByText(/It's been a while since your last backup/)).toBeInTheDocument();
      });

      const afterTime = Date.now();
      const storedTime = parseInt(localStorage.getItem('lastReminderDate'));
      
      // Should be between before and after
      expect(storedTime).toBeGreaterThanOrEqual(beforeTime);
      expect(storedTime).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('User Interactions', () => {
    it('navigates to settings when Export Now is clicked', async () => {
      renderWithProviders();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(screen.getByText('Export Now')).toBeInTheDocument();
      });

      const exportButton = screen.getByText('Export Now');
      fireEvent.click(exportButton);

      expect(mockNavigate).toHaveBeenCalledWith('/settings');
    });

    it('hides reminder when Export Now is clicked', async () => {
      renderWithProviders();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(screen.getByText('Export Now')).toBeInTheDocument();
      });

      const exportButton = screen.getByText('Export Now');
      fireEvent.click(exportButton);

      expect(screen.queryByText(/It's been a while since your last backup/)).not.toBeInTheDocument();
    });

    it('hides reminder when Remind Me Later is clicked', async () => {
      renderWithProviders();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(screen.getByText('Remind Me Later')).toBeInTheDocument();
      });

      const laterButton = screen.getByText('Remind Me Later');
      fireEvent.click(laterButton);

      expect(screen.queryByText(/It's been a while since your last backup/)).not.toBeInTheDocument();
    });

    it('hides reminder when close button is clicked', async () => {
      renderWithProviders();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(screen.getByLabelText('Close reminder')).toBeInTheDocument();
      });

      const closeButton = screen.getByLabelText('Close reminder');
      fireEvent.click(closeButton);

      expect(screen.queryByText(/It's been a while since your last backup/)).not.toBeInTheDocument();
    });
  });

  describe('CSS Module Integration', () => {
    it('applies correct CSS classes to elements', async () => {
      renderWithProviders();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(screen.getByText(/It's been a while since your last backup/)).toBeInTheDocument();
      });

      // Find the reminderContainer (outermost div)
      const reminderContainer = screen.getByText(/It's been a while since your last backup/).closest('.reminderContainer');
      expect(reminderContainer).toHaveClass('reminderContainer');

      const content = reminderContainer.querySelector('.reminderContent');
      expect(content).toBeInTheDocument();

      const actions = reminderContainer.querySelector('.reminderActions');
      expect(actions).toBeInTheDocument();

      const exportButton = screen.getByText('Export Now');
      expect(exportButton).toHaveClass('exportButton');

      const laterButton = screen.getByText('Remind Me Later');
      expect(laterButton).toHaveClass('laterButton');

      const closeButton = screen.getByLabelText('Close reminder');
      expect(closeButton).toHaveClass('closeButton');
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels', async () => {
      renderWithProviders();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(screen.getByLabelText('Close reminder')).toBeInTheDocument();
      });

      const closeButton = screen.getByLabelText('Close reminder');
      expect(closeButton).toHaveAttribute('aria-label', 'Close reminder');
    });

    it('maintains focus management when reminder appears', async () => {
      renderWithProviders();
      
      // Focus should not be stolen when reminder appears
      const focusTarget = document.body;
      focusTarget.focus();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(screen.getByText(/It's been a while since your last backup/)).toBeInTheDocument();
      });

      // Focus should remain where it was
      expect(document.activeElement).toBe(document.body);
    });
  });

  describe('LocalStorage Integration', () => {
    it('reads from localStorage correctly', async () => {
      const getItemSpy = jest.spyOn(Storage.prototype, 'getItem');
      
      renderWithProviders();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(getItemSpy).toHaveBeenCalledWith('lastExportDate');
      expect(getItemSpy).toHaveBeenCalledWith('lastReminderDate');
    });

    it('writes to localStorage correctly', async () => {
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
      
      renderWithProviders();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(screen.getByText(/It's been a while since your last backup/)).toBeInTheDocument();
      });

      expect(setItemSpy).toHaveBeenCalledWith('lastReminderDate', expect.any(String));
    });

    it('handles localStorage errors gracefully', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('localStorage error');
      });
      
      renderWithProviders();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      // Should not show reminder when localStorage fails
      await waitFor(() => {
        expect(screen.queryByText(/It's been a while since your last backup/)).not.toBeInTheDocument();
      }, { timeout: 500 });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'ExportReminder: localStorage access failed',
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('handles invalid date values in localStorage', async () => {
      localStorage.setItem('lastExportDate', 'invalid-date');
      localStorage.setItem('lastReminderDate', 'invalid-date');
      
      renderWithProviders();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      // Should still work and show reminder due to invalid dates being treated as not existing
      await waitFor(() => {
        expect(screen.getByText(/It's been a while since your last backup/)).toBeInTheDocument();
      });
    });

    it('handles authentication state changes', async () => {
      // First render with authenticated user
      const { rerender } = renderWithProviders(true);
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(screen.getByText(/It's been a while since your last backup/)).toBeInTheDocument();
      });

      // Change auth state to unauthenticated
      useAuth.mockReturnValue({
        isAuthenticated: false,
        user: null,
        login: jest.fn(),
        logout: jest.fn(),
        loading: false
      });

      rerender(
        <BrowserRouter>
          <ExportReminder />
        </BrowserRouter>
      );

      expect(screen.queryByText(/It's been a while since your last backup/)).not.toBeInTheDocument();
    });
  });

  describe('Component Lifecycle', () => {
    it('cleans up properly on unmount', () => {
      const { unmount } = renderWithProviders();
      
      expect(() => unmount()).not.toThrow();
    });

    it('handles multiple re-renders correctly', async () => {
      const { rerender } = renderWithProviders();
      
      // Re-render multiple times
      rerender(
        <BrowserRouter>
          <ExportReminder />
        </BrowserRouter>
      );

      rerender(
        <BrowserRouter>
          <ExportReminder />
        </BrowserRouter>
      );

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      await waitFor(() => {
        expect(screen.getByText(/It's been a while since your last backup/)).toBeInTheDocument();
      });
    });
  });

  describe('Performance', () => {
    it('does not cause memory leaks with timer', () => {
      const { unmount } = renderWithProviders();
      
      // Advance timer past the deadline
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      
      unmount();
      
      // Should not throw or cause issues
      expect(() => {
        jest.runOnlyPendingTimers();
      }).not.toThrow();
    });
  });
});