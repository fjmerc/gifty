import React from 'react';
import styles from '../../../pages/css/Admin.module.css';

export const README = 'https://github.com/fjmerc/gifty#';

export const addressWarning = (publicUrl, origin = window.location.origin) => {
  try {
    if (!publicUrl || new URL(publicUrl).origin === origin) return null;
  } catch { return null; }
  return `Links use ${publicUrl}, but you opened Gifty at ${origin}. If other people can't open the links, set GIFTY_URL (see the README).`;
};

const onOff = (on) => (on ? 'On' : 'Off');

// What the server detected from .env; changing these means editing .env and restarting
export default function InstanceStatus({ settings }) {
  const { features, timeZone, backups } = settings.status;
  const warning = addressWarning(settings.publicUrl);
  const rows = [
    ['AI suggestions', onOff(features.ai), 'configuration'],
    ['Web search', onOff(features.webSearch), 'configuration'],
    ['Email', onOff(features.email), 'configuration'],
    ['Time zone', timeZone, 'configuration'],
    ['Backups', `Daily at ${backups.time}, the last ${backups.keep} kept`, 'data-and-backups'],
    ['Address', warning || settings.publicUrl, 'reverse-proxy']
  ];
  return (
    <dl className={styles.status}>
      {rows.map(([label, value, anchor]) => (
        <div key={label} className={styles.statusRow}>
          <dt>{label}</dt>
          <dd>{value} <a href={`${README}${anchor}`} target="_blank" rel="noreferrer">How to change</a></dd>
        </div>
      ))}
    </dl>
  );
}
