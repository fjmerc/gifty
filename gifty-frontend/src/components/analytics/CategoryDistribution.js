import React, { useState } from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import styles from '../css/analytics/CategoryDistribution.module.css';
import { chartThemeOptions, mergeOptions, seriesColors, useThemeColors } from '../../utils/themeColors';

ChartJS.register(ArcElement, Tooltip, Legend);

const CategoryDistribution = ({ data, isLoading }) => {
  // State for sorting and filtering
  const [sortBy, setSortBy] = useState('count'); // 'count' or 'name'
  const [limit, setLimit] = useState(10); // Number of categories to display
  
  // Six series colours in a fixed order; the rest share the muted 'other' colour
  const colors = useThemeColors();

  // Only real categories: nothing while loading or when the period is empty
  const hasData = !isLoading && Array.isArray(data) && data.length > 0;

  // Process and prepare chart data
  const prepareChartData = () => {
    if (!hasData) return [];

    // Sort data
    const sortedData = [...data].sort((a, b) => {
      if (sortBy === 'count') {
        return b.count - a.count; // Descending by count
      } else {
        return a.name.localeCompare(b.name); // Alphabetical by name
      }
    });

    // Limit the number of categories to display
    const limitedData = sortedData.slice(0, limit);

    // Calculate total for percentages
    const total = sortedData.reduce((sum, item) => sum + item.count, 0);

    // Add percentage to each item
    return limitedData.map(item => ({
      ...item,
      percentage: total > 0 ? Math.round((item.count / total) * 100) : 0
    }));
  };

  const chartData = prepareChartData();

  // Handle sort change
  const handleSortChange = (e) => {
    setSortBy(e.target.value);
  };

  // Handle limit change
  const handleLimitChange = (e) => {
    setLimit(parseInt(e.target.value, 10));
  };

  return (
    <div className={`card ${styles.categoryCard}`}>
      <div className={`card-header ${styles.cardHeader}`}>
        <h5>Category Distribution</h5>
      </div>
      <div className="card-body">
        <div className={styles.controls}>
          <div className={styles.formGroup}>
            <label htmlFor="categorySort" className={`form-label ${styles.formLabel}`}>Sort by</label>
            <select id="categorySort"
              value={sortBy} 
              onChange={handleSortChange}
              className={`form-select ${styles.formSelect}`}
              disabled={!hasData}
            >
              <option value="count">Count (Highest First)</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>
          
          <div className={styles.formGroup}>
            <label htmlFor="categoryLimit" className={`form-label ${styles.formLabel}`}>Show Top</label>
            <select id="categoryLimit"
              value={limit} 
              onChange={handleLimitChange}
              className={`form-select ${styles.formSelect}`}
              disabled={!hasData}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={20}>20</option>
            </select>
          </div>
        </div>
        
        <div className={styles.chartContainer}>
          {isLoading ? (
            <div className={styles.loadingPlaceholder}>
              <span>Loading category data...</span>
            </div>
          ) : !hasData ? (
            <p className={styles.noDataMessage}>
              No category data available for the selected period.
            </p>
          ) : (
            <div className={styles.chartArea}>
              <Pie
                role="img"
                aria-label={`Feedback by category: ${chartData.map(({ name, percentage }) => `${name} ${percentage}%`).join(', ')}`}
                data={{
                  // Percentages ride in the legend (chart.js draws no slice labels)
                  labels: chartData.map(({ name, percentage }) => `${name} (${percentage}%)`),
                  datasets: [{
                    data: chartData.map(({ count }) => count),
                    backgroundColor: seriesColors(colors, chartData.length),
                    borderColor: colors.surface,
                    borderWidth: chartData.length > 1 ? 2 : 0, // no seam across a lone slice
                  }],
                }}
                options={mergeOptions(chartThemeOptions(colors), {
                  responsive: true,
                  maintainAspectRatio: false,
                  layout: { padding: 20 },
                  plugins: {
                    legend: { position: 'right', labels: { font: { size: 12 }, boxWidth: 12 } },
                    tooltip: {
                      callbacks: {
                        title: (items) => chartData[items[0].dataIndex].name,
                        label: (ctx) => [`${chartData[ctx.dataIndex].count} feedbacks`, `${chartData[ctx.dataIndex].percentage}%`],
                      },
                    },
                  },
                })}
              />
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
};

export default CategoryDistribution;
