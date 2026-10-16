import React from 'react';
import { render as rtlRender } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { NotificationProvider } from './NotificationContext';
import userReducer from './slices/userSlice';
import giftLibraryReducer from './slices/giftLibrarySlice';

// Create a test store factory
function createTestStore(preloadedState = {}) {
  return configureStore({
    reducer: {
      user: userReducer,
      giftLibrary: giftLibraryReducer,
    },
    preloadedState,
  });
}

// Mock AuthContext values for testing
const mockAuthContextValue = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
  login: jest.fn(),
  logout: jest.fn(),
  updateUser: jest.fn(),
  fetchUserProfile: jest.fn(),
  validateAuth: jest.fn(),
};

// Mock NotificationContext values for testing
const mockNotificationContextValue = {
  unreadCount: 0,
  updateUnreadCount: jest.fn(),
  fetchUnreadCount: jest.fn(),
  notifications: [],
  settings: {
    defaultDuration: 5,
    displayOrder: 'newest',
    soundAlerts: true,
    visualAlerts: true,
    autoDismiss: true,
  },
  updateSettings: jest.fn(),
  notificationPermission: 'default',
  checkNotificationPermission: jest.fn(),
  requestNotificationPermission: jest.fn(),
};

// Component tests start signed out without a profile request on the
// (often mocked) API client
const notSignedIn = () => Promise.reject(Object.assign(new Error('Not signed in (test render)'), { response: { status: 401 } }));

// Mock AuthProvider for testing
const MockAuthProvider = ({ children, value = {} }) => {
  const authValue = { ...mockAuthContextValue, ...value };
  
  return (
    <div data-testid="mock-auth-provider">
      {React.cloneElement(
        <AuthProvider loadProfile={notSignedIn}>{children}</AuthProvider>,
        {},
        React.createElement(
          'div',
          { 'data-auth-context': JSON.stringify(authValue) },
          children
        )
      )}
    </div>
  );
};

// Mock NotificationProvider for testing
const MockNotificationProvider = ({ children, value = {} }) => {
  const notificationValue = { ...mockNotificationContextValue, ...value };
  
  return (
    <div data-testid="mock-notification-provider">
      {React.cloneElement(
        <NotificationProvider>{children}</NotificationProvider>,
        {},
        React.createElement(
          'div',
          { 'data-notification-context': JSON.stringify(notificationValue) },
          children
        )
      )}
    </div>
  );
};

// AllTheProviders wrapper component
function AllTheProviders({ 
  children, 
  initialState = {},
  store = null,
  authContextValue = {},
  notificationContextValue = {},
  routerProps = {}
}) {
  const testStore = store || createTestStore(initialState);
  
  return (
    <Provider store={testStore}>
      <BrowserRouter {...routerProps}>
        <MockAuthProvider value={authContextValue}>
          <MockNotificationProvider value={notificationContextValue}>
            {children}
          </MockNotificationProvider>
        </MockAuthProvider>
      </BrowserRouter>
    </Provider>
  );
}

// Custom render function
function render(ui, options = {}) {
  const {
    initialState = {},
    store = null,
    authContextValue = {},
    notificationContextValue = {},
    routerProps = {},
    ...renderOptions
  } = options;

  function Wrapper({ children }) {
    return (
      <AllTheProviders
        initialState={initialState}
        store={store}
        authContextValue={authContextValue}
        notificationContextValue={notificationContextValue}
        routerProps={routerProps}
      >
        {children}
      </AllTheProviders>
    );
  }

  return rtlRender(ui, { wrapper: Wrapper, ...renderOptions });
}

// Helper function to create authenticated user state
export function createAuthenticatedUser(userOverrides = {}) {
  return {
    isAuthenticated: true,
    isLoading: false,
    user: {
      id: 'test-user-id',
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      profilePicture: null,
      ...userOverrides,
    },
  };
}

// Helper function to create Redux state with user
export function createUserState(userOverrides = {}) {
  return {
    user: {
      currentUser: {
        id: 'test-user-id',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        ...userOverrides,
      },
      loading: false,
      error: null,
    },
  };
}

// Helper function to create Redux state with gift library
export function createGiftLibraryState(giftOverrides = {}) {
  return {
    giftLibrary: {
      gifts: [],
      loading: false,
      error: null,
      filters: {
        category: '',
        priceRange: [0, 1000],
        recipients: [],
      },
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalItems: 0,
      },
      ...giftOverrides,
    },
  };
}

// Helper function to wait for async operations
export function waitForLoadingToFinish() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// re-export everything
/**
 * Pin "now" to a fixed date for tests whose fixtures are written for a
 * specific day/year. Only argument-less `new Date()` and `Date.now()` shift;
 * time keeps moving and real timers stay real (Jest 27 can't fake Date
 * alone). Returns a restore function — call it in afterAll/afterEach.
 */
export function pinSystemDate(iso) {
  const RealDate = global.Date;
  const offset = new RealDate(iso).getTime() - RealDate.now();
  class PinnedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...args);
    }
    static now() {
      return RealDate.now() + offset;
    }
  }
  global.Date = PinnedDate;
  return () => { global.Date = RealDate; };
}

export * from '@testing-library/react';
export { render, createTestStore, AllTheProviders };
export { mockAuthContextValue, mockNotificationContextValue };
