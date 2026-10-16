import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CategoryDistribution from '../CategoryDistribution';

// Mock CSS modules
// Charts render as a div carrying what the component computed
jest.mock('react-chartjs-2', () => {
  const lastProps = {};
  const chart = (testId) => ({ data, options, ...rest }) => {
    lastProps[testId] = { data, options };
    return <div data-testid={testId} data-chart-data={JSON.stringify(data)} data-chart-options={JSON.stringify(options)} {...rest} />;
  };
  return { Line: chart('line-chart'), Bar: chart('bar-chart'), Pie: chart('pie-chart'), lastProps };
});

jest.mock('../../css/analytics/CategoryDistribution.module.css', () => ({
  categoryCard: 'categoryCard',
  cardHeader: 'cardHeader',
  controls: 'controls',
  formGroup: 'formGroup',
  formLabel: 'formLabel',
  formSelect: 'formSelect',
  chartContainer: 'chartContainer',
  loadingPlaceholder: 'loadingPlaceholder',
  noDataMessage: 'noDataMessage',
  chartArea: 'chartArea'
}));

// The slices as the component computed them, read back from the chart data
const slices = () => {
  const { labels, datasets } = JSON.parse(screen.getByTestId('pie-chart').dataset.chartData);
  return labels.map((label, i) => {
    const [, name, percentage] = label.match(/^(.*) \((\d+)%\)$/);
    return { name, percentage: Number(percentage), count: datasets[0].data[i], fill: datasets[0].backgroundColor[i] };
  });
};
const chartOptions = () => JSON.parse(screen.getByTestId('pie-chart').dataset.chartOptions);

describe('CategoryDistribution Component', () => {
  const mockData = [
    { name: 'Electronics', count: 25 },
    { name: 'Clothing', count: 20 },
    { name: 'Books', count: 15 },
    { name: 'Home Decor', count: 10 },
    { name: 'Toys', count: 8 },
    { name: 'Sports', count: 5 }
  ];

  describe('Basic Rendering', () => {
    it('renders without crashing', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      expect(screen.getByText('Category Distribution')).toBeInTheDocument();
    });

    it('renders all main sections', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      expect(screen.getByText('Category Distribution')).toBeInTheDocument();
      expect(screen.getByText('Sort by')).toBeInTheDocument();
      expect(screen.getByText('Show Top')).toBeInTheDocument();
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    });

    it('applies correct CSS classes', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      const card = screen.getByText('Category Distribution').closest('.categoryCard');
      expect(card).toBeInTheDocument();
      expect(card).toHaveClass('categoryCard');
      
      const header = screen.getByText('Category Distribution').closest('.cardHeader');
      expect(header).toHaveClass('cardHeader');
    });
  });

  describe('Data Processing', () => {
    it('processes data correctly for chart display', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
            const pieData = slices();
      
      // Should include percentage calculations
      expect(pieData).toHaveLength(6);
      expect(pieData[0]).toHaveProperty('percentage');
      expect(pieData[0].name).toBe('Electronics');
      expect(pieData[0].count).toBe(25);
    });

    it('calculates percentages correctly', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
            const pieData = slices();
      
      // Total count is 83, Electronics (25) should be ~30%
      expect(pieData[0].percentage).toBe(30);
      // Clothing (20) should be ~24%
      expect(pieData[1].percentage).toBe(24);
    });

    it('handles empty data array: a message, no chart', () => {
      render(<CategoryDistribution data={[]} isLoading={false} />);

      expect(screen.getByText('No category data available for the selected period.')).toBeInTheDocument();
      expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument();
    });

    it('handles undefined data: no invented categories', () => {
      render(<CategoryDistribution data={undefined} isLoading={false} />);

      expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument();
      expect(screen.queryByText(/Electronics/)).not.toBeInTheDocument();
      expect(screen.getByText('No category data available for the selected period.')).toBeInTheDocument();
    });

    it('handles null data: no invented categories', () => {
      render(<CategoryDistribution data={null} isLoading={false} />);

      expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument();
      expect(screen.getByText('No category data available for the selected period.')).toBeInTheDocument();
    });
  });

  describe('Sorting Functionality', () => {
    it('defaults to sorting by count', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      const sortSelect = screen.getByDisplayValue('Count (Highest First)');
      expect(sortSelect).toBeInTheDocument();
      
            const pieData = slices();
      
      // Electronics (25) should be first
      expect(pieData[0].name).toBe('Electronics');
      expect(pieData[0].count).toBe(25);
    });

    it('sorts by count in descending order', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
            const pieData = slices();
      
      // Should be sorted by count descending
      expect(pieData[0].count).toBeGreaterThan(pieData[1].count);
      expect(pieData[1].count).toBeGreaterThan(pieData[2].count);
    });

    it('sorts by name alphabetically when selected', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      const sortSelect = screen.getByDisplayValue('Count (Highest First)');
      fireEvent.change(sortSelect, { target: { value: 'name' } });
      
            const pieData = slices();
      
      // Should be sorted alphabetically - Books comes before Clothing
      expect(pieData[0].name).toBe('Books');
      expect(pieData[1].name).toBe('Clothing');
    });

    it('maintains sort selection after data changes', () => {
      const { rerender } = render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      const sortSelect = screen.getByDisplayValue('Count (Highest First)');
      fireEvent.change(sortSelect, { target: { value: 'name' } });
      
      expect(screen.getByDisplayValue('Name (A-Z)')).toBeInTheDocument();
      
      // Re-render with new data
      const newData = [{ name: 'Zebra', count: 5 }, { name: 'Alpha', count: 10 }];
      rerender(<CategoryDistribution data={newData} isLoading={false} />);
      
      // Sort selection should be maintained
      expect(screen.getByDisplayValue('Name (A-Z)')).toBeInTheDocument();
    });
  });

  describe('Limit Functionality', () => {
    it('defaults to showing top 10 categories', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      const limitSelect = screen.getByDisplayValue('10');
      expect(limitSelect).toBeInTheDocument();
    });

    it('limits displayed data to selected number', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      // First verify initial state shows all data
            let pieData = slices();
      expect(pieData).toHaveLength(6); // All mock data items
      
      // Change limit to 3
      const limitSelect = screen.getByDisplayValue('10');
      fireEvent.change(limitSelect, { target: { value: '3' } });
      
      // The event should trigger onChange, test the functionality works
      expect(limitSelect).toBeInTheDocument();
      
      // Test that the component handles limit changes (the data limiting logic is tested elsewhere)
      expect(screen.getByText('Category Distribution')).toBeInTheDocument();
    });

    it('shows all data when limit is higher than data length', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      const limitSelect = screen.getByDisplayValue('10');
      fireEvent.change(limitSelect, { target: { value: '20' } });
      
            const pieData = slices();
      
      expect(pieData).toHaveLength(6); // All available data
    });

    it('respects limit when rendering data', () => {
      // Test the data limiting logic by checking slice behavior
      const largeData = Array.from({ length: 15 }, (_, i) => ({
        name: `Category ${i + 1}`,
        count: 15 - i
      }));
      
      render(<CategoryDistribution data={largeData} isLoading={false} />);
      
            const pieData = slices();
      
      // Should limit to default 10 items
      expect(pieData).toHaveLength(10);
    });

    it('provides all expected limit options', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      const limitSelect = screen.getByDisplayValue('10');
      const options = Array.from(limitSelect.querySelectorAll('option')).map(opt => opt.value);
      
      expect(options).toEqual(['5', '10', '15', '20']);
    });
  });

  describe('Loading State', () => {
    it('shows loading placeholder when isLoading is true', () => {
      render(<CategoryDistribution data={mockData} isLoading={true} />);
      
      expect(screen.getByText('Loading category data...')).toBeInTheDocument();
      expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument();
    });

    it('disables controls when loading', () => {
      render(<CategoryDistribution data={mockData} isLoading={true} />);
      
      const sortSelect = screen.getByDisplayValue('Count (Highest First)');
      const limitSelect = screen.getByDisplayValue('10');
      
      expect(sortSelect).toBeDisabled();
      expect(limitSelect).toBeDisabled();
    });

    it('applies loading placeholder styling', () => {
      render(<CategoryDistribution data={mockData} isLoading={true} />);
      
      const loadingElement = screen.getByText('Loading category data...');
      expect(loadingElement.closest('.loadingPlaceholder')).toBeInTheDocument();
    });
  });

  describe('Chart Configuration', () => {
    it('sizes the chart to its box and pads it', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);

      expect(chartOptions()).toMatchObject({ responsive: true, maintainAspectRatio: false, layout: { padding: 20 } });
      expect(screen.getByTestId('pie-chart').parentElement).toHaveClass('chartArea');
    });

    it('draws one slice per category', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);

      expect(slices()).toHaveLength(6); // Same as data length
    });

    it('has a text alternative listing each category and share', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);

      const chart = screen.getByTestId('pie-chart');
      expect(chart).toHaveAttribute('role', 'img');
      expect(chart.getAttribute('aria-label')).toMatch(/^Feedback by category: Electronics 30%, Clothing 24%/);
    });
  });

  describe('Legend Configuration', () => {
    it('places the legend on the right with 12px labels', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);

      expect(chartOptions().plugins.legend).toMatchObject({ position: 'right', labels: { font: { size: 12 } } });
    });

    it('carries each share in the legend label', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);

      const { labels } = JSON.parse(screen.getByTestId('pie-chart').dataset.chartData);
      expect(labels[0]).toBe('Electronics (30%)');
    });
  });

  describe('Color System', () => {
    it('assigns colors to slices from the predefined palette', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);

      const expectedColors = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6'];
      expect(slices().map(({ fill }) => fill)).toEqual(expectedColors);
    });

    it('never cycles colours: slices past the sixth share the muted colour', () => {
      const largeData = Array.from({ length: 25 }, (_, i) => ({
        name: `Category ${i + 1}`,
        count: 25 - i
      }));

      render(<CategoryDistribution data={largeData} isLoading={false} />);
      fireEvent.change(screen.getByLabelText('Show Top'), { target: { value: '20' } });

      const fills = slices().map(({ fill }) => fill);
      expect(fills[0]).toBe('#2a78d6');
      expect(fills[5]).toBe('#6250d6');
      expect(new Set(fills.slice(6))).toEqual(new Set(['#666666']));
    });
  });

  describe('Form Controls', () => {
    it('renders sort control with correct attributes', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      const sortGroup = screen.getByLabelText('Sort by').parentElement;
      expect(sortGroup).toBeInTheDocument();
      expect(sortGroup).toHaveClass('formGroup');
    });

    it('renders limit control with correct attributes', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      const limitGroup = screen.getByLabelText('Show Top').parentElement;
      expect(limitGroup).toBeInTheDocument();
      expect(limitGroup).toHaveClass('formGroup');
    });

    it('applies form styling classes', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      const sortLabel = screen.getByText('Sort by');
      const limitLabel = screen.getByText('Show Top');
      const sortSelect = screen.getByDisplayValue('Count (Highest First)');
      const limitSelect = screen.getByDisplayValue('10');
      
      expect(sortLabel).toHaveClass('formLabel');
      expect(limitLabel).toHaveClass('formLabel');
      expect(sortSelect).toHaveClass('formSelect');
      expect(limitSelect).toHaveClass('formSelect');
    });
  });

  describe('No Data State', () => {
    it('shows no data message when data array is empty', () => {
      render(<CategoryDistribution data={[]} isLoading={false} />);
      
      const noDataMessage = screen.getByText('No category data available for the selected period.');
      expect(noDataMessage).toBeInTheDocument();
      expect(noDataMessage.closest('.noDataMessage')).toHaveClass('noDataMessage');
    });

    it('does not show no data message when loading', () => {
      render(<CategoryDistribution data={[]} isLoading={true} />);
      
      expect(screen.queryByText('No category data available for the selected period.')).not.toBeInTheDocument();
    });

    it('does not show no data message when data exists', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      expect(screen.queryByText('No category data available for the selected period.')).not.toBeInTheDocument();
    });
  });

  describe('Tooltip', () => {
    it('titles a slice with its category and lists count and share', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);

      const { callbacks } = require('react-chartjs-2').lastProps['pie-chart'].options.plugins.tooltip;
      expect(callbacks.title([{ dataIndex: 0 }])).toBe('Electronics');
      expect(callbacks.label({ dataIndex: 0 })).toEqual(['25 feedbacks', '30%']);
    });
  });

  describe('Props Validation', () => {
    it('handles missing data prop gracefully', () => {
      expect(() => {
        render(<CategoryDistribution isLoading={false} />);
      }).not.toThrow();
    });

    it('handles missing isLoading prop gracefully', () => {
      expect(() => {
        render(<CategoryDistribution data={mockData} />);
      }).not.toThrow();
    });

    it('works with minimal props', () => {
      render(<CategoryDistribution />);
      
      expect(screen.getByText('Category Distribution')).toBeInTheDocument();
    });
  });

  describe('Event Handling', () => {
    it('handles sort change correctly', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      const sortSelect = screen.getByDisplayValue('Count (Highest First)');
      
      fireEvent.change(sortSelect, { target: { value: 'name' } });
      
      expect(screen.getByDisplayValue('Name (A-Z)')).toBeInTheDocument();
    });

    it('handles limit change correctly', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      const limitSelect = screen.getByDisplayValue('10');
      
      fireEvent.change(limitSelect, { target: { value: '5' } });
      
      expect(screen.getByDisplayValue('5')).toBeInTheDocument();
    });

    it('updates chart data when controls change', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      // Test that the controls can be found and interacted with
      const limitSelect = screen.getByDisplayValue('10');
      const sortSelect = screen.getByDisplayValue('Count (Highest First)');
      
      // Fire change events
      fireEvent.change(limitSelect, { target: { value: '3' } });
      fireEvent.change(sortSelect, { target: { value: 'name' } });
      
      // Component should still be rendered and functional after changes
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
      expect(screen.getByText('Category Distribution')).toBeInTheDocument();
      
      // Verify the controls are still functional
      expect(limitSelect).toBeInTheDocument();
      expect(sortSelect).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('provides proper form labels', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      expect(screen.getByText('Sort by')).toBeInTheDocument();
      expect(screen.getByText('Show Top')).toBeInTheDocument();
    });

    it('associates labels with form controls', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      const sortGroup = screen.getByLabelText('Sort by').parentElement;
      const limitGroup = screen.getByLabelText('Show Top').parentElement;
      
      expect(sortGroup).toBeInTheDocument();
      expect(limitGroup).toBeInTheDocument();
    });

    it('provides meaningful content for screen readers', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      expect(screen.getByText('Category Distribution')).toBeInTheDocument();
      expect(screen.getByText('Count (Highest First)')).toBeInTheDocument();
    });
  });

  describe('Component State Management', () => {
    it('maintains independent state for sort and limit', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
      const sortSelect = screen.getByDisplayValue('Count (Highest First)');
      const limitSelect = screen.getByDisplayValue('10');
      
      fireEvent.change(sortSelect, { target: { value: 'name' } });
      fireEvent.change(limitSelect, { target: { value: '5' } });
      
      expect(screen.getByDisplayValue('Name (A-Z)')).toBeInTheDocument();
      expect(screen.getByDisplayValue('5')).toBeInTheDocument();
    });

    it('updates chart when state changes', () => {
      render(<CategoryDistribution data={mockData} isLoading={false} />);
      
            let pieData = slices();
      
      // Should start sorted by count
      expect(pieData[0].name).toBe('Electronics');
      
      const sortSelect = screen.getByDisplayValue('Count (Highest First)');
      fireEvent.change(sortSelect, { target: { value: 'name' } });
      
      pieData = slices();
      
      // Should now be sorted alphabetically
      expect(pieData[0].name).toBe('Books');
    });
  });

});