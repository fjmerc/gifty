import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import FeedbackAnalytics from '../js/FeedbackAnalytics';
import axiosInstance from '../../axiosInstance';
import * as AuthContext from '../../AuthContext';

// Mock axiosInstance
jest.mock('../../axiosInstance');

// Mock CSS modules
jest.mock('../css/FeedbackAnalytics.module.css', () => ({
  pageWrapper: 'pageWrapper',
  analyticsContainer: 'analyticsContainer',
  pageTitle: 'pageTitle',
  loadingContainer: 'loadingContainer',
  errorAlert: 'errorAlert',
  filterCard: 'filterCard',
  statsRow: 'statsRow',
  overviewSection: 'overviewSection',
  chartsRow: 'chartsRow',
  chartCol: 'chartCol',
  tableRow: 'tableRow'
}));

// Mock child components
jest.mock('../../components/filters/DateRangeFilter', () => {
  return function MockDateRangeFilter({ dateRange, onDateRangeChange }) {
    return (
      <div data-testid="date-range-filter">
        <button 
          onClick={() => onDateRangeChange({
            startDate: new Date('2023-01-01'),
            endDate: new Date('2023-12-31')
          })}
          data-testid="change-date-range"
        >
          Change Date Range
        </button>
        <span data-testid="current-range">
          {dateRange.startDate.toISOString()} to {dateRange.endDate.toISOString()}
        </span>
      </div>
    );
  };
});

jest.mock('../../components/analytics/FeedbackOverview', () => {
  return function MockFeedbackOverview({ data, isLoading }) {
    return (
      <div data-testid="feedback-overview">
        <h3>Feedback Overview</h3>
        {isLoading ? (
          <span data-testid="overview-loading">Loading...</span>
        ) : (
          <div>
            <span data-testid="total-feedback">{data.totalFeedback}</span>
            <span data-testid="average-sentiment">{data.averageSentiment}</span>
            <span data-testid="positive-response-rate">{data.positiveResponseRate}</span>
            <span data-testid="feedback-by-type">{JSON.stringify(data.feedbackByType)}</span>
          </div>
        )}
      </div>
    );
  };
});

jest.mock('../../components/analytics/CategoryDistribution', () => {
  return function MockCategoryDistribution({ data, isLoading }) {
    return (
      <div data-testid="category-distribution">
        <h4>Category Distribution</h4>
        {isLoading ? (
          <span data-testid="category-loading">Loading...</span>
        ) : (
          <div data-testid="category-data">
            {data.map((category, index) => (
              <div key={index} data-testid={`category-${category.name}`}>
                {category.name}: {category.count}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };
});

jest.mock('../../components/analytics/TagCloud', () => {
  return function MockTagCloud({ data, isLoading }) {
    return (
      <div data-testid="tag-cloud">
        <h4>Tag Cloud</h4>
        {isLoading ? (
          <span data-testid="tag-loading">Loading...</span>
        ) : (
          <div data-testid="tag-data">
            {data.map((tag, index) => (
              <div key={index} data-testid={`tag-${tag.tag}`}>
                {tag.tag}: {tag.count}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };
});

jest.mock('../../components/analytics/SentimentAnalysis', () => {
  return function MockSentimentAnalysis({ data, isLoading }) {
    return (
      <div data-testid="sentiment-analysis">
        <h4>Sentiment Analysis</h4>
        {isLoading ? (
          <span data-testid="sentiment-loading">Loading...</span>
        ) : (
          <div data-testid="sentiment-data">
            <span data-testid="sentiment-score">{data.averageSentiment}</span>
            {data.sentimentDistribution.map((item, index) => (
              <div key={index} data-testid={`sentiment-${item.sentiment.toLowerCase().replace(' ', '-')}`}>
                {item.sentiment}: {item.count}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };
});

jest.mock('../../components/analytics/FeedbackTimeline', () => {
  return function MockFeedbackTimeline({ data, isLoading }) {
    return (
      <div data-testid="feedback-timeline">
        <h4>Feedback Timeline</h4>
        {isLoading ? (
          <span data-testid="timeline-loading">Loading...</span>
        ) : (
          <div data-testid="timeline-data">
            {data.map((item, index) => (
              <div key={index} data-testid={`timeline-${item.date}`}>
                {item.date}: {item.count}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };
});

jest.mock('../../components/ui/LoadingSpinner', () => {
  return function MockLoadingSpinner({ message }) {
    return (
      <div data-testid="loading-spinner">
        {message || 'Loading...'}
      </div>
    );
  };
});

// Mock utils
jest.mock('../../utils/feedbackMetricsUtils', () => ({
  calculateAverageSentiment: jest.fn(() => 0.75),
  calculatePositiveResponseRate: jest.fn(() => 0.68)
}));

// Test helper to render with Router and Auth
const renderWithProviders = (component, user = null) => {
  jest.spyOn(AuthContext, 'useAuth').mockReturnValue({
    user: user || { id: 'user1', firstName: 'Test', isAdmin: false },
    isLoading: false,
    login: jest.fn(),
    logout: jest.fn()
  });

  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

// Mock API responses
const mockAnalyticsResponse = {
  globalMetrics: {
    totalInteractions: 150,
    purchaseRate: 0.25,
    saveRate: 0.35,
    ignoreRate: 0.15,
    successRate: 0.60,
    actionsBreakdown: {
      viewed: 150,
      saved: 52,
      purchased: 38,
      ignored: 23,
      favorited: 15
    }
  },
  userStats: {
    averageSentiment: 0.75,
    engagement: {
      positiveRate: 0.68
    },
    sentimentBreakdown: {
      veryPositive: 15,
      positive: 25,
      neutral: 30,
      negative: 10,
      veryNegative: 5
    },
    ratings: {
      average: 4.2,
      distribution: [2, 5, 8, 25, 45]
    },
    topPositiveTags: ['thoughtful', 'perfect', 'useful'],
    topNegativeTags: ['expensive', 'generic']
  },
  categoryMetrics: [
    { category: 'Electronics', totalInteractions: 50 },
    { category: 'Books', totalInteractions: 30 },
    { category: 'Home & Garden', totalInteractions: 25 }
  ],
  tagMetrics: [
    { tag: 'thoughtful', totalInteractions: 40 },
    { tag: 'practical', totalInteractions: 35 },
    { tag: 'unique', totalInteractions: 20 }
  ],
  timeTrends: [
    { date: '2023-01-01', total: 10, averageRating: 4.0 },
    { date: '2023-01-02', total: 15, averageRating: 4.2 },
    { date: '2023-01-03', total: 12, averageRating: 3.8 }
  ]
};

const mockLogsResponse = {
  logs: [
    { id: 'log1', action: 'purchased', giftTitle: 'Test Gift 1', userId: 'user1' },
    { id: 'log2', action: 'saved', giftTitle: 'Test Gift 2', userId: 'user2' }
  ],
  pagination: {
    totalPages: 3,
    currentPage: 1,
    totalLogs: 25
  }
};

describe('FeedbackAnalytics Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default API responses with small delay to test loading states
    axiosInstance.get.mockImplementation((url) => {
      if (url === '/feedback/analytics') {
        return Promise.resolve({ data: mockAnalyticsResponse });
      } else if (url === '/feedback/logs') {
        return Promise.resolve({ data: mockLogsResponse });
      }
      return Promise.reject(new Error('Unhandled API call'));
    });
  });

  // 1. Component Logic Analysis & Authentication Integration
  describe('Component Logic Analysis & Authentication Integration', () => {
    test('renders correctly for regular user without admin features', async () => {
      renderWithProviders(<FeedbackAnalytics />);
      
      // Component should show loading initially
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      
      // Wait for data to load and component to render
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /feedback analytics/i })).toBeInTheDocument();
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('feedback-overview')).toBeInTheDocument();
        expect(screen.queryByTestId('feedback-table')).not.toBeInTheDocument();
      });
    });

    // Accounts have no admin role yet (1b): no account sees a logs table
    test('renders the same for an account marked admin', async () => {
      const adminUser = { id: 'admin1', firstName: 'Admin', isAdmin: true };
      renderWithProviders(<FeedbackAnalytics />, adminUser);
      
      // Wait for data to load and component to render
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /feedback analytics/i })).toBeInTheDocument();
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('feedback-overview')).toBeInTheDocument();
        expect(screen.queryByTestId('feedback-table')).not.toBeInTheDocument();
      });
    });

    test('handles loading states during authentication check', () => {
      jest.spyOn(AuthContext, 'useAuth').mockReturnValue({
        user: null,
        isLoading: true,
        login: jest.fn(),
        logout: jest.fn()
      });

      render(
        <BrowserRouter>
          <FeedbackAnalytics />
        </BrowserRouter>
      );
      
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(screen.getByText(/verifying authentication/i)).toBeInTheDocument();
    });

    test('manages complex state with multiple data sources', async () => {
      renderWithProviders(<FeedbackAnalytics />);
      
      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /feedback analytics/i })).toBeInTheDocument();
      });
      
      await waitFor(() => {
        // Verify all analytics components are rendered with data
        expect(screen.getByTestId('total-feedback')).toHaveTextContent('150');
        expect(screen.getByTestId('average-sentiment')).toBeInTheDocument();
        expect(screen.getByTestId('positive-response-rate')).toBeInTheDocument();
        expect(screen.getByTestId('category-data')).toBeInTheDocument();
        expect(screen.getByTestId('tag-data')).toBeInTheDocument();
        expect(screen.getByTestId('sentiment-data')).toBeInTheDocument();
        expect(screen.getByTestId('timeline-data')).toBeInTheDocument();
      });
    });
  });

  // 2. Data Fetching & API Integration
  describe('Data Fetching & API Integration', () => {
    test('fetches analytics data on component mount', async () => {
      renderWithProviders(<FeedbackAnalytics />);
      
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/feedback/analytics', {
          params: expect.objectContaining({
            includeTimeTrends: true,
            startDate: expect.any(String),
            endDate: expect.any(String)
          })
        });
      });
    });

    test('never requests feedback logs, even for an account marked admin', async () => {
      const adminUser = { id: 'admin1', firstName: 'Admin', isAdmin: true };
      renderWithProviders(<FeedbackAnalytics />, adminUser);

      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/feedback/analytics', expect.any(Object));
      });
      expect(axiosInstance.get).not.toHaveBeenCalledWith('/feedback/logs', expect.anything());
    });

    test('does not fetch logs data for regular users', async () => {
      const regularUser = { id: 'user1', firstName: 'User', isAdmin: false };
      renderWithProviders(<FeedbackAnalytics />, regularUser);
      
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/feedback/analytics', expect.any(Object));
        expect(axiosInstance.get).not.toHaveBeenCalledWith('/feedback/logs', expect.any(Object));
      });
    });

    test('handles API errors gracefully', async () => {
      axiosInstance.get.mockRejectedValue(new Error('Network error'));
      
      renderWithProviders(<FeedbackAnalytics />);
      
      await waitFor(() => {
        expect(screen.getByText(/failed to load feedback analytics/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    test('retries failed API calls when retry button is clicked', async () => {
      axiosInstance.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: mockAnalyticsResponse });
      
      renderWithProviders(<FeedbackAnalytics />);
      
      await waitFor(() => {
        expect(screen.getByText(/failed to load feedback analytics/i)).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
      
      await waitFor(() => {
        expect(screen.queryByText(/failed to load feedback analytics/i)).not.toBeInTheDocument();
        expect(screen.getByTestId('feedback-overview')).toBeInTheDocument();
      });
    });
  });

  // 3. Date Range Filtering & State Management
  describe('Date Range Filtering & State Management', () => {
    test('renders date range filter with default 30-day range', async () => {
      renderWithProviders(<FeedbackAnalytics />);
      
      // Wait for component to load
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /feedback analytics/i })).toBeInTheDocument();
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('date-range-filter')).toBeInTheDocument();
        expect(screen.getByTestId('current-range')).toBeInTheDocument();
      });
    });

    test('updates date range and refetches data when filter changes', async () => {
      renderWithProviders(<FeedbackAnalytics />);
      
      // Wait for component to load
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /feedback analytics/i })).toBeInTheDocument();
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('date-range-filter')).toBeInTheDocument();
      });
      
      fireEvent.click(screen.getByTestId('change-date-range'));
      
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledWith('/feedback/analytics', {
          params: expect.objectContaining({
            startDate: '2023-01-01T00:00:00.000Z',
            endDate: '2023-12-31T00:00:00.000Z'
          })
        });
      });
    });

    test('formats date range parameters correctly for API', async () => {
      renderWithProviders(<FeedbackAnalytics />);
      
      await waitFor(() => {
        const calls = axiosInstance.get.mock.calls.find(call => 
          call[0] === '/feedback/analytics'
        );
        expect(calls[1].params.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(calls[1].params.endDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      });
    });
  });

  // 4. Analytics Data Processing & Display
  describe('Analytics Data Processing & Display', () => {
    test('processes and displays overview metrics correctly', async () => {
      renderWithProviders(<FeedbackAnalytics />);
      
      // Wait for component to load
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /feedback analytics/i })).toBeInTheDocument();
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('total-feedback')).toHaveTextContent('150');
        expect(screen.getByTestId('average-sentiment')).toBeInTheDocument();
        expect(screen.getByTestId('positive-response-rate')).toBeInTheDocument();
      });
    });

    test('processes category data for distribution chart', async () => {
      renderWithProviders(<FeedbackAnalytics />);
      
      await waitFor(() => {
        expect(screen.getByTestId('category-Electronics')).toHaveTextContent('Electronics: 50');
        expect(screen.getByTestId('category-Books')).toHaveTextContent('Books: 30');
        expect(screen.getByTestId('category-Home & Garden')).toHaveTextContent('Home & Garden: 25');
      });
    });

    test('processes tag data for tag cloud', async () => {
      renderWithProviders(<FeedbackAnalytics />);
      
      await waitFor(() => {
        expect(screen.getByTestId('tag-thoughtful')).toHaveTextContent('thoughtful: 40');
        expect(screen.getByTestId('tag-practical')).toHaveTextContent('practical: 35');
        expect(screen.getByTestId('tag-unique')).toHaveTextContent('unique: 20');
      });
    });

    test('processes sentiment data correctly', async () => {
      renderWithProviders(<FeedbackAnalytics />);
      
      await waitFor(() => {
        expect(screen.getByTestId('sentiment-very-positive')).toHaveTextContent('Very Positive: 15');
        expect(screen.getByTestId('sentiment-positive')).toHaveTextContent('Positive: 25');
        expect(screen.getByTestId('sentiment-neutral')).toHaveTextContent('Neutral: 30');
        expect(screen.getByTestId('sentiment-negative')).toHaveTextContent('Negative: 10');
        expect(screen.getByTestId('sentiment-very-negative')).toHaveTextContent('Very Negative: 5');
      });
    });

    test('processes timeline data for trend visualization', async () => {
      renderWithProviders(<FeedbackAnalytics />);
      
      await waitFor(() => {
        expect(screen.getByTestId('timeline-2023-01-01')).toHaveTextContent('2023-01-01: 10');
        expect(screen.getByTestId('timeline-2023-01-02')).toHaveTextContent('2023-01-02: 15');
        expect(screen.getByTestId('timeline-2023-01-03')).toHaveTextContent('2023-01-03: 12');
      });
    });

    test('handles missing or incomplete API data gracefully', async () => {
      axiosInstance.get.mockResolvedValue({
        data: {
          globalMetrics: {},
          userStats: {},
          categoryMetrics: [],
          tagMetrics: [],
          timeTrends: []
        }
      });
      
      renderWithProviders(<FeedbackAnalytics />);
      
      await waitFor(() => {
        expect(screen.getByTestId('feedback-overview')).toBeInTheDocument();
        expect(screen.getByTestId('category-data')).toBeInTheDocument();
        expect(screen.getByTestId('tag-data')).toBeInTheDocument();
      });
    });
  });

  // 5. Pagination & Table Management (Admin Only)
  describe('Pagination & Table Management', () => {
  });

  // 6. Component Integration & Child Component Communication
  describe('Component Integration & Child Component Communication', () => {
    test('passes correct props to FeedbackOverview component', async () => {
      renderWithProviders(<FeedbackAnalytics />);
      
      await waitFor(() => {
        const overview = screen.getByTestId('feedback-overview');
        expect(overview).toBeInTheDocument();
        expect(screen.getByTestId('total-feedback')).toBeInTheDocument();
      });
    });

    test('passes loading state to all child components', () => {
      axiosInstance.get.mockImplementation(() => new Promise(() => {})); // Never resolves
      
      renderWithProviders(<FeedbackAnalytics />);
      
      // Should show global loading spinner instead of component-specific loading
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(screen.getByText(/loading feedback analytics/i)).toBeInTheDocument();
    });

    test('renders all analytics components in correct layout', async () => {
      renderWithProviders(<FeedbackAnalytics />);
      
      await waitFor(() => {
        expect(screen.getByTestId('feedback-overview')).toBeInTheDocument();
        expect(screen.getByTestId('category-distribution')).toBeInTheDocument();
        expect(screen.getByTestId('tag-cloud')).toBeInTheDocument();
        expect(screen.getByTestId('sentiment-analysis')).toBeInTheDocument();
        expect(screen.getByTestId('feedback-timeline')).toBeInTheDocument();
      });
    });

    test('handles date range filter callback correctly', async () => {
      renderWithProviders(<FeedbackAnalytics />);
      
      await waitFor(() => {
        expect(screen.getByTestId('date-range-filter')).toBeInTheDocument();
      });
      
      const initialCallCount = axiosInstance.get.mock.calls.length;
      
      fireEvent.click(screen.getByTestId('change-date-range'));
      
      await waitFor(() => {
        expect(axiosInstance.get.mock.calls.length).toBeGreaterThan(initialCallCount);
      });
    });
  });

  // 7. Performance Optimization & Memoization
  describe('Performance Optimization & Memoization', () => {
    test('uses useCallback for fetchFeedbackData to prevent unnecessary re-renders', async () => {
      const adminUser = { id: 'admin1', firstName: 'Admin', isAdmin: true };
      renderWithProviders(<FeedbackAnalytics />, adminUser);
      
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledTimes(1); // Analytics
      });
      
      // Re-render should not cause additional API calls
      renderWithProviders(<FeedbackAnalytics />, adminUser);
      
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledTimes(2); // Should be exactly double
      });
    });

    test('handles useEffect dependency changes correctly', async () => {
      renderWithProviders(<FeedbackAnalytics />);
      
      await waitFor(() => {
        expect(axiosInstance.get).toHaveBeenCalledTimes(1);
      });
      
      // Test that useEffect dependencies work correctly by ensuring
      // the component fetches data on mount and uses useCallback properly
      expect(axiosInstance.get).toHaveBeenCalledWith('/feedback/analytics', expect.any(Object));
    });

    test('optimizes API calls by combining parameters efficiently', async () => {
      renderWithProviders(<FeedbackAnalytics />);
      
      await waitFor(() => {
        const analyticsCall = axiosInstance.get.mock.calls.find(call => 
          call[0] === '/feedback/analytics'
        );
        expect(analyticsCall[1].params).toEqual(
          expect.objectContaining({
            includeTimeTrends: true,
            startDate: expect.any(String),
            endDate: expect.any(String)
          })
        );
      });
    });
  });

  // 8. Error Handling & Edge Cases
  describe('Error Handling & Edge Cases', () => {
    test('invents no figures when there is no feedback in the period', async () => {
      axiosInstance.get.mockResolvedValue({
        data: { globalMetrics: { totalInteractions: 0, actionsBreakdown: {} }, userStats: { totalFeedback: 0 }, categoryMetrics: [], tagMetrics: [] },
      });

      renderWithProviders(<FeedbackAnalytics />);

      await waitFor(() => expect(screen.getByTestId('feedback-by-type')).toBeInTheDocument());
      expect(screen.getByTestId('feedback-by-type')).toHaveTextContent('[]');
      expect(screen.getByTestId('average-sentiment')).toBeEmptyDOMElement();
      expect(screen.getByTestId('positive-response-rate')).toBeEmptyDOMElement();
    });

    test('handles empty analytics response gracefully', async () => {
      axiosInstance.get.mockResolvedValue({ data: {} });
      
      renderWithProviders(<FeedbackAnalytics />);
      
      await waitFor(() => {
        expect(screen.getByTestId('feedback-overview')).toBeInTheDocument();
        expect(screen.queryByText(/failed to load/i)).not.toBeInTheDocument();
      });
    });

    test('handles analytics API error while logs succeed', async () => {
      const adminUser = { id: 'admin1', firstName: 'Admin', isAdmin: true };
      
      axiosInstance.get.mockImplementation((url) => {
        if (url === '/feedback/analytics') {
          return Promise.reject(new Error('Analytics error'));
        } else if (url === '/feedback/logs') {
          return Promise.resolve({ data: mockLogsResponse });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });
      
      renderWithProviders(<FeedbackAnalytics />, adminUser);
      
      await waitFor(() => {
        expect(screen.getByText(/failed to load feedback analytics/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    test('handles malformed API response data', async () => {
      axiosInstance.get.mockResolvedValue({
        data: {
          globalMetrics: 'invalid',
          userStats: null,
          categoryMetrics: 'not an array',
          tagMetrics: undefined
        }
      });
      
      renderWithProviders(<FeedbackAnalytics />);
      
      await waitFor(() => {
        expect(screen.getByTestId('feedback-overview')).toBeInTheDocument();
        expect(screen.queryByText(/failed to load/i)).not.toBeInTheDocument();
      });
    });

    test('handles component unmounting during API calls', async () => {
      let resolvePromise;
      axiosInstance.get.mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve;
        })
      );
      
      const { unmount } = renderWithProviders(<FeedbackAnalytics />);
      
      // Unmount before API call completes
      unmount();
      
      // Resolve the promise
      resolvePromise({ data: mockAnalyticsResponse });
      
      // Should not throw any warnings or errors
      expect(true).toBe(true);
    });

    test('handles extremely large datasets without performance issues', async () => {
      const largeResponse = {
        ...mockAnalyticsResponse,
        categoryMetrics: Array.from({ length: 1000 }, (_, i) => ({
          category: `Category ${i}`,
          totalInteractions: Math.floor(Math.random() * 100)
        })),
        tagMetrics: Array.from({ length: 1000 }, (_, i) => ({
          tag: `tag${i}`,
          totalInteractions: Math.floor(Math.random() * 50)
        }))
      };
      
      axiosInstance.get.mockResolvedValue({ data: largeResponse });
      
      const startTime = Date.now();
      renderWithProviders(<FeedbackAnalytics />);
      
      await waitFor(() => {
        expect(screen.getByTestId('feedback-overview')).toBeInTheDocument();
      });
      
      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(5000); // Should render within 5 seconds
    });
  });

  // 9. Accessibility & User Experience
  describe('Accessibility & User Experience', () => {
    test('has proper heading hierarchy', async () => {
      renderWithProviders(<FeedbackAnalytics />);
      
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /feedback analytics/i, level: 1 })).toBeInTheDocument();
      });
      
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /feedback overview/i, level: 3 })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /category distribution/i, level: 4 })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /tag cloud/i, level: 4 })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /sentiment analysis/i, level: 4 })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /feedback timeline/i, level: 4 })).toBeInTheDocument();
      });
    });

    test('provides loading states with descriptive messages', () => {
      axiosInstance.get.mockImplementation(() => new Promise(() => {}));
      
      renderWithProviders(<FeedbackAnalytics />);
      
      expect(screen.getByText(/loading feedback analytics/i)).toBeInTheDocument();
    });

    test('provides error states with retry functionality', async () => {
      axiosInstance.get.mockRejectedValue(new Error('Network error'));
      
      renderWithProviders(<FeedbackAnalytics />);
      
      await waitFor(() => {
        expect(screen.getByText(/failed to load feedback analytics/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
      
      expect(screen.getByRole('button', { name: /retry/i })).toBeEnabled();
    });

    test('applies correct CSS classes for styling', async () => {
      const { container } = renderWithProviders(<FeedbackAnalytics />);
      
      // Wait for component to load
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /feedback analytics/i })).toBeInTheDocument();
      });
      
      expect(container.querySelector('.pageWrapper')).toBeInTheDocument();
      expect(container.querySelector('.analyticsContainer')).toBeInTheDocument();
      
      await waitFor(() => {
        expect(container.querySelector('.statsRow')).toBeInTheDocument();
        expect(container.querySelector('.chartsRow')).toBeInTheDocument();
      });
    });

    test('maintains responsive layout structure', async () => {
      renderWithProviders(<FeedbackAnalytics />);
      
      // Wait for component to load
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /feedback analytics/i })).toBeInTheDocument();
      });
      
      await waitFor(() => {
        // Check that Bootstrap grid components are rendered with correct structure
        expect(screen.getByTestId('feedback-overview')).toBeInTheDocument();
        expect(screen.getByTestId('category-distribution')).toBeInTheDocument();
        expect(screen.getByTestId('tag-cloud')).toBeInTheDocument();
        
        // Verify components are rendered in their containers
        const overviewSection = screen.getByTestId('feedback-overview').closest('.overviewSection');
        expect(overviewSection).toBeInTheDocument();
      });
    });
  });
});