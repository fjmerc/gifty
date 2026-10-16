import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar as farStar, faThumbsDown, faThumbsUp } from '@fortawesome/free-regular-svg-icons';
import { faStar as fasStar, faXmark } from '@fortawesome/free-solid-svg-icons';
import axiosInstance from '../../axiosInstance';
import styles from '../../pages/css/Gifts.module.css';

/**
 * Gift Feedback Component
 * 
 * Allows users to provide feedback on gift suggestions with
 * a star rating system and simplified actions.
 */
const GiftFeedback = ({ gift, onFeedbackSubmitted, existingFeedback = null, isLoading = false }) => {
  // Initialize component with any existing feedback from the backend
  
  // Initialize with existingFeedback if available
  const [rating, setRating] = useState(existingFeedback?.rating || 0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  
  // Check if we already have existing feedback from the prop
  // This runs when the component mounts or when existingFeedback changes
  React.useEffect(() => {
    if (existingFeedback) {
      setFeedbackSubmitted(true);
      setRating(existingFeedback.rating || 0);
    } else {
      // Only reset if we're sure there's no feedback (and not just loading)
      if (!isLoading) {
        setFeedbackSubmitted(false);
        setRating(0);
      }
    }
  }, [existingFeedback, gift._id, isLoading]);
  
  // Monitor loading state changes
  React.useEffect(() => {
    if (!isLoading && existingFeedback && !feedbackSubmitted) {
      setFeedbackSubmitted(true);
      setRating(existingFeedback.rating || 0);
    }
  }, [isLoading, existingFeedback, feedbackSubmitted, gift._id]);
  
  /**
   * Handles rating change
   * @param {number} newRating - New rating value (1-5)
   */
  const handleRatingChange = (newRating) => {
    // Toggle rating off if clicking the same star
    if (rating === newRating) {
      setRating(0);
    } else {
      setRating(newRating);
    }
  };
  
  /**
   * Submits feedback to the API
   * @param {string} action - Action to record ('saved', 'purchased', 'ignored', 'favorited')
   */
  const submitFeedback = async (action) => {
    try {
      setIsSubmitting(true);
      setError(null);
      
      await axiosInstance.post('/feedback', {
        giftId: gift._id,
        action,
        explicitRating: rating > 0 ? rating : null
      });
      
      setFeedbackSubmitted(true);
      setIsSubmitting(false);
      
      // Notify parent component
      if (onFeedbackSubmitted) {
        onFeedbackSubmitted(action, rating);
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      setError('Failed to submit feedback. Please try again.');
      setIsSubmitting(false);
    }
  };
  
  // Show loading state if data is still being loaded
  if (isLoading) {
    return (
      <div className={styles.feedbackLoading}>
        <p>Loading feedback...</p>
      </div>
    );
  }

  // If feedback already submitted or we have existing feedback data, show thank you message
  if (feedbackSubmitted || existingFeedback) {
    return (
      <div className={styles.feedbackSubmitted}>
        <p>Thank you for your feedback!</p>
        {rating > 0 && (
          <div className={styles.starRating}>
            {[1, 2, 3, 4, 5].map((value) => (
              <span
                key={value}
                className={`${styles.starButton} ${value <= rating ? styles.starActive : ''}`}
                style={{ color: value <= rating ? 'var(--color-warning)' : 'var(--color-border-input)' }}
              >
                <FontAwesomeIcon icon={value <= rating ? fasStar : farStar} style={{ fontSize: 16 }} />
              </span>
            ))}
            <span className={styles.ratingLabel}>
              {rating === 1 && 'Not helpful'}
              {rating === 2 && 'Somewhat helpful'}
              {rating === 3 && 'Helpful'}
              {rating === 4 && 'Very helpful'}
              {rating === 5 && 'Extremely helpful'}
            </span>
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div 
      className={styles.feedbackContainer}
      onClick={(e) => e.stopPropagation()} // Prevent clicks from propagating to parent card
    >
      <h4 className={styles.feedbackTitle}>Rate this suggestion</h4>
      
      {/* Star Rating */}
      <div className={styles.starRating}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            className={`${styles.starButton} ${value <= rating ? styles.starActive : ''}`}
            onClick={(e) => {
              e.stopPropagation(); // Prevent propagation
              handleRatingChange(value);
            }}
            disabled={isSubmitting}
            aria-label={`Rate ${value} stars`}
            style={{ color: value <= rating ? 'var(--color-warning)' : 'var(--color-border-input)' }}
          >
            <FontAwesomeIcon icon={value <= rating ? fasStar : farStar} style={{ fontSize: 16 }} />
          </button>
        ))}
        
        {rating > 0 && (
          <span className={styles.ratingText}>
            {rating === 1 && 'Not helpful'}
            {rating === 2 && 'Somewhat helpful'}
            {rating === 3 && 'Helpful'}
            {rating === 4 && 'Very helpful'}
            {rating === 5 && 'Extremely helpful'}
          </span>
        )}
      </div>
      
      {/* Action Buttons */}
      <div className={styles.feedbackButtons}>
        <button
          className={styles.ignoreButton}
          onClick={(e) => {
            e.stopPropagation(); // Prevent propagation
            submitFeedback('ignored');
          }}
          disabled={isSubmitting}
        >
          <FontAwesomeIcon icon={faThumbsDown} className={styles.feedbackIcon} style={{ fontSize: 12 }} />
          Not Helpful
        </button>
        
        <button
          className={styles.likeButton}
          onClick={(e) => {
            e.stopPropagation(); // Prevent propagation
            submitFeedback('favorited');
          }}
          disabled={isSubmitting}
        >
          <FontAwesomeIcon icon={faThumbsUp} className={styles.feedbackIcon} style={{ fontSize: 12 }} />
          Helpful
        </button>
      </div>
      
      {/* Error Message */}
      {error && (
        <div className={styles.feedbackError}>
          <FontAwesomeIcon icon={faXmark} style={{ fontSize: 12, marginRight: '4px' }} />
          {error}
        </div>
      )}
      
      {/* Loading Indicator */}
      {isSubmitting && (
        <div className={styles.feedbackLoading}>
          Submitting...
        </div>
      )}
    </div>
  );
};

export default GiftFeedback;
