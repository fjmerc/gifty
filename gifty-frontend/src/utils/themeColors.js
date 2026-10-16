import { useTheme } from '../ThemeContext';

// Canvas charts (chart.js) cannot read CSS custom properties, so the colours
// they draw with live here as values, one set per theme. They mirror the
// --color-* tokens in src/index.css (utils/__tests__/themeColors.test.js keeps
// the two in step); DESIGN.md is the source of truth.
export const THEME_COLORS = {
  light: {
    primary: '#006666',
    'primary-bright': '#008080',
    surface: '#ffffff',
    'surface-muted': '#f8f9fa',
    ink: '#333333',
    'ink-muted': '#666666',
    border: '#e0e0e0',
    success: '#2e7d32',
    warning: '#856404',
    danger: '#dc3545',
    info: '#4682b4',
    'data-1': '#2a78d6',
    'data-2': '#eb6834',
    'data-3': '#1baf7a',
    'data-4': '#eda100',
    'data-5': '#e87ba4',
    'data-6': '#6250d6',
  },
  dark: {
    primary: '#7cccc8',
    'primary-bright': '#2a9d8f',
    surface: '#1e293b',
    'surface-muted': '#0f172a',
    ink: '#e2e8f0',
    'ink-muted': '#94a3b8',
    border: '#334155',
    success: '#a5d6a7',
    warning: '#fcd34d',
    danger: '#ef9a9a',
    info: '#4682b4',
    'data-1': '#3987e5',
    'data-2': '#d95926',
    'data-3': '#199e70',
    'data-4': '#c98500',
    'data-5': '#d55181',
    'data-6': '#9085e9',
  },
};

export const DATA_SERIES = ['data-1', 'data-2', 'data-3', 'data-4', 'data-5', 'data-6'];

/** The colours for the applied theme (light outside a ThemeProvider). */
export const useThemeColors = () => {
  const theme = useTheme()?.theme;
  return THEME_COLORS[theme === 'dark' ? 'dark' : 'light'];
};

/** Series colours in fixed order; past the sixth, 'Other' gets ink-muted. */
export const seriesColors = (colors, count) =>
  Array.from({ length: count }, (_, i) => (i < DATA_SERIES.length ? colors[DATA_SERIES[i]] : colors['ink-muted']));

/**
 * chart.js options for the theme: legend and tick text in ink, grid lines in
 * the border colour, tooltips on the surface. Merged under a chart's options.
 */
export const chartThemeOptions = (colors, { scales = [] } = {}) => ({
  color: colors['ink-muted'],
  borderColor: colors.border,
  plugins: {
    legend: { labels: { color: colors.ink } },
    tooltip: {
      backgroundColor: colors.surface,
      titleColor: colors.ink,
      bodyColor: colors.ink,
      borderColor: colors.border,
      borderWidth: 1,
    },
  },
  scales: Object.fromEntries(scales.map((axis) => [axis, {
    grid: { color: colors.border },
    border: { color: colors.border },
    ticks: { color: colors['ink-muted'] },
    title: { color: colors['ink-muted'] },
  }])),
});

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v !== 'function';

/** Deep merge: values in `override` win; functions and arrays are taken as is. */
export const mergeOptions = (base, override) => {
  const out = { ...base };
  Object.entries(override || {}).forEach(([key, value]) => {
    out[key] = isObject(value) && isObject(base?.[key]) ? mergeOptions(base[key], value) : value;
  });
  return out;
};
