import React from 'react';
import styles from './LoadingSpinner.module.css';

/**
 * Loading placeholder: one status region with a visible message and a
 * decorative spinning mark. `minHeight` reserves the space the content will
 * take, so swapping it in does not shove the page around. The mark fades in
 * after a short delay, so fast loads never flash a spinner.
 */
const LoadingSpinner = ({ message = 'Loading…', minHeight = '200px' }) => (
  <div
    className={styles.wrap}
    role="status"
    aria-label={message ? undefined : 'Loading…'}
    style={{ minHeight }}
  >
    <span className={styles.mark} aria-hidden="true" />
    {message && <span className={styles.message}>{message}</span>}
  </div>
);

export default LoadingSpinner;
