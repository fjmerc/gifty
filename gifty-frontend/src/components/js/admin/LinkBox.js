import React, { useRef, useState } from 'react';
import { addressWarning } from './InstanceStatus';
import styles from '../../../pages/css/Admin.module.css';

// A one-time link: shown once, copied by hand, sent by the admin themselves
export default function LinkBox({ link, note = 'Shown once. Send it to the person yourself.' }) {
  const input = useRef(null);
  const [copied, setCopied] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied('Copied.');
    } catch {
      input.current?.select();
      setCopied('Press Ctrl+C to copy.');
    }
  };
  let warning = null;
  try { warning = addressWarning(new URL(link).origin); } catch { warning = null; }
  return (
    <div className={styles.linkBox}>
      <label htmlFor="one-time-link" className={styles.visuallyHidden}>Link</label>
      <input id="one-time-link" ref={input} className={styles.field} readOnly value={link} onFocus={(e) => e.target.select()} />
      <button type="button" className={styles.button} onClick={copy}>Copy link</button>
      <p className={styles.muted} role="status">{copied || note}</p>
      {warning && <p className={styles.warning}>{warning}</p>}
    </div>
  );
}
