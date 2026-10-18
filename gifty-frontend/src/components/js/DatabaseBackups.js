// Database Management (moved from Settings to the Admin page's Backups tab):
// server-side database backups for admins. Only the owner restores or
// deletes: a restore replaces every account and the owner record, and can
// change who is an admin, so the profile is read again after one.
import React, { useState, memo, useEffect } from 'react';
import { toast } from 'react-toastify';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faCalendarDays, faCircleExclamation, faCircleInfo, faDatabase, faFilePdf, faRotateLeft, faTrash } from '@fortawesome/free-solid-svg-icons';
import styles from '../../pages/css/Settings.module.css';
import axiosInstance from '../../axiosInstance';
import { useAuth } from '../../AuthContext';
import { databaseRestoreSummary } from '../../utils/backupSummary';
import Modal from '../ui/Modal';
import useConfirm from '../ui/useConfirm';

// Messages with several sentences or line breaks (server instructions,
// restore summaries) stay until dismissed so they can be read
const LONG_MESSAGE = { autoClose: false, style: { whiteSpace: 'pre-line' } };

// Helper function to format file size
const formatFileSize = (bytes) => {
  if (bytes === 0 || !bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Database Backup Modal component
// Only the owner restores or deletes: a restore replaces every account and the owner record
const DatabaseBackupModal = memo(({ isOpen, onClose, backups, isLoading, canRestore, onCreateBackup, onRestoreBackup, onDeleteBackup }) => (
  <Modal
    open={isOpen}
    onClose={onClose}
    title="Database Backups"
    size="lg"
    footer={(
      <>
        <div className={styles.modalHelpText}>
          <FontAwesomeIcon icon={faCircleInfo} /> Backups are stored on the server and contain your complete database.
        </div>
        <button
          onClick={onClose}
          className={styles.secondaryButton}
        >
          Close
        </button>
      </>
    )}
  >
    <div className={styles.backupListHeader}>
      {/* aria-disabled, not disabled: the button has focus when the dialog
          opens, and a disabled button would drop it to <body> */}
      <button
        onClick={isLoading ? undefined : onCreateBackup}
        className={styles.primaryButton}
        aria-disabled={isLoading}
      >
        <FontAwesomeIcon icon={faDatabase} /> Create New Backup
      </button>
    </div>

    {isLoading ? (
      <div>
        <div className={styles.loading} role="status">
          <FontAwesomeIcon icon={faSpinner} spin /> Processing database backup operation...
        </div>
      </div>
    ) : backups.length === 0 ? (
      <div className={styles.emptyState}>
        <FontAwesomeIcon icon={faDatabase} style={{ fontSize: 32 }} />
        <p>No database backups found.</p>
        <p className={styles.secondaryText}>Create your first backup to protect your data.</p>
      </div>
    ) : (
      <div className={styles.backupList}>
        {backups.map((backup) => (
          <div key={backup.name} className={styles.backupItem}>
            <div className={styles.backupInfo}>
              <div className={styles.backupHeader}>
                <FontAwesomeIcon icon={faDatabase} className={styles.backupIcon} />
                <strong>{backup.name}</strong>
              </div>
              <div className={styles.backupDetails}>
                <div><FontAwesomeIcon icon={faCalendarDays} className={styles.detailIcon} /> Created: {new Date(backup.createdAt || backup.timestamp).toLocaleString()}</div>
                {backup.size && <div><FontAwesomeIcon icon={faFilePdf} className={styles.detailIcon} /> Size: {formatFileSize(backup.size)}</div>}
              </div>
            </div>
            {canRestore && (
            <div className={styles.backupActions}>
              <button
                onClick={() => onRestoreBackup(backup)}
                className={styles.secondaryButton}
                disabled={isLoading}
                title="Restore this backup"
                aria-label={`Restore backup ${backup.name}`}
              >
                <FontAwesomeIcon icon={faRotateLeft} /> Restore
              </button>
              <button
                onClick={() => onDeleteBackup(backup.name)}
                className={styles.dangerButton}
                disabled={isLoading}
                title="Delete this backup"
                aria-label={`Delete backup ${backup.name}`}
              >
                <FontAwesomeIcon icon={faTrash} /> Delete
              </button>
            </div>
            )}
          </div>
        ))}
      </div>
    )}
  </Modal>
));

// Database Restore Modal component
const DatabaseRestoreModal = memo(({ isOpen, onClose, backup, isRestoring, onConfirm }) => (
  <Modal
    open={Boolean(isOpen && backup)}
    onClose={onClose}
    title="Restore Database"
    role="alertdialog"
    size="lg"
    closeOnEscape={!isRestoring}
    closeOnBackdrop={!isRestoring}
    showCloseButton={!isRestoring}
    footer={(
      <>
        <button
          onClick={onClose}
          className={styles.secondaryButton}
          disabled={isRestoring}
        >
          Cancel
        </button>
        <button
          onClick={() => onConfirm(backup.name)}
          className={styles.dangerButton}
          disabled={isRestoring}
        >
          {isRestoring ? 'Restoring...' : 'Confirm Restore'}
        </button>
      </>
    )}
  >
    {backup && (
      <>
        <div className={styles.backupInfo}>
          <h3>Backup Details</h3>
          <ul className={styles.backupDetailsList}>
            <li><strong>Name:</strong> {backup.name}</li>
            <li><strong>Created:</strong> {new Date(backup.createdAt || backup.timestamp).toLocaleString()}</li>
            {backup.size && <li><strong>Size:</strong> {formatFileSize(backup.size)}</li>}
          </ul>
        </div>

        <div className={styles.warningContainer}>
          <FontAwesomeIcon icon={faCircleExclamation} className={styles.warningIcon} />
          <p className={styles.warningText}>
            Warning: This will replace all database data with the selected backup.
            This action cannot be undone. Make sure you have exported any important data.
          </p>
        </div>

        {isRestoring && (
          <div className={styles.restoreProgressContainer}>
            <div className={styles.loading} role="status">
              <FontAwesomeIcon icon={faSpinner} spin /> Restoring database... This may take a few minutes depending on the size of the backup.
            </div>
          </div>
        )}
      </>
    )}
  </Modal>
));

// Shown when the server cannot delete a backup file it does not own
const PermissionErrorModal = ({ backupName, onClose }) => (
  <Modal
    open={Boolean(backupName)}
    onClose={onClose}
    title="Permission Error"
    size="lg"
    footer={(
      <button className={styles.secondaryButton} onClick={onClose}>Close</button>
    )}
  >
    <p className={styles.warningText}>You do not have permission to delete this backup file.</p>
    <h3>To fix this issue:</h3>
    <ol>
      <li>Open a terminal window</li>
      <li>
        Run one of these commands to fix the permissions:
        <pre className={styles.commandBlock}>
{`# Option 1: Change ownership of the backup files
sudo chown -R $(whoami):$(whoami) "${backupName}"

# Option 2: Run the fix-permissions.sh script if it was created
./database_backups/fix-permissions.sh`}
        </pre>
      </li>
      <li>Return to this page and try deleting the backup again</li>
    </ol>
  </Modal>
);

export default function DatabaseBackups() {
  const { user: authUser, fetchUserProfile } = useAuth() || {};
  const { confirm, confirmDialog } = useConfirm();
  // The backup the server could not delete for lack of file permissions
  const [permissionErrorBackup, setPermissionErrorBackup] = useState(null);
  // Database backup state
  const [databaseBackups, setDatabaseBackups] = useState([]);
  const [isDbBackupLoading, setIsDbBackupLoading] = useState(false);
  const [isDbRestoreLoading, setIsDbRestoreLoading] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [isDbDeleteLoading, setIsDbDeleteLoading] = useState(false);
  const [showDatabaseBackupModal, setShowDatabaseBackupModal] = useState(false);
  const [showDatabaseRestoreModal, setShowDatabaseRestoreModal] = useState(false);
  const [selectedDatabaseBackup, setSelectedDatabaseBackup] = useState(null);


  // Database backup functions
  // Fetch all database backups
  const fetchDatabaseBackups = async () => {
    try {
      setIsDbBackupLoading(true);
      const response = await axiosInstance.get('/database/backups');
      setDatabaseBackups(response.data);
    } catch (error) {
      console.error('Error fetching database backups:', error);
      
      const errorMsg = error.response?.data?.message || 'Unknown error';
      // More specific error message for user
      toast.error(`Failed to load database backups: ${errorMsg}`);
    } finally {
      setIsDbBackupLoading(false);
    }
  };

  // Create a new database backup
  const handleCreateDatabaseBackup = async () => {
    try {
      setIsDbBackupLoading(true);
      const response = await axiosInstance.post('/database/backup');
      
      // Show success message with backup details
      const backupName = response.data?.backupName || 'Unnamed backup';
      toast.success(`Database backup '${backupName}' created successfully`);
      
      // Refresh the list of backups
      fetchDatabaseBackups();
    } catch (error) {
      console.error('Error creating database backup:', error);
      
      // Handle specific known error cases with helpful messages
      const errorMsg = error.response?.data?.message || 'Unknown error';
      if (errorMsg.includes('MongoDB Database Tools') && errorMsg.includes('not installed')) {
        toast.error(
          'MongoDB Database Tools are not installed on the server. ' +
          'Please ask your administrator to install mongodb-database-tools using the appropriate package manager:\n\n' +
          'For Ubuntu/Debian: sudo apt install mongodb-database-tools\n' +
          'For macOS: brew install mongodb-database-tools\n' +
          'For other systems, please refer to MongoDB documentation.',
          LONG_MESSAGE
        );
      } else if (errorMsg.includes('Docker is not installed')) {
        toast.error(
          'Docker is not installed or not in PATH on the server. ' +
          'Since MongoDB is running in a Docker container, Docker is required for database backups.\n\n' +
          'Please ask your administrator to install Docker.',
          LONG_MESSAGE
        );
      } else if (errorMsg.includes('No running MongoDB containers found')) {
        toast.error(
          'No running MongoDB Docker containers were found. ' +
          'Please ensure your MongoDB container is running.\n\n' +
          'Ask your administrator to start the MongoDB container.',
          LONG_MESSAGE
        );
      } else if (errorMsg.includes('Failed to create backup directory')) {
        toast.error(
          'Failed to create the backup directory on the server. ' +
          'This might be due to permission issues.\n\n' +
          'Please ask your administrator to check the server permissions.',
          LONG_MESSAGE
        );
      } else {
        toast.error('Failed to create database backup: ' + errorMsg);
      }
    } finally {
      setIsDbBackupLoading(false);
    }
  };

  // Restore from a database backup
  const handleRestoreDatabaseBackup = async (backupName) => {
    try {
      setIsDbRestoreLoading(true);
      const response = await axiosInstance.post(`/database/restore/${backupName}`);
      const summary = databaseRestoreSummary(backupName, response.data);
      fetchUserProfile?.();

      // Close the modal
      setShowDatabaseRestoreModal(false);
      setSelectedDatabaseBackup(null);

      // Report the restore and offer to reload in one dialog
      const reload = await confirm({
        title: 'Database restored',
        message: summary,
        details: <p>Reload the page to see the restored data?</p>,
        confirmLabel: 'Reload now',
        cancelLabel: 'Not now',
      });
      if (reload) {
        window.location.reload();
      }
    } catch (error) {
      console.error('Error restoring database:', error);
      
      // Handle specific known error cases with helpful messages
      const errorMsg = error.response?.data?.message || 'Unknown error';
      if (errorMsg.includes('MongoDB Database Tools') && errorMsg.includes('not installed')) {
        toast.error(
          'MongoDB Database Tools are not installed on the server. ' +
          'Please ask your administrator to install mongodb-database-tools using the appropriate package manager:\n\n' +
          'For Ubuntu/Debian: sudo apt install mongodb-database-tools\n' +
          'For macOS: brew install mongodb-database-tools\n' +
          'For other systems, please refer to MongoDB documentation.',
          LONG_MESSAGE
        );
      } else if (errorMsg.includes('Docker is not installed')) {
        toast.error(
          'Docker is not installed or not in PATH on the server. ' +
          'Since MongoDB is running in a Docker container, Docker is required for database backups.\n\n' +
          'Please ask your administrator to install Docker.',
          LONG_MESSAGE
        );
      } else if (errorMsg.includes('No running MongoDB containers found')) {
        toast.error(
          'No running MongoDB Docker containers were found. ' +
          'Please ensure your MongoDB container is running.\n\n' +
          'Ask your administrator to start the MongoDB container.',
          LONG_MESSAGE
        );
      } else if (errorMsg.includes('Backup not found')) {
        toast.error(
          `The backup '${backupName}' could not be found on the server. ` +
          'It may have been deleted or moved.\n\n' +
          'Please try creating a new backup.',
          LONG_MESSAGE
        );
      } else if (errorMsg.includes('does not contain database')) {
        toast.error(
          `The backup '${backupName}' does not contain the expected database. ` +
          'This may be due to a mismatch between the backup and your current database configuration.\n\n' +
          'Please check your MongoDB configuration and try again.',
          LONG_MESSAGE
        );
      } else {
        toast.error('Failed to restore database: ' + errorMsg);
      }
    } finally {
      setIsDbRestoreLoading(false);
    }
  };

  // Delete a database backup
  const handleDeleteDatabaseBackup = async (backupName) => {
    const confirmed = await confirm({
      title: 'Delete backup',
      message: `Are you sure you want to delete backup '${backupName}'? This action cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (confirmed) {
      try {
        setIsDbDeleteLoading(true);
        await axiosInstance.delete(`/database/backups/${backupName}`);
        toast.success(`Backup '${backupName}' deleted successfully`);
        // Refresh the list of backups
        fetchDatabaseBackups();
      } catch (error) {
        console.error('Error deleting database backup:', error);
        
        // Handle specific error cases
        const errorMsg = error.response?.data?.message || 'Unknown error';
        
        if (errorMsg.includes('Backup not found')) {
          toast.error(
            `The backup '${backupName}' could not be found. ` +
            'It may have already been deleted or moved.\n\n' +
            'The backup list will be refreshed.',
            LONG_MESSAGE
          );
          // Refresh anyway to make sure the UI is in sync
          fetchDatabaseBackups();
        } else if (errorMsg.includes('Permission denied')) {
          // Special handling for permission errors: explain how to fix them
          setPermissionErrorBackup(backupName);

          // Still refresh the list to ensure UI is up to date
          fetchDatabaseBackups();
        } else {
          toast.error('Failed to delete database backup: ' + errorMsg);
        }
      } finally {
        setIsDbDeleteLoading(false);
      }
    }
  };

  // Open database restore modal
  const openDatabaseRestoreModal = (backup) => {
    setSelectedDatabaseBackup(backup);
    setShowDatabaseRestoreModal(true);
  };

  // Load database backups when modal is opened
  useEffect(() => {
    if (showDatabaseBackupModal) {
      fetchDatabaseBackups();
    }
  }, [showDatabaseBackupModal]);

  if (authUser?.role !== 'admin') return null;

  return (
    <>
      <section className={styles.settingsSection}>
        <h2>Database Management</h2>
        <div className={styles.settingGroup}>
          <div className={styles.settingItem}>
            <div>
              <div className={styles.settingLabel}>Database Backups</div>
              <div className={styles.settingDescription}>Manage server-side database backups</div>
            </div>
            <div className={styles.settingControl}>
              <button 
                onClick={() => setShowDatabaseBackupModal(true)} 
                className={styles.primaryButton}
              >
                <FontAwesomeIcon icon={faDatabase} /> Manage Backups
              </button>
            </div>
          </div>

          <div className={styles.settingItem}>
            <div>
              <div className={styles.settingLabel}>Create Database Backup</div>
              <div className={styles.settingDescription}>Create a new database backup on the server</div>
            </div>
            <div className={styles.settingControl}>
              <button 
                onClick={handleCreateDatabaseBackup} 
                className={styles.secondaryButton}
                disabled={isDbBackupLoading}
              >
                {isDbBackupLoading ? <><FontAwesomeIcon icon={faSpinner} spin /> Creating...</> : 'Create Backup'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Database Backup Modal */}
      <DatabaseBackupModal
        isOpen={showDatabaseBackupModal}
        onClose={() => setShowDatabaseBackupModal(false)}
        backups={databaseBackups}
        isLoading={isDbBackupLoading}
        canRestore={Boolean(authUser?.isOwner)}
        onCreateBackup={handleCreateDatabaseBackup}
        onRestoreBackup={openDatabaseRestoreModal}
        onDeleteBackup={handleDeleteDatabaseBackup}
      />

      {/* Database Restore Modal */}
      <DatabaseRestoreModal
        isOpen={showDatabaseRestoreModal}
        onClose={() => {
          setShowDatabaseRestoreModal(false);
          setSelectedDatabaseBackup(null);
        }}
        backup={selectedDatabaseBackup}
        isRestoring={isDbRestoreLoading}
        onConfirm={handleRestoreDatabaseBackup}
      />

      <PermissionErrorModal
        backupName={permissionErrorBackup}
        onClose={() => setPermissionErrorBackup(null)}
      />

      {confirmDialog}
    </>
  );
}
