import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  THEME_COLORS, chartThemeOptions, mergeOptions, seriesColors, useThemeColors,
} from '../themeColors';

let mockTheme = null;
jest.mock('../../ThemeContext', () => ({ useTheme: () => mockTheme }));

const css = fs.readFileSync(path.join(__dirname, '../../index.css'), 'utf8');
const block = (selector) => {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf('\n}', start));
};
const tokenValue = (text, name) => {
  const m = text.match(new RegExp(`--color-${name}:\\s*([^;]+);`));
  return m && m[1].trim().toLowerCase();
};

test.each(['light', 'dark'])('the %s chart colours match the CSS tokens', (theme) => {
  const text = block(theme === 'light' ? ':root' : ':root[data-theme="dark"]');
  Object.entries(THEME_COLORS[theme]).forEach(([name, value]) => {
    expect([name, tokenValue(text, name)]).toEqual([name, value]);
  });
});

const Probe = () => <span data-testid="c">{useThemeColors().ink}</span>;

test('charts get the colours of the applied theme', () => {
  mockTheme = { theme: 'dark' };
  const { rerender } = render(<Probe />);
  expect(screen.getByTestId('c')).toHaveTextContent(THEME_COLORS.dark.ink);
  mockTheme = { theme: 'light' };
  rerender(<Probe />);
  expect(screen.getByTestId('c')).toHaveTextContent(THEME_COLORS.light.ink);
  mockTheme = null;
  rerender(<Probe />);
  expect(screen.getByTestId('c')).toHaveTextContent(THEME_COLORS.light.ink);
});

test('series colours follow a fixed order and fold past six into ink-muted', () => {
  const c = THEME_COLORS.light;
  expect(seriesColors(c, 7)).toEqual([c['data-1'], c['data-2'], c['data-3'], c['data-4'], c['data-5'], c['data-6'], c['ink-muted']]);
});

test('theme options merge under a chart\'s own options', () => {
  const merged = mergeOptions(chartThemeOptions(THEME_COLORS.dark, { scales: ['x'] }), {
    plugins: { legend: { position: 'top' } },
    scales: { x: { ticks: { callback: 'cb' } } },
  });
  expect(merged.plugins.legend).toEqual({ position: 'top', labels: { color: THEME_COLORS.dark.ink } });
  expect(merged.scales.x.ticks).toEqual({ color: THEME_COLORS.dark['ink-muted'], callback: 'cb' });
  expect(merged.plugins.tooltip.backgroundColor).toBe(THEME_COLORS.dark.surface);
});
