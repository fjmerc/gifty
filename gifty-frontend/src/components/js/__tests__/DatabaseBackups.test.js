import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { toast } from 'react-toastify';
import { BrowserRouter } from 'react-router-dom';
import DatabaseBackups from '../DatabaseBackups';
import axiosInstance from '../../../axiosInstance';

// Database Management, on the Admin page's Backups tab (moved from Settings)
jest.mock('../../../axiosInstance');

// Results are reported with toasts
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  ToastContainer: () => null,
}));

// The signed-in account; restoring and deleting are for the instance owner
let mockAuthUser = { firstName: 'Test', role: 'admin', isOwner: true };
const mockFetchUserProfile = jest.fn();
jest.mock('../../../AuthContext', () => ({ useAuth: () => ({ user: mockAuthUser, fetchUserProfile: mockFetchUserProfile }) }));

jest.mock('../../../pages/css/Settings.module.css', () => ({
  settingsSection: 'settingsSection',
  settingGroup: 'settingGroup',
  settingItem: 'settingItem'
}));

jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: ({ icon, spin, ...props }) =>
    <span data-testid={`fa-${icon.iconName}`} data-icon={icon.iconName || 'icon'} data-spin={spin} {...props} />
}));

const renderWithRouter = (component) => render(<BrowserRouter>{component}</BrowserRouter>);

const mockDatabaseBackups = [
  { name: 'backup-2023-01-01.tar.gz', createdAt: '2023-01-01T10:00:00Z', size: 1024000, timestamp: '2023-01-01T10:00:00Z' },
  { name: 'backup-2023-01-02.tar.gz', createdAt: '2023-01-02T10:00:00Z', size: 2048000, timestamp: '2023-01-02T10:00:00Z' }
];

describe('Database Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axiosInstance.get.mockImplementation((url) => (url === '/database/backups'
      ? Promise.resolve({ data: mockDatabaseBackups })
      : Promise.reject(new Error('Unhandled API call'))));
    axiosInstance.post.mockResolvedValue({ data: { message: 'Success' } });
    axiosInstance.delete.mockResolvedValue({ data: { message: 'Deleted' } });
  });

    test('opens database backup modal and fetches backups', async () => {
      renderWithRouter(<DatabaseBackups />);
      
      
      const manageBackupsBtn = screen.getByRole('button', { name: /manage backups/i });
      fireEvent.click(manageBackupsBtn);
      
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/database/backups');
        expect(screen.getByRole('heading', { name: /database backups/i })).toBeInTheDocument();
      });
    });

    // A focused control that turns disabled drops focus to <body>, out of the
    // dialog; the backup list loads right as the dialog opens
    test('Create New Backup stays focusable while the list loads, and does nothing then', async () => {
      let finish;
      axiosInstance.get.mockImplementation((url) => (url === '/database/backups'
        ? new Promise((resolve) => { finish = () => resolve({ data: [] }); })
        : Promise.resolve({ data: {} })));
      renderWithRouter(<DatabaseBackups />);

      fireEvent.click(screen.getByRole('button', { name: /manage backups/i }));
      const create = await screen.findByRole('button', { name: /create new backup/i });
      await waitFor(() => expect(create).toHaveAttribute('aria-disabled', 'true'));
      expect(create).not.toBeDisabled();
      fireEvent.click(create);
      expect(axiosInstance.post).not.toHaveBeenCalledWith('/database/backup');
      finish();
      await waitFor(() => expect(create).toHaveAttribute('aria-disabled', 'false'));
    });

    test('creates new database backup', async () => {
      axiosInstance.post.mockResolvedValue({ data: { backupName: 'new-backup.tar.gz' } });
      
      renderWithRouter(<DatabaseBackups />);
      
      
      fireEvent.click(screen.getByRole('button', { name: /create backup/i }));
      
      await waitFor(() => {
        expect(axiosInstance.post).toHaveBeenCalledWith('/database/backup');
        expect(toast.success).toHaveBeenCalledWith("Database backup 'new-backup.tar.gz' created successfully");
      });
    });

    test('handles database backup creation errors with helpful messages', async () => {
      axiosInstance.post.mockRejectedValue({
        response: { data: { message: 'MongoDB Database Tools are not installed' } }
      });
      
      renderWithRouter(<DatabaseBackups />);
      
      
      fireEvent.click(screen.getByRole('button', { name: /create backup/i }));
      
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('MongoDB Database Tools are not installed'), expect.objectContaining({ autoClose: false }));
      });
    });

    // A restore can change who is an admin: the signed-in profile is read again
    test('restore refreshes the profile', async () => {
      mockFetchUserProfile.mockClear();
      axiosInstance.post.mockResolvedValueOnce({ data: { success: true, collections: {}, upgrade: {} } });
      renderWithRouter(<DatabaseBackups />);
      fireEvent.click(screen.getByRole('button', { name: /manage backups/i }));
      fireEvent.click(await screen.findByRole('button', { name: 'Restore backup backup-2023-01-01.tar.gz' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Confirm Restore' }));
      await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledWith('/database/restore/backup-2023-01-01.tar.gz'));
      await waitFor(() => expect(mockFetchUserProfile).toHaveBeenCalled());
    });

    test('deletes database backup with confirmation', async () => {
      renderWithRouter(<DatabaseBackups />);
      
      
      // Open manage backups modal
      fireEvent.click(screen.getByRole('button', { name: /manage backups/i }));
      
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /database backups/i })).toBeInTheDocument();
        expect(axiosInstance.get).toHaveBeenCalledWith('/database/backups');
      });
      
      fireEvent.click(await screen.findByRole('button', { name: 'Delete backup backup-2023-01-01.tar.gz' }));

      // Asks first, in a confirmation on top of the backups dialog
      const confirmation = screen.getByRole('alertdialog', { name: 'Delete backup' });
      expect(confirmation).toHaveTextContent("Are you sure you want to delete backup 'backup-2023-01-01.tar.gz'?");
      expect(axiosInstance.delete).not.toHaveBeenCalled();
      fireEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(axiosInstance.delete).toHaveBeenCalledWith('/database/backups/backup-2023-01-01.tar.gz'));
      expect(toast.success).toHaveBeenCalledWith("Backup 'backup-2023-01-01.tar.gz' deleted successfully");
    });

    test('hides database management from members', async () => {
      mockAuthUser = { firstName: 'Kid', role: 'member', isOwner: false };
      try {
        renderWithRouter(<DatabaseBackups />);
        expect(screen.queryByRole('heading', { name: /database management/i })).not.toBeInTheDocument();
        expect(axiosInstance.get).not.toHaveBeenCalledWith('/database/backups');
      } finally {
        mockAuthUser = { firstName: 'Test', role: 'admin', isOwner: true };
      }
    });

    test('shows database management to an admin who is not the owner', async () => {
      mockAuthUser = { firstName: 'Ann', role: 'admin', isOwner: false };
      try {
        renderWithRouter(<DatabaseBackups />);
        expect(await screen.findByRole('heading', { name: /database management/i })).toBeInTheDocument();
      } finally {
        mockAuthUser = { firstName: 'Test', role: 'admin', isOwner: true };
      }
    });

    // A restore replaces every account and the owner record: only the owner
    // restores or deletes server backups; other admins can make and list them
    test('an admin who is not the owner can make backups but not restore or delete them', async () => {
      mockAuthUser = { firstName: 'Ann', role: 'admin', isOwner: false };
      try {
        renderWithRouter(<DatabaseBackups />);
        fireEvent.click(await screen.findByRole('button', { name: /manage backups/i }));
        expect(await screen.findByText('backup-2023-01-01.tar.gz')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create new backup/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /restore backup backup-2023-01-01/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /delete backup backup-2023-01-01/i })).not.toBeInTheDocument();
      } finally {
        mockAuthUser = { firstName: 'Test', role: 'admin', isOwner: true };
      }
    });

    test('the owner can restore and delete server backups', async () => {
      renderWithRouter(<DatabaseBackups />);
      fireEvent.click(await screen.findByRole('button', { name: /manage backups/i }));
      expect(await screen.findByRole('button', { name: /restore backup backup-2023-01-01/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /delete backup backup-2023-01-01/i })).toBeInTheDocument();
    });

    test('handles empty database backups list', async () => {
      axiosInstance.get.mockImplementation((url) => {
        if (url === '/database/backups') {
          return Promise.resolve({ data: [] });
        }
        return Promise.resolve({ data: {} });
      });
      
      renderWithRouter(<DatabaseBackups />);
      
      
      fireEvent.click(screen.getByRole('button', { name: /manage backups/i }));
      
      await waitFor(() => {
        expect(screen.getByText(/no database backups found/i)).toBeInTheDocument();
        expect(screen.getByText(/create your first backup/i)).toBeInTheDocument();
      });
    });

  test('Manage Backups opens a named Database Backups dialog that Escape closes', async () => {
    renderWithRouter(<DatabaseBackups />);
    fireEvent.click(screen.getByRole('button', { name: /manage backups/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Database Backups' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Database Backups' })).not.toBeInTheDocument());
  });
});
