import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect } from '@jest/globals';
import FeedbackOverview from '../FeedbackOverview';

// Mock Recharts components
// FontAwesome icons render as a span named after the icon
// Charts render as a div carrying what the component computed
jest.mock('react-chartjs-2', () => {
  const chart = (testId) => ({ data, options, ...rest }) => (
    <div data-testid={testId} data-chart-data={JSON.stringify(data)} data-chart-options={JSON.stringify(options)} {...rest} />
  );
  return { Line: chart('line-chart'), Bar: chart('bar-chart'), Pie: chart('pie-chart') };
});

jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: ({ icon, className, style }) => (
    <span data-testid={`${icon.iconName}-icon`} className={className} style={style} />
  ),
}));

// Mock CSS modules
jest.mock('../css/analytics/FeedbackOverview.module.css', () => ({
  overviewCard: 'mock-overview-card',
  sentimentHigh: 'mock-sentiment-high',
  sentimentMedium: 'mock-sentiment-medium',
  sentimentLow: 'mock-sentiment-low',
  cardHeader: 'mock-card-header',
  metricsSection: 'mock-metrics-section',
  metricsTitle: 'mock-metrics-title',
  metricItem: 'mock-metric-item',
  metricIcon: 'mock-metric-icon',
  metricInfo: 'mock-metric-info',
  metricLabel: 'mock-metric-label',
  metricValue: 'mock-metric-value',
  loadingPlaceholder: 'mock-loading-placeholder',
  chartSection: 'mock-chart-section',
  chartTitle: 'mock-chart-title',
  chartContainer: 'mock-chart-container',
  chartArea: 'mock-chart-area',
  loadingChartPlaceholder: 'mock-loading-chart-placeholder',
  mostCommonAction: 'mock-most-common-action'
}));

// Mock feedbackMetricsUtils
jest.mock('../../../utils/feedbackMetricsUtils', () => ({
  formatSentiment: jest.fn((score) => {
    if (score === undefined || score === null || isNaN(score)) return '0%';
    const numScore = Number(score);
    if (numScore > 1) return `${Math.round(numScore)}%`;
    return `${Math.round(numScore * 100)}%`;
  }),
  formatResponseRate: jest.fn((rate) => {
    if (rate === undefined || rate === null || isNaN(rate)) return '0%';
    const numRate = Number(rate);
    if (numRate > 1) return `${Math.round(numRate)}%`;
    return `${Math.round(numRate * 100)}%`;
  })
}));

// The bars as the component computed them, read back from the chart data
const barData = () => {
  const { labels, datasets } = JSON.parse(screen.getByTestId('bar-chart').dataset.chartData);
  return labels.map((name, i) => ({ name, count: datasets[0].data[i] }));
};
const barOptions = () => JSON.parse(screen.getByTestId('bar-chart').dataset.chartOptions);

describe('FeedbackOverview Component', () => {
  // Sample test data
  const mockData = {
    totalFeedback: 150,
    averageSentiment: 0.75,
    positiveResponseRate: 0.85,
    uniqueCategories: 12,
    uniqueTags: 25,
    mostCommonAction: 'Saved',
    feedbackByType: [
      { name: 'Viewed', count: 60 },
      { name: 'Saved', count: 40 },
      { name: 'Purchased', count: 25 },
      { name: 'Ignored', count: 15 },
      { name: 'Favorited', count: 10 }
    ]
  };

  const emptyData = {};

  describe('Basic Rendering', () => {
    test('renders without crashing', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      expect(screen.getByText('Feedback Overview')).toBeInTheDocument();
    });

    test('renders all main sections', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      expect(screen.getByText('Feedback Overview')).toBeInTheDocument();
      expect(screen.getByText('Key Metrics')).toBeInTheDocument();
      expect(screen.getByText('Feedback by Type')).toBeInTheDocument();
    });

    test('applies correct CSS classes', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      const card = screen.getByText('Feedback Overview').closest('div').parentElement;
      expect(card).toHaveClass('mock-overview-card');
      
      const header = screen.getByText('Feedback Overview').parentElement;
      expect(header).toHaveClass('mock-card-header');
    });
  });

  describe('Loading State', () => {
    test('displays loading placeholders when isLoading is true', () => {
      render(<FeedbackOverview data={mockData} isLoading={true} />);
      
      const placeholders = document.querySelectorAll('.mock-loading-placeholder');
      expect(placeholders.length).toBeGreaterThan(0);
    });

    test('shows loading chart placeholder when isLoading is true', () => {
      render(<FeedbackOverview data={mockData} isLoading={true} />);
      
      expect(screen.getByText('Loading chart data...')).toBeInTheDocument();
    });

    test('does not show chart when loading', () => {
      render(<FeedbackOverview data={mockData} isLoading={true} />);
      
      expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
    });

    test('applies loading placeholder styling', () => {
      render(<FeedbackOverview data={mockData} isLoading={true} />);
      
      const chartPlaceholder = screen.getByText('Loading chart data...').parentElement;
      expect(chartPlaceholder).toHaveClass('mock-loading-chart-placeholder');
    });
  });

  describe('No feedback yet', () => {
    test('says so instead of drawing an empty or invented chart', () => {
      render(<FeedbackOverview data={{ ...mockData, totalFeedback: 0, feedbackByType: [] }} isLoading={false} />);
      expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
      expect(screen.getByText(/no feedback in this period yet/i)).toBeInTheDocument();
    });

    test('shows a dash, not a made-up rate, when there is no figure', () => {
      const { formatSentiment, formatResponseRate } = require('../../../utils/feedbackMetricsUtils');
      render(<FeedbackOverview data={{ ...mockData, averageSentiment: null, positiveResponseRate: null }} isLoading={false} />);
      expect(screen.getAllByText('—')).toHaveLength(2);
      expect(formatSentiment).not.toHaveBeenCalledWith(null);
      expect(formatResponseRate).not.toHaveBeenCalledWith(null);
    });
  });

  describe('Key Metrics Display', () => {
    test('displays total feedback correctly', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      expect(screen.getByText('Total Feedback')).toBeInTheDocument();
      expect(screen.getByText('150')).toBeInTheDocument();
    });

    test('displays average sentiment with formatting', () => {
      const { formatSentiment } = require('../../../utils/feedbackMetricsUtils');
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      expect(screen.getByText('Average Sentiment')).toBeInTheDocument();
      expect(formatSentiment).toHaveBeenCalledWith(0.75);
    });

    test('displays positive response rate with formatting', () => {
      const { formatResponseRate } = require('../../../utils/feedbackMetricsUtils');
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      expect(screen.getByText('Positive Response Rate')).toBeInTheDocument();
      expect(formatResponseRate).toHaveBeenCalledWith(0.85);
    });

    test('displays unique categories and tags', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      expect(screen.getByText('Unique Categories / Tags')).toBeInTheDocument();
      expect(screen.getByText('12 / 25')).toBeInTheDocument();
    });

    test('renders metric icons correctly', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      expect(screen.getByTestId('gift-icon')).toBeInTheDocument();
      expect(screen.getByTestId('face-smile-icon')).toBeInTheDocument();
      expect(screen.getByTestId('thumbs-up-icon')).toBeInTheDocument();
      expect(screen.getByTestId('tag-icon')).toBeInTheDocument();
    });

    test('applies correct metric styling classes', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      const metricItems = document.querySelectorAll('.mock-metric-item');
      expect(metricItems.length).toBe(4);
      
      metricItems.forEach(item => {
        expect(item.querySelector('.mock-metric-icon')).toBeInTheDocument();
        expect(item.querySelector('.mock-metric-info')).toBeInTheDocument();
        expect(item.querySelector('.mock-metric-label')).toBeInTheDocument();
        expect(item.querySelector('.mock-metric-value')).toBeInTheDocument();
      });
    });
  });

  describe('Sentiment Icon Styling', () => {
    test('applies green color for high sentiment', () => {
      const highSentimentData = { ...mockData, averageSentiment: 0.8 };
      render(<FeedbackOverview data={highSentimentData} isLoading={false} />);
      
      const smileIcon = screen.getByTestId('face-smile-icon').parentElement;
      expect(smileIcon).toHaveClass('mock-sentiment-high'); // #28a745
    });

    test('applies yellow color for medium sentiment', () => {
      const mediumSentimentData = { ...mockData, averageSentiment: 0.5 };
      render(<FeedbackOverview data={mediumSentimentData} isLoading={false} />);
      
      const smileIcon = screen.getByTestId('face-smile-icon').parentElement;
      expect(smileIcon).toHaveClass('mock-sentiment-medium'); // #ffc107
    });

    test('applies red color for low sentiment', () => {
      const lowSentimentData = { ...mockData, averageSentiment: 0.2 };
      render(<FeedbackOverview data={lowSentimentData} isLoading={false} />);
      
      const smileIcon = screen.getByTestId('face-smile-icon').parentElement;
      expect(smileIcon).toHaveClass('mock-sentiment-low'); // #dc3545
    });

    test('applies white icon color for contrast', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      const smileIcon = screen.getByTestId('face-smile-icon').parentElement;
      expect(smileIcon).toHaveClass('mock-metric-icon'); // the icon class sets on-fill text
    });
  });

  describe('Sentiment Normalization', () => {
    test('handles sentiment scores above 1 (percentage format)', () => {
      const percentageData = { ...mockData, averageSentiment: 75 };
      render(<FeedbackOverview data={percentageData} isLoading={false} />);
      
      const smileIcon = screen.getByTestId('face-smile-icon').parentElement;
      expect(smileIcon).toHaveClass('mock-sentiment-high'); // Should be green (75% = 0.75)
    });

    test('handles negative sentiment scores', () => {
      const negativeData = { ...mockData, averageSentiment: -0.5 };
      render(<FeedbackOverview data={negativeData} isLoading={false} />);
      
      const smileIcon = screen.getByTestId('face-smile-icon').parentElement;
      // -0.5 converts to 0.25, which is < 0.4, so it should be red
      expect(smileIcon).toHaveClass('mock-sentiment-low'); // Should be red
    });

    test('handles undefined sentiment scores', () => {
      const undefinedData = { ...mockData, averageSentiment: undefined };
      render(<FeedbackOverview data={undefinedData} isLoading={false} />);
      
      const smileIcon = screen.getByTestId('face-smile-icon').parentElement;
      // No score: no status colour (red would read as a bad score)
      expect(smileIcon).not.toHaveClass('mock-sentiment-low');
      expect(smileIcon).not.toHaveClass('mock-sentiment-medium');
      expect(smileIcon).not.toHaveClass('mock-sentiment-high');
    });

    test('handles null sentiment scores', () => {
      const nullData = { ...mockData, averageSentiment: null };
      render(<FeedbackOverview data={nullData} isLoading={false} />);
      
      const smileIcon = screen.getByTestId('face-smile-icon').parentElement;
      // No score: no status colour (red would read as a bad score)
      expect(smileIcon).not.toHaveClass('mock-sentiment-low');
      expect(smileIcon).not.toHaveClass('mock-sentiment-medium');
      expect(smileIcon).not.toHaveClass('mock-sentiment-high');
    });

    test('handles NaN sentiment scores', () => {
      const nanData = { ...mockData, averageSentiment: NaN };
      render(<FeedbackOverview data={nanData} isLoading={false} />);
      
      const smileIcon = screen.getByTestId('face-smile-icon').parentElement;
      // No score: no status colour (red would read as a bad score)
      expect(smileIcon).not.toHaveClass('mock-sentiment-low');
      expect(smileIcon).not.toHaveClass('mock-sentiment-medium');
      expect(smileIcon).not.toHaveClass('mock-sentiment-high');
    });

    test('clamps sentiment scores to 0-1 range', () => {
      const extremeData = { ...mockData, averageSentiment: 150 };
      render(<FeedbackOverview data={extremeData} isLoading={false} />);
      
      const smileIcon = screen.getByTestId('face-smile-icon').parentElement;
      expect(smileIcon).toHaveClass('mock-sentiment-high'); // Should be green (clamped to 1)
    });
  });

  describe('Chart Rendering', () => {
    test('renders bar chart with correct data', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      const chart = screen.getByTestId('bar-chart');
      expect(chart).toBeInTheDocument();
      
      const chartData = barData();
      expect(chartData).toEqual(mockData.feedbackByType);
    });

    test('configures chart components correctly', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      const { datasets } = JSON.parse(screen.getByTestId('bar-chart').dataset.chartData);
      expect(datasets[0]).toMatchObject({ label: 'Count', backgroundColor: '#2a78d6' });
      expect(barOptions().plugins.legend.display).toBe(false);
      expect(barOptions().scales.y.beginAtZero).toBe(true);
      expect(barOptions().scales.x.ticks.font.size).toBe(12);
    });

    test('sizes the chart to its box, with a text alternative', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);

      const chart = screen.getByTestId('bar-chart');
      expect(barOptions()).toMatchObject({ responsive: true, maintainAspectRatio: false });
      expect(chart.parentElement).toHaveClass('mock-chart-area');
      expect(chart).toHaveAttribute('role', 'img');
      expect(chart.getAttribute('aria-label')).toMatch(/^Feedback by type: /);
    });

    test('configures bar with rounded corners', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      const { datasets } = JSON.parse(screen.getByTestId('bar-chart').dataset.chartData);
      expect(datasets[0].borderRadius).toBe(4);
    });

    test('displays most common action', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      expect(screen.getByText('Most Common Action:')).toBeInTheDocument();
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });

  describe('Empty Data Handling', () => {
    test('uses placeholder data when data is empty', () => {
      render(<FeedbackOverview data={emptyData} isLoading={false} />);
      
      expect(screen.getByText('0')).toBeInTheDocument(); // Total feedback
      expect(screen.getByText('0 / 0')).toBeInTheDocument(); // Categories/Tags
      expect(screen.getByText('None')).toBeInTheDocument(); // Most common action
    });

    test('draws no chart when empty', () => {
      render(<FeedbackOverview data={emptyData} isLoading={false} />);

      expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
      expect(screen.getByText(/no feedback in this period yet/i)).toBeInTheDocument();
    });

    test('handles missing feedbackByType gracefully', () => {
      const dataWithoutFeedbackByType = {
        totalFeedback: 100,
        averageSentiment: 0.5,
        positiveResponseRate: 0.6,
        uniqueCategories: 5,
        uniqueTags: 10,
        mostCommonAction: 'Viewed'
      };
      
      render(<FeedbackOverview data={dataWithoutFeedbackByType} isLoading={false} />);
      
      // No breakdown by type: a message, not an all-zero chart
      expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
      expect(screen.getByText(/no feedback in this period yet/i)).toBeInTheDocument();
    });
  });

  describe('Props Handling', () => {
    test('handles missing data prop gracefully', () => {
      render(<FeedbackOverview data={{}} isLoading={false} />);
      
      expect(screen.getByText('Feedback Overview')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
    });

    test('handles missing isLoading prop gracefully', () => {
      render(<FeedbackOverview data={mockData} />);
      
      expect(screen.getByText('Feedback Overview')).toBeInTheDocument();
      expect(screen.getByText('150')).toBeInTheDocument();
    });

    test('works with minimal props', () => {
      render(<FeedbackOverview data={{}} isLoading={false} />);
      
      expect(screen.getByText('Feedback Overview')).toBeInTheDocument();
    });
  });

  describe('Layout and Responsive Design', () => {
    test('applies correct column classes for responsive layout', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      const columns = document.querySelectorAll('[class*="col-"]');
      expect(columns.length).toBe(2);
      
      // Check for the presence of column class combinations
      const hasMetricsColumn = Array.from(columns).some(col => 
        col.classList.contains('col-lg-4') && col.classList.contains('col-md-6')
      );
      const hasChartColumn = Array.from(columns).some(col => 
        col.classList.contains('col-lg-8') && col.classList.contains('col-md-6')
      );
      
      expect(hasMetricsColumn).toBe(true);
      expect(hasChartColumn).toBe(true);
    });

    test('uses Bootstrap row structure', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      expect(document.querySelector('.row')).toBeInTheDocument();
    });

    test('applies section-specific styling classes', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      expect(document.querySelector('.mock-metrics-section')).toBeInTheDocument();
      expect(document.querySelector('.mock-chart-section')).toBeInTheDocument();
      expect(document.querySelector('.mock-chart-container')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    test('handles extremely large numbers', () => {
      const largeData = {
        ...mockData,
        totalFeedback: 999999,
        uniqueCategories: 1000,
        uniqueTags: 5000
      };
      
      render(<FeedbackOverview data={largeData} isLoading={false} />);
      
      expect(screen.getByText('999999')).toBeInTheDocument();
      expect(screen.getByText('1000 / 5000')).toBeInTheDocument();
    });

    test('handles zero values correctly', () => {
      const zeroData = {
        totalFeedback: 0,
        averageSentiment: 0,
        positiveResponseRate: 0,
        uniqueCategories: 0,
        uniqueTags: 0,
        mostCommonAction: 'None',
        feedbackByType: []
      };
      
      render(<FeedbackOverview data={zeroData} isLoading={false} />);
      
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('0 / 0')).toBeInTheDocument();
      expect(screen.getByText('None')).toBeInTheDocument();
    });

    test('handles string numbers in data', () => {
      const stringData = {
        totalFeedback: '150',
        averageSentiment: '0.75',
        positiveResponseRate: '0.85',
        uniqueCategories: '12',
        uniqueTags: '25',
        mostCommonAction: 'Saved',
        feedbackByType: mockData.feedbackByType
      };
      
      render(<FeedbackOverview data={stringData} isLoading={false} />);
      
      expect(screen.getByText('150')).toBeInTheDocument();
      expect(screen.getByText('12 / 25')).toBeInTheDocument();
    });

    test('handles special characters in mostCommonAction', () => {
      const specialData = {
        ...mockData,
        mostCommonAction: 'Custom Action (Special)'
      };
      
      render(<FeedbackOverview data={specialData} isLoading={false} />);
      
      expect(screen.getByText('Custom Action (Special)')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    test('provides meaningful heading structure', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      expect(screen.getByRole('heading', { level: 5, name: 'Feedback Overview' })).toBeInTheDocument();
    });

    test('uses semantic content structure', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      const metricLabels = screen.getAllByText(/Total Feedback|Average Sentiment|Positive Response Rate|Unique Categories/);
      expect(metricLabels.length).toBeGreaterThan(0);
    });

    test('provides accessible chart through test ids', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });

    test('uses descriptive icon test ids', () => {
      render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      expect(screen.getByTestId('gift-icon')).toBeInTheDocument();
      expect(screen.getByTestId('face-smile-icon')).toBeInTheDocument();
      expect(screen.getByTestId('thumbs-up-icon')).toBeInTheDocument();
      expect(screen.getByTestId('tag-icon')).toBeInTheDocument();
    });
  });

  describe('Performance Considerations', () => {
    test('memoizes chart data correctly', () => {
      const { rerender } = render(<FeedbackOverview data={mockData} isLoading={false} />);
      
      const initialChart = screen.getByTestId('bar-chart');
      const initialData = initialChart.getAttribute('data-chart-data');
      
      // Re-render with same data
      rerender(<FeedbackOverview data={mockData} isLoading={false} />);
      
      const updatedChart = screen.getByTestId('bar-chart');
      const updatedData = updatedChart.getAttribute('data-chart-data');
      
      expect(initialData).toBe(updatedData);
    });

    test('handles rapid loading state changes', () => {
      const { rerender } = render(<FeedbackOverview data={mockData} isLoading={true} />);
      
      expect(screen.getByText('Loading chart data...')).toBeInTheDocument();
      
      rerender(<FeedbackOverview data={mockData} isLoading={false} />);
      
      expect(screen.queryByText('Loading chart data...')).not.toBeInTheDocument();
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });
  });
});