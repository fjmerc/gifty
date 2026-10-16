import React from 'react';
import { Link } from 'react-router-dom';
import HomepageImage from '../../assets/homepage.png'; // Adjust path as necessary
import styles from '../css/Home.module.css';  // Correctly import as a module

const HomePage = () => {
  return (
    <div className={styles['homePage']}>
        <section className={styles['heroSection']}>
          <img src={HomepageImage} alt="Welcome to Gifty" className={styles['homepage-hero']} />
          <h1>Welcome to Gifty!</h1>
          <p>Discover the joy of giving with personalized gift recommendations.</p>
          <div className={styles['actions']}>
            <Link to="/about" className={`${styles.btn} ${styles['btn-secondary']}`}>Learn More</Link>
            <Link to="/register" className={`${styles.btn} ${styles['btn-primary']}`}>Create Account</Link>
          </div>
          <p className={styles['loginPrompt']}>
            Already have an account? <Link to="/login" className={styles['loginLink']}>Login</Link>
          </p>
        </section>
    </div>
  );
};

export default HomePage;
