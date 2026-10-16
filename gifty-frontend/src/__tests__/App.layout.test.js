// The backup reminder sits in the page flow under the header, so it never
// floats over a page's own buttons (Generate, the add buttons)
import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../App';

jest.mock('react-toastify', () => ({
  toast: { success: () => {}, error: () => {}, info: () => {}, warn: () => {} },
  ToastContainer: () => null,
}));
jest.mock('../pages/js/Home', () => () => <div data-testid="home-page">Home</div>);
jest.mock('../components/ui/ExportReminder', () => () => <div data-testid="export-reminder" />);
jest.mock('../components/js/SessionTimeout', () => () => null);
jest.mock('../components/js/Header', () => () => null);

test('the backup reminder is part of the main content, before the page', async () => {
  window.history.pushState({}, '', '/');
  render(<App />);
  const reminder = screen.getByTestId('export-reminder');
  const page = await screen.findByTestId('home-page');
  const main = reminder.closest('main');
  expect(main).not.toBeNull();
  expect(main).toContainElement(page);
  // eslint-disable-next-line no-bitwise
  expect(reminder.compareDocumentPosition(page) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('a skip link is the first thing to focus and moves focus to the main content', async () => {
  window.history.pushState({}, '', '/');
  render(<App />);
  await screen.findByTestId('home-page');
  const skip = screen.getByRole('link', { name: 'Skip to main content' });
  const main = document.querySelector('main');

  expect(main).toHaveAttribute('id', 'main-content');
  expect(main).toHaveAttribute('tabindex', '-1');
  expect(skip).toHaveAttribute('href', '#main-content');

  const focusable = document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
  expect(focusable[0]).toBe(skip);

  skip.click();
  expect(main).toHaveFocus();
});
