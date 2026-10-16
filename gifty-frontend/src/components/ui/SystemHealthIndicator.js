import React, { useState } from 'react';
import styles from './SystemHealthIndicator.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faCheckCircle, 
  faExclamationTriangle, 
  faInfoCircle, 
  faStethoscope,
  faSearch,
  faSpinner,
  faExclamationCircle 
} from '@fortawesome/free-solid-svg-icons';
import { Tooltip } from 'react-tooltip';
import axiosInstance from '../../axiosInstance';

const SystemHealthIndicator = ({ systemHealth, onHealthUpdate }) => {
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Run system diagnostics
  const runDiagnostics = async () => {
    setIsRunningDiagnostic(true);
    setError(null);
    setSuccessMessage(null);
    setDiagnosticReport(null);

    try {
      const response = await axiosInstance.get('/gift-library/system-health');
      
      // Format detailed diagnostic report
      const report = {
        ...response.data,
        recommendations: []
      };

      // Add recommendations based on health status
      if (report.giftCount < 100) {
        report.recommendations.push('Increase gift library size by triggering discovery');
      }
      if (report.recentGifts === 0 && report.lastDiscovery) {
        const hoursSinceDiscovery = Math.round((Date.now() - new Date(report.lastDiscovery)) / (1000 * 60 * 60));
        if (hoursSinceDiscovery > 24) {
          report.recommendations.push('No recent discoveries. Consider running discovery process.');
        }
      }
      
      setDiagnosticReport(report);
      
      // Update system health if callback provided
      if (onHealthUpdate) {
        onHealthUpdate(response.data);
      }
    } catch (err) {
      console.error('Failed to run diagnostics:', err);
      setError('Failed to run diagnostics. Please try again.');
    } finally {
      setIsRunningDiagnostic(false);
    }
  };

  // Trigger gift discovery process
  const triggerDiscovery = async () => {
    setIsDiscovering(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await axiosInstance.post('/gift-library/discover/trigger');
      
      // Show success message
      if (response.data.message) {
        setSuccessMessage(response.data.message);
        setTimeout(() => setSuccessMessage(null), 5000);
      }
      
      // Refresh diagnostics after triggering
      setTimeout(() => runDiagnostics(), 2000);
    } catch (err) {
      console.error('Failed to trigger discovery:', err);
      if (err.response?.status === 403) {
        setError('Not authorized. Admin privileges required.');
      } else {
        setError('Failed to trigger discovery. Please try again.');
      }
    } finally {
      setIsDiscovering(false);
    }
  };

  // If no health data is available yet
  if (!systemHealth) {
    return (
      <div className={styles.healthIndicator}>
        <div className={styles.healthStatus + ' ' + styles.unknown}>
          <FontAwesomeIcon icon={faInfoCircle} className={styles.statusIcon} />
          <span>System health unknown</span>
        </div>
        <button 
          onClick={runDiagnostics} 
          className={styles.actionButton}
          disabled={isRunningDiagnostic}
        >
          {isRunningDiagnostic ? (
            <><FontAwesomeIcon icon={faSpinner} spin /> Running...</>
          ) : (
            <><FontAwesomeIcon icon={faStethoscope} /> Run Diagnostics</>
          )}
        </button>
      </div>
    );
  }

  const giftCount = systemHealth.giftCount ?? 0;
  const minLibrarySize = systemHealth.minLibrarySize ?? 100;
  const isHealthy = systemHealth.isHealthy ?? giftCount > minLibrarySize;
  const healthPercentage = Math.min(100, Math.round((giftCount / minLibrarySize) * 100));
  
  return (
    <div className={styles.healthIndicator}>
      <div className={`${styles.healthStatus} ${isHealthy ? styles.healthy : styles.unhealthy}`}>
        <FontAwesomeIcon 
          icon={isHealthy ? faCheckCircle : faExclamationTriangle} 
          className={styles.statusIcon} 
        />
        <span>
          {isHealthy 
            ? 'Hybrid system healthy' 
            : `Hybrid system needs more data (${giftCount}/${minLibrarySize})`}
        </span>
        <span
          data-tooltip-id="system-health-info"
          data-tooltip-content={`The hybrid suggestion system requires more than ${minLibrarySize} gifts in the library to function optimally. Currently at ${healthPercentage}% capacity.`}
          className={styles.infoIcon}
        >
          <FontAwesomeIcon icon={faInfoCircle} />
        </span>
        <Tooltip id="system-health-info" />
      </div>
      
      {/* Progress bar showing system health */}
      <div className={styles.healthProgressContainer}>
        <div 
          className={styles.healthProgress} 
          style={{ width: `${healthPercentage}%` }}
        ></div>
      </div>
      
      {/* Last discovery information */}
      {systemHealth.lastDiscovery && (
        <div className={styles.discoveryInfo}>
          Last discovery: {new Date(systemHealth.lastDiscovery).toLocaleString()}
        </div>
      )}

      {/* Action buttons */}
      <div className={styles.actionButtons}>
        <button 
          onClick={runDiagnostics} 
          className={styles.actionButton}
          disabled={isRunningDiagnostic}
        >
          {isRunningDiagnostic ? (
            <><FontAwesomeIcon icon={faSpinner} spin /> Running...</>
          ) : (
            <><FontAwesomeIcon icon={faStethoscope} /> Run Diagnostics</>
          )}
        </button>
        
        <button 
          onClick={triggerDiscovery} 
          className={`${styles.actionButton} ${styles.discoveryButton}`}
          disabled={isDiscovering}
        >
          {isDiscovering ? (
            <><FontAwesomeIcon icon={faSpinner} spin /> Discovering...</>
          ) : (
            <><FontAwesomeIcon icon={faSearch} /> Trigger Discovery</>
          )}
        </button>
      </div>

      {/* Error/Success messages */}
      {error && (
        <div className={`${styles.message} ${styles.error}`}>
          <FontAwesomeIcon icon={faExclamationCircle} />
          <span>{error}</span>
        </div>
      )}
      
      {successMessage && (
        <div className={`${styles.message} ${styles.success}`}>
          <FontAwesomeIcon icon={faCheckCircle} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Diagnostic Report */}
      {diagnosticReport && (
        <div className={styles.diagnosticReport}>
          <h4>Diagnostic Report</h4>
          <div className={styles.reportSection}>
            <strong>System Status:</strong>
            <ul>
              <li>Total Gifts: {diagnosticReport.giftCount}</li>
              <li>Recent Gifts: {diagnosticReport.recentGifts}</li>
              {diagnosticReport.lastDiscovery && (
                <li>Last Discovery: {new Date(diagnosticReport.lastDiscovery).toLocaleString()}</li>
              )}
            </ul>
          </div>
          
          {diagnosticReport.recommendations && diagnosticReport.recommendations.length > 0 && (
            <div className={styles.reportSection}>
              <strong>Recommendations:</strong>
              <ul>
                {diagnosticReport.recommendations.map((rec, index) => (
                  <li key={index}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SystemHealthIndicator;
