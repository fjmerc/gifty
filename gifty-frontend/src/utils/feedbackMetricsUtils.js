/**
 * Utility functions for calculating feedback metrics from raw data
 * These functions serve as fallbacks when the API doesn't provide the metrics directly
 */

/**
 * Calculate average sentiment from raw feedback data
 * @param {Object} data - The API response data
 * @returns {Number} - The calculated average sentiment (0-1 scale)
 */
export const calculateAverageSentiment = (data) => {
  
  try {
    // Try to calculate from sentiment distribution if available
    const userStats = data?.userStats || {};
    const sentimentBreakdown = userStats?.sentimentBreakdown;
    
    if (sentimentBreakdown) {
      
      // Map sentiment categories to values (0-1 scale)
      const sentimentValues = {
        veryPositive: 0.9,
        positive: 0.7,
        neutral: 0.5,
        negative: 0.3,
        veryNegative: 0.1
      };
      
      let totalCount = 0;
      let weightedSum = 0;
      
      // Calculate weighted average
      Object.entries(sentimentBreakdown).forEach(([category, count]) => {
        if (typeof count === 'number' && sentimentValues[category] !== undefined) {
          weightedSum += sentimentValues[category] * count;
          totalCount += count;
        }
      });
      
      if (totalCount > 0) {
        const result = weightedSum / totalCount;
        return result;
      }
    }
    
    // Try to calculate from ratings if available
    const ratings = userStats?.ratings;
    if (ratings && ratings.distribution && Array.isArray(ratings.distribution)) {
      
      let totalRatings = 0;
      let weightedSum = 0;
      
      // Ratings are on a 1-5 scale, convert to 0-1 scale
      ratings.distribution.forEach((count, index) => {
        const rating = index + 1; // 1-5 scale
        const normalizedRating = (rating - 1) / 4; // Convert to 0-1 scale
        weightedSum += normalizedRating * count;
        totalRatings += count;
      });
      
      if (totalRatings > 0) {
        const result = weightedSum / totalRatings;
        return result;
      }
    }
    
    // Try to calculate from actions if available
    const globalMetrics = data?.globalMetrics || {};
    const actionsBreakdown = globalMetrics?.actionsBreakdown;
    
    if (actionsBreakdown) {
      
      // Map actions to sentiment values
      const actionSentimentMap = {
        purchased: 0.9, // Very positive
        favorited: 0.8, // Very positive
        saved: 0.7,     // Positive
        viewed: 0.5,    // Neutral
        ignored: 0.2    // Negative
      };
      
      let totalActions = 0;
      let weightedSum = 0;
      
      Object.entries(actionsBreakdown).forEach(([action, count]) => {
        if (typeof count === 'number' && actionSentimentMap[action] !== undefined) {
          weightedSum += actionSentimentMap[action] * count;
          totalActions += count;
        }
      });
      
      if (totalActions > 0) {
        const result = weightedSum / totalActions;
        return result;
      }
    }
    
    // If we couldn't calculate from any source, return a default value
    return 0.5; // Default to neutral
    
  } catch (error) {
    console.error('FALLBACK - Error calculating average sentiment:', error);
    return 0.5; // Default to neutral on error
  }
};

/**
 * Calculate positive response rate from raw feedback data
 * @param {Object} data - The API response data
 * @returns {Number} - The calculated positive response rate (0-1 scale)
 */
export const calculatePositiveResponseRate = (data) => {
  
  try {
    const globalMetrics = data?.globalMetrics || {};
    const actionsBreakdown = globalMetrics?.actionsBreakdown;
    
    if (actionsBreakdown) {
      
      // Consider purchased, saved, and favorited as positive actions
      const positiveActions = ['purchased', 'saved', 'favorited'];
      let positiveCount = 0;
      let totalCount = 0;
      
      // Sum up all actions to get total
      Object.entries(actionsBreakdown).forEach(([action, count]) => {
        if (typeof count === 'number') {
          totalCount += count;
          if (positiveActions.includes(action)) {
            positiveCount += count;
          }
        }
      });
      
      if (totalCount > 0) {
        const result = positiveCount / totalCount;
        return result;
      }
    }
    
    // Try to calculate from user stats if available
    const userStats = data?.userStats || {};
    const engagement = userStats?.engagement;
    
    if (engagement) {
      
      if (typeof engagement.positiveRate === 'number') {
        return engagement.positiveRate;
      }
      
      if (typeof engagement.savedRate === 'number' && 
          typeof engagement.purchasedRate === 'number') {
        // Combine saved and purchased rates
        const result = engagement.savedRate + engagement.purchasedRate;
        return result;
      }
    }
    
    // If we couldn't calculate from any source, return a default value
    return 0.5; // Default to 50%
    
  } catch (error) {
    console.error('FALLBACK - Error calculating positive response rate:', error);
    return 0.5; // Default to 50% on error
  }
};

/**
 * Format a sentiment score for display
 * @param {Number} score - The sentiment score
 * @returns {String} - Formatted percentage string
 */
export const formatSentiment = (score) => {
  if (score === undefined || score === null || isNaN(score)) {
    return '0%';
  }
  
  const numScore = Number(score);
  
  // Format based on value range
  if (numScore > 1) {
    return `${Math.round(numScore)}%`;
  } else if (numScore >= 0 && numScore <= 1) {
    return `${Math.round(numScore * 100)}%`;
  } else if (numScore >= -1 && numScore < 0) {
    return `${Math.round((numScore + 1) * 50)}%`;
  } else {
    const normalized = Math.max(0, Math.min(100, numScore));
    return `${Math.round(normalized)}%`;
  }
};

/**
 * Format a response rate for display
 * @param {Number} rate - The response rate
 * @returns {String} - Formatted percentage string
 */
export const formatResponseRate = (rate) => {
  if (rate === undefined || rate === null || isNaN(rate)) {
    return '0%';
  }
  
  const numRate = Number(rate);
  
  if (numRate > 1) {
    return `${Math.round(numRate)}%`;
  } else if (numRate >= 0 && numRate <= 1) {
    return `${Math.round(numRate * 100)}%`;
  } else {
    const normalized = Math.max(0, Math.min(100, numRate));
    return `${Math.round(normalized)}%`;
  }
};
