import React from 'react';
import styles from './WebSources.module.css';

/**
 * "Related pages on the web": pages the web search found for a Web-Enhanced
 * suggestion (related pages, not necessarily the product itself). Links
 * only (http/https); each opens in a new tab without giving the page access
 * to Gifty. Renders nothing when there are none.
 */
const WebSources = ({ sources }) => {
  const links = (sources || []).filter((src) => /^https?:\/\//i.test(src?.url || ''));
  if (links.length === 0) return null;
  return (
    // Clicks on a link must not also select the card around it
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div className={styles.webSources} onClick={(e) => e.stopPropagation()}>
      <p className={styles.heading}>Related pages on the web:</p>
      <ul className={styles.list}>
        {links.map((src) => (
          <li key={src.url}>
            <a href={src.url} target="_blank" rel="noopener noreferrer" className={styles.link}>
              {src.title || src.host}
            </a>{' '}
            <span className={styles.host}>{src.host}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default WebSources;
