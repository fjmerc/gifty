import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import FeedbackTimeline from '../FeedbackTimeline';

// Mock CSS modules
jest.mock('../css/analytics/FeedbackTimeline.module.css', () => ({
  timelineCard: 'timelineCard',
  cardHeader: 'cardHeader',
  cardBody: 'cardBody',
  chartContainer: 'chartContainer',
  loadingContainer: 'loadingContainer',
  spinner: 'spinner',
  noDataContainer: 'noDataContainer',
  noDataMessage: 'noDataMessage',
  timelineLegend: 'timelineLegend',
  legendItem: 'legendItem',
  countLegend: 'countLegend',
  ratingLegend: 'ratingLegend',
  timelineInfo: 'timelineInfo'
}));

// Mock Chart.js and react-chartjs-2
const mockLine = jest.fn(() => <div data-testid="chart-line">Mock Line Chart</div>);

jest.mock('react-chartjs-2', () => ({
  Line: (props) => mockLine(props)
}));

jest.mock('chart.js', () => ({
  Chart: {
    register: () => {}
  },
  CategoryScale: {},
  LinearScale: {},
  PointElement: {},
  LineElement: {},
  Title: {},
  Tooltip: {},
  Legend: {}
}));

// Mock console.log to avoid cluttering test output
const originalConsoleLog = console.log;
beforeAll(() => {
  console.log = jest.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
});

describe('FeedbackTimeline', () => {
  // Mock data for testing
  const mockTimelineData = [
    {
      date: '2024-01-01T00:00:00Z',
      count: 5,
      averageRating: 4.2
    },
    {
      date: '2024-01-02T00:00:00Z',
      count: 8,
      averageRating: 3.8
    },
    {
      date: '2024-01-03T00:00:00Z',
      count: 12,
      averageRating: 4.5
    },
    {
      date: '2024-01-04T00:00:00Z',
      count: 6,
      averageRating: 3.9
    },
    {
      date: '2024-01-05T00:00:00Z',
      count: 15,
      averageRating: 4.1
    }
  ];

  const defaultProps = {
    data: mockTimelineData,
    isLoading: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Rendering', () => {
    test('renders timeline card with correct title', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      expect(screen.getByText('Feedback Timeline')).toBeInTheDocument();
    });

    test('applies correct CSS classes to main container', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const container = screen.getByText('Feedback Timeline').closest('.timelineCard');
      expect(container).toHaveClass('timelineCard');
    });

    test('renders header with correct styling', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const header = screen.getByText('Feedback Timeline').closest('.cardHeader');
      expect(header).toHaveClass('cardHeader');
    });

    test('renders body container with correct styling', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const cardBody = screen.getByText('Feedback Timeline').closest('.timelineCard').querySelector('.cardBody');
      expect(cardBody).toHaveClass('cardBody');
    });
  });

  describe('Loading State', () => {
    test('renders loading spinner when isLoading is true', () => {
      render(<FeedbackTimeline {...defaultProps} isLoading={true} />);
      
      const loadingContainer = screen.getByText('Feedback Timeline').closest('.timelineCard').querySelector('.loadingContainer');
      expect(loadingContainer).toBeInTheDocument();
      expect(loadingContainer).toHaveClass('loadingContainer');
    });

    test('renders spinner with correct CSS class', () => {
      render(<FeedbackTimeline {...defaultProps} isLoading={true} />);
      
      const spinner = screen.getByText('Feedback Timeline').closest('.timelineCard').querySelector('.spinner');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveClass('spinner');
    });

    test('does not render chart when loading', () => {
      render(<FeedbackTimeline {...defaultProps} isLoading={true} />);
      
      expect(screen.queryByTestId('chart-line')).not.toBeInTheDocument();
    });

    test('does not render legend when loading', () => {
      render(<FeedbackTimeline {...defaultProps} isLoading={true} />);
      
      expect(screen.queryByText('Feedback Count - Number of feedback entries per period')).not.toBeInTheDocument();
    });

    test('loading state shows title', () => {
      render(<FeedbackTimeline {...defaultProps} isLoading={true} />);
      
      expect(screen.getByText('Feedback Timeline')).toBeInTheDocument();
    });
  });

  describe('Empty Data Handling', () => {
    test('shows no data message when data is empty array', () => {
      render(<FeedbackTimeline {...defaultProps} data={[]} />);
      
      expect(screen.getByText('No timeline data available')).toBeInTheDocument();
    });

    test('shows no data message when data is null', () => {
      render(<FeedbackTimeline {...defaultProps} data={null} />);
      
      expect(screen.getByText('No timeline data available')).toBeInTheDocument();
    });

    test('shows no data message when data is undefined', () => {
      render(<FeedbackTimeline {...defaultProps} data={undefined} />);
      
      expect(screen.getByText('No timeline data available')).toBeInTheDocument();
    });

    test('no data container has correct styling', () => {
      render(<FeedbackTimeline {...defaultProps} data={[]} />);
      
      const noDataContainer = screen.getByText('No timeline data available').closest('.noDataContainer');
      expect(noDataContainer).toHaveClass('noDataContainer');
    });

    test('no data message has correct styling', () => {
      render(<FeedbackTimeline {...defaultProps} data={[]} />);
      
      const noDataMessage = screen.getByText('No timeline data available');
      expect(noDataMessage).toHaveClass('noDataMessage');
    });

    test('does not render chart when no data', () => {
      render(<FeedbackTimeline {...defaultProps} data={[]} />);
      
      expect(screen.queryByTestId('chart-line')).not.toBeInTheDocument();
    });

  });

  describe('Chart Rendering', () => {
    test('renders chart when data is available', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      expect(mockLine).toHaveBeenCalled();
    });

    test('chart container has correct styling', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const chartContainer = screen.getByText('Feedback Timeline').closest('.timelineCard').querySelector('.chartContainer');
      expect(chartContainer).toHaveClass('chartContainer');
    });

    test('passes correct data structure to Line chart', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      expect(mockLine).toHaveBeenCalled();
      const chartProps = mockLine.mock.calls[0][0];
      
      expect(chartProps.data).toBeDefined();
      expect(chartProps.data.labels).toBeDefined();
      expect(chartProps.data.datasets).toBeDefined();
      expect(chartProps.options).toBeDefined();
    });


    test('chart data includes formatted dates as labels', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const chartProps = mockLine.mock.calls[0][0];
      const labels = chartProps.data.labels;
      
      expect(labels).toEqual([
        '1/1/2024',
        '1/2/2024',
        '1/3/2024',
        '1/4/2024',
        '1/5/2024'
      ]);
    });

    test('labels weekly and monthly points by the period they cover', () => {
      render(<FeedbackTimeline {...defaultProps} data={[
        { date: '2026-12-28', period: 'week', count: 2, averageRating: 3 },
        { date: '2027-01-01', period: 'month', count: 2, averageRating: 3 }
      ]} />);

      const { labels } = mockLine.mock.calls[mockLine.mock.calls.length - 1][0].data;
      expect(labels).toEqual([
        `Week of ${new Date(2026, 11, 28).toLocaleDateString()}`,
        new Date(2027, 0, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
      ]);
    });

    test('chart data includes two datasets', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const chartProps = mockLine.mock.calls[0][0];
      const datasets = chartProps.data.datasets;
      
      expect(datasets).toHaveLength(2);
      expect(datasets[0].label).toBe('Feedback Count');
      expect(datasets[1].label).toBe('Average Rating');
    });

    test('feedback count dataset has correct data', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const chartProps = mockLine.mock.calls[0][0];
      const feedbackCountDataset = chartProps.data.datasets[0];
      
      expect(feedbackCountDataset.data).toEqual([5, 8, 12, 6, 15]);
      expect(feedbackCountDataset.borderColor).toBe('#2a78d6');
      expect(feedbackCountDataset.backgroundColor).toBe('#2a78d6');
    });

    test('average rating dataset has correct data', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const chartProps = mockLine.mock.calls[0][0];
      const averageRatingDataset = chartProps.data.datasets[1];
      
      expect(averageRatingDataset.data).toEqual([4.2, 3.8, 4.5, 3.9, 4.1]);
      expect(averageRatingDataset.borderColor).toBe('#eb6834');
      expect(averageRatingDataset.backgroundColor).toBe('#eb6834');
    });
  });

  describe('Chart Configuration', () => {
    test('chart options are correctly configured', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const chartProps = mockLine.mock.calls[0][0];
      const options = chartProps.options;
      
      expect(options.responsive).toBe(true);
      expect(options.maintainAspectRatio).toBe(false);
    });

    test('legend configuration is correct', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const chartProps = mockLine.mock.calls[0][0];
      const legend = chartProps.options.plugins.legend;
      
      // One legend: the explained one under the chart
      expect(legend.display).toBe(false);
    });

    test('title is disabled', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const chartProps = mockLine.mock.calls[0][0];
      const title = chartProps.options.plugins.title;
      
      expect(title.display).toBe(false);
    });

    test('tooltip configuration is correct', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const chartProps = mockLine.mock.calls[0][0];
      const tooltip = chartProps.options.plugins.tooltip;
      
      expect(tooltip.backgroundColor).toBe('#ffffff');
      expect(tooltip.titleColor).toBe('#333333');
      expect(tooltip.bodyColor).toBe('#333333');
      expect(tooltip.padding).toBe(12);
    });

    test('y-axis configuration is correct', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const chartProps = mockLine.mock.calls[0][0];
      const yAxis = chartProps.options.scales.y;
      
      expect(yAxis.beginAtZero).toBe(true);
      expect(yAxis.grid.color).toBe('#e0e0e0');
    });

    test('x-axis configuration is correct', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const chartProps = mockLine.mock.calls[0][0];
      const xAxis = chartProps.options.scales.x;
      
      expect(xAxis.grid.color).toBe('#e0e0e0');
    });

    test('tooltip callback function works correctly', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const chartProps = mockLine.mock.calls[0][0];
      const tooltipCallback = chartProps.options.plugins.tooltip.callbacks.label;
      
      const mockContext = {
        dataset: { label: 'Test Label' },
        parsed: { y: 4.123456 }
      };
      
      const result = tooltipCallback(mockContext);
      expect(result).toBe('Test Label: 4.12');
    });

    test('y-axis tick callback function works correctly', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const chartProps = mockLine.mock.calls[0][0];
      const tickCallback = chartProps.options.scales.y.ticks.callback;
      
      const result = tickCallback(4.123456);
      expect(result).toBe('4.1');
    });
  });

  describe('Legend Rendering', () => {
    test('renders timeline legend', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const legend = screen.getByText('Feedback Count - Number of feedback entries per period').closest('.timelineLegend');
      expect(legend).toHaveClass('timelineLegend');
    });

    test('renders feedback count legend item', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      expect(screen.getByText('Feedback Count - Number of feedback entries per period')).toBeInTheDocument();
      
      const legendItem = screen.getByText('Feedback Count - Number of feedback entries per period').closest('.legendItem');
      expect(legendItem).toHaveClass('legendItem');
    });

    test('renders average rating legend item', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      expect(screen.getByText('Average Rating - Mean rating score per period')).toBeInTheDocument();
      
      const legendItem = screen.getByText('Average Rating - Mean rating score per period').closest('.legendItem');
      expect(legendItem).toHaveClass('legendItem');
    });

    test('count legend has correct styling', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const countLegend = screen.getByText('Feedback Count - Number of feedback entries per period').closest('.legendItem').querySelector('.countLegend');
      expect(countLegend).toHaveClass('countLegend');
    });

    test('rating legend has correct styling', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const ratingLegend = screen.getByText('Average Rating - Mean rating score per period').closest('.legendItem').querySelector('.ratingLegend');
      expect(ratingLegend).toHaveClass('ratingLegend');
    });

    test('legend items are in correct order', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const legendItems = screen.getAllByRole('generic', { hidden: true }).filter(el => 
        el.className.includes('legendItem')
      );
      
      expect(legendItems).toHaveLength(2);
    });
  });

  describe('Data Processing', () => {
    test('handles date formatting correctly', () => {
      const dataWithDifferentDates = [
        { date: '2024-12-25T00:00:00Z', count: 1, averageRating: 5.0 },
        { date: '2024-02-29T00:00:00Z', count: 2, averageRating: 4.0 }
      ];
      
      render(<FeedbackTimeline {...defaultProps} data={dataWithDifferentDates} />);
      
      const chartProps = mockLine.mock.calls[0][0];
      const labels = chartProps.data.labels;
      
      expect(labels).toContain('12/25/2024');
      expect(labels).toContain('2/29/2024');
    });

    test('labels bare date-only days and any time within a UTC day on that UTC day', () => {
      const data = [
        { date: '2024-03-10', count: 1, averageRating: 5.0 },
        { date: '2024-03-11T23:30:00Z', count: 2, averageRating: 4.0 }
      ];

      render(<FeedbackTimeline {...defaultProps} data={data} />);

      const labels = mockLine.mock.calls[0][0].data.labels;
      expect(labels).toEqual(['3/10/2024', '3/11/2024']);
    });

    test('labels backend M/D/YYYY day strings on that same day', () => {
      render(<FeedbackTimeline {...defaultProps} data={[{ date: '1/5/2024', count: 1, averageRating: 5.0 }]} />);

      expect(mockLine.mock.calls[0][0].data.labels).toEqual(['1/5/2024']);
    });

    test('handles missing data fields gracefully', () => {
      const dataWithMissingFields = [
        { date: '2024-01-01T00:00:00Z', count: 5 }, // missing averageRating
        { date: '2024-01-02T00:00:00Z', averageRating: 4.0 } // missing count
      ];
      
      render(<FeedbackTimeline {...defaultProps} data={dataWithMissingFields} />);
      
      expect(mockLine).toHaveBeenCalled();
      
      const chartProps = mockLine.mock.calls[mockLine.mock.calls.length - 1][0];
      expect(chartProps.data.datasets[0].data).toEqual([5, undefined]);
      expect(chartProps.data.datasets[1].data).toEqual([undefined, 4.0]);
    });

    test('handles zero values correctly', () => {
      const dataWithZeros = [
        { date: '2024-01-01T00:00:00Z', count: 0, averageRating: 0 }
      ];
      
      render(<FeedbackTimeline {...defaultProps} data={dataWithZeros} />);
      
      const chartProps = mockLine.mock.calls[0][0];
      expect(chartProps.data.datasets[0].data).toEqual([0]);
      expect(chartProps.data.datasets[1].data).toEqual([0]);
    });

    test('handles negative values correctly', () => {
      const dataWithNegatives = [
        { date: '2024-01-01T00:00:00Z', count: -1, averageRating: -2.5 }
      ];
      
      render(<FeedbackTimeline {...defaultProps} data={dataWithNegatives} />);
      
      const chartProps = mockLine.mock.calls[0][0];
      expect(chartProps.data.datasets[0].data).toEqual([-1]);
      expect(chartProps.data.datasets[1].data).toEqual([-2.5]);
    });

    test('handles large datasets', () => {
      const largeDataset = Array.from({ length: 50 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        count: i + 1,
        averageRating: (i % 5) + 1
      }));
      
      render(<FeedbackTimeline {...defaultProps} data={largeDataset} />);
      
      expect(mockLine).toHaveBeenCalled();
      
      const chartProps = mockLine.mock.calls[mockLine.mock.calls.length - 1][0];
      expect(chartProps.data.labels).toHaveLength(50);
      expect(chartProps.data.datasets[0].data).toHaveLength(50);
      expect(chartProps.data.datasets[1].data).toHaveLength(50);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('handles invalid date strings gracefully', () => {
      const dataWithInvalidDate = [
        { date: 'invalid-date', count: 5, averageRating: 4.0 }
      ];
      
      render(<FeedbackTimeline {...defaultProps} data={dataWithInvalidDate} />);
      
      expect(mockLine).toHaveBeenCalled();
      
      const chartProps = mockLine.mock.calls[mockLine.mock.calls.length - 1][0];
      // Invalid Date will be converted to "Invalid Date" string
      expect(chartProps.data.labels[0]).toBe('Invalid Date');
    });

    test('handles single data point', () => {
      const singleDataPoint = [
        { date: '2024-01-01T00:00:00Z', count: 1, averageRating: 5.0 }
      ];
      
      render(<FeedbackTimeline {...defaultProps} data={singleDataPoint} />);
      
      expect(mockLine).toHaveBeenCalled();
      
      const chartProps = mockLine.mock.calls[mockLine.mock.calls.length - 1][0];
      expect(chartProps.data.labels).toHaveLength(1);
      expect(chartProps.data.datasets[0].data).toHaveLength(1);
      expect(chartProps.data.datasets[1].data).toHaveLength(1);
    });

    test('handles data with null values', () => {
      const dataWithNulls = [
        { date: '2024-01-01T00:00:00Z', count: null, averageRating: null }
      ];
      
      render(<FeedbackTimeline {...defaultProps} data={dataWithNulls} />);
      
      const chartProps = mockLine.mock.calls[0][0];
      expect(chartProps.data.datasets[0].data).toEqual([null]);
      expect(chartProps.data.datasets[1].data).toEqual([null]);
    });

    test('handles extremely large numbers', () => {
      const dataWithLargeNumbers = [
        { date: '2024-01-01T00:00:00Z', count: 999999999, averageRating: 999.999 }
      ];
      
      render(<FeedbackTimeline {...defaultProps} data={dataWithLargeNumbers} />);
      
      const chartProps = mockLine.mock.calls[0][0];
      expect(chartProps.data.datasets[0].data).toEqual([999999999]);
      expect(chartProps.data.datasets[1].data).toEqual([999.999]);
    });
  });

  describe('Component Structure', () => {
    test('maintains proper component hierarchy', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const card = screen.getByText('Feedback Timeline').closest('.timelineCard');
      const header = card.querySelector('.cardHeader');
      const body = card.querySelector('.cardBody');
      const chartContainer = body.querySelector('.chartContainer');
      const legend = body.querySelector('.timelineLegend');
      
      expect(header).toBeInTheDocument();
      expect(body).toBeInTheDocument();
      expect(chartContainer).toBeInTheDocument();
      expect(legend).toBeInTheDocument();
    });

    test('chart container is within card body', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const cardBody = screen.getByText('Feedback Timeline').closest('.timelineCard').querySelector('.cardBody');
      const chartContainer = cardBody.querySelector('.chartContainer');
      
      expect(chartContainer).toBeInTheDocument();
    });

    test('legend is within card body but outside chart container', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      const cardBody = screen.getByText('Feedback Timeline').closest('.timelineCard').querySelector('.cardBody');
      const legend = cardBody.querySelector('.timelineLegend');
      const chartContainer = cardBody.querySelector('.chartContainer');
      
      expect(legend).toBeInTheDocument();
      expect(chartContainer.contains(legend)).toBe(false);
    });
  });

  describe('Accessibility and Best Practices', () => {
    test('component structure supports screen readers', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      // Main title should be accessible
      expect(screen.getByRole('heading', { level: 5, name: 'Feedback Timeline' })).toBeInTheDocument();
    });

    test('legend text provides meaningful descriptions', () => {
      render(<FeedbackTimeline {...defaultProps} />);
      
      expect(screen.getByText('Feedback Count - Number of feedback entries per period')).toBeInTheDocument();
      expect(screen.getByText('Average Rating - Mean rating score per period')).toBeInTheDocument();
    });

    test('loading state provides visual feedback', () => {
      render(<FeedbackTimeline {...defaultProps} isLoading={true} />);
      
      const spinner = screen.getByText('Feedback Timeline').closest('.timelineCard').querySelector('.spinner');
      expect(spinner).toBeInTheDocument();
    });

    test('empty state provides clear messaging', () => {
      render(<FeedbackTimeline {...defaultProps} data={[]} />);
      
      expect(screen.getByText('No timeline data available')).toBeInTheDocument();
    });
  });
});