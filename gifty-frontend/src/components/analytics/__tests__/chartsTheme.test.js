// Charts draw on a canvas, so they cannot use CSS variables: they take the
// applied theme's colours and redraw when the theme changes.
import React from 'react';
import { render } from '@testing-library/react';
import FeedbackTimeline from '../FeedbackTimeline';
import CategoryDistribution from '../CategoryDistribution';
import SentimentAnalysis from '../SentimentAnalysis';
import FeedbackOverview from '../FeedbackOverview';
import BudgetAnalytics from '../../js/BudgetAnalytics';
import { THEME_COLORS } from '../../../utils/themeColors';

const mockCharts = [];
jest.mock('react-chartjs-2', () => {
  const chart = (type) => (props) => { mockCharts.push({ type, ...props }); return <div data-testid={`${type}-chart`} />; };
  return { Line: chart('line'), Bar: chart('bar'), Pie: chart('pie'), Doughnut: chart('doughnut') };
});
jest.mock('chart.js', () => ({
  Chart: { register: () => {} },
  CategoryScale: {}, LinearScale: {}, PointElement: {}, LineElement: {}, BarElement: {}, ArcElement: {},
  Title: {}, Tooltip: {}, Legend: {}, Filler: {},
}));

let mockTheme = { theme: 'dark' };
jest.mock('../../../ThemeContext', () => ({ useTheme: () => mockTheme }));

const dark = THEME_COLORS.dark;
const light = THEME_COLORS.light;
const last = (type) => [...mockCharts].reverse().find((c) => c.type === type);

beforeEach(() => {
  mockCharts.length = 0;
  mockTheme = { theme: 'dark' };
});

test('timeline: series, ticks, grid and tooltip use the dark theme', () => {
  render(<FeedbackTimeline data={[{ date: '2026-01-01', count: 2, averageRating: 4 }]} isLoading={false} />);
  const { data, options } = last('line');
  expect(data.datasets.map((d) => d.borderColor)).toEqual([dark['data-1'], dark['data-2']]);
  expect(options.scales.y.grid.color).toBe(dark.border);
  expect(options.scales.x.ticks.color).toBe(dark['ink-muted']);
  expect(options.plugins.tooltip.backgroundColor).toBe(dark.surface);
  expect(options.plugins.tooltip.bodyColor).toBe(dark.ink);
  expect(options.plugins.legend.labels.color).toBe(dark.ink);
});

test('timeline redraws in light when the theme changes', () => {
  const { rerender } = render(<FeedbackTimeline data={[{ date: '2026-01-01', count: 2, averageRating: 4 }]} isLoading={false} />);
  mockTheme = { theme: 'light' };
  rerender(<FeedbackTimeline data={[{ date: '2026-01-01', count: 2, averageRating: 4 }]} isLoading={false} />);
  expect(last('line').data.datasets[0].borderColor).toBe(light['data-1']);
  expect(last('line').options.scales.y.grid.color).toBe(light.border);
});

test('category pie: fixed series order, slice gaps in the surface colour', () => {
  const data = Array.from({ length: 7 }, (_, i) => ({ name: `C${i}`, count: 10 - i }));
  render(<CategoryDistribution data={data} isLoading={false} />);
  const { data: chart, options } = last('pie');
  expect(chart.datasets[0].backgroundColor).toEqual([
    dark['data-1'], dark['data-2'], dark['data-3'], dark['data-4'], dark['data-5'], dark['data-6'], dark['ink-muted'],
  ]);
  expect(chart.datasets[0].borderColor).toBe(dark.surface);
  expect(options.plugins.legend.labels.color).toBe(dark.ink);
});

test('sentiment: a diverging scale from the status tokens, whatever the server sends', () => {
  const data = {
    sentimentDistribution: [
      { sentiment: 'Very Positive', count: 3, color: '#2ecc71' },
      { sentiment: 'Positive', count: 2, color: '#3498db' },
      { sentiment: 'Neutral', count: 1, color: '#95a5a6' },
      { sentiment: 'Negative', count: 1, color: '#e67e22' },
      { sentiment: 'Very Negative', count: 1, color: '#e74c3c' },
    ],
    averageSentiment: 0.7,
    topPositiveTags: [],
    topNegativeTags: [],
  };
  render(<SentimentAnalysis data={data} isLoading={false} />);
  const { data: chart, options } = last('bar');
  expect(chart.datasets[0].backgroundColor).toEqual([dark.success, dark['primary-bright'], dark['ink-muted'], dark.warning, dark.danger]);
  expect(options.scales.y.ticks.color).toBe(dark['ink-muted']);
});

test('feedback overview bar uses the theme', () => {
  render(<FeedbackOverview data={{ totalFeedback: 3, feedbackByType: [{ name: 'Saved', count: 3 }] }} isLoading={false} />);
  const chart = last('bar');
  expect(chart.data.datasets[0].backgroundColor).toBe(dark['data-1']);
  expect(chart.options.plugins.tooltip.backgroundColor).toBe(dark.surface);
});

test('budget allocation pie: fixed order, unallocated in the border colour, gaps in surface', () => {
  render(
    <BudgetAnalytics
      analytics={{ currency: 'EUR' }}
      overallBudget={{ exists: true, isLimited: true, amount: 100, unallocated: 50 }}
      recipientBudgets={[
        { _id: 'a', firstName: 'A', limit: 30, budget: { exists: true, allocationType: 'fixed' } },
        { _id: 'b', firstName: 'B', limit: 20, budget: { exists: true, allocationType: 'fixed' } },
      ]}
    />,
  );
  const { data: chart, options } = last('pie');
  expect(chart.datasets[0].backgroundColor).toEqual([dark['data-1'], dark['data-2'], dark.border]);
  expect(chart.datasets[0].borderColor).toBe(dark.surface);
  expect(options.plugins.legend.labels.color).toBe(dark.ink);
});
