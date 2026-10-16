// Developer and placeholder pages are not part of the app: their addresses
// fall through to the catch-all like any unknown address.
import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../App';

jest.mock('react-toastify', () => ({
  toast: { success: () => {}, error: () => {}, info: () => {}, warn: () => {} },
  ToastContainer: () => null,
}));
// Signed in: let every protected page through
jest.mock('../ProtectedRoute', () => ({ children }) => children);
jest.mock('../pages/js/Home', () => () => <div data-testid="home-page">Home</div>);
jest.mock('../pages/js/UserProfile', () => () => <div data-testid="user-profile-page">User profile</div>);
jest.mock('../components/js/Header', () => () => null);
// Never finishes loading, like a chunk still on the wire
jest.mock('../pages/js/Settings', () => () => { throw new Promise(() => {}); });
jest.mock('../components/ui/ExportReminder', () => () => null);
jest.mock('../components/js/SessionTimeout', () => () => null);

describe.each(['/api-test', '/vendors', '/profile'])('%s', (path) => {
  test('is not a page any more', async () => {
    window.history.pushState({}, '', path);
    render(<App />);
    expect(await screen.findByTestId('home-page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByText(/Vendors Page|Profile Page|Test API/i)).toBeNull();
  });
});

test('the user profile page is still there', async () => {
  window.history.pushState({}, '', '/user-profile');
  render(<App />);
  expect(await screen.findByTestId('user-profile-page')).toBeInTheDocument();
});

describe('route-level code splitting', () => {
  const fs = require('fs');
  const path = require('path');
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');

  test('only the public shell pages are imported eagerly', () => {
    const eagerPages = [...appSource.matchAll(/^import \w+ from '\.\/(pages\/js\/\w+|components\/GiftExplorer\/\w+|components\/forms\/js\/\w+)';$/gm)]
      .map((m) => m[1]);
    expect(eagerPages.sort()).toEqual(['pages/js/Home', 'pages/js/Login']);
    expect(appSource).toMatch(/lazy\(\(\) => import\('\.\/pages\/js\/Events'\)\)/);
  });

  test('a page that is still loading shows a loading status in its place', () => {
    // Settings stands in for any page whose chunk has not arrived yet
    window.history.pushState({}, '', '/settings');
    render(<App />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/Loading/);
    expect(status).toHaveStyle({ minHeight: '60vh' });
    expect(status.closest('main')).not.toBeNull();
  });

  test('a lazy page replaces the loading status once loaded', async () => {
    window.history.pushState({}, '', '/user-profile');
    render(<App />);
    expect(await screen.findByTestId('user-profile-page')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
