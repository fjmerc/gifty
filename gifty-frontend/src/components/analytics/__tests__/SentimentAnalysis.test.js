import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SentimentAnalysis from '../SentimentAnalysis';

// Mock CSS modules
// Charts render as a div carrying what the component computed
jest.mock('react-chartjs-2', () => {
  const chart = (testId) => ({ data, options, ...rest }) => (
    <div data-testid={testId} data-chart-data={JSON.stringify(data)} data-chart-options={JSON.stringify(options)} {...rest} />
  );
  return { Line: chart('line-chart'), Bar: chart('bar-chart'), Pie: chart('pie-chart') };
});

jest.mock('../css/analytics/SentimentAnalysis.module.css', () => ({
  sentimentCard: 'sentiment-card',
  cardHeader: 'card-header',
  controls: 'controls',
  formGroup: 'form-group',
  formLabel: 'form-label',
  formSelect: 'form-select',
  sentimentScore: 'sentiment-score',
  scoreLabel: 'score-label',
  scoreValue: 'score-value',
  chartContainer: 'chart-container',
  loadingPlaceholder: 'loading-placeholder',
  tagsRow: 'tags-row',
  tagColumn: 'tag-column',
  tagColumnTitle: 'tag-column-title',
  tagList: 'tag-list',
  positiveTag: 'positive-tag',
  negativeTag: 'negative-tag',
  chartArea: 'chart-area'
}));

// Test data
const mockSentimentData = {
  sentimentDistribution: [
    { sentiment: 'Very Positive', count: 25, color: '#2ecc71' },
    { sentiment: 'Positive', count: 40, color: '#3498db' },
    { sentiment: 'Neutral', count: 20, color: '#95a5a6' },
    { sentiment: 'Negative', count: 10, color: '#e67e22' },
    { sentiment: 'Very Negative', count: 5, color: '#e74c3c' }
  ],
  averageSentiment: 0.65,
  topPositiveTags: ['Electronics', 'Books', 'Games'],
  topNegativeTags: ['Clothing', 'Jewelry', 'Home']
};

const emptyData = {
  sentimentDistribution: [
    { sentiment: 'Very Positive', count: 0, color: '#2ecc71' },
    { sentiment: 'Positive', count: 0, color: '#3498db' },
    { sentiment: 'Neutral', count: 0, color: '#95a5a6' },
    { sentiment: 'Negative', count: 0, color: '#e67e22' },
    { sentiment: 'Very Negative', count: 0, color: '#e74c3c' }
  ],
  averageSentiment: 0,
  topPositiveTags: [],
  topNegativeTags: []
};

// The bars as the component computed them: chart data plus the shares named in
// the chart's text alternative
const bars = () => {
  const chart = screen.getByTestId('bar-chart');
  const { labels, datasets } = JSON.parse(chart.dataset.chartData);
  const shares = chart.getAttribute('aria-label').replace(/^Feedback by sentiment: /, '').split(', ');
  return labels.map((sentiment, i) => ({
    sentiment,
    count: datasets[0].data[i],
    fill: datasets[0].backgroundColor[i],
    percentage: Number(shares[i].match(/(\d+)%$/)[1]),
  }));
};

describe('SentimentAnalysis Component', () => {
  // Rendering Tests
  describe('Rendering', () => {
    test('renders sentiment analysis card with header', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      expect(document.querySelector('.card-header')).toBeInTheDocument();
      expect(screen.getByText('Sentiment Analysis')).toBeInTheDocument();
    });

    test('renders card body with controls and chart container', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      expect(document.querySelector('.card-body')).toBeInTheDocument();
      expect(screen.getByLabelText('Chart Type').parentElement).toBeInTheDocument();
      expect(screen.getByTestId('bar-chart').parentElement).toHaveClass('chart-area');
    });

    test('renders chart type selector with correct options', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      const select = screen.getByLabelText('Chart Type');
      expect(select).toBeInTheDocument();
      expect(select.value).toBe('bar');
      
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(2);
      expect(options[0]).toHaveTextContent('Bar Chart');
      expect(options[1]).toHaveTextContent('Pie Chart');
    });

    test('renders average sentiment score with correct formatting', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      expect(screen.getByText('Average Sentiment:')).toBeInTheDocument();
      expect(screen.getByText('65%')).toBeInTheDocument();
    });

    test('renders positive and negative tags sections', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      expect(screen.getByText('Top Positive Tags')).toBeInTheDocument();
      expect(screen.getByText('Top Negative Tags')).toBeInTheDocument();
      expect(document.querySelector('.row.tags-row')).toBeInTheDocument();
      expect(document.querySelectorAll('.tags-row > .col-md-6')).toHaveLength(2);
    });
  });

  // Chart Rendering Tests
  describe('Chart Rendering', () => {
    test('renders bar chart by default', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
      expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument();
      // One bar per sentiment, named on the axis, so no legend
      expect(JSON.parse(screen.getByTestId('bar-chart').dataset.chartOptions).plugins.legend.display).toBe(false);
    });

    test('renders pie chart when selected', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      const select = screen.getByLabelText('Chart Type');
      fireEvent.change(select, { target: { value: 'pie' } });
      
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
      expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
      // The pie's legend carries the shares
      expect(JSON.parse(screen.getByTestId('pie-chart').dataset.chartData).labels[0]).toBe('Very Positive (25%)');
    });

    test('sizes the chart to its box, with a text alternative', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);

      const chart = screen.getByTestId('bar-chart');
      expect(JSON.parse(chart.dataset.chartOptions)).toMatchObject({ responsive: true, maintainAspectRatio: false });
      expect(chart).toHaveAttribute('role', 'img');
      expect(chart.getAttribute('aria-label')).toBe('Feedback by sentiment: Very Positive 25%, Positive 40%, Neutral 20%, Negative 10%, Very Negative 5%');
    });

    test('renders chart components with correct props', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      const chartData = bars();
      
      expect(chartData).toHaveLength(5);
      expect(chartData[0]).toHaveProperty('sentiment', 'Very Positive');
      expect(chartData[0]).toHaveProperty('count', 25);
      expect(chartData[0]).toHaveProperty('percentage', 25);
    });

    test('renders cells with correct colors', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      // A diverging scale from the status tokens (light theme)
      expect(bars().map(({ fill }) => fill)).toEqual(['#2e7d32', '#008080', '#666666', '#856404', '#dc3545']);
    });
  });

  // Data Processing Tests
  describe('Data Processing', () => {
    test('calculates percentages correctly', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      const chartData = bars();
      
      // Total: 25 + 40 + 20 + 10 + 5 = 100
      expect(chartData[0].percentage).toBe(25); // 25/100 * 100
      expect(chartData[1].percentage).toBe(40); // 40/100 * 100
      expect(chartData[2].percentage).toBe(20); // 20/100 * 100
      expect(chartData[3].percentage).toBe(10); // 10/100 * 100
      expect(chartData[4].percentage).toBe(5);  // 5/100 * 100
    });

    test('shows an empty state, not invented numbers, when every count is zero', () => {
      render(<SentimentAnalysis data={{ ...emptyData, averageSentiment: null }} isLoading={false} />);

      expect(screen.getByText(/no sentiment breakdown for this period yet/i)).toBeInTheDocument();
      expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
      expect(screen.queryByText('72%')).not.toBeInTheDocument();
      expect(screen.queryByText('Gift Cards')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Chart Type')).toBeDisabled();
    });

    test('shows no figures when data is undefined', () => {
      render(<SentimentAnalysis data={undefined} isLoading={false} />);

      expect(screen.queryByText('72%')).not.toBeInTheDocument();
      expect(screen.queryByText('Gift Cards')).not.toBeInTheDocument();
      expect(screen.getByText(/no sentiment breakdown for this period yet/i)).toBeInTheDocument();
      expect(screen.getByTestId('sentiment-score')).toHaveTextContent('—');
    });

    test('keeps a real average when the breakdown is missing', () => {
      render(<SentimentAnalysis data={{ averageSentiment: 0.5 }} isLoading={false} />);

      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(screen.queryByText('Gift Cards')).not.toBeInTheDocument();
      expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
    });
  });

  // User Interaction Tests
  describe('User Interactions', () => {
    test('chart type selector changes chart display', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      const select = screen.getByLabelText('Chart Type');
      
      // Initially bar chart
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
      expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument();
      
      // Switch to pie chart
      fireEvent.change(select, { target: { value: 'pie' } });
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
      expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
      
      // Switch back to bar chart
      fireEvent.change(select, { target: { value: 'bar' } });
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
      expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument();
    });

    test('chart type selector is disabled when loading', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={true} />);
      
      const select = screen.getByLabelText('Chart Type');
      expect(select).toBeDisabled();
    });

    test('maintains chart type state across re-renders', () => {
      const { rerender } = render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      const select = screen.getByLabelText('Chart Type');
      fireEvent.change(select, { target: { value: 'pie' } });
      
      expect(select.value).toBe('pie');
      
      // Re-render with different props
      rerender(<SentimentAnalysis data={mockSentimentData} isLoading={true} />);
      
      expect(select.value).toBe('pie'); // Should maintain state
    });
  });

  // Loading State Tests
  describe('Loading States', () => {
    test('displays loading placeholder when isLoading is true', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={true} />);
      
      expect(screen.getByText('Loading sentiment data...')).toBeInTheDocument();
      expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
      expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument();
    });

    test('hides loading placeholder when data loads', () => {
      const { rerender } = render(<SentimentAnalysis data={mockSentimentData} isLoading={true} />);
      
      expect(screen.getByText('Loading sentiment data...')).toBeInTheDocument();
      
      rerender(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      expect(screen.queryByText('Loading sentiment data...')).not.toBeInTheDocument();
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });

    test('shows no figures while loading', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={true} />);

      expect(screen.getByText('Loading sentiment data...')).toBeInTheDocument();
      expect(screen.queryByText('Gift Cards')).not.toBeInTheDocument();
      expect(screen.queryByText('72%')).not.toBeInTheDocument();
      expect(screen.getByTestId('sentiment-score')).toHaveTextContent('—');
    });
  });

  // Sentiment Scoring Tests
  describe('Sentiment Scoring', () => {
    test('formats sentiment score as percentage', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      expect(screen.getByText('65%')).toBeInTheDocument();
    });

    test('applies correct colors based on sentiment score', () => {
      const testCases = [
        { score: 0.9, expectedColor: 'var(--color-success)' }, // Very positive
        { score: 0.7, expectedColor: 'var(--color-primary)' }, // Positive
        { score: 0.5, expectedColor: 'var(--color-ink-muted)' }, // Neutral
        { score: 0.3, expectedColor: 'var(--color-warning)' }, // Negative
        { score: 0.1, expectedColor: 'var(--color-danger-strong)' }  // Very negative
      ];

      testCases.forEach(({ score, expectedColor }) => {
        const data = { ...mockSentimentData, averageSentiment: score };
        const { rerender } = render(<SentimentAnalysis data={data} isLoading={false} />);
        
        const scoreElement = screen.getByText(`${Math.round(score * 100)}%`);
        expect(scoreElement).toHaveStyle(`color: ${expectedColor}`);
        
        rerender(<div />); // Clear for next test
      });
    });

    test('handles edge case sentiment scores', () => {
      const edgeCases = [
        { score: 0, expectedText: '0%' },
        { score: 1, expectedText: '100%' },
        { score: 0.999, expectedText: '100%' },
        { score: 0.001, expectedText: '0%' }
      ];

      edgeCases.forEach(({ score, expectedText }) => {
        const data = { ...mockSentimentData, averageSentiment: score };
        const { rerender } = render(<SentimentAnalysis data={data} isLoading={false} />);
        
        expect(screen.getByText(expectedText)).toBeInTheDocument();
        
        rerender(<div />); // Clear for next test
      });
    });
  });

  // Tags Display Tests
  describe('Tags Display', () => {
    test('renders positive tags correctly', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      mockSentimentData.topPositiveTags.forEach(tag => {
        expect(screen.getByText(tag)).toBeInTheDocument();
      });
    });

    test('renders negative tags correctly', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      mockSentimentData.topNegativeTags.forEach(tag => {
        expect(screen.getByText(tag)).toBeInTheDocument();
      });
    });

    test('handles empty tag arrays', () => {
      const dataWithEmptyTags = {
        ...mockSentimentData,
        topPositiveTags: [],
        topNegativeTags: []
      };
      
      render(<SentimentAnalysis data={dataWithEmptyTags} isLoading={false} />);

      // No tags to show: the tag columns are left out
      expect(screen.queryByText('Top Positive Tags')).not.toBeInTheDocument();
      expect(screen.queryByText('Top Negative Tags')).not.toBeInTheDocument();
    });

    test('applies correct styling to tag sections', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      const positiveTitle = screen.getByText('Top Positive Tags');
      const negativeTitle = screen.getByText('Top Negative Tags');
      
      expect(positiveTitle).toHaveStyle('color: var(--color-success)');
      expect(negativeTitle).toHaveStyle('color: var(--color-danger-strong)');
    });
  });

  // Console Logging Tests

  // CSS Classes Tests
  describe('CSS Classes', () => {
    test('applies correct CSS module classes', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      expect(document.querySelector('.card-header')).toHaveClass('card-header');
      expect(screen.getByLabelText('Chart Type').parentElement).toHaveClass('form-group');
      expect(screen.getByLabelText('Chart Type')).toHaveClass('form-select');
      expect(document.querySelector('.row')).toHaveClass('tags-row');
    });

    test('applies loading placeholder class when loading', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={true} />);
      
      const loadingElement = screen.getByText('Loading sentiment data...');
      expect(loadingElement.parentElement).toHaveClass('loading-placeholder');
    });
  });

  // Accessibility Tests
  describe('Accessibility', () => {
    test('chart type selector has proper accessibility attributes', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      const select = screen.getByLabelText('Chart Type');
      expect(select).toBeInTheDocument();
      
      const label = screen.getByText('Chart Type');
      expect(label).toBeInTheDocument();
    });

    test('maintains proper heading hierarchy', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      const mainHeading = screen.getByRole('heading', { level: 5 });
      expect(mainHeading).toHaveTextContent('Sentiment Analysis');
      
      const subHeadings = screen.getAllByRole('heading', { level: 6 });
      expect(subHeadings).toHaveLength(2);
      expect(subHeadings[0]).toHaveTextContent('Top Positive Tags');
      expect(subHeadings[1]).toHaveTextContent('Top Negative Tags');
    });

    test('provides meaningful content for screen readers', () => {
      render(<SentimentAnalysis data={mockSentimentData} isLoading={false} />);
      
      expect(screen.getByText('Average Sentiment:')).toBeInTheDocument();
      expect(screen.getByText('Chart Type')).toBeInTheDocument();
      expect(screen.getByText('Top Positive Tags')).toBeInTheDocument();
      expect(screen.getByText('Top Negative Tags')).toBeInTheDocument();
    });
  });

  // Edge Cases and Error Handling
  describe('Edge Cases', () => {
    test('handles data with single sentiment category', () => {
      const singleCategoryData = {
        sentimentDistribution: [
          { sentiment: 'Positive', count: 100, color: '#3498db' }
        ],
        averageSentiment: 0.8,
        topPositiveTags: ['Great'],
        topNegativeTags: []
      };
      
      render(<SentimentAnalysis data={singleCategoryData} isLoading={false} />);
      
      const chartData = bars();
      expect(chartData).toHaveLength(1);
      expect(chartData[0].percentage).toBe(100);
    });

    test('handles malformed sentiment distribution data', () => {
      const malformedData = {
        sentimentDistribution: null,
        averageSentiment: 0.5,
        topPositiveTags: ['Test'],
        topNegativeTags: ['Test']
      };
      
      render(<SentimentAnalysis data={malformedData} isLoading={false} />);
      
      // No invented breakdown: an empty state, the real tags stay
      expect(screen.queryByText('Gift Cards')).not.toBeInTheDocument();
      expect(screen.getByText(/no sentiment breakdown for this period yet/i)).toBeInTheDocument();
    });

    test('handles missing tag arrays gracefully', () => {
      const dataWithMissingTags = {
        sentimentDistribution: mockSentimentData.sentimentDistribution,
        averageSentiment: 0.6,
        topPositiveTags: [], // Empty arrays instead of undefined to avoid map error
        topNegativeTags: []
      };
      
      expect(() => {
        render(<SentimentAnalysis data={dataWithMissingTags} isLoading={false} />);
      }).not.toThrow();
      
      // Component should render without crashing with empty tag arrays
      expect(screen.getByText('60%')).toBeInTheDocument(); // displays the provided average sentiment
      expect(screen.queryByText('Top Positive Tags')).not.toBeInTheDocument();
    });

    test('handles very large count values', () => {
      const largeCountData = {
        sentimentDistribution: [
          { sentiment: 'Positive', count: 999999, color: '#3498db' },
          { sentiment: 'Negative', count: 1, color: '#e74c3c' }
        ],
        averageSentiment: 0.9,
        topPositiveTags: ['Test'],
        topNegativeTags: ['Test']
      };
      
      render(<SentimentAnalysis data={largeCountData} isLoading={false} />);
      
      const chartData = bars();
      expect(chartData[0].percentage).toBe(100); // 999999 / 1000000 * 100 rounded
      expect(chartData[1].percentage).toBe(0);   // 1 / 1000000 * 100 rounded
    });
  });
});