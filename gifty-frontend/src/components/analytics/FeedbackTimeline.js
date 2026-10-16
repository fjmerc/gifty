import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { dateOnlyISO, formatDateOnly } from '../../utils/dates';
import { chartThemeOptions, mergeOptions, useThemeColors } from '../../utils/themeColors';
import styles from '../css/analytics/FeedbackTimeline.module.css';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// Each point is the calendar day its bucket starts on ('YYYY-MM-DD'; older
// servers sent 'M/D/YYYY') plus the period it covers: show that day, never
// shifted by zone. Unparseable values keep the old fallback label.
const timelineLabel = (item) => {
  const iso = dateOnlyISO(item.date);
  if (!iso) return 'Invalid Date';
  if (item.period === 'week') return `Week of ${formatDateOnly(iso)}`;
  if (item.period === 'month') {
    const [year, month] = iso.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  return formatDateOnly(iso);
};

const FeedbackTimeline = ({ data, isLoading }) => {
  const colors = useThemeColors();
  if (isLoading) {
    return (
      <div className={styles.timelineCard}>
        <div className={styles.cardHeader}>
          <h5>Feedback Timeline</h5>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.loadingContainer}>
            <div className={styles.spinner}></div>
          </div>
        </div>
      </div>
    );
  }

  if (!data || !data.length) {
    return (
      <div className={styles.timelineCard}>
        <div className={styles.cardHeader}>
          <h5>Feedback Timeline</h5>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.noDataContainer}>
            <div className={styles.noDataMessage}>
              No timeline data available
            </div>
          </div>
        </div>
      </div>
    );
  }
  

  const chartData = {
    labels: data.map(timelineLabel),
    datasets: [
      {
        label: 'Feedback Count',
        data: data.map(item => item.count),
        fill: false,
        borderColor: colors['data-1'],
        backgroundColor: colors['data-1'],
        tension: 0.2,
        borderWidth: 2,
        pointBackgroundColor: colors['data-1'],
        pointRadius: 4,
        pointHoverRadius: 6
      },
      {
        label: 'Average Rating',
        data: data.map(item => item.averageRating),
        fill: false,
        borderColor: colors['data-2'],
        backgroundColor: colors['data-2'],
        tension: 0.2,
        borderWidth: 2,
        pointBackgroundColor: colors['data-2'],
        pointRadius: 4,
        pointHoverRadius: 6
      }
    ]
  };

  const options = mergeOptions(chartThemeOptions(colors, { scales: ['x', 'y'] }), {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      // The legend under the chart names and explains both series
      legend: { display: false },
      title: {
        display: false
      },
      tooltip: {
        titleFont: {
          size: 14,
          weight: 'bold'
        },
        bodyFont: {
          size: 13
        },
        padding: 12,
        callbacks: {
          label: function(context) {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            return `${label}: ${value.toFixed(2)}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return value.toFixed(1);
          }
        }
      }
    }
  });

  return (
    <div className={styles.timelineCard}>
      <div className={styles.cardHeader}>
        <h5>Feedback Timeline</h5>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.chartContainer}>
          <Line data={chartData} options={options} />
        </div>
        <div className={styles.timelineLegend}>
          <div className={styles.legendItem}>
            <div className={styles.countLegend}></div>
            <span>Feedback Count - Number of feedback entries per period</span>
          </div>
          <div className={styles.legendItem}>
            <div className={styles.ratingLegend}></div>
            <span>Average Rating - Mean rating score per period</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeedbackTimeline;
