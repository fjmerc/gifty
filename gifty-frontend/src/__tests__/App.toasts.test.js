// Pages report results with react-toastify; without a ToastContainer in the
// app those messages are never shown.
import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../App';

// A plain component: the shared jest.fn() mock loses its implementation
// when mocks are reset between tests
jest.mock('react-toastify', () => ({
  toast: { success: () => {}, error: () => {}, info: () => {}, warn: () => {} },
  ToastContainer: () => <div data-testid="toast-container" />
}));
jest.mock('../pages/js/Home', () => () => <div>Home</div>);
jest.mock('../components/ui/ExportReminder', () => () => null);
jest.mock('../components/js/SessionTimeout', () => () => null);

test('the app shows toast messages', async () => {
  render(<App />);
  expect(await screen.findByTestId('toast-container')).toBeInTheDocument();
});

test('the old profile edit address opens the profile page', async () => {
  window.history.pushState({}, '', '/user-profile/edit');
  render(<App />);
  // Signed out, the protected profile page sends the visitor on; the bare
  // form (without the user's data) is never shown
  await screen.findByTestId('toast-container');
  expect(window.location.pathname).not.toBe('/user-profile/edit');
  expect(document.querySelector('input[name=firstName]')).toBeNull();
});
