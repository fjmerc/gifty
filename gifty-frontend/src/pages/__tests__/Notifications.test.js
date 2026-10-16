import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Notifications from '../js/Notifications';
import axiosInstance from '../../axiosInstance';

// The bell's unread count belongs to the server (a snoozed notice doesn't
// count until its snooze ends): after each change the page asks for it
jest.mock('../../axiosInstance');
const mockFetchUnreadCount = jest.fn();
jest.mock('../../NotificationContext', () => ({
  useNotification: () => ({
    fetchUnreadCount: mockFetchUnreadCount,
    updateUnreadCount: jest.fn(),
    notificationPermission: 'default',
    requestNotificationPermission: jest.fn()
  })
}));

const notice = {
  _id: 'n1', read: false, isSnoozed: false, notificationType: 'info', notificationDate: '2026-10-14T12:00:00.000Z',
  formattedNotificationDate: 'Oct 14 08:00 AM', event: { _id: 'e1', name: 'Party', recipient: { firstName: 'Ann', lastName: 'Lee' } }
};

beforeEach(() => {
  mockFetchUnreadCount.mockClear();
  axiosInstance.get.mockImplementation((url) => Promise.resolve(url.startsWith('/notifications/stats')
    ? { data: { unreadCount: 1, preferences: {} } }
    : { data: { notifications: [notice], totalPages: 1, currentPage: 1 } }));
  axiosInstance.put.mockResolvedValue({ data: { ...notice, isSnoozed: true, formattedSnoozedUntil: 'later' } });
  axiosInstance.delete.mockResolvedValue({ data: {} });
});

const openOptions = async () => {
  await waitFor(() => expect(document.body.textContent).toContain(new Date(notice.notificationDate).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })), { timeout: 3000 });
  fireEvent.click(screen.getByRole('button', { name: 'Toggle notification options' }));
};

test('asks the server for the unread count after a snooze', async () => {
  render(<Notifications />);
  await openOptions();
  fireEvent.click(screen.getByRole('button', { name: /Snooze 30 minutes/ }));
  await waitFor(() => expect(mockFetchUnreadCount).toHaveBeenCalled());
});

test('asks the server for the unread count after a removal', async () => {
  render(<Notifications />);
  await openOptions();
  fireEvent.click(screen.getByRole('button', { name: /Remove/ }));
  await waitFor(() => expect(mockFetchUnreadCount).toHaveBeenCalled());
});

test('the settings open in a named dialog that Escape closes', async () => {
  render(<Notifications />);
  fireEvent.click(await screen.findByRole('button', { name: 'Notification settings' }, { timeout: 3000 }));
  const dialog = screen.getByRole('dialog', { name: 'Notification Settings' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(screen.getByLabelText('Display order')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test("shows notice times in the browser's own date and time format, not the server's US text", async () => {
  const shown = new Date(notice.notificationDate).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  axiosInstance.get.mockImplementation((url) => Promise.resolve(url.startsWith('/notifications/stats')
    ? { data: { unreadCount: 1, preferences: {} } }
    : { data: { notifications: [{ ...notice, formattedNotificationDate: 'SERVER TEXT' }], totalPages: 1, currentPage: 1 } }));
  const spy = jest.spyOn(Date.prototype, 'toLocaleString');
  render(<Notifications />);
  await waitFor(() => expect(document.body.textContent).toContain(shown), { timeout: 3000 });
  expect(document.body.textContent).not.toContain('SERVER TEXT');
  expect(spy.mock.calls.every(([locale]) => locale === undefined)).toBe(true);
  spy.mockRestore();
});

test('removing a snoozed notification updates the "snoozed" count without a reload', async () => {
  let snoozedCount = 1;
  const snoozed = { ...notice, isSnoozed: true, snoozedUntil: '2099-01-01T00:00:00.000Z' };
  axiosInstance.get.mockImplementation((url) => Promise.resolve(url.startsWith('/notifications/stats')
    ? { data: { unreadCount: 0, snoozedCount, preferences: {} } }
    : { data: { notifications: snoozedCount ? [snoozed] : [], totalPages: 1, currentPage: 1 } }));
  axiosInstance.delete.mockImplementation(() => {
    snoozedCount = 0;
    return Promise.resolve({ data: {} });
  });
  render(<Notifications />);
  expect(await screen.findByText(/1 snoozed notification/, {}, { timeout: 3000 })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Toggle notification options' }));
  fireEvent.click(screen.getByRole('button', { name: /Remove/ }));

  await waitFor(() => expect(screen.queryByText(/snoozed notification/)).not.toBeInTheDocument());
});
