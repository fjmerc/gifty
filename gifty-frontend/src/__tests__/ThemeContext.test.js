// The Theme setting (Light / Dark / System) decides <html data-theme>.
// System follows the operating system's colour scheme, including changes
// while the page is open; the choice is remembered on this device so the next
// visit (signed in or not) starts in the right theme.
import React from 'react';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { THEME_STORAGE_KEY } from '../utils/theme';
import axiosInstance from '../axiosInstance';

jest.mock('../axiosInstance', () => ({ __esModule: true, default: { get: jest.fn() } }));

let mockAuth = { isAuthenticated: false };
jest.mock('../AuthContext', () => ({ useAuth: () => mockAuth }));

let stored;
let systemDark;
let listeners;

beforeEach(() => {
  mockAuth = { isAuthenticated: false };
  stored = {};
  systemDark = false;
  listeners = [];
  document.documentElement.removeAttribute('data-theme');
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: jest.fn((key) => (key in stored ? stored[key] : null)),
      setItem: jest.fn((key, value) => { stored[key] = String(value); }),
    },
  });
  window.matchMedia = jest.fn((query) => ({
    media: query,
    get matches() { return systemDark; },
    addEventListener: (type, fn) => { if (type === 'change') listeners.push(fn); },
    removeEventListener: (type, fn) => { listeners = listeners.filter((l) => l !== fn); },
  }));
  axiosInstance.get.mockResolvedValue({ data: {} });
});

const setSystemDark = (value) => {
  systemDark = value;
  act(() => { listeners.forEach((fn) => fn({ matches: value })); });
};

const Probe = () => {
  const { preference, theme, setPreference } = useTheme();
  return (
    <div>
      <span data-testid="pref">{preference}</span>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={() => setPreference('dark')}>dark</button>
      <button type="button" onClick={() => setPreference('system')}>system</button>
    </div>
  );
};

const theme = () => document.documentElement.getAttribute('data-theme');

test('signed out with nothing remembered: follows the system (light)', () => {
  render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(theme()).toBe('light');
  expect(screen.getByTestId('pref')).toHaveTextContent('system');
  expect(axiosInstance.get).not.toHaveBeenCalled();
});

test('signed out with a dark system: dark, and it follows the system when it changes', () => {
  systemDark = true;
  render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(theme()).toBe('dark');
  setSystemDark(false);
  expect(theme()).toBe('light');
  setSystemDark(true);
  expect(theme()).toBe('dark');
});

test('a remembered choice survives a reload and overrides the system', () => {
  stored[THEME_STORAGE_KEY] = 'dark';
  render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(theme()).toBe('dark');
  setSystemDark(false);
  expect(theme()).toBe('dark');
  expect(listeners).toHaveLength(0);
});

test('choosing a theme applies it at once and remembers it', () => {
  render(<ThemeProvider><Probe /></ThemeProvider>);
  fireEvent.click(screen.getByText('dark'));
  expect(theme()).toBe('dark');
  expect(stored[THEME_STORAGE_KEY]).toBe('dark');
  fireEvent.click(screen.getByText('system'));
  expect(theme()).toBe('light');
  expect(stored[THEME_STORAGE_KEY]).toBe('system');
});

test('signed in: the saved preference from the server wins and is remembered', async () => {
  mockAuth = { isAuthenticated: true };
  axiosInstance.get.mockResolvedValue({ data: { theme: 'dark' } });
  render(<ThemeProvider><Probe /></ThemeProvider>);
  await waitFor(() => expect(theme()).toBe('dark'));
  expect(axiosInstance.get).toHaveBeenCalledWith('/settings/user-preferences');
  expect(stored[THEME_STORAGE_KEY]).toBe('dark');
});

test('an unreadable storage or a failing server keeps the system theme', async () => {
  mockAuth = { isAuthenticated: true };
  systemDark = true;
  window.localStorage.getItem.mockImplementation(() => { throw new Error('blocked'); });
  window.localStorage.setItem.mockImplementation(() => { throw new Error('blocked'); });
  axiosInstance.get.mockRejectedValue(new Error('offline'));
  render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(theme()).toBe('dark');
  await waitFor(() => expect(axiosInstance.get).toHaveBeenCalled());
  expect(theme()).toBe('dark');
});

test('works without matchMedia (older browsers, test doubles)', () => {
  window.matchMedia = undefined;
  render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(theme()).toBe('light');
});

test('after a sign-out, the next account\'s saved preference applies again', async () => {
  mockAuth = { isAuthenticated: true };
  axiosInstance.get.mockResolvedValue({ data: {} });
  const { rerender } = render(<ThemeProvider><Probe /></ThemeProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'system' }));
  mockAuth = { isAuthenticated: false };
  rerender(<ThemeProvider><Probe /></ThemeProvider>);
  axiosInstance.get.mockResolvedValue({ data: { theme: 'dark' } });
  mockAuth = { isAuthenticated: true };
  rerender(<ThemeProvider><Probe /></ThemeProvider>);
  await waitFor(() => expect(theme()).toBe('dark'));
});
