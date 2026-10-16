import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from '../../axiosInstance';
import styles from '../css/Notifications.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBell,
  faSpinner,
  faExclamationCircle,
  faInbox,
  faEnvelope,
  faEllipsisH,
  faCheck,
  faTrash,
  faClock,
  faCheckCircle,
  faHistory,
  faCog,
  faCheckDouble,
  faUndo,
  faInfoCircle
} from '@fortawesome/free-solid-svg-icons';
import ErrorBoundary from '../../components/js/ErrorBoundary';
import Modal from '../../components/ui/Modal';
import DOMPurify from 'dompurify';
import { useNotification } from '../../NotificationContext';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(null);
  const [snoozeDurations] = useState([
    { label: '30 minutes', value: 30 },
    { label: '1 hour', value: 60 },
    { label: '1 day', value: 1440 }
  ]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({});
  const [includeRetroactive, setIncludeRetroactive] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState({
    defaultDuration: 5,
    displayOrder: 'newest',
    soundAlerts: true,
    visualAlerts: true,
    autoDismiss: true
  });
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const feedbackTimeoutRef = useRef(null);
  const notificationRefs = useRef({});
  // The unread count is the server's (a snoozed notice doesn't count until
  // its snooze ends): ask for it after each change rather than guess
  const { fetchUnreadCount, notificationPermission, requestNotificationPermission } = useNotification();

  // Reference to track if the component is mounted
  const isMounted = useRef(true);
  const abortControllerRef = useRef(null);
  
  useEffect(() => {
    // Set isMounted to true when component mounts
    isMounted.current = true;
    
    // Clean up function to set isMounted to false when component unmounts
    return () => {
      isMounted.current = false;
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);
  
  // Use a separate effect to track fetch status
  const [isFetching, setIsFetching] = useState(false);
  
  const timeoutRef = useRef();
  const lastFetchTimeRef = useRef(0);
  const FETCH_THROTTLE_MS = 5000; // Throttle to once every 5 seconds

  const fetchData = useCallback(async (immediate = false) => {
    if (!isMounted.current) return;
    
    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Check if we've fetched recently to prevent excessive API calls
    const now = Date.now();
    if (!immediate && now - lastFetchTimeRef.current < FETCH_THROTTLE_MS) {
      return;
    }
    
    try {
      abortControllerRef.current = new AbortController();
      setIsFetching(true);
      if (loading === false) {
        setLoading(true);
      }
      
      lastFetchTimeRef.current = now;
      
      const [notificationsRes, statsRes] = await Promise.all([
        axios.get(`/notifications?page=${currentPage}&limit=10&includeRetroactive=${includeRetroactive}`, {
          signal: abortControllerRef.current.signal
        }),
        axios.get('/notifications/stats', {
          signal: abortControllerRef.current.signal
        })
      ]);

      if (!isMounted.current) return;

      let fetchedNotifications = notificationsRes.data.notifications;
      
      if (notificationSettings.displayOrder === 'oldest') {
        fetchedNotifications = fetchedNotifications.sort((a, b) => 
          new Date(a.notificationDate) - new Date(b.notificationDate)
        );
      } else {
        fetchedNotifications = fetchedNotifications.sort((a, b) => 
          new Date(b.notificationDate) - new Date(a.notificationDate)
        );
      }
      
      setNotifications(fetchedNotifications);
      setTotalPages(notificationsRes.data.totalPages);
      setStats(statsRes.data);
    } catch (err) {
      if (err.name === 'AbortError' || !isMounted.current) return;
      console.error('Error fetching notifications:', err);
      setError(err.response?.data?.message || 'Failed to fetch notifications');
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setIsFetching(false);
      }
    }
  }, [currentPage, includeRetroactive, notificationSettings.displayOrder, loading]);

  useEffect(() => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout with a longer delay
    timeoutRef.current = setTimeout(() => {
      if (!isFetching && isMounted.current) {
        fetchData();
      }
    }, 1000); // Increased from 300ms to 1000ms

    // Cleanup on unmount or dependency change
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [currentPage, includeRetroactive, notificationSettings.displayOrder, isFetching, fetchData]);

  // Load notification settings from localStorage on component mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('notificationSettings');
    if (savedSettings) {
      try {
        const parsedSettings = JSON.parse(savedSettings);
        setNotificationSettings(parsedSettings);
      } catch (error) {
        console.error('Error parsing notification settings:', error);
      }
    }
  }, []);

  // Handle clicks outside the settings modal to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      // If dropdown is open, check if click is outside the dropdown
      if (dropdownOpen !== null) {
        const dropdownElement = notificationRefs.current[dropdownOpen];
        if (dropdownElement && !dropdownElement.contains(event.target)) {
          setDropdownOpen(null);
        }
      }
    };

    // Add event listener when a dropdown is shown (the settings dialog closes itself)
    if (dropdownOpen !== null) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    // Clean up the event listener
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  // Additional cleanup for component unmount
  useEffect(() => {
    return () => {
      // Ensure all event listeners are removed on unmount
      document.removeEventListener('mousedown', () => {});
    };
  }, []);

  const showFeedback = (message, type = 'info', duration = 3000) => {
    setFeedbackMessage({ text: message, type });
    
    // Clear any existing timeout
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    
    // Set a new timeout to clear the message
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedbackMessage('');
    }, duration);
  };

  // In the browser's own language and clock (the server's formatted text is
  // always US English in the server's zone)
  const formatDate = (value) => (value
    ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '');

  const getFormattedDate = (notification) => formatDate(notification.notificationDate);

  const getNotificationIcon = (notification) => {
    // First check if it's snoozed
    if (notification.isSnoozed) {
      return faClock;
    }
    
    // Then check if it's retroactive
    if (notification.isRetroactive) {
      return faHistory;
    }
    
    // Then check if it's read
    if (notification.read) {
      return faCheckCircle;
    }
    
    // Otherwise use type-based icon
    switch (notification.notificationType) {
      case 'Email':
      case 'email':
        return faEnvelope;
      case 'Reminder':
      case 'reminder':
        return faClock;
      default:
        return faBell;
    }
  };

  const handleSettingsChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    
    setNotificationSettings(prev => {
      const updatedSettings = {
        ...prev,
        [name]: newValue
      };
      
      // Save to localStorage for non-display order changes
      if (name !== 'displayOrder') {
        localStorage.setItem('notificationSettings', JSON.stringify(updatedSettings));
      }
      
      return updatedSettings;
    });
  };

  const handleSettingsToggle = () => {
    setShowSettingsModal(prev => !prev);
  };

  const handleSaveSettings = () => {
    // Save all current settings to localStorage
    const currentSettings = { ...notificationSettings };
    delete currentSettings.pendingDisplayOrder; // Remove any pending state
    localStorage.setItem('notificationSettings', JSON.stringify(currentSettings));
    
    // Close the modal
    setShowSettingsModal(false);
    
    // Show success feedback
    showFeedback('Settings saved successfully', 'success');
  };

  const handleToggleRead = async (notificationId, currentStatus) => {
    try {
      setNotifications(notifications.map(notif => 
        notif._id === notificationId ? { ...notif, read: !currentStatus } : notif
      ));
      
      const response = await axios.put(`/notifications/${notificationId}`, {
        read: !currentStatus
      });
      
      if (!response.data) {
        setNotifications(notifications.map(notif => 
          notif._id === notificationId ? { ...notif, read: currentStatus } : notif
        ));
      }
      fetchUnreadCount();
    } catch (err) {
      setNotifications(notifications.map(notif => 
        notif._id === notificationId ? { ...notif, read: currentStatus } : notif
      ));
      setError('Failed to update notification');
    } finally {
      setDropdownOpen(null);
    }
  };

  const handleDelete = async (notificationId) => {
    const notification = notifications.find(n => n._id === notificationId);
    try {
      setNotifications(notifications.filter(notif => notif._id !== notificationId));

      await axios.delete(`/notifications/${notificationId}`);
      fetchUnreadCount();
      // The snoozed and retroactive counts above the list are the server's
      fetchData(true);
      
      if (dropdownOpen === notificationId) {
        setDropdownOpen(null);
      }
    } catch (err) {
      setNotifications(prev => [...prev, notification]);
      setError('Failed to delete notification');
    } finally {
      setDropdownOpen(null);
    }
  };

  // Fixed handleSnooze function that uses the server response
  const handleSnooze = async (notificationId, duration) => {
    try {
      // Make the API call and get the response
      const response = await axios.put(`/notifications/${notificationId}/snooze`, { snoozeDuration: duration });
      
      fetchUnreadCount();
      
      // Show feedback message to the user
      showFeedback(`Notification snoozed until ${formatDate(response.data.snoozedUntil) || 'later'}`, 'success');
      
      // Trigger a refetch to get fresh, properly populated data
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Immediate refetch to update the UI
      fetchData(true);
      
      setDropdownOpen(null);
    } catch (err) {
      showFeedback('Failed to snooze notification', 'error');
      console.error('Snooze error:', err);
    }
  };

  // New function to unsnooze a notification
  const handleUnsnooze = async (notificationId) => {
    try {
      // Find the notification in our local state
      const notification = notifications.find(n => n._id === notificationId);
      if (!notification) {
        showFeedback('Notification not found', 'error');
        return;
      }

      // Optimistically update UI
      const updatedNotifications = notifications.map(n => {
        if (n._id === notificationId) {
          return {
            ...n,
            isSnoozed: false,
            snoozedUntil: null
          };
        }
        return n;
      });
      
      setNotifications(updatedNotifications);
      
      // Update the notification on the server by setting snoozedUntil to null
      // We'll use the regular update endpoint since there isn't a specific unsnooze endpoint
      await axios.put(`/notifications/${notificationId}`, {
        snoozedUntil: null
      });
      
      fetchUnreadCount();
      // Show success message
      showFeedback('Notification unsnooze successful', 'success');
      
      // Refresh data to make sure everything is in sync
      fetchData(true);
      
      setDropdownOpen(null);
    } catch (err) {
      showFeedback('Failed to unsnooze notification', 'error');
      console.error('Unsnooze error:', err);
      
      // Refresh data to revert any optimistic updates
      fetchData(true);
    }
  };

  const handleDropdownToggle = (notificationId, event) => {
    event.stopPropagation(); // Prevent event bubbling
    setDropdownOpen(dropdownOpen === notificationId ? null : notificationId);
  };

  const loadMoreNotifications = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };
  
  const toggleRetroactiveNotifications = async () => {
    const newValue = !includeRetroactive;
    
    try {
      // Optimistically update UI
      setIncludeRetroactive(newValue);
      
      // If we're hiding retroactive notifications, reset to page 1
      if (includeRetroactive && currentPage > 1) {
        setCurrentPage(1);
      }
      
      // Update user preference if we have a notification ID to work with
      if (notifications.length > 0) {
        await axios.put(`/notifications/${notifications[0]._id}`, {
          allowRetroactive: newValue
        });
      }
      
      showFeedback(`Retroactive notifications ${newValue ? 'enabled' : 'disabled'}`, 'success');
    } catch (err) {
      // Revert on error
      setIncludeRetroactive(includeRetroactive);
      setError('Failed to update retroactive notification preference');
      showFeedback('Failed to update preference', 'error');
    }
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <FontAwesomeIcon icon={faSpinner} spin /> Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.notificationsPage}>
        <div className={`${styles.container} ${styles.centerContent}`}>
          <FontAwesomeIcon icon={faExclamationCircle} size="2x" className={styles.errorIcon} />
          <p>Error: {error}</p>
        </div>
      </div>
    );
  }

  const renderSnoozeOptions = (notification) => (
    <div className={styles.snoozeOptions}>
      {notification.isSnoozed && (
        <button
          onClick={() => handleUnsnooze(notification._id)}
          className={`${styles.snoozeButton} ${styles.unsnoozeButton}`}
        >
          <FontAwesomeIcon icon={faUndo} />
          <span>Unsnooze notification</span>
        </button>
      )}
      {snoozeDurations.map(duration => (
        <button
          key={duration.value}
          onClick={() => handleSnooze(notification._id, duration.value)}
          className={styles.snoozeButton}
        >
          <FontAwesomeIcon icon={faClock} />
          <span>Snooze {duration.label}</span>
        </button>
      ))}
    </div>
  );

  const renderNotificationCard = (notification) => (
    <div 
      key={notification._id} 
      className={`${styles.notificationCard} 
                  ${!notification.read ? styles.unread : styles.read} 
                  ${notification.isRetroactive ? styles.retroactive : ''}
                  ${notification.isSnoozed ? styles.snoozed : ''}`}
      ref={el => notificationRefs.current[notification._id] = el}
    >
      <div className={styles.notificationInfo}>
        <h3 className={styles.notificationTitle}>
          <FontAwesomeIcon 
            icon={getNotificationIcon(notification)} 
            className={`${styles.notificationIcon} 
                       ${notification.isRetroactive ? styles.retroactiveIcon : ''} 
                       ${notification.isSnoozed ? styles.snoozedIcon : ''}`}
          />
          {notification.event ? (
            <>
              {DOMPurify.sanitize(notification.event.name)} - {notification.event.recipient && `${DOMPurify.sanitize(notification.event.recipient.firstName)} ${DOMPurify.sanitize(notification.event.recipient.lastName)}`}
            </>
          ) : (
            'Notification details unavailable'
          )}
          
          {notification.isSnoozed && (
            <span className={styles.snoozedBadge}>Snoozed</span>
          )}
          
          {notification.isRetroactive && !notification.isSnoozed && (
            <span className={styles.retroactiveBadge}>Retroactive</span>
          )}
        </h3>
        <p className={styles.notificationMeta}>
          {getFormattedDate(notification)}
          
          {notification.isSnoozed && notification.snoozedUntil && (
            <span className={styles.snoozedTime}>
              <FontAwesomeIcon icon={faClock} /> Snoozed until: {formatDate(notification.snoozedUntil)}
            </span>
          )}
          
          {notification.isRetroactive && notification.scheduledTime && !notification.isSnoozed && (
            <span className={styles.originalTime}>
              <FontAwesomeIcon icon={faHistory} /> Originally scheduled for: {formatDate(notification.scheduledTime)}
            </span>
          )}
        </p>
      </div>
      <div className={styles.notificationActions}>
        <button 
          className={styles.ellipsisButton}
          onClick={(e) => handleDropdownToggle(notification._id, e)}
          aria-label="Toggle notification options"
        >
          <FontAwesomeIcon icon={faEllipsisH} />
        </button>
        {dropdownOpen === notification._id && (
          <div className={styles.dropdownMenu}>
            <div className={styles.snoozeSection}>
              {renderSnoozeOptions(notification)}
            </div>
            <button 
              onClick={() => handleToggleRead(notification._id, notification.read)} 
              className={`${styles.readStateButton}`}
            >
              <FontAwesomeIcon icon={faCheck} />
              <span>Mark as {notification.read ? 'unread' : 'read'}</span>
            </button>
            <button onClick={() => handleDelete(notification._id)} className={styles.trashIcon}>
              <FontAwesomeIcon icon={faTrash} />
              <span>Remove</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <ErrorBoundary>
      <div className={styles.notificationsPage}>
        {/* Feedback message */}
        {feedbackMessage && (
          <div className={`${styles.feedbackMessage} ${styles[feedbackMessage.type]}`}>
            <FontAwesomeIcon icon={feedbackMessage.type === 'success' ? faCheckDouble : faExclamationCircle} />
            {feedbackMessage.text}
          </div>
        )}
        
        <div className={styles.container}>
          <div className={styles.header}>
            <div className={styles.headerContent}>
              <h1>Notifications</h1>
              <div className={styles.headerActions}>
                <button 
                  className={styles.settingsButton} 
                  title="Notification settings"
                  aria-label="Notification settings"
                  onClick={handleSettingsToggle}
                >
                  <FontAwesomeIcon icon={faCog} aria-hidden="true" />
                </button>
              </div>
            </div>
            
            {/* Stats Summary */}
            <div className={styles.statsRow}>
              {stats.snoozedCount > 0 && (
                <div className={styles.statItem}>
                  <FontAwesomeIcon icon={faClock} className={styles.snoozedIcon} />
                  <span>
                    {stats.snoozedCount} snoozed notification{stats.snoozedCount !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
              
              {stats.retroactiveCount > 0 && (
                <div className={styles.retroactiveInfo}>
                  <FontAwesomeIcon icon={faHistory} className={styles.retroactiveIcon} />
                  <span>
                    {stats.retroactiveCount} retroactive notification{stats.retroactiveCount !== 1 ? 's' : ''} from when the server was offline
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className={`${styles.notificationList} ${styles.marginBottom}`}>
            {notifications.length === 0 ? (
              <div className={styles.emptyState}>
                <FontAwesomeIcon icon={faInbox} className={styles.emptyIcon} />
                <p>No notifications</p>
              </div>
            ) : (
              notifications.map(notification => renderNotificationCard(notification))
            )}
          </div>

          {currentPage < totalPages && (
            <button onClick={loadMoreNotifications} className={styles.loadMoreButton}>
              Load More
            </button>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      <Modal
        open={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        title="Notification Settings"
        footer={(
          <>
            <button
              className={styles.cancelButton}
              onClick={() => setShowSettingsModal(false)}
            >
              Cancel
            </button>
            <button
              className={styles.saveButton}
              onClick={handleSaveSettings}
            >
              Save Settings
            </button>
          </>
        )}
      >
        {/* Hide/Show Retroactive Option */}
        <div className={styles.settingGroup}>
          <div className={styles.checkboxWrapper}>
            <input
              id="includeRetroactive"
              name="includeRetroactive"
              type="checkbox"
              checked={includeRetroactive}
              onChange={toggleRetroactiveNotifications}
              className={styles.settingCheckbox}
            />
            <label htmlFor="includeRetroactive" className={styles.checkboxLabel}>
              Show retroactive notifications
            </label>
          </div>
          <div className={styles.settingDescription}>
            Display notifications that were generated when the system was offline. These notifications show the original scheduled time.
          </div>
        </div>

        <div className={styles.settingGroup}>
          <label htmlFor="defaultDuration" className={styles.settingLabel}>
            Default notification duration (seconds)
          </label>
          <input
            id="defaultDuration"
            name="defaultDuration"
            type="number"
            min="1"
            max="30"
            value={notificationSettings.defaultDuration}
            onChange={handleSettingsChange}
            className={styles.settingInput}
          />
        </div>

        <div className={styles.settingGroup}>
          <label htmlFor="displayOrder" className={styles.settingLabel}>
            Display order
          </label>
          <select
            id="displayOrder"
            name="displayOrder"
            value={notificationSettings.displayOrder}
            onChange={handleSettingsChange}
            className={styles.settingSelect}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>

        <div className={styles.settingGroup}>
          <div className={styles.checkboxWrapper}>
            <input
              id="soundAlerts"
              name="soundAlerts"
              type="checkbox"
              checked={notificationSettings.soundAlerts}
              onChange={handleSettingsChange}
              className={styles.settingCheckbox}
            />
            <label htmlFor="soundAlerts" className={styles.checkboxLabel}>
              Enable sound alerts
            </label>
          </div>
          <div className={styles.settingDescription}>
            Play a sound when new notifications arrive
          </div>
        </div>

        <div className={styles.settingGroup}>
          <div className={styles.checkboxWrapper}>
            <input
              id="visualAlerts"
              name="visualAlerts"
              type="checkbox"
              checked={notificationSettings.visualAlerts}
              onChange={handleSettingsChange}
              className={styles.settingCheckbox}
            />
            <label htmlFor="visualAlerts" className={styles.checkboxLabel}>
              Enable visual alerts
            </label>
          </div>
          <div className={styles.settingDescription}>
            Show a visual indicator for new notifications
          </div>
          
          {/* Browser notification permission */}
          {notificationSettings.visualAlerts && (
            <div className={styles.browserNotificationSetting}>
              <h4 className={styles.permissionTitle}>
                <FontAwesomeIcon icon={faBell} className={styles.permissionIcon} />
                Browser Notifications
              </h4>
              <p className={styles.permissionDescription}>
                Allow Gifty to send notifications even when the app is closed or in the background (separate from app notifications)
              </p>
              
              {!('Notification' in window) ? (
                <div className={styles.permissionUnsupported}>
                  <FontAwesomeIcon icon={faInfoCircle} className={styles.permissionIcon} />
                  <p>Browser notifications are not supported in your browser.</p>
                </div>
              ) : notificationPermission === 'granted' ? (
                <div className={styles.permissionGranted}>
                  <FontAwesomeIcon icon={faCheckCircle} className={styles.permissionIcon} />
                  <span>Browser notifications are enabled</span>
                </div>
              ) : notificationPermission === 'denied' ? (
                <div className={styles.permissionDenied}>
                  <FontAwesomeIcon icon={faExclamationCircle} className={styles.permissionIcon} />
                  <span>
                    Browser notifications are blocked. To enable them, you need to change your
                    browser settings for this site.
                  </span>
                  <div className={styles.helpLinkContainer}>
                    <a 
                      href="https://support.google.com/chrome/answer/3220216?hl=en" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className={styles.helpLink}
                    >
                      How to enable notifications
                    </a>
                  </div>
                </div>
              ) : (
                <div className={styles.permissionDefault}>
                  <button 
                    className={styles.permissionButton}
                    onClick={async () => {
                      try {
                        const result = await requestNotificationPermission();
                        if (result === 'granted') {
                          showFeedback('Browser notifications enabled!', 'success');
                        } else if (result === 'denied') {
                          showFeedback('Browser notification permission denied. You can change this in your browser settings.', 'error', 5000);
                        }
                      } catch (error) {
                        showFeedback('Error requesting permission', 'error');
                      }
                    }}
                  >
                    <FontAwesomeIcon icon={faBell} className={styles.permissionIcon} />
                    Enable Browser Notifications
                  </button>
                  <p className={styles.permissionDescription}>
                    Allow Gifty to send you notifications even when the app is closed or in the background.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.settingGroup}>
          <div className={styles.checkboxWrapper}>
            <input
              id="autoDismiss"
              name="autoDismiss"
              type="checkbox"
              checked={notificationSettings.autoDismiss}
              onChange={handleSettingsChange}
              className={styles.settingCheckbox}
            />
            <label htmlFor="autoDismiss" className={styles.checkboxLabel}>
              Auto-dismiss notifications
            </label>
          </div>
          <div className={styles.settingDescription}>
            Automatically dismiss notifications after they've been shown
          </div>
        </div>
      </Modal>
    </ErrorBoundary>
  );
};

export default Notifications;
