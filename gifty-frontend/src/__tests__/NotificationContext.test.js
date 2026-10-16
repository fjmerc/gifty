import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { NotificationProvider, useNotification } from '../NotificationContext';
import axiosInstance from '../axiosInstance';

// Sign-in is a cookie the page can't read: the bell must follow the app's
// auth state, not a token in localStorage (there is none any more)
jest.mock('../axiosInstance');
const mockPlay = jest.fn(() => Promise.resolve());
jest.mock('../assets/sounds/notification.js', () => ({ createNotificationSound: () => ({ play: mockPlay }) }));
let mockAuthenticated = true;
jest.mock('../AuthContext', () => ({ useAuth: () => ({ isAuthenticated: mockAuthenticated }) }));

const Badge = () => {
  const { unreadCount } = useNotification();
  return <span data-testid="unread">{unreadCount}</span>;
};

describe('NotificationProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    axiosInstance.get.mockResolvedValue({ data: { unreadCount: 3 } });
  });

  test('counts unread notifications for a signed-in user', async () => {
    mockAuthenticated = true;
    render(<NotificationProvider><Badge /></NotificationProvider>);
    await waitFor(() => expect(screen.getByTestId('unread')).toHaveTextContent('3'));
    expect(axiosInstance.get).toHaveBeenCalledWith('/notifications/stats');
  });

  test('asks nothing while signed out', async () => {
    mockAuthenticated = false;
    render(<NotificationProvider><Badge /></NotificationProvider>);
    await new Promise((r) => setTimeout(r, 50));
    expect(axiosInstance.get).not.toHaveBeenCalledWith('/notifications/stats');
  });

  describe('alerts for new notifications', () => {
    const notice = (id, extra = {}) => ({ _id: id, read: false, isSnoozed: false, event: { name: 'Party', recipient: { firstName: 'Ann', lastName: 'Lee' } }, ...extra });
    let latest;

    beforeEach(() => {
      jest.useFakeTimers('modern');
      mockAuthenticated = true;
      mockPlay.mockClear();
      latest = [notice('a'), notice('b', { read: true })];
      axiosInstance.get.mockImplementation((url) => Promise.resolve(
        url === '/notifications/stats' ? { data: { unreadCount: 1 } } : { data: { notifications: latest } }
      ));
    });

    afterEach(() => jest.useRealTimers());

    const poll = async () => {
      await act(async () => { jest.advanceTimersByTime(120000); });
      await act(async () => {});
    };

    test('stay quiet about what was already there when the page opened', async () => {
      render(<NotificationProvider><Badge /></NotificationProvider>);
      await act(async () => {});
      await poll();
      expect(mockPlay).not.toHaveBeenCalled();
    });

    test('sound once for a new unread notice, not for read or snoozed ones, even without its event', async () => {
      render(<NotificationProvider><Badge /></NotificationProvider>);
      await act(async () => {});

      latest = [notice('c', { event: null }), notice('d', { read: true }), notice('e', { isSnoozed: true }), ...latest];
      await poll();
      expect(mockPlay).toHaveBeenCalledTimes(1);

      await poll();
      expect(mockPlay).toHaveBeenCalledTimes(1);
    });
  });
});

