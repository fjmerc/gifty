import React, { useState, memo, useRef, lazy, Suspense, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import styles from '../css/Settings.module.css';
import axiosInstance from '../../axiosInstance';
import { useAuth } from '../../AuthContext';
import { useTheme } from '../../ThemeContext';
import { backupContents, restoreSummary, databaseRestoreSummary } from '../../utils/backupSummary';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faBell, faCalendarCheck, faCalendarDays, faCircleCheck, faCircleExclamation, faCircleInfo, faDatabase, faEnvelope, faEye, faEyeSlash, faFilePdf, faRotateLeft, faTrash } from '@fortawesome/free-solid-svg-icons';
import Modal from '../../components/ui/Modal';
import useConfirm from '../../components/ui/useConfirm';
import AIProviderSelector from '../../components/ui/AIProviderSelector';

// Messages with several sentences or line breaks (server instructions,
// restore summaries) stay until dismissed so they can be read
const LONG_MESSAGE = { autoClose: false, style: { whiteSpace: 'pre-line' } };

// A password field with its show/hide toggle
const PasswordField = ({ id, label, value, onChange, shown, onToggle, hint }) => (
  <div className={styles.formGroup}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.passwordInputWrapper}>
      <input
        type={shown ? 'text' : 'password'}
        id={id}
        value={value}
        onChange={onChange}
        required
      />
      <button
        type="button"
        className={styles.eyeButton}
        onClick={onToggle}
        aria-label={`${shown ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
      >
        {shown ? <FontAwesomeIcon icon={faEyeSlash} /> : <FontAwesomeIcon icon={faEye} />}
      </button>
    </div>
    {hint}
  </div>
);

// ChangePasswordModal component
const ChangePasswordModal = memo(({ isOpen, onClose }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate passwords
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    // Mirror the backend complexity rules so we never submit a password the
    // server will reject, and report the first unmet requirement specifically.
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long');
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setError('New password must contain at least one lowercase letter');
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setError('New password must contain at least one uppercase letter');
      return;
    }
    if (!/\d/.test(newPassword)) {
      setError('New password must contain at least one number');
      return;
    }
    if (!/[@$!%*?&]/.test(newPassword)) {
      setError('New password must contain at least one special character (@ $ ! % * ? &)');
      return;
    }

    try {
      setIsLoading(true);
      const response = await axiosInstance.post('/users/change-password', {
        currentPassword,
        newPassword
      });

      if (response.data.message) {
        toast.success('Password changed successfully');
        onClose();
      }
    } catch (error) {
      setError(
        error.response?.data?.errors?.[0]?.message ||
        error.response?.data?.message ||
        'Failed to change password'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Change Password"
      closeOnEscape={!isLoading}
      closeOnBackdrop={!isLoading}
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            className={styles.secondaryButton}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="change-password-form"
            className={styles.primaryButton}
            disabled={isLoading}
          >
            {isLoading ? <><FontAwesomeIcon icon={faSpinner} spin /> Changing...</> : 'Change Password'}
          </button>
        </>
      )}
    >
      <form id="change-password-form" onSubmit={handleSubmit} className={styles.passwordForm}>
        {error && <div className={styles.errorMessage} role="alert">{error}</div>}

        <PasswordField
          id="currentPassword"
          label="Current Password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          shown={showCurrentPassword}
          onToggle={() => setShowCurrentPassword(!showCurrentPassword)}
        />
        <PasswordField
          id="newPassword"
          label="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          shown={showNewPassword}
          onToggle={() => setShowNewPassword(!showNewPassword)}
          hint={(
            <p className={styles.passwordHint}>
              At least 8 characters, including an uppercase letter, a lowercase
              letter, a number, and a special character (@ $ ! % * ? &).
            </p>
          )}
        />
        <PasswordField
          id="confirmPassword"
          label="Confirm New Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          shown={showConfirmPassword}
          onToggle={() => setShowConfirmPassword(!showConfirmPassword)}
        />
      </form>
    </Modal>
  );
});

// RestoreModal component
const RestoreModal = memo(({
  backupInfo,
  isRestoring,
  restoreProgress,
  onConfirm,
  onCancel
}) => (
  <Modal
    open
    onClose={onCancel}
    title="Restore Backup"
    role="alertdialog"
    closeOnEscape={!isRestoring}
    closeOnBackdrop={!isRestoring}
    showCloseButton={!isRestoring}
    footer={(
      <>
        <button
          onClick={onCancel}
          className={styles.secondaryButton}
          disabled={isRestoring}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className={styles.dangerButton}
          disabled={isRestoring}
        >
          {isRestoring ? <><FontAwesomeIcon icon={faSpinner} spin /> Restoring...</> : 'Confirm Restore'}
        </button>
      </>
    )}
  >
    <div className={styles.backupInfo}>
      <h3>Backup Details</h3>
      <ul>
        {backupInfo.timestamp && <li>Created: {new Date(backupInfo.timestamp).toLocaleString()}</li>}
        {backupInfo.counts && <li>Contains: {backupContents(backupInfo)}</li>}
      </ul>
      {backupInfo.legacy && (
        <p>
          This backup is from an older version of Gifty. Its data will be updated as it's
          restored, the same way this server's data was.
        </p>
      )}
    </div>
    <p className={styles.warningText}>
      Warning: This will replace all your current data with the backup data.
      This action cannot be undone.
    </p>

    {isRestoring && (
      <div
        className={styles.progressBar}
        role="progressbar"
        aria-label="Restore progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={restoreProgress}
      >
        <div
          className={styles.progressFill}
          style={{ transform: `scaleX(${restoreProgress / 100})` }}
        />
      </div>
    )}
  </Modal>
));

const blobText = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsText(blob);
});

// Exports are downloaded as blobs, so an error's JSON body arrives as a Blob
const exportErrorReason = async (error) => {
  const body = error.response?.data;
  try {
    const parsed = body instanceof Blob ? JSON.parse(await blobText(body)) : body;
    if (parsed?.message) return parsed.message;
  } catch (parseError) {
    // Not JSON: fall through to the generic reason
  }
  return 'Please try again.';
};

// Move ExportModal outside of Settings component and memoize it
const ExportModal = memo(({
  selectedTypes,
  setSelectedTypes,
  handleExportZip,
  isExporting,
  setShowExportModal
}) => (
  <Modal
    open
    onClose={() => setShowExportModal(false)}
    title="Select Data to Export"
    footer={(
      <>
        <button
          onClick={() => setShowExportModal(false)}
          className={styles.secondaryButton}
        >
          Cancel
        </button>
        <button
          onClick={handleExportZip}
          className={styles.primaryButton}
          disabled={isExporting}
        >
          {isExporting ? 'Exporting...' : 'Export as ZIP'}
        </button>
      </>
    )}
  >
    {Object.entries(selectedTypes).map(([type, isSelected]) => (
      <div key={type} className={styles.settingItem}>
        <label htmlFor={`export-${type}`} className={styles.settingLabel}>
          {type.charAt(0).toUpperCase() + type.slice(1)}
        </label>
        <div className={styles.settingControl}>
          <input
            id={`export-${type}`}
            type="checkbox"
            checked={isSelected}
            onChange={() => setSelectedTypes(prev => ({
              ...prev,
              [type]: !prev[type]
            }))}
            className={styles.checkbox}
          />
        </div>
      </div>
    ))}
  </Modal>
));

// Helper function to format file size
const formatFileSize = (bytes) => {
  if (bytes === 0 || !bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Database Backup Modal component
const DatabaseBackupModal = memo(({ isOpen, onClose, backups, isLoading, onCreateBackup, onRestoreBackup, onDeleteBackup }) => (
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

// Lazy-load EmailConfig component
const EmailConfig = lazy(() => import('../../components/js/EmailConfig'));
const HolidaySettingsComponent = lazy(() => import('../../components/js/HolidaySettings'));

// EmailConfigModal component
const EmailConfigModal = memo(({ isOpen, onClose, configKey }) => (
  <Modal open={isOpen} onClose={onClose} title="Email Configuration" size="lg">
    <Suspense fallback={<div>Loading email configuration...</div>}>
      <EmailConfig
        key={configKey}
        refreshTrigger={configKey}
        onSuccess={(shouldClose = true) => {
          // Only close the modal if shouldClose is true (default)
          if (shouldClose) {
            onClose();
          }
        }}
      />
    </Suspense>
  </Modal>
));

// HolidaySettingsModal component
const HolidaySettingsModal = memo(({ isOpen, onClose, onSettingsChange }) => {
  // Add a key state to force remounting when the modal is opened
  const [componentKey, setComponentKey] = useState(0);

  // When the modal opens, increment the key to force a remount
  useEffect(() => {
    if (isOpen) {
      setComponentKey(prev => prev + 1);
    }
  }, [isOpen]);

  return (
    <Modal open={isOpen} onClose={onClose} title="Holiday Reminders" size="lg">
      <Suspense fallback={<div>Loading holiday settings...</div>}>
        <HolidaySettingsComponent
          key={componentKey}
          onSettingsChange={onSettingsChange}
        />
      </Suspense>
    </Modal>
  );
});

const DeleteAccountModal = memo(({ isOpen, onClose }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  // Deleting needs the current password (the server checks it)
  const [currentPassword, setCurrentPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const navigate = useNavigate();

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') {
      toast.error('Please type DELETE to confirm');
      return;
    }

    try {
      setIsDeleting(true);
      setPasswordError('');
      await axiosInstance.delete('/users/account', { data: { currentPassword } });
      // Clear any auth tokens or user data from localStorage
      localStorage.removeItem('userInfo');
      localStorage.removeItem('token');
      // Redirect to home page
      navigate('/');
    } catch (error) {
      const passwordProblem = error.response?.data?.errors?.find((e) => e.field === 'currentPassword');
      if (passwordProblem) setPasswordError(passwordProblem.message);
      else toast.error(error.response?.data?.message || 'Failed to delete account');
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Delete Account"
      role="alertdialog"
      closeOnEscape={!isDeleting}
      closeOnBackdrop={!isDeleting}
      footer={(
        <>
          <button
            onClick={onClose}
            className={styles.secondaryButton}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            className={styles.dangerButton}
            disabled={isDeleting || confirmText !== 'DELETE' || !currentPassword}
          >
            {isDeleting ? <><FontAwesomeIcon icon={faSpinner} spin /> Deleting...</> : 'Delete Account'}
          </button>
        </>
      )}
    >
      <p className={styles.warningText}>
        Warning: This action cannot be undone. All your data will be permanently deleted.
      </p>
      <label htmlFor="delete-account-confirm">Type DELETE to confirm:</label>
      <input
        id="delete-account-confirm"
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        className={styles.deleteConfirmInput}
        placeholder="Type DELETE"
        autoComplete="off"
      />
      <label htmlFor="delete-account-password">Current password</label>
      <input
        id="delete-account-password"
        type="password"
        value={currentPassword}
        onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(''); }}
        className={styles.deleteConfirmInput}
        autoComplete="current-password"
        aria-invalid={passwordError ? 'true' : undefined}
        aria-describedby={passwordError ? 'delete-account-password-error' : undefined}
      />
      {passwordError && (
        <p id="delete-account-password-error" role="alert" className={styles.warningText}>{passwordError}</p>
      )}
    </Modal>
  );
});

const Settings = () => {
  // Database backups are instance-wide: only the instance owner can use them
  const isInstanceOwner = Boolean(useAuth()?.user?.isInstanceOwner);
  const themeContext = useTheme();
  const fileInputRef = useRef(null);
  const { confirm, confirmDialog } = useConfirm();
  // A finished restore's summary, shown before the page reloads
  const [restoreResult, setRestoreResult] = useState(null);
  // The backup the server could not delete for lack of file permissions
  const [permissionErrorBackup, setPermissionErrorBackup] = useState(null);
  const [userPreferences, setUserPreferences] = useState({
    theme: themeContext?.preference || 'system',
    notifications: true,
    timezone: 'UTC',
    allowRetroactiveNotifications: true,
    notificationSettings: {
      email: { enabled: true, address: '' },
      push: { enabled: true },
      sms: { enabled: false, number: '' }
    },
    holidaySettings: {
      enabled: true,
      categories: ['national', 'cultural'],
      countryCode: 'US',
      defaultRemindDaysBefore: 7
    }
  });
  // systemHealth is no longer used in UI but kept for backend interaction
  // eslint-disable-next-line no-unused-vars
  const [systemHealth, setSystemHealth] = useState({ isHealthy: true, giftCount: 0 });
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEmailConfigModal, setShowEmailConfigModal] = useState(false);
  const [showHolidaySettingsModal, setShowHolidaySettingsModal] = useState(false);
  const [emailConfigKey, setEmailConfigKey] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState(
    'Notification' in window ? Notification.permission : 'unsupported'
  ); // Key to force re-mount of EmailConfig

  // Fetch user preferences when component mounts
  useEffect(() => {
    const fetchUserPreferences = async () => {
      try {
        setIsLoadingPreferences(true);
        const response = await axiosInstance.get('/settings/user-preferences');
        setUserPreferences(response.data);
        // Use a more optimistic default value for systemHealth
        setSystemHealth(response.data.systemHealth || { isHealthy: true, giftCount: 0 });
      } catch (error) {
        console.error('Error fetching user preferences:', error);
        // Don't show alert as it might prevent interaction
        // Set default values in case of error
        setUserPreferences(prev => ({
          ...prev,
          allowRetroactiveNotifications: true
        }));
      } finally {
        // Always ensure isLoadingPreferences is set to false
        setIsLoadingPreferences(false);
      }
    };

    fetchUserPreferences();
  }, []);

  // Update a user preference
  const updateUserPreference = async (key, value) => {
    try {
      await axiosInstance.post('/settings/user-preferences', { [key]: value });
      setUserPreferences(prev => ({ ...prev, [key]: value }));
      if (key === 'theme') themeContext?.setPreference(value);
    } catch (error) {
      console.error('Error updating user preference:', error);
      toast.error(error.response?.data?.message || 'Failed to update preference. Please try again.');
    }
  };

  const [selectedTypes, setSelectedTypes] = useState({
    gifts: true,
    events: true,
    recipients: true,
    budgets: true
  });



  // Create and download backup
  const handleCreateBackup = async () => {
    try {
      setIsBackingUp(true);
      const response = await axiosInstance.get('/settings/backup');
      
      // Validate the backup data structure
      if (!response.data || !response.data.metadata || !response.data.data) {
        throw new Error('Invalid backup data structure received from server');
      }
      
      // Create a blob from the stringified JSON
      const jsonString = JSON.stringify(response.data, null, 2); // Pretty print for readability
      const filename = `gifty-backup-${new Date().toISOString()}.json`;
      
      // Create blob and trigger download
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      // Record the export date for the reminder system
      localStorage.setItem('lastExportDate', new Date().getTime().toString());
      
      toast.success('Backup created successfully! The file has been downloaded to your device.');
    } catch (error) {
      console.error('Error creating backup:', error);
      toast.error('Error creating backup: ' + (error.response?.data?.message || 'Unknown error'));
    } finally {
      setIsBackingUp(false);
    }
  };

  // Restore state
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [backupInfo, setBackupInfo] = useState(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  
  // Database backup state
  const [databaseBackups, setDatabaseBackups] = useState([]);
  const [isDbBackupLoading, setIsDbBackupLoading] = useState(false);
  const [isDbRestoreLoading, setIsDbRestoreLoading] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [isDbDeleteLoading, setIsDbDeleteLoading] = useState(false);
  const [showDatabaseBackupModal, setShowDatabaseBackupModal] = useState(false);
  const [showDatabaseRestoreModal, setShowDatabaseRestoreModal] = useState(false);
  const [selectedDatabaseBackup, setSelectedDatabaseBackup] = useState(null);

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    // Let the same file be chosen again after a cancel or an error
    event.target.value = '';
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast.error('Please select a valid JSON backup file');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('backup', file);
      const validateResponse = await axiosInstance.post('/settings/validate-backup', formData);

      if (validateResponse.data.isValid) {
        setSelectedFile(file);
        setBackupInfo(validateResponse.data.backupInfo);
        setShowRestoreModal(true);
      }
    } catch (error) {
      console.error('Error validating backup:', error);
      toast.error(error.response?.data?.message || 'This backup file could not be read.');
    }
  };

  const handleRestoreBackup = () => {
    fileInputRef.current?.click();
  };

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

  // Handle email configuration modal opening
  const handleOpenEmailConfig = () => {
    setEmailConfigKey(prevKey => prevKey + 1); // Increment key to force re-render
    setShowEmailConfigModal(true);
  };

  // Handle holiday settings modal opening
  // The holiday settings window loads the saved settings itself
  const handleOpenHolidaySettings = () => setShowHolidaySettingsModal(true);

  const confirmRestore = async () => {
    if (!selectedFile) return;

    try {
      setIsRestoring(true);
      setRestoreProgress(0);

      const formData = new FormData();
      formData.append('backup', selectedFile);

      const response = await axiosInstance.post('/settings/restore', formData, {
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setRestoreProgress(progress);
        }
      });

      const summary = restoreSummary(response.data);

      // Refetch user preferences
      try {
        const prefsResponse = await axiosInstance.get('/settings/user-preferences');
        setUserPreferences(prefsResponse.data);
        setSystemHealth(prefsResponse.data.systemHealth || { isHealthy: false, giftCount: 0 });
      } catch (prefsError) {
        console.error('Error fetching updated preferences after restore:', prefsError);
      }
      
      // Show what was restored; the page reloads when the dialog closes
      setRestoreResult(summary);
    } catch (error) {
      console.error('Error restoring backup:', error);
      toast.error('Failed to restore backup: ' + (error.response?.data?.message || 'Unknown error'));
    } finally {
      setIsRestoring(false);
      setRestoreProgress(0);
      setShowRestoreModal(false);
      setSelectedFile(null);
      setBackupInfo(null);
    }
  };

  const handleExportData = async (format) => {
    // Set the appropriate loading state
    if (format.toLowerCase() === 'csv') {
      setIsExportingCsv(true);
    } else if (format.toLowerCase() === 'json') {
      setIsExportingJson(true);
    }
    
    try {
      const selectedDataTypes = Object.entries(selectedTypes)
        .filter(([_, isSelected]) => isSelected)
        .map(([type]) => type);

      if (selectedDataTypes.length === 0) {
        toast.error('Please select at least one data type to export.');
        return;
      }

      const response = await axiosInstance.post('/settings/export', {
        dataTypes: selectedDataTypes,
        format: format.toLowerCase()
      }, {
        responseType: 'blob'
      });

      // Create a blob from the response data
      const blob = new Blob([response.data], { 
        type: format.toLowerCase() === 'csv' ? 'text/csv' : 'application/json'
      });
      
      // Create a URL for the blob
      const url = window.URL.createObjectURL(blob);
      
      // Create a temporary link element
      const link = document.createElement('a');
      link.href = url;
      
      // Set filename
      const filename = `gifty-export-${selectedDataTypes.join('-')}.${format.toLowerCase()}`;
      link.setAttribute('download', filename);
      
      // Append link to body, click it, and remove it
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the URL
      window.URL.revokeObjectURL(url);
      
      // An export is not a backup: the backup reminder keeps counting
      toast.success(`Export successful! Your ${format.toUpperCase()} file has been downloaded.`);
    } catch (error) {
      console.error('Error exporting data:', error);
      toast.error(`Failed to export data: ${await exportErrorReason(error)}`);
    } finally {
      // Reset the appropriate loading state
      if (format.toLowerCase() === 'csv') {
        setIsExportingCsv(false);
      } else if (format.toLowerCase() === 'json') {
        setIsExportingJson(false);
      }
    }
  };

  const handleExportZip = async () => {
    try {
      setIsExportingZip(true);
      const selectedDataTypes = Object.entries(selectedTypes)
        .filter(([_, isSelected]) => isSelected)
        .map(([type]) => type);

      if (selectedDataTypes.length === 0) {
        toast.error('Please select at least one data type to export.');
        return;
      }

      const response = await axiosInstance.post('/settings/export-zip', {
        dataTypes: selectedDataTypes
      }, {
        responseType: 'blob'
      });

      // Create a blob from the response data
      const blob = new Blob([response.data], { type: 'application/zip' });
      
      // Create a URL for the blob
      const url = window.URL.createObjectURL(blob);
      
      // Create a temporary link element
      const link = document.createElement('a');
      link.href = url;
      
      // Set filename
      const filename = `gifty-export-${new Date().toISOString()}.zip`;
      link.setAttribute('download', filename);
      
      // Append link to body, click it, and remove it
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the URL
      window.URL.revokeObjectURL(url);
      setShowExportModal(false);
      
      // An export is not a backup: the backup reminder keeps counting
      toast.success('Export successful! Your ZIP file has been downloaded.');
    } catch (error) {
      console.error('Error exporting data:', error);
      toast.error(`Failed to export data: ${await exportErrorReason(error)}`);
    } finally {
      setIsExportingZip(false);
    }
  };


  return (
    <div className={styles.settingsPage}>
      {isLoadingPreferences && (
        <div className={styles.loading}>
          <FontAwesomeIcon icon={faSpinner} spin /> Loading...
        </div>
      )}
      <div className={styles.settingsContainer}>
        {/* Hidden file input for backup restore */}
        <input
          type="file"
          ref={fileInputRef}
          className={styles.fileInput}
          accept=".json"
          onChange={handleFileSelect}
          aria-label="Backup file to restore"
          tabIndex={-1}
        />
      <div className={styles.settingsHeader}>
        <h1>Settings</h1>
      </div>

      {/* General Settings Section */}
      <section className={styles.settingsSection}>
        <h2>General Settings</h2>
        <div className={styles.settingGroup}>
          <div className={styles.settingItem}>
            <div>
              <div className={styles.settingLabel}>Theme</div>
              <div className={styles.settingDescription}>Choose your preferred theme</div>
            </div>
            <div className={styles.settingControl}>
              <select 
                value={userPreferences.theme} 
                onChange={(e) => updateUserPreference('theme', e.target.value)}
                aria-label="Theme"
                className={styles.secondaryButton}
                disabled={isLoadingPreferences}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </div>
          </div>

          <div className={styles.settingItem}>
            <div>
              <div className={styles.settingLabel}>Notifications</div>
              <div className={styles.settingDescription}>Enable or disable the Gifty notification system (reminders, alerts, updates)</div>
            </div>
            <div className={styles.settingControl}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={userPreferences.notificationSettings?.email?.enabled || false}
                  onChange={(e) => {
                    const newSettings = {
                      ...userPreferences.notificationSettings,
                      email: {
                        ...userPreferences.notificationSettings.email,
                        enabled: e.target.checked
                      }
                    };
                    updateUserPreference('notificationSettings', newSettings);
                  }}
                  aria-label="Gifty notifications"
                  className={styles.checkbox}
                  disabled={isLoadingPreferences}
                />
                <span>{userPreferences.notificationSettings?.email?.enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>
          </div>
          
          {userPreferences.notificationSettings?.email?.enabled && (
            <div className={styles.settingSubItem}>
              <div>
                <div className={styles.settingSubLabel}>
                  <FontAwesomeIcon icon={faBell} className={styles.settingIcon} />
                  Browser Notifications
                </div>
                <div className={styles.settingDescription}>Allow notifications when the app is closed or in the background (requires browser permission)</div>
              </div>
              <div className={styles.settingControl}>
                {!('Notification' in window) ? (
                  <div className={styles.permissionTag + ' ' + styles.unsupportedTag}>
                    <FontAwesomeIcon icon={faCircleInfo} className={styles.permissionIcon} />
                    Not supported
                  </div>
                ) : notificationPermission === 'granted' ? (
                  <div className={styles.permissionTag + ' ' + styles.grantedTag}>
                    <FontAwesomeIcon icon={faCircleCheck} className={styles.permissionIcon} />
                    Enabled
                  </div>
                ) : notificationPermission === 'denied' ? (
                  <div className={styles.permissionTag + ' ' + styles.deniedTag}>
                    <FontAwesomeIcon icon={faCircleExclamation} className={styles.permissionIcon} />
                    Blocked
                    <button
                      type="button"
                      onClick={() => toast.info('Notifications are blocked for this site. Allow them in your browser\'s site settings, then reload the page.')}
                      className={styles.infoButton}
                      aria-label="How to unblock notifications"
                    >
                      ?
                    </button>
                  </div>
                ) : (
                  <button 
                    className={styles.permissionButtonSmall}
                    onClick={async () => {
                      try {
                        const result = await Notification.requestPermission();
                        setNotificationPermission(result);
                        if (result === 'granted') {
                          toast.success('Browser notifications enabled!');
                        } else if (result === 'denied') {
                          toast.error('Browser notification permission denied. You can change this in your browser settings.');
                        }
                      } catch (error) {
                        console.error('Error requesting permission:', error);
                        toast.error('Error requesting permission');
                      }
                    }}
                  >
                    <FontAwesomeIcon icon={faBell} className={styles.permissionIcon} />
                    Enable
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* AI Settings Section — provider/model picker. Same component
          used inline on the Gifts page; living here too so users find
          it where preferences normally are. */}
      <section className={styles.settingsSection}>
        <h2>AI Model</h2>
        <p className={styles.sectionDescription}>
          Choose which AI service powers your gift suggestions. Switching providers
          changes the style and quality of recommendations; you can change this any
          time and it takes effect on your next generation.
        </p>
        <AIProviderSelector
          embedded
          provider={userPreferences.aiProvider || null}
          model={userPreferences.aiModel || null}
          activeProvider={userPreferences.activeProvider}
          activeModel={userPreferences.activeModel}
          onChange={({ provider, model }) => {
            // Persist both fields together so the server resolves a
            // consistent provider+model pair.
            updateUserPreference('aiProvider', provider);
            updateUserPreference('aiModel', model);
          }}
        />
      </section>

      {/* Advanced Settings Section */}
      <section className={styles.settingsSection}>
        <h2>Advanced Settings</h2>
        <div className={styles.settingGroup}>
          {/* Retroactive Notifications Toggle */}
          <div className={styles.settingItem}>
            <div>
              <div className={styles.settingLabel}>Retroactive Notifications</div>
              <div className={styles.settingDescription}>Get notifications for events that were added after their date had passed</div>
            </div>
            <div className={styles.settingControl}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={userPreferences.allowRetroactiveNotifications}
                  onChange={(e) => updateUserPreference('allowRetroactiveNotifications', e.target.checked)}
                  aria-label="Retroactive notifications"
                  className={styles.checkbox}
                  disabled={false} // Removed isLoadingPreferences to fix checkbox selection
                />
                <span>{userPreferences.allowRetroactiveNotifications ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>
          </div>
        </div>
      </section>



      {/* Notification Settings Section */}
      <section className={styles.settingsSection}>
        <h2>Notification Settings</h2>
        <div className={styles.settingGroup}>
          <div className={styles.settingItem}>
            <div>
              <div className={styles.settingLabel}>Email Notifications</div>
              <div className={styles.settingDescription}>Configure SMTP settings for email notifications</div>
            </div>
            <div className={styles.settingControl}>
              <button 
                className={styles.secondaryButton}
                onClick={handleOpenEmailConfig}
              >
                <FontAwesomeIcon icon={faEnvelope} /> Configure Email
              </button>
            </div>
          </div>
          
          <div className={styles.settingItem}>
            <div>
              <div className={styles.settingLabel}>Holiday Reminders</div>
              <div className={styles.settingDescription}>Configure automatic reminders for holidays and special dates</div>
            </div>
            <div className={styles.settingControl}>
              <button 
                className={styles.secondaryButton}
                onClick={handleOpenHolidaySettings}
              >
                <FontAwesomeIcon icon={faCalendarCheck} /> Configure Holidays
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* User Data Management Section */}
      <section className={styles.settingsSection}>
        <h2>User Data Management</h2>
        <div className={styles.settingGroup}>
          <div className={styles.settingItem}>
            <div>
              <div className={styles.settingLabel}>Backup Data</div>
              <div className={styles.settingDescription}>Create a backup of all your data and download it to your device</div>
            </div>
            <div className={styles.settingControl}>
              <button 
                onClick={handleCreateBackup} 
                className={styles.primaryButton}
                disabled={isBackingUp}
              >
                {isBackingUp ? <><FontAwesomeIcon icon={faSpinner} spin /> Creating Backup...</> : 'Create Backup'}
              </button>
            </div>
          </div>

          <div className={styles.settingItem}>
            <div>
              <div className={styles.settingLabel}>Restore Data</div>
              <div className={styles.settingDescription}>Restore data from a backup file from your device</div>
            </div>
            <div className={styles.settingControl}>
              <button onClick={handleRestoreBackup} className={styles.secondaryButton}>
                Restore Backup
              </button>
            </div>
          </div>

          <div className={`${styles.settingItem} ${styles.settingItemStacked}`}>
            <div>
              <div className={styles.settingLabel}>Export Data</div>
              <div className={styles.settingDescription}>A readable copy for spreadsheets (CSV, JSON or ZIP). Exports cannot be restored; to move or restore your data, use Create Backup.</div>
            </div>
            <div className={`${styles.settingControl} ${styles.buttonGroup}`}>
              <button 
                onClick={() => handleExportData('csv')} 
                className={styles.secondaryButton} 
                disabled={isExportingCsv || isExportingJson || isExportingZip}
              >
                {isExportingCsv ? <><FontAwesomeIcon icon={faSpinner} spin /> Exporting...</> : 'Export as CSV'}
              </button>
              <button 
                onClick={() => handleExportData('json')} 
                className={styles.secondaryButton} 
                disabled={isExportingCsv || isExportingJson || isExportingZip}
              >
                {isExportingJson ? <><FontAwesomeIcon icon={faSpinner} spin /> Exporting...</> : 'Export as JSON'}
              </button>
              <button 
                onClick={() => setShowExportModal(true)} 
                className={styles.secondaryButton} 
                disabled={isExportingCsv || isExportingJson || isExportingZip}
              >
                {isExportingZip ? <><FontAwesomeIcon icon={faSpinner} spin /> Exporting...</> : 'Export as ZIP'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Database Management Section */}
      {isInstanceOwner && (
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
      )}
      {showExportModal && (
        <ExportModal 
          selectedTypes={selectedTypes}
          setSelectedTypes={setSelectedTypes}
          handleExportZip={handleExportZip}
          isExporting={isExportingZip}
          setShowExportModal={setShowExportModal}
        />
      )}

      {showRestoreModal && backupInfo && (
        <RestoreModal
          backupInfo={backupInfo}
          isRestoring={isRestoring}
          restoreProgress={restoreProgress}
          onConfirm={confirmRestore}
          onCancel={() => {
            setShowRestoreModal(false);
            setSelectedFile(null);
            setBackupInfo(null);
          }}
        />
      )}

      {/* Account Settings Section */}
      <section className={styles.settingsSection}>
        <h2>Account Settings</h2>
        <div className={styles.settingGroup}>
          <div className={styles.settingItem}>
            <div>
              <div className={styles.settingLabel}>Change Password</div>
              <div className={styles.settingDescription}>Update your account password</div>
            </div>
            <div className={styles.settingControl}>
              <button 
                className={styles.secondaryButton}
                onClick={() => setShowChangePasswordModal(true)}
              >
                Change Password
              </button>
            </div>
          </div>

          <div className={styles.settingItem}>
            <div>
              <div className={styles.settingLabel}>Delete Account</div>
              <div className={styles.settingDescription}>Permanently delete your account and all data</div>
            </div>
            <div className={styles.settingControl}>
              <button 
                className={styles.dangerButton}
                onClick={() => setShowDeleteModal(true)}
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      </section>
      </div>

      {/* Change Password Modal */}
      <ChangePasswordModal 
        isOpen={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
      />
      
      {/* Delete Account Modal */}
      <DeleteAccountModal 
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
      />
      
      {/* Email Configuration Modal */}
      <EmailConfigModal
        isOpen={showEmailConfigModal}
        onClose={() => setShowEmailConfigModal(false)}
        configKey={emailConfigKey}
      />

      {/* Holiday Settings Modal */}
      <HolidaySettingsModal
        isOpen={showHolidaySettingsModal}
        onClose={() => setShowHolidaySettingsModal(false)}
        onSettingsChange={(updatedPreferences) => {
          if (updatedPreferences?.holidaySettings) {
            setUserPreferences(prev => ({ ...prev, holidaySettings: updatedPreferences.holidaySettings }));
          }
          setShowHolidaySettingsModal(false);
        }}
      />

      {/* Database Backup Modal */}
      <DatabaseBackupModal
        isOpen={showDatabaseBackupModal}
        onClose={() => setShowDatabaseBackupModal(false)}
        backups={databaseBackups}
        isLoading={isDbBackupLoading}
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

      {/* The restored data shows after a reload: say what was restored first */}
      <Modal
        open={Boolean(restoreResult)}
        onClose={() => window.location.reload()}
        title="Backup restored"
        showCloseButton={false}
        footer={(
          <button className={styles.primaryButton} onClick={() => window.location.reload()}>
            Reload now
          </button>
        )}
      >
        <p>{restoreResult}</p>
      </Modal>
      {confirmDialog}
    </div>
  );
};

export default Settings;
