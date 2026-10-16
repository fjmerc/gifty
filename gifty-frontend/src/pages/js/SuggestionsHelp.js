import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowTrendUp, faAward, faChartPie, faFilter, faHeart, faKey } from '@fortawesome/free-solid-svg-icons';
import { Link } from 'react-router-dom';
import styles from '../css/SuggestionsHelp.module.css';

/**
 * Help page explaining the enhanced suggestions feature
 */
const SuggestionsHelp = () => {
  return (
    <div className={styles.suggestionsHelpPage}>
      <div className={styles.header}>
        <h1>Enhanced Gift Suggestions</h1>
        <p className={styles.subtitle}>Understanding how our smart gift recommendation system works</p>
      </div>
      <div className={styles.container}>
        
        <div className={styles.section}>
          <h2>What are Enhanced Suggestions?</h2>
          <p>
            Enhanced Suggestions is an advanced gift recommendation system that learns from your
            feedback and interactions to provide increasingly personalized gift ideas.
            Unlike basic suggestions which rely solely on recipient profiles, enhanced suggestions
            incorporate your feedback history and preferences to suggest gifts that are more
            likely to delight the recipient.
          </p>
        </div>
        
        <div className={styles.section}>
          <h2>How It Works</h2>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <FontAwesomeIcon icon={faHeart} style={{ fontSize: 24 }} />
            </div>
            <div className={styles.featureContent}>
              <h3>Feedback Collection</h3>
              <p>
                When you rate suggestions as helpful or not helpful, we record this feedback
                to understand your preferences. Each interaction helps the system learn what
                types of gifts work best for your recipients.
              </p>
            </div>
          </div>
          
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <FontAwesomeIcon icon={faArrowTrendUp} style={{ fontSize: 24 }} />
            </div>
            <div className={styles.featureContent}>
              <h3>Pattern Recognition</h3>
              <p>
                Our system analyzes patterns in your feedback to identify categories, price ranges,
                and gift characteristics that consistently receive positive responses. It also learns
                what types of suggestions you typically ignore or find unhelpful.
              </p>
            </div>
          </div>
          
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <FontAwesomeIcon icon={faFilter} style={{ fontSize: 24 }} />
            </div>
            <div className={styles.featureContent}>
              <h3>Intelligent Filtering</h3>
              <p>
                Gift ideas similar to ones you've previously marked as "Not Helpful" are automatically
                filtered out, saving you time and ensuring you only see fresh, relevant suggestions.
              </p>
            </div>
          </div>
          
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <FontAwesomeIcon icon={faChartPie} style={{ fontSize: 24 }} />
            </div>
            <div className={styles.featureContent}>
              <h3>Personalized Scoring</h3>
              <p>
                Each suggestion is scored based on how well it matches the recipient's profile AND
                your historical preferences. This ensures suggestions are not just appropriate but
                tailored to your gift-giving style.
              </p>
            </div>
          </div>
          
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <FontAwesomeIcon icon={faKey} style={{ fontSize: 24 }} />
            </div>
            <div className={styles.featureContent}>
              <h3>Privacy-Focused</h3>
              <p>
                All learning happens locally within your account. Your feedback and preferences
                are never shared with other users, and the system only uses your own data to
                improve your experience.
              </p>
            </div>
          </div>
        </div>
        
        <div className={styles.section}>
          <h2>How to Use Enhanced Suggestions</h2>
          <ol className={styles.instructionsList}>
            <li>
              <strong>Provide feedback on suggestions</strong> - Rate gift ideas as helpful or not helpful,
              and use the star rating system to indicate how much you like each suggestion.
            </li>
            <li>
              <strong>Toggle Enhanced Suggestions</strong> - On the Gifts page, enable the Enhanced
              Suggestions toggle before generating new gift ideas.
            </li>
            <li>
              <strong>Allow time for learning</strong> - The system gets smarter with each interaction.
              To unlock Enhanced Suggestions, you need to interact with at least 10 gift suggestions.
            </li>
            <li>
              <strong>Check the analytics</strong> - Visit the Suggestion Analytics page to see which
              gift categories and characteristics are most successful based on your feedback.
            </li>
          </ol>
        </div>
        
        <div className={styles.callout}>
          <FontAwesomeIcon icon={faAward} className={styles.calloutIcon} style={{ fontSize: 24 }} />
          <div className={styles.calloutContent}>
            <h3>Better Suggestions Guaranteed</h3>
            <p>
              Our Enhanced Suggestions feature is designed to continuously improve over time.
              The more you use it, the better it gets at suggesting gifts that match both the
              recipient's preferences and your gift-giving style.
            </p>
          </div>
        </div>
        
        <div className={styles.footer}>
          <Link to="/gifts" className={styles.backButton}>
            Back to Gifts
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SuggestionsHelp;
