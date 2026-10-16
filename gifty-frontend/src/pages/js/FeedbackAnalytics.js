import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../AuthContext';
import axiosInstance from '../../axiosInstance';
import DateRangeFilter from '../../components/filters/DateRangeFilter';
import FeedbackOverview from '../../components/analytics/FeedbackOverview';
import CategoryDistribution from '../../components/analytics/CategoryDistribution';
import TagCloud from '../../components/analytics/TagCloud';
import SentimentAnalysis from '../../components/analytics/SentimentAnalysis';
import FeedbackTimeline from '../../components/analytics/FeedbackTimeline';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { 
  calculateAverageSentiment, 
  calculatePositiveResponseRate
} from '../../utils/feedbackMetricsUtils';
import styles from '../css/FeedbackAnalytics.module.css';

const FeedbackAnalytics = () => {
  const { isLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedbackData, setFeedbackData] = useState({
    overview: {
      totalInteractions: 0,
      purchaseRate: 0,
      saveRate: 0,
      ignoreRate: 0,
      successRate: 0,
      totalFeedback: 0,
      averageSentiment: 0,
      positiveResponseRate: 0,
      uniqueCategories: 0,
      uniqueTags: 0,
      mostCommonAction: 'None',
      feedbackByType: [
        { name: 'Viewed', count: 0 },
        { name: 'Saved', count: 0 },
        { name: 'Purchased', count: 0 },
        { name: 'Ignored', count: 0 },
        { name: 'Favorited', count: 0 }
      ]
    },
    categories: [],
    tags: [],
    timeline: [],
    sentiment: {
      sentimentScore: 0,
      sentimentText: 'Neutral',
      sentimentDistribution: [
        { sentiment: 'Very Positive', count: 0 },
        { sentiment: 'Positive', count: 0 },
        { sentiment: 'Neutral', count: 0 },
        { sentiment: 'Negative', count: 0 },
        { sentiment: 'Very Negative', count: 0 }
      ],
      averageSentiment: 0,
      topPositiveTags: [],
      topNegativeTags: [],
      actions: {
        distribution: {},
        total: 0,
        positive: 0,
        negative: 0,
        neutral: 0
      },
      ratings: {
        distribution: [0, 0, 0, 0, 0],
        trend: []
      }
    }
  });
  // The first load has finished (the spinner shows only before it)
  const [hasLoaded, setHasLoaded] = useState(false);
  
  // Date range state
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    endDate: new Date() // Today
  });
  
  const fetchFeedbackData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Convert dates to ISO strings
      const startDateStr = dateRange.startDate.toISOString();
      const endDateStr = dateRange.endDate.toISOString();
      
      // Fetch analytics data with token
      const analyticsResponse = await axiosInstance.get('/feedback/analytics', {
        params: { 
          startDate: startDateStr, 
          endDate: endDateStr,
          includeTimeTrends: true
        },
      
      });
      
      // Process the API response
      
      // Process the data for the overview component
      const globalMetrics = analyticsResponse.data.globalMetrics || {};
      const userStats = analyticsResponse.data.userStats || {};
      const categoryMetrics = analyticsResponse.data.categoryMetrics || [];
      const tagMetrics = analyticsResponse.data.tagMetrics || [];
      const timeTrends = analyticsResponse.data.timeTrends || [];
      
      // Extract Average Sentiment with flexible fallbacks
      const getAverageSentiment = () => {
        // If we have ratings.average, convert it from 1-5 scale to 0-1 scale
        if (userStats?.ratings?.average !== undefined) {
          const ratingAverage = userStats.ratings.average;
          // Convert from 1-5 scale to 0-1 scale
          const normalizedRating = (ratingAverage - 1) / 4;
          return normalizedRating;
        }
        
        // Try all possible field locations with adjusted priority
        const possibleFields = [
          // First priority: Direct sentiment fields
          userStats?.averageSentiment,
          userStats?.sentimentScore,
          userStats?.overallSentiment,
          userStats?.sentimentAverage,
          globalMetrics?.averageSentiment,
          globalMetrics?.sentimentScore,
          // Second priority: Nested sentiment fields
          userStats?.sentiment?.averageSentiment,
          userStats?.sentiment?.score,
          globalMetrics?.sentiment?.score,
          // Last resort: Calculate from available data
          calculateAverageSentiment(analyticsResponse.data)
        ];
        
        // Find the first non-null, defined value that can be converted to a number
        const value = possibleFields.find(field => 
          field !== undefined && field !== null && !isNaN(Number(field))
        );
        
        return value !== undefined ? Number(value) : 0;
      };
      
      
      // Extract Positive Response Rate with flexible fallbacks
      const getPositiveResponseRate = () => {
        // First check if we have the engagement.positiveRate field
        if (userStats?.engagement?.positiveRate !== undefined) {
          return userStats.engagement.positiveRate;
        }
        
        // Try all possible field locations with adjusted priority
        const possibleFields = [
          // First priority: Direct positive rate fields
          globalMetrics?.positiveResponseRate,
          globalMetrics?.positiveRate,
          globalMetrics?.positiveFeedbackRate,
          userStats?.positiveResponseRate,
          // Second priority: Success rate fields (which might be calculated differently)
          globalMetrics?.successRate,
          userStats?.successRate,
          // Third priority: Nested fields
          userStats?.actions?.positiveRate,
          globalMetrics?.engagement?.positiveRate,
          // Last resort: Calculate from available data
          calculatePositiveRateFromActions(globalMetrics?.actionsBreakdown),
          calculatePositiveResponseRate(analyticsResponse.data)
        ];
        
        // Find the first non-null, defined value that can be converted to a number
        const value = possibleFields.find(field => 
          field !== undefined && field !== null && !isNaN(Number(field))
        );
        
        return value !== undefined ? Number(value) : 0;
      };
      
      // Helper function to calculate positive rate from actions breakdown
      const calculatePositiveRateFromActions = (actionsBreakdown) => {
        if (!actionsBreakdown) return undefined;
        
        try {
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
            return positiveCount / totalCount;
          }
        } catch (err) {
          console.error('Error calculating positive rate from actions:', err);
        }
        
        return undefined;
      };
      
      // Create feedback by type data
      const feedbackByType = [];
      if (globalMetrics.actionsBreakdown) {
        if (globalMetrics.actionsBreakdown.viewed) {
          feedbackByType.push({ name: 'Viewed', count: globalMetrics.actionsBreakdown.viewed });
        }
        if (globalMetrics.actionsBreakdown.saved) {
          feedbackByType.push({ name: 'Saved', count: globalMetrics.actionsBreakdown.saved });
        }
        if (globalMetrics.actionsBreakdown.purchased) {
          feedbackByType.push({ name: 'Purchased', count: globalMetrics.actionsBreakdown.purchased });
        }
        if (globalMetrics.actionsBreakdown.ignored) {
          feedbackByType.push({ name: 'Ignored', count: globalMetrics.actionsBreakdown.ignored });
        }
        if (globalMetrics.actionsBreakdown.favorited) {
          feedbackByType.push({ name: 'Favorited', count: globalMetrics.actionsBreakdown.favorited });
        }
      }
      
      // Find most common action
      let mostCommonAction = 'None';
      let maxCount = 0;
      Object.entries(globalMetrics.actionsBreakdown || {}).forEach(([action, count]) => {
        if (count > maxCount) {
          maxCount = count;
          mostCommonAction = action.charAt(0).toUpperCase() + action.slice(1);
        }
      });
      
      // Count unique categories and tags
      const uniqueCategories = categoryMetrics.length || 0;
      const uniqueTags = tagMetrics.length || 0;
      
      
      // Create overview data with actual values from API
      const overviewData = {
        ...globalMetrics,
        totalFeedback: globalMetrics.totalInteractions || globalMetrics.totalFeedback || 0,
        averageSentiment: getAverageSentiment(),
        positiveResponseRate: getPositiveResponseRate(),
        uniqueCategories,
        uniqueTags,
        mostCommonAction,
        feedbackByType
      };
      // No feedback in the period: no rates to report (the helpers' fallbacks
      // would otherwise show an invented 50%)
      if (!overviewData.totalFeedback && !userStats.totalFeedback) {
        overviewData.averageSentiment = null;
        overviewData.positiveResponseRate = null;
      }
      
      // Format category data for CategoryDistribution component
      const formattedCategories = Array.isArray(categoryMetrics) ? categoryMetrics.map(category => {
        return {
          name: category.category || 'Unknown',
          count: category.totalInteractions || 0,
          percentage: 0 // Will be calculated by the component
        };
      }) : [];
      
      // Format tag data for TagCloud component
      const formattedTags = Array.isArray(tagMetrics) ? tagMetrics.map(tag => {
        return {
          tag: tag.tag || 'Unknown',
          count: tag.totalInteractions || 0
        };
      }) : [];
      
      // Format sentiment data
      const formattedSentiment = {
        sentimentDistribution: [
          { 
            sentiment: 'Very Positive', 
            count: userStats?.sentimentBreakdown?.veryPositive || 0 },
          { 
            sentiment: 'Positive', 
            count: userStats?.sentimentBreakdown?.positive || 0 },
          { 
            sentiment: 'Neutral', 
            count: userStats?.sentimentBreakdown?.neutral || 0 },
          { 
            sentiment: 'Negative', 
            count: userStats?.sentimentBreakdown?.negative || 0 },
          { 
            sentiment: 'Very Negative', 
            count: userStats?.sentimentBreakdown?.veryNegative || 0 }
        ],
        averageSentiment: overviewData.averageSentiment,
        topPositiveTags: userStats?.topPositiveTags || [],
        topNegativeTags: userStats?.topNegativeTags || []
      };
      
      // Format timeline data
      const formattedTimeline = Array.isArray(timeTrends) ? timeTrends.map(trend => {
        return {
          date: trend.date,
          period: trend.period,
          count: trend.total || 0,
          averageRating: trend.averageRating || 0
        };
      }) : [];
      
      // Using the imported formatting functions from feedbackMetricsUtils.js
      
      // Update state with all fetched data
      setFeedbackData({
        overview: overviewData,
        categories: formattedCategories,
        tags: formattedTags,
        timeline: formattedTimeline,
        sentiment: formattedSentiment
      });
      setHasLoaded(true);
      
    } catch (err) {
      console.error('Error fetching feedback data:', err);
      setError('Failed to load feedback analytics. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    // Fetch data when component mounts
    fetchFeedbackData();
  }, [fetchFeedbackData]);

  const handleDateRangeChange = (newRange) => {
    setDateRange(newRange);
  };

  // Show loading state while authentication is being checked or data is loading
  if (isLoading || (loading && !hasLoaded)) {
    return (
      <div className={styles.pageWrapper}>
        <div className={`container ${styles.loadingContainer}`}>
          <LoadingSpinner message={isLoading ? "Verifying authentication..." : "Loading feedback analytics..."} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageWrapper}>
      <div className={`container ${styles.analyticsContainer}`}>
        <h1 className={styles.pageTitle}>Feedback Analytics</h1>
      
      {error && (
        <div className={styles.errorAlert}>
          <p>{error}</p>
          <button onClick={fetchFeedbackData}>Retry</button>
        </div>
      )}
      
      
      <div className={`card ${styles.filterCard}`}>
        <div className="card-body">
          <DateRangeFilter 
            dateRange={dateRange}
            onDateRangeChange={handleDateRangeChange}
          />
        </div>
      </div>
      
      <div className={`row ${styles.statsRow}`}>
        <div className={`col-lg-12 ${styles.overviewSection}`}>
          <FeedbackOverview data={feedbackData.overview} isLoading={loading} />
        </div>
      </div>
      
      <div className={`row ${styles.chartsRow}`}>
        <div className={`col-md-6 ${styles.chartCol}`}>
          <CategoryDistribution 
            data={feedbackData.categories} 
            isLoading={loading} 
          />
        </div>
        <div className={`col-md-6 ${styles.chartCol}`}>
          <TagCloud 
            data={feedbackData.tags} 
            isLoading={loading} 
          />
        </div>
      </div>
      
      <div className={`row ${styles.chartsRow}`}>
        <div className={`col-md-6 ${styles.chartCol}`}>
          <SentimentAnalysis 
            data={feedbackData.sentiment} 
            isLoading={loading} 
          />
        </div>
        <div className={`col-md-6 ${styles.chartCol}`}>
          <FeedbackTimeline 
            data={feedbackData.timeline} 
            isLoading={loading} 
          />
        </div>
      </div>
      
      </div>
    </div>
  );
};

export default FeedbackAnalytics;
