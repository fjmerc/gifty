import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { toast } from 'react-toastify';
import { BrowserRouter } from 'react-router-dom';
import Settings from '../js/Settings';
import axiosInstance from '../../axiosInstance';
import { ThemeProvider } from '../../ThemeContext';

// Mock axiosInstance
jest.mock('../../axiosInstance');

// Results are reported with toasts
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  ToastContainer: () => null,
}));

// The signed-in account; database tools are for the instance owner
let mockAuthUser = { firstName: 'Test', role: 'admin', isOwner: true };
const mockFetchUserProfile = jest.fn();
jest.mock('../../AuthContext', () => ({ useAuth: () => ({ user: mockAuthUser, fetchUserProfile: mockFetchUserProfile }) }));

// Mock CSS modules
jest.mock('../css/Settings.module.css', () => ({
  settingsPage: 'settingsPage',
  settingsContainer: 'settingsContainer',
  settingsHeader: 'settingsHeader',
  settingsSection: 'settingsSection',
  settingGroup: 'settingGroup',
  settingItem: 'settingItem',
  settingSubItem: 'settingSubItem',
  settingLabel: 'settingLabel',
  settingSubLabel: 'settingSubLabel',
  settingDescription: 'settingDescription',
  settingControl: 'settingControl',
  settingIcon: 'settingIcon',
  loading: 'loading',
  checkbox: 'checkbox',
  secondaryButton: 'secondaryButton',
  primaryButton: 'primaryButton',
  dangerButton: 'dangerButton',
  modalOverlay: 'modalOverlay',
  modalContent: 'modalContent',
  modalBody: 'modalBody',
  modalFooter: 'modalFooter',
  closeButton: 'closeButton',
  fileInput: 'fileInput',
  passwordForm: 'passwordForm',
  formGroup: 'formGroup',
  passwordInputWrapper: 'passwordInputWrapper',
  eyeButton: 'eyeButton',
  errorMessage: 'errorMessage',
  warningText: 'warningText',
  deleteConfirmInput: 'deleteConfirmInput',
  permissionTag: 'permissionTag',
  grantedTag: 'grantedTag',
  deniedTag: 'deniedTag',
  unsupportedTag: 'unsupportedTag',
  permissionIcon: 'permissionIcon',
  permissionButtonSmall: 'permissionButtonSmall',
  infoButton: 'infoButton',
  backupInfo: 'backupInfo',
  backupList: 'backupList',
  backupItem: 'backupItem',
  backupListHeader: 'backupListHeader',
  backupHeader: 'backupHeader',
  backupIcon: 'backupIcon',
  backupDetails: 'backupDetails',
  backupActions: 'backupActions',
  backupDetailsList: 'backupDetailsList',
  detailIcon: 'detailIcon',
  emptyState: 'emptyState',
  secondaryText: 'secondaryText',
  warningContainer: 'warningContainer',
  warningIcon: 'warningIcon',
  restoreProgressContainer: 'restoreProgressContainer',
  progressBar: 'progressBar',
  progressFill: 'progressFill',
  modalHelpText: 'modalHelpText'
}));

// Mock FontAwesome
jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: ({ icon, spin, ...props }) => 
    <span data-testid={`fa-${icon.iconName}`} data-icon={icon.iconName || 'icon'} data-spin={spin} {...props} />
}));

// Mock lazy components
jest.mock('../../components/js/EmailConfig', () => {
  return function MockEmailConfig({ onSuccess }) {
    return (
      <div data-testid="email-config">
        <h3>Email Configuration</h3>
        <button onClick={() => onSuccess(true)} data-testid="email-save-button">Save Email Config</button>
        <button onClick={() => onSuccess(false)} data-testid="email-save-no-close-button">Save Without Close</button>
      </div>
    );
  };
});

jest.mock('../../components/js/HolidaySettings', () => {
  return function MockHolidaySettings({ onSettingsChange }) {
    return (
      <div data-testid="holiday-settings">
        <h3>Holiday Settings</h3>
        <button 
          onClick={() => onSettingsChange({ holidaySettings: { enabled: true } })} 
          data-testid="holiday-save-button"
        >
          Save Holiday Settings
        </button>
      </div>
    );
  };
});

// Test helper to render with Router
const renderWithRouter = (component) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

// Mock user preferences data
const mockUserPreferences = {
  theme: 'light',
  notifications: true,
  timezone: 'UTC',
  allowRetroactiveNotifications: true,
  notificationSettings: {
    email: { enabled: true, address: 'test@example.com' },
    push: { enabled: true },
    sms: { enabled: false, number: '' }
  },
  holidaySettings: {
    enabled: true,
    categories: ['national', 'cultural'],
    countryCode: 'US',
    defaultRemindDaysBefore: 7
  }
};

// Mock database backups data
const mockDatabaseBackups = [
  {
    name: 'backup-2023-01-01.tar.gz',
    createdAt: '2023-01-01T10:00:00Z',
    size: 1024000,
    timestamp: '2023-01-01T10:00:00Z'
  },
  {
    name: 'backup-2023-01-02.tar.gz',
    createdAt: '2023-01-02T10:00:00Z',
    size: 2048000,
    timestamp: '2023-01-02T10:00:00Z'
  }
];

// Mock backup validation response
const mockBackupInfo = {
  version: '1.0.0',
  timestamp: '2023-01-01T10:00:00Z',
  dataTypes: ['gifts', 'events', 'recipients', 'budgets']
};

describe('Settings Page', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default API responses
    axiosInstance.get.mockImplementation((url) => {
      switch (url) {
        case '/settings/user-preferences':
          return Promise.resolve({ data: mockUserPreferences });
        case '/database/backups':
          return Promise.resolve({ data: mockDatabaseBackups });
        default:
          return Promise.reject(new Error('Unhandled API call'));
      }
    });
    
    axiosInstance.post.mockResolvedValue({ data: { message: 'Success' } });
    axiosInstance.delete.mockResolvedValue({ data: { message: 'Deleted' } });
    
    
    // Mock URL methods
    global.URL.createObjectURL = jest.fn(() => 'mock-blob-url');
    global.URL.revokeObjectURL = jest.fn();
    
    // Mock localStorage
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
    };
    global.localStorage = localStorageMock;
    
    // Mock Notification API
    global.Notification = {
      permission: 'default',
      requestPermission: jest.fn(() => Promise.resolve('granted'))
    };
  });

  // 1. Component Logic Analysis & Bug Fixes Validation
  describe('Component Logic Analysis & Bug Fixes Validation', () => {
    test('validates complex component architecture with multiple modals', async () => {
      renderWithRouter(<Settings />);
      
      // Verify component renders without throwing errors despite complexity - use specific heading level
      expect(screen.getByRole('heading', { name: /^settings$/i, level: 1 })).toBeInTheDocument();
      
      // Wait for API calls to complete
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/settings/user-preferences');
      });
    });

    test('handles API loading states properly', async () => {
      renderWithRouter(<Settings />);
      
      // Should show loading initially
      expect(screen.getByText(/loading\.\.\./i)).toBeInTheDocument();
      
      // Wait for loading to finish
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
    });

    test('manages complex state with 30+ useState hooks', async () => {
      renderWithRouter(<Settings />);
      
      // Wait for loading to finish and preferences to be loaded
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      // Verify various state-dependent elements are rendered
      const themeSelect = screen.getByRole('combobox'); // theme select
      expect(themeSelect).toBeInTheDocument();
      expect(themeSelect).toHaveValue('light');
      expect(screen.getAllByRole('checkbox')[0]).toBeInTheDocument(); // notifications (first checkbox)
    });

    test('properly handles component unmounting with cleanup', () => {
      const { unmount } = renderWithRouter(<Settings />);
      
      // Component should unmount without errors
      expect(() => unmount()).not.toThrow();
    });
  });

  // 2. Authentication & Basic Rendering
  describe('AI Model section', () => {
    test('has one AI Model heading: the picker sits in the section without its own card title', async () => {
      const defaultGet = axiosInstance.get.getMockImplementation();
      axiosInstance.get.mockImplementation((url) => (url === '/ai/models'
        ? Promise.resolve({ data: { defaultProvider: 'openai', providers: [{ id: 'openai', label: 'OpenAI', available: true, models: [] }] } })
        : defaultGet(url)));
      renderWithRouter(<Settings />);

      expect(await screen.findByRole('option', { name: 'OpenAI' })).toBeInTheDocument();
      expect(screen.getAllByRole('heading', { name: 'AI Model' })).toHaveLength(1);
    });
  });

  describe('Authentication & Basic Rendering', () => {
    test('renders main settings sections correctly', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      // Verify all main sections
      expect(screen.getByRole('heading', { name: /general settings/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /advanced settings/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /notification settings/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /user data management/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /account settings/i })).toBeInTheDocument();
    });

    test('applies correct CSS module classes', () => {
      const { container } = renderWithRouter(<Settings />);
      
      expect(container.querySelector('.settingsPage')).toBeInTheDocument();
      expect(container.querySelector('.settingsContainer')).toBeInTheDocument();
      expect(container.querySelector('.settingsHeader')).toBeInTheDocument();
    });

    test('renders all setting controls and buttons', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      // Verify key action buttons exist - handle duplicates
      expect(screen.getAllByRole('button', { name: /create backup/i })).toHaveLength(1); // Data management (Database Management is on the Admin page)
      expect(screen.getByRole('button', { name: /restore backup/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /configure email/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /configure holidays/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /delete account/i })).toBeInTheDocument();
    });
  });

  // 3. Data Fetching & API Integration
  describe('Data Fetching & API Integration', () => {
    test('fetches user preferences on component mount', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/settings/user-preferences');
      });
    });

    test('handles API error gracefully during preferences fetch', async () => {
      axiosInstance.get.mockRejectedValue(new Error('API Error'));
      
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      // Should still render with default values
      expect(screen.getByRole('heading', { name: /^settings$/i, level: 1 })).toBeInTheDocument();
    });

    test('updates user preferences via API', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      // Change theme setting
      const themeSelect = screen.getByRole('combobox');
      expect(themeSelect).toHaveValue('light');
      fireEvent.change(themeSelect, { target: { value: 'dark' } });
      
      await waitFor(() => {
        expect(axiosInstance.post).toHaveBeenCalledWith('/settings/user-preferences', { theme: 'dark' });
      });
    });

    test('choosing a theme applies it to the page right away', async () => {
      document.documentElement.setAttribute('data-theme', 'light');
      renderWithRouter(<ThemeProvider><Settings /></ThemeProvider>);

      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });

      fireEvent.change(screen.getByRole('combobox', { name: 'Theme' }), { target: { value: 'dark' } });

      await waitFor(() => {
        expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
      });
      expect(axiosInstance.post).toHaveBeenCalledWith('/settings/user-preferences', { theme: 'dark' });
    });

    test('handles preference update API errors', async () => {
      axiosInstance.post.mockRejectedValue(new Error('Update failed'));
      
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      const themeSelect = screen.getByRole('combobox');
      fireEvent.change(themeSelect, { target: { value: 'dark' } });
      
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to update preference. Please try again.');
      });
    });
  });

  // 4. User Interactions & Modal Management
  describe('User Interactions & Modal Management', () => {
    test('opens and closes change password modal', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      // Open modal
      const changePasswordBtn = screen.getByRole('button', { name: /change password/i });
      fireEvent.click(changePasswordBtn);
      
      expect(screen.getByRole('heading', { name: /change password/i })).toBeInTheDocument();
      
      // Close modal
      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelBtn);
      
      expect(screen.queryByRole('heading', { name: /change password/i })).not.toBeInTheDocument();
    });

    test('handles password change form submission', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      // Open change password modal
      fireEvent.click(screen.getByRole('button', { name: /change password/i }));
      
      // Fill form
      fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'oldpass' } });
      fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'NewPass123!' } });
      fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'NewPass123!' } });

      // Submit form - get the second "Change Password" button (the one in the modal)
      const changePasswordButtons = screen.getAllByRole('button', { name: /change password/i });
      fireEvent.click(changePasswordButtons[1]); // Modal submit button

      await waitFor(() => {
        expect(axiosInstance.post).toHaveBeenCalledWith('/users/change-password', {
          currentPassword: 'oldpass',
          newPassword: 'NewPass123!'
        });
      });
    });

    test('validates password confirmation in change password form', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByRole('button', { name: /change password/i }));
      
      // Fill with mismatched passwords
      fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'oldpass' } });
      fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'newpass123' } });
      fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'different' } });
      
      const changePasswordButtons = screen.getAllByRole('button', { name: /change password/i });
      fireEvent.click(changePasswordButtons[1]); // Modal submit button
      
      expect(screen.getByText('New passwords do not match')).toBeInTheDocument();
    });

    test('toggles password visibility in change password form', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByRole('button', { name: /change password/i }));
      
      const passwordInput = screen.getByLabelText('Current Password');
      const eyeButton = passwordInput.parentElement.querySelector('button');
      
      // Initially should be password type
      expect(passwordInput).toHaveAttribute('type', 'password');
      
      // Click eye button to show password
      fireEvent.click(eyeButton);
      expect(passwordInput).toHaveAttribute('type', 'text');
      
      // Click again to hide
      fireEvent.click(eyeButton);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });

  // 5. File Operations & Data Management
  describe('File Operations & Data Management', () => {
    test('handles backup creation', async () => {
      axiosInstance.get.mockImplementation((url) => {
        if (url === '/settings/backup') {
          return Promise.resolve({
            data: {
              metadata: { version: '1.0.0', timestamp: new Date().toISOString() },
              data: { gifts: [], events: [], recipients: [], budgets: [] }
            }
          });
        }
        return Promise.resolve({ data: mockUserPreferences });
      });
      
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      const createBackupBtns = screen.getAllByRole('button', { name: /create backup/i });
      fireEvent.click(createBackupBtns[0]); // First "Create Backup" button (in data management section)
      
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/settings/backup');
        expect(toast.success).toHaveBeenCalledWith('Backup created successfully! The file has been downloaded to your device.');
      });
    });

    test('handles export data operations', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      // Mock blob response
      axiosInstance.post.mockResolvedValue({ data: new Blob(['csv data'], { type: 'text/csv' }) });
      
      const exportCsvBtn = screen.getByRole('button', { name: /export as csv/i });
      fireEvent.click(exportCsvBtn);
      
      await waitFor(() => {
        expect(axiosInstance.post).toHaveBeenCalledWith('/settings/export', {
          dataTypes: ['gifts', 'events', 'recipients', 'budgets'],
          format: 'csv'
        }, { responseType: 'blob' });
      });
    });

    test('shows the server\'s reason when an export is refused', async () => {
      renderWithRouter(<Settings />);
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      const body = new Blob([JSON.stringify({ message: 'Export size would exceed maximum allowed size' })], { type: 'application/json' });
      axiosInstance.post.mockRejectedValueOnce({ response: { status: 400, data: body } });

      fireEvent.click(screen.getByRole('button', { name: /export as csv/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to export data: Export size would exceed maximum allowed size');
      });
    });

    test('an export does not count as a backup for the backup reminder', async () => {
      localStorage.removeItem('lastExportDate');
      renderWithRouter(<Settings />);
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      axiosInstance.post.mockResolvedValueOnce({ data: new Blob(['csv data'], { type: 'text/csv' }) });

      fireEvent.click(screen.getByRole('button', { name: /export as csv/i }));

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/downloaded/i)));
      expect(localStorage.getItem('lastExportDate')).toBeNull();
    });

    test('says an export cannot be restored', async () => {
      renderWithRouter(<Settings />);
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      expect(screen.getByText(/cannot be restored/i)).toBeInTheDocument();
    });

    test('opens export modal for ZIP selection', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      const exportZipBtn = screen.getByRole('button', { name: /export as zip/i });
      fireEvent.click(exportZipBtn);
      
      expect(screen.getByRole('heading', { name: /select data to export/i })).toBeInTheDocument();
      
      // Verify the data type labels are displayed (this is what users actually see)
      expect(screen.getByText('Gifts')).toBeInTheDocument();
      expect(screen.getByText('Events')).toBeInTheDocument();
      expect(screen.getByText('Recipients')).toBeInTheDocument();
      expect(screen.getByText('Budgets')).toBeInTheDocument();
    });

    test('handles file upload for backup restoration', async () => {
      axiosInstance.post.mockImplementation((url, data) => {
        if (url === '/settings/validate-backup') {
          return Promise.resolve({
            data: { isValid: true, backupInfo: mockBackupInfo }
          });
        }
        return Promise.resolve({ data: { message: 'Success' } });
      });
      
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      // Create a mock file
      const file = new File(['backup data'], 'backup.json', { type: 'application/json' });
      
      // Get the hidden file input
      const fileInput = document.querySelector('input[type="file"]');
      
      // Simulate file selection
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });
      
      fireEvent.change(fileInput);
      
      await waitFor(() => {
        expect(axiosInstance.post).toHaveBeenCalledWith('/settings/validate-backup', expect.any(FormData));
      });
    });
  });

  describe('Restoring your own backup', () => {
    const selectBackupFile = () => {
      const fileInput = document.querySelector('input[type="file"]');
      Object.defineProperty(fileInput, 'files', {
        value: [new File(['{}'], 'backup.json', { type: 'application/json' })],
        writable: false,
      });
      fireEvent.change(fileInput);
    };

    test('shows what the file holds, flags an older backup, and reports what was restored and fixed', async () => {
      axiosInstance.post.mockImplementation((url) => {
        if (url === '/settings/validate-backup') {
          return Promise.resolve({ data: { isValid: true, backupInfo: {
            format: 1, legacy: true, timestamp: '2025-06-01T00:00:00Z', dataTypes: ['recipients'],
            counts: { recipients: 1, events: 2, gifts: 3, budgets: 0 }
          } } });
        }
        if (url === '/settings/restore') {
          return Promise.resolve({ data: {
            success: true, legacy: true,
            restoredData: { recipients: 1, events: 2, gifts: 3, budgets: 0, overallBudgets: 0 },
            skipped: { events: 0, gifts: 0, budgets: 0 },
            fixes: { textFieldsDecoded: 0, pricesRounded: 1, purchaseDatesAdded: 0, eventsWithImportedType: 0 }
          } });
        }
        return Promise.resolve({ data: {} });
      });
      renderWithRouter(<Settings />);
      await waitFor(() => expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument());

      selectBackupFile();

      expect(await screen.findByText('Contains: 1 recipient, 2 events, 3 gifts, 0 budgets')).toBeInTheDocument();
      expect(screen.getByText(/from an older version of Gifty/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Restore' }));

      // The summary waits in a dialog: the page reloads only when it is closed
      const done = await screen.findByRole('dialog', { name: 'Backup restored' });
      expect(done).toHaveTextContent(
        'Backup restored: 1 recipient, 2 events, 3 gifts, 0 budgets, 0 overall budgets. '
        + 'Updated from an older backup: 1 price rounded to the cent.'
      );
      expect(within(done).getByRole('button', { name: 'Reload now' })).toBeInTheDocument();
    });
  });

  // 7. Modal Integrations & Lazy Loading
  describe('Modal Integrations & Lazy Loading', () => {
    test('opens email configuration modal', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      const configureEmailBtn = screen.getByRole('button', { name: /configure email/i });
      fireEvent.click(configureEmailBtn);
      
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /email configuration/i, level: 2 })).toBeInTheDocument();
        expect(screen.getByTestId('email-config')).toBeInTheDocument();
      });
    });

    test('handles email configuration save and close', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByRole('button', { name: /configure email/i }));
      
      await waitFor(() => {
        expect(screen.getByTestId('email-config')).toBeInTheDocument();
      });
      
      // Click save button that closes modal
      fireEvent.click(screen.getByTestId('email-save-button'));
      
      expect(screen.queryByRole('heading', { name: /email configuration/i })).not.toBeInTheDocument();
    });

    test('opens holiday settings modal with user data', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      const configureHolidaysBtn = screen.getByRole('button', { name: /configure holidays/i });
      fireEvent.click(configureHolidaysBtn);
      
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /holiday reminders/i })).toBeInTheDocument();
        expect(screen.getByTestId('holiday-settings')).toBeInTheDocument();
      });
    });

    test('handles holiday settings changes and updates preferences', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByRole('button', { name: /configure holidays/i }));
      
      await waitFor(() => {
        expect(screen.getByTestId('holiday-settings')).toBeInTheDocument();
      });
      
      // Trigger settings change
      fireEvent.click(screen.getByTestId('holiday-save-button'));
      
      // The window closes once the settings are saved
      await waitFor(() => {
        expect(screen.queryByTestId('holiday-settings')).not.toBeInTheDocument();
      });
    });

    test('opens delete account modal with confirmation input', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      const deleteAccountBtn = screen.getByRole('button', { name: /delete account/i });
      fireEvent.click(deleteAccountBtn);
      
      expect(screen.getByRole('heading', { name: /delete account/i })).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/type delete/i)).toBeInTheDocument();
    });

    test('validates DELETE confirmation before account deletion', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByRole('button', { name: /delete account/i }));
      
      const confirmInput = screen.getByPlaceholderText(/type delete/i);
      const deleteAccountBtns = screen.getAllByRole('button', { name: /delete account/i });
      const modalDeleteBtn = deleteAccountBtns[1]; // Second button is the modal button
      
      // Button should be disabled initially when no text entered
      expect(modalDeleteBtn).toBeDisabled();
      
      // Type incorrect text - button should still be disabled
      fireEvent.change(confirmInput, { target: { value: 'WRONG' } });
      expect(modalDeleteBtn).toBeDisabled();
      
      // Type DELETE - still needs the current password
      fireEvent.change(confirmInput, { target: { value: 'DELETE' } });
      expect(modalDeleteBtn).toBeDisabled();
      const password = screen.getByLabelText('Current password');
      expect(password).toHaveAttribute('type', 'password');
      expect(password).toHaveAttribute('autocomplete', 'current-password');
      fireEvent.change(password, { target: { value: 'Secret-pass1' } });
      expect(modalDeleteBtn).not.toBeDisabled();
      fireEvent.click(modalDeleteBtn);
      
      await waitFor(() => {
        expect(axiosInstance.delete).toHaveBeenCalledWith('/users/account', { data: { currentPassword: 'Secret-pass1' } });
      });
    });

    test('shows a wrong password next to the field and keeps the dialog open', async () => {
      axiosInstance.delete.mockRejectedValueOnce({ response: { status: 400, data: {
        message: 'Current password is incorrect',
        errors: [{ field: 'currentPassword', message: 'Current password is incorrect' }]
      } } });
      renderWithRouter(<Settings />);
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /delete account/i }));
      fireEvent.change(screen.getByPlaceholderText(/type delete/i), { target: { value: 'DELETE' } });
      fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'Wrong-pass1' } });
      fireEvent.click(screen.getAllByRole('button', { name: /delete account/i })[1]);

      const field = screen.getByLabelText('Current password');
      await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
      expect(document.getElementById(field.getAttribute('aria-describedby'))).toHaveTextContent('Current password is incorrect');
      expect(screen.getByRole('heading', { name: /delete account/i })).toBeInTheDocument();
    });
  });

  // 8. Notification & Permission Management
  describe('Notification & Permission Management', () => {
    test('displays notification permission status', async () => {
      global.Notification.permission = 'granted';
      
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      // Should show enabled status for granted permission - look for the permission tag specifically
      expect(screen.getByTestId('fa-circle-check')).toBeInTheDocument();
      
      // Verify the permission tag contains "Enabled" text
      const permissionTag = screen.getByTestId('fa-circle-check').closest('div');
      expect(permissionTag).toHaveTextContent('Enabled');
    });

    test('handles notification permission request', async () => {
      global.Notification.permission = 'default';
      global.Notification.requestPermission.mockResolvedValue('granted');
      
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      const enableBtn = screen.getByRole('button', { name: /enable/i });
      fireEvent.click(enableBtn);
      
      await waitFor(() => {
        expect(global.Notification.requestPermission).toHaveBeenCalled();
        expect(toast.success).toHaveBeenCalledWith('Browser notifications enabled!');
      });
    });

    test('toggles notification settings', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      // Get all checkboxes and target the first one (email notifications)
      const checkboxes = screen.getAllByRole('checkbox');
      const emailNotificationCheckbox = checkboxes[0]; // First checkbox is email notifications
      fireEvent.click(emailNotificationCheckbox);
      
      await waitFor(() => {
        expect(axiosInstance.post).toHaveBeenCalledWith('/settings/user-preferences', {
          notificationSettings: expect.objectContaining({
            email: expect.objectContaining({
              enabled: false
            })
          })
        });
      });
    });

    test('toggles retroactive notifications setting', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      // Get all checkboxes and target the second one (retroactive notifications)
      const checkboxes = screen.getAllByRole('checkbox');
      const retroactiveCheckbox = checkboxes[1]; // Second checkbox is retroactive notifications
      fireEvent.click(retroactiveCheckbox);
      
      await waitFor(() => {
        expect(axiosInstance.post).toHaveBeenCalledWith('/settings/user-preferences', {
          allowRetroactiveNotifications: false
        });
      });
    });
  });

  // 9. Error Handling & Edge Cases
  describe('Error Handling & Edge Cases', () => {
    test('handles invalid backup file selection', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      const fileInput = document.querySelector('input[type="file"]');
      const invalidFile = new File(['data'], 'backup.txt', { type: 'text/plain' });
      
      Object.defineProperty(fileInput, 'files', {
        value: [invalidFile],
        writable: false,
      });
      
      fireEvent.change(fileInput);
      
      expect(toast.error).toHaveBeenCalledWith('Please select a valid JSON backup file');
    });

    test('handles backup validation failure', async () => {
      axiosInstance.post.mockRejectedValue({
        response: { data: { message: 'Invalid backup format' } }
      });
      
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      const fileInput = document.querySelector('input[type="file"]');
      const file = new File(['invalid data'], 'backup.json', { type: 'application/json' });
      
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });
      
      fireEvent.change(fileInput);
      
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Invalid backup format');
      });
    });

    test('handles component rendering without Notification API support', async () => {
      delete global.Notification;
      
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      expect(screen.getByText(/not supported/i)).toBeInTheDocument();
    });

    test('handles network errors during operations', async () => {
      axiosInstance.get.mockRejectedValue(new Error('Network Error'));
      axiosInstance.post.mockRejectedValue(new Error('Network Error'));
      
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      // Component should still render with error handling
      expect(screen.getByRole('heading', { name: /^settings$/i, level: 1 })).toBeInTheDocument();
    });

    test('handles modal overlay clicks for closing modals', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      // Open change password modal
      fireEvent.click(screen.getByRole('button', { name: /change password/i }));
      
      // Click on the backdrop (outside the dialog)
      const backdrop = screen.getByTestId('modal-backdrop');
      fireEvent.mouseDown(backdrop);
      fireEvent.click(backdrop);
      
      expect(screen.queryByRole('heading', { name: /change password/i })).not.toBeInTheDocument();
    });

    test('prevents modal close during loading operations', async () => {
      renderWithRouter(<Settings />);
      
      await waitFor(() => {
        expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument();
      });
      
      // Open change password modal
      const changePasswordBtns = screen.getAllByRole('button', { name: /change password/i });
      fireEvent.click(changePasswordBtns[0]); // First button opens the modal
      
      // Fill form and submit to trigger loading state
      fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'oldpass' } });
      // Must satisfy the password rules (8+ chars, upper, lower, digit, special) or validation stops the submit
      fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'NewPass123!' } });
      fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'NewPass123!' } });
      
      // Mock slow API response
      axiosInstance.post.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));
      
      const submitPasswordBtns = screen.getAllByRole('button', { name: /change password/i });
      fireEvent.click(submitPasswordBtns[1]); // Second button is the submit button in modal
      
      // Cancel button should be disabled during loading
      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      expect(cancelBtn).toBeDisabled();
    });
  });

  describe('Dialogs and names', () => {
    const loaded = async () => {
      renderWithRouter(<Settings />);
      await waitFor(() => expect(screen.queryByText(/loading\.\.\./i)).not.toBeInTheDocument());
    };

    test.each([
      ['Change Password', 'Change Password', 'dialog'],
      ['Configure Holidays', 'Holiday Reminders', 'dialog'],
      ['Configure Email', 'Email Configuration', 'dialog'],
      ['Export as ZIP', 'Select Data to Export', 'dialog'],
      ['Delete Account', 'Delete Account', 'alertdialog'],
    ])('%s opens a named %s that Escape closes', async (button, title, role) => {
      await loaded();
      fireEvent.click(screen.getAllByRole('button', { name: new RegExp(button, 'i') })[0]);
      const dialog = await screen.findByRole(role, { name: title });
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole(role, { name: title })).not.toBeInTheDocument());
    });

    test('the theme select and the two toggles have names', async () => {
      await loaded();
      expect(screen.getByRole('combobox', { name: 'Theme' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Gifty notifications' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Retroactive notifications' })).toBeInTheDocument();
    });

    test('the show-password buttons say which field they reveal', async () => {
      await loaded();
      fireEvent.click(screen.getByRole('button', { name: /change password/i }));
      expect(screen.getByRole('button', { name: 'Show current password' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Show new password' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Show confirm new password' })).toBeInTheDocument();
    });

    test('the export choices are labelled checkboxes', async () => {
      await loaded();
      fireEvent.click(screen.getByRole('button', { name: /export as zip/i }));
      ['Gifts', 'Events', 'Recipients', 'Budgets'].forEach((name) => {
        expect(screen.getByRole('checkbox', { name })).toBeChecked();
      });
    });

    test('a password change is reported with a toast', async () => {
      await loaded();
      fireEvent.click(screen.getByRole('button', { name: /change password/i }));
      fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'oldpass' } });
      fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'NewPass123!' } });
      fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'NewPass123!' } });
      fireEvent.click(screen.getAllByRole('button', { name: /change password/i })[1]);
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Password changed successfully'));
      expect(screen.queryByRole('dialog', { name: 'Change Password' })).not.toBeInTheDocument();
    });
  });
});
