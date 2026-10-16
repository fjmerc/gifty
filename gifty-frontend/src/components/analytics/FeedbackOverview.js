import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFaceSmile, faGift, faTag, faThumbsUp } from '@fortawesome/free-solid-svg-icons';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js';
import { formatSentiment, formatResponseRate } from '../../utils/feedbackMetricsUtils';
import styles from '../css/analytics/FeedbackOverview.module.css';
import { chartThemeOptions, mergeOptions, useThemeColors } from '../../utils/themeColors';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const FeedbackOverview = ({ data, isLoading }) => {
  const colors = useThemeColors();
  // Default placeholder data for when real data is loading or empty
  const placeholderData = {
    totalFeedback: 0,
    averageSentiment: null,
    positiveResponseRate: null,
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
  };

  // Use real data or placeholder based on availability
  const displayData = (isLoading || Object.keys(data).length === 0) 
    ? placeholderData 
    : data;

  // Using imported formatting functions from feedbackMetricsUtils.js

  // Prepare data for the bar chart: only real counts
  const chartData = displayData.feedbackByType || [];
  const hasChartData = chartData.some(({ count }) => count > 0);
  // A rate the server could not give is shown as a dash, never a guess
  const hasFigure = (value) => value !== null && value !== undefined && !Number.isNaN(Number(value));

  // Get normalized sentiment value (between 0-1)
  const getNormalizedSentiment = (score) => {
    if (score === undefined || score === null || isNaN(score)) {
      return 0;
    }
    
    const numScore = Number(score);
    let normalized;
    
    if (numScore > 1) {
      // Assume it's a percentage (0-100)
      normalized = numScore / 100;
    } else if (numScore >= -1 && numScore < 0) {
      // Convert -1 to 0 scale to 0 to 0.5 scale
      normalized = (numScore + 1) / 2;
    } else {
      // Already in 0-1 scale
      normalized = numScore;
    }
    
    // Ensure the result is between 0 and 1
    normalized = Math.max(0, Math.min(1, normalized));
    
    return normalized;
  };

  // Sentiment level of the icon: its fill comes from the status tokens in CSS
  const getSentimentClass = (score) => {
    const normalizedScore = getNormalizedSentiment(score);
    if (normalizedScore >= 0.7) return styles.sentimentHigh;
    if (normalizedScore >= 0.4) return styles.sentimentMedium;
    return styles.sentimentLow;
  };

  return (
    <div className={`card ${styles.overviewCard}`}>
      <div className={`card-header ${styles.cardHeader}`}>
        <h5>Feedback Overview</h5>
      </div>
      <div className="card-body">
        <div className="row">
          {/* Key metrics section */}
          <div className={`col-lg-4 col-md-6 ${styles.metricsSection}`}>
            <div className={styles.metricsTitle}>Key Metrics</div>
            
            <div className={styles.metricItem}>
              <div className={styles.metricIcon}>
                <FontAwesomeIcon icon={faGift} />
              </div>
              <div className={styles.metricInfo}>
                <div className={styles.metricLabel}>Total Feedback</div>
                <div className={styles.metricValue}>
                  {isLoading ? (
                    <span className={styles.loadingPlaceholder}></span>
                  ) : (
                    displayData.totalFeedback
                  )}
                </div>
              </div>
            </div>
            
            <div className={styles.metricItem}>
              <div className={`${styles.metricIcon} ${hasFigure(displayData.averageSentiment) ? getSentimentClass(displayData.averageSentiment) : ''}`}>
                <FontAwesomeIcon icon={faFaceSmile} />
              </div>
              <div className={styles.metricInfo}>
                <div className={styles.metricLabel}>Average Sentiment</div>
                <div className={styles.metricValue}>
                  {isLoading ? (
                    <span className={styles.loadingPlaceholder}></span>
                  ) : (
                    hasFigure(displayData.averageSentiment) ? formatSentiment(displayData.averageSentiment) : '—'
                  )}
                </div>
              </div>
            </div>
            
            <div className={styles.metricItem}>
              <div className={styles.metricIcon}>
                <FontAwesomeIcon icon={faThumbsUp} />
              </div>
              <div className={styles.metricInfo}>
                <div className={styles.metricLabel}>Positive Response Rate</div>
                <div className={styles.metricValue}>
                  {isLoading ? (
                    <span className={styles.loadingPlaceholder}></span>
                  ) : (
                    hasFigure(displayData.positiveResponseRate) ? formatResponseRate(displayData.positiveResponseRate) : '—'
                  )}
                </div>
              </div>
            </div>
            
            <div className={styles.metricItem}>
              <div className={styles.metricIcon}>
                <FontAwesomeIcon icon={faTag} />
              </div>
              <div className={styles.metricInfo}>
                <div className={styles.metricLabel}>Unique Categories / Tags</div>
                <div className={styles.metricValue}>
                  {isLoading ? (
                    <span className={styles.loadingPlaceholder}></span>
                  ) : (
                    `${displayData.uniqueCategories} / ${displayData.uniqueTags}`
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Feedback by type chart */}
          <div className={`col-lg-8 col-md-6 ${styles.chartSection}`}>
            <div className={styles.chartTitle}>Feedback by Type</div>
            <div className={styles.chartContainer}>
              {isLoading ? (
                <div className={styles.loadingChartPlaceholder}>
                  <span>Loading chart data...</span>
                </div>
              ) : !hasChartData ? (
                <p className={styles.noData}>No feedback in this period yet.</p>
              ) : (
                <div className={styles.chartArea}>
                  <Bar
                    role="img"
                    aria-label={`Feedback by type: ${chartData.map(({ name, count }) => `${name} ${count}`).join(', ')}`}
                    data={{
                      labels: chartData.map(({ name }) => name),
                      datasets: [{
                        label: 'Count',
                        data: chartData.map(({ count }) => count),
                        backgroundColor: colors['data-1'],
                        borderRadius: 4,
                        maxBarThickness: 64,
                      }],
                    }}
                    options={mergeOptions(chartThemeOptions(colors, { scales: ['x', 'y'] }), {
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y} feedback` } },
                      },
                      scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 12 } } },
                        // Counts: whole-number ticks only
                        y: { beginAtZero: true, border: { dash: [3, 3] }, ticks: { font: { size: 12 }, precision: 0 } },
                      },
                    })}
                  />
                </div>
              )}
            </div>
            <div className={styles.mostCommonAction}>
              <strong>Most Common Action:</strong> {displayData.mostCommonAction}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeedbackOverview;
