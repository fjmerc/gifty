import React, { useState } from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend } from 'chart.js';
import styles from '../css/analytics/SentimentAnalysis.module.css';
import { chartThemeOptions, mergeOptions, useThemeColors } from '../../utils/themeColors';

// Sentiment is a diverging scale: negative and positive poles, neutral between
const SENTIMENT_TOKENS = {
  'very positive': 'success',
  positive: 'primary-bright',
  neutral: 'ink-muted',
  negative: 'warning',
  'very negative': 'danger',
};
// Text versions (the score) use tokens that pass as text on the card
const SENTIMENT_TEXT = ['danger-strong', 'warning', 'ink-muted', 'primary', 'success'];

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const SentimentAnalysis = ({ data, isLoading }) => {
  const colors = useThemeColors();
  const sentimentColor = (sentiment) => colors[SENTIMENT_TOKENS[String(sentiment).toLowerCase()]] || colors['ink-muted'];
  // State for chart type
  const [chartType, setChartType] = useState('bar'); // 'bar' or 'pie'
  
  // Only real figures are shown: nothing while loading, an empty state when
  // the period has no breakdown, and the average only when there is one.
  const distribution = !isLoading && Array.isArray(data?.sentimentDistribution) ? data.sentimentDistribution : [];
  const hasDistribution = distribution.some((item) => item.count > 0);
  const average = !isLoading && Number.isFinite(data?.averageSentiment) ? data.averageSentiment : null;
  const positiveTags = (!isLoading && data?.topPositiveTags) || [];
  const negativeTags = (!isLoading && data?.topNegativeTags) || [];
  const hasTags = positiveTags.length > 0 || negativeTags.length > 0;

  // Calculate percentages for the sentiment distribution
  const calculatePercentages = (distribution) => {
    if (!distribution) return [];
    const total = distribution.reduce((sum, item) => sum + item.count, 0);
    return distribution.map(item => ({
      ...item,
      percentage: Math.round((item.count / total) * 100)
    }));
  };

  const chartData = hasDistribution ? calculatePercentages(distribution) : [];

  // Shared by both chart types: one value per sentiment, in its own color
  const chartDataset = {
    labels: chartData.map(({ sentiment }) => sentiment),
    datasets: [{
      label: 'Count',
      data: chartData.map(({ count }) => count),
      backgroundColor: chartData.map(({ sentiment }) => sentimentColor(sentiment)),
    }],
  };
  // The pie has no axis: its legend carries the percentages
  const pieDataset = {
    ...chartDataset,
    labels: chartData.map(({ sentiment, percentage }) => `${sentiment} (${percentage}%)`),
  };
  const chartTooltip = {
    callbacks: {
      label: (ctx) => [`${chartData[ctx.dataIndex].count} feedbacks`, `${chartData[ctx.dataIndex].percentage}%`],
    },
  };
  const chartLabel = `Feedback by sentiment: ${chartData.map(({ sentiment, percentage }) => `${sentiment} ${percentage}%`).join(', ')}`;

  // Handle chart type change
  const handleChartTypeChange = (e) => {
    setChartType(e.target.value);
  };

  // Format sentiment score for display
  const formatSentimentScore = (score) => {
    return `${Math.round(score * 100)}%`;
  };

  // Get color based on sentiment value (0-1)
  const getSentimentColor = (score) => {
    const step = score >= 0.8 ? 4 : score >= 0.6 ? 3 : score >= 0.4 ? 2 : score >= 0.2 ? 1 : 0;
    return `var(--color-${SENTIMENT_TEXT[step]})`;
  };

  return (
    <div className={`card ${styles.sentimentCard}`}>
      <div className={`card-header ${styles.cardHeader}`}>
        <h5>Sentiment Analysis</h5>
      </div>
      <div className="card-body">
        <div className={styles.controls}>
          <div className={styles.formGroup}>
            <label htmlFor="chartType" className={`form-label ${styles.formLabel}`}>Chart Type</label>
            <select id="chartType"
              value={chartType} 
              onChange={handleChartTypeChange}
              className={`form-select ${styles.formSelect}`}
              disabled={isLoading || !hasDistribution}
            >
              <option value="bar">Bar Chart</option>
              <option value="pie">Pie Chart</option>
            </select>
          </div>
          
          <div className={styles.sentimentScore} data-testid="sentiment-score">
            <span className={styles.scoreLabel}>Average Sentiment:</span>
            {average === null ? (
              <span className={styles.scoreValue}>—</span>
            ) : (
              <span
                className={styles.scoreValue}
                style={{ color: getSentimentColor(average) }}
              >
                {formatSentimentScore(average)}
              </span>
            )}
          </div>
        </div>
        
        <div className={styles.chartContainer}>
          {isLoading ? (
            <div className={styles.loadingPlaceholder}>
              <span>Loading sentiment data...</span>
            </div>
          ) : !hasDistribution ? (
            <p className={styles.noData}>
              No sentiment breakdown for this period yet. Rating suggestions on Gifts fills this in.
            </p>
          ) : chartType === 'bar' ? (
            <div className={styles.chartArea}>
              <Bar
                role="img"
                aria-label={chartLabel}
                data={chartDataset}
                options={mergeOptions(chartThemeOptions(colors, { scales: ['x', 'y'] }), {
                  responsive: true,
                  maintainAspectRatio: false,
                  // Each bar is its own sentiment, named on the axis: no legend
                  plugins: { legend: { display: false }, tooltip: chartTooltip },
                  scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, border: { dash: [3, 3] } },
                  },
                })}
              />
            </div>
          ) : (
            <div className={styles.chartArea}>
              <Pie
                role="img"
                aria-label={chartLabel}
                data={pieDataset}
                options={mergeOptions(chartThemeOptions(colors), {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { position: 'bottom' }, tooltip: chartTooltip },
                })}
              />
            </div>
          )}
        </div>
        
        {hasTags && (
          <div className={`row ${styles.tagsRow}`}>
            <div className={`col-md-6 ${styles.tagColumn}`}>
              <h6 className={styles.tagColumnTitle} style={{ color: 'var(--color-success)' }}>
                Top Positive Tags
              </h6>
              <ul className={styles.tagList}>
                {positiveTags.map((tag, index) => (
                  <li key={index} className={styles.positiveTag}>{tag}</li>
                ))}
              </ul>
            </div>

            <div className={`col-md-6 ${styles.tagColumn}`}>
              <h6 className={styles.tagColumnTitle} style={{ color: 'var(--color-danger-strong)' }}>
                Top Negative Tags
              </h6>
              <ul className={styles.tagList}>
                {negativeTags.map((tag, index) => (
                  <li key={index} className={styles.negativeTag}>{tag}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SentimentAnalysis;
