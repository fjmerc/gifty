import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../AuthContext';
import { useNavigate } from 'react-router-dom';
import styles from '../css/ExportReminder.module.css';

/**
 * A subtle reminder component that encourages users to export their data
 * when they haven't done so in a while and have made significant changes.
 */
const ExportReminder = () => {
  const [showReminder, setShowReminder] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const createdAt = user?.createdAt;
  const hasRecipients = user?.hasRecipients === true;
  
  // Checked as soon as someone is signed in, not on a timer: a banner that
  // appeared seconds later pushed the whole page down mid-read. Signed out,
  // nothing is checked, so the reminder is not used up on the login page.
  useEffect(() => {
    if (!isAuthenticated) return;
    // Nothing to back up yet: an account without recipients has no gifts or
    // events of its own either
    if (!hasRecipients) return;
    // Check if we should show the reminder
    const checkExportReminder = () => {
      try {
        const lastExport = localStorage.getItem('lastExportDate');
        const lastReminder = localStorage.getItem('lastReminderDate');
        const now = Date.now();
        
        // Parse dates safely
        const lastExportTime = lastExport ? parseInt(lastExport) : null;
        const lastReminderTime = lastReminder ? parseInt(lastReminder) : null;
        // Never exported: the interval runs from when the account was created
        const createdTime = Date.parse(createdAt);
        const sinceTime = lastExportTime && !isNaN(lastExportTime) ? lastExportTime : createdTime;
        
        // If never exported or it's been more than 30 days
        if (isNaN(sinceTime) || (now - sinceTime > 30 * 24 * 60 * 60 * 1000)) {
          // And if we haven't reminded in the last 7 days
          if (!lastReminderTime || isNaN(lastReminderTime) || (now - lastReminderTime > 7 * 24 * 60 * 60 * 1000)) {
            setShowReminder(true);
            localStorage.setItem('lastReminderDate', now.toString());
          }
        }
      } catch (error) {
        // If localStorage fails, just don't show the reminder
        console.warn('ExportReminder: localStorage access failed', error);
      }
    };
    
    checkExportReminder();
  }, [isAuthenticated, hasRecipients, createdAt]);
  
  const handleExportNow = () => {
    navigate('/settings');
    setShowReminder(false);
    // Record reminder date to avoid showing again too soon
    try {
      localStorage.setItem('lastReminderDate', Date.now().toString());
    } catch (error) {
      console.warn('ExportReminder: Failed to update localStorage', error);
    }
  };
  
  const handleRemindLater = () => {
    setShowReminder(false);
    // Record reminder date to avoid showing again too soon
    try {
      localStorage.setItem('lastReminderDate', Date.now().toString());
    } catch (error) {
      console.warn('ExportReminder: Failed to update localStorage', error);
    }
  };
  
  if (!showReminder || !isAuthenticated) return null;
  
  return (
    <div className={styles.reminderContainer} role="status">
      <div className={styles.reminderContent}>
        <p>It's been a while since your last backup. Would you like to create one now?</p>
        <div className={styles.reminderActions}>
          <button onClick={handleExportNow} className={styles.exportButton}>
            Export Now
          </button>
          <button onClick={handleRemindLater} className={styles.laterButton}>
            Remind Me Later
          </button>
        </div>
      </div>
      <button className={styles.closeButton} onClick={handleRemindLater} aria-label="Close reminder">
        <FontAwesomeIcon icon={faXmark} style={{ fontSize: 16 }} />
      </button>
    </div>
  );
};

export default ExportReminder;
