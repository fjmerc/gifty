import React from 'react';
import { Link } from 'react-router-dom';
import styles from './RecipientNotFound.module.css';

// For an id that names no recipient of this account (deleted, someone
// else's, or not an id at all): the API answers 404 for each
const RecipientNotFound = () => (
  <div className={styles.notFound}>
    <h1>Recipient not found</h1>
    <p>This recipient may have been deleted, or the link is wrong.</p>
    <Link to="/recipients" className={styles.backLink}>Back to Recipients</Link>
  </div>
);

export default RecipientNotFound;
