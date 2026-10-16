import React from 'react';
import styles from './SourceBadge.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGlobe, faRobot } from '@fortawesome/free-solid-svg-icons';

/**
 * Component to display the source of a gift (web discovery or AI-generated)
 */
const SourceBadge = ({ sourceType }) => {
  if (!sourceType) return null;
  
  if (sourceType === 'discovered') {
    return (
      <div className={`${styles.badge} ${styles.discovered}`}>
        <FontAwesomeIcon icon={faGlobe} className={styles.icon} />
        <span>Web Discovery</span>
      </div>
    );
  }
  
  if (sourceType === 'ai_generated') {
    return (
      <div className={`${styles.badge} ${styles.aiGenerated}`}>
        <FontAwesomeIcon icon={faRobot} className={styles.icon} />
        <span>AI Generated</span>
      </div>
    );
  }
  
  return null;
};

export default SourceBadge;
