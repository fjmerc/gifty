import React from 'react';
import { render, screen } from '../test-utils';
import { createAuthenticatedUser, createUserState } from '../test-utils';

// Simple test component to verify setup
const TestComponent = () => {
  return (
    <div>
      <h1 data-testid="test-heading">Test Component</h1>
      <p data-testid="test-paragraph">This is a test component to verify our testing setup.</p>
    </div>
  );
};

describe('Testing Infrastructure Verification', () => {
  test('renders test component correctly', () => {
    render(<TestComponent />);
    
    expect(screen.getByTestId('test-heading')).toBeInTheDocument();
    expect(screen.getByTestId('test-paragraph')).toBeInTheDocument();
    expect(screen.getByText('Test Component')).toBeInTheDocument();
  });

  test('can render with authenticated user context', () => {
    const authContextValue = createAuthenticatedUser({
      firstName: 'John',
      lastName: 'Doe',
    });

    render(<TestComponent />, {
      authContextValue,
    });

    expect(screen.getByTestId('test-heading')).toBeInTheDocument();
  });

  test('can render with Redux store state', () => {
    const initialState = createUserState({
      firstName: 'Jane',
      lastName: 'Smith',
    });

    render(<TestComponent />, {
      initialState,
    });

    expect(screen.getByTestId('test-heading')).toBeInTheDocument();
  });

  test('localStorage mock is working', () => {
    // Test that localStorage mock exists and functions work
    expect(localStorage.setItem).toBeDefined();
    expect(localStorage.getItem).toBeDefined();
    expect(typeof localStorage.setItem).toBe('function');
    expect(typeof localStorage.getItem).toBe('function');
  });

  test('Chart.js mocks are working', () => {
    const mockChart = require('chart.js');
    expect(mockChart.Chart).toBeDefined();
    expect(typeof mockChart.Chart).toBe('object');
    expect(typeof mockChart.Chart.register).toBe('function');
  });

  test('React Router mock is working', () => {
    // Test that our test-utils wrapper includes router context
    // If this doesn't throw, the router context is working
    render(<TestComponent />);
    expect(screen.getByTestId('test-heading')).toBeInTheDocument();
  });
});

// Test to verify CSS modules support
describe('CSS Modules Support', () => {
  test('identity-obj-proxy is working for CSS modules', () => {
    // Simulating a CSS module import
    const mockStyles = require('../__mocks__/fileMock.js');
    expect(mockStyles.default).toBe('test-file-stub');
  });
});

// Test to verify all providers are working together
describe('Provider Integration', () => {
  test('all providers work together', () => {
    const authContextValue = createAuthenticatedUser();
    const notificationContextValue = {
      unreadCount: 5,
      notifications: [{ id: '1', message: 'Test notification' }],
    };
    const initialState = createUserState();

    render(<TestComponent />, {
      authContextValue,
      notificationContextValue,
      initialState,
    });

    expect(screen.getByTestId('test-heading')).toBeInTheDocument();
  });
});

// Test library mocks
describe('Library Mocks', () => {
  test('React Toastify mock is working', () => {
    const { toast } = require('react-toastify');
    expect(toast.success).toBeDefined();
    expect(typeof toast.success).toBe('function');
  });

  test('react-chartjs-2 mock is working', () => {
    const { Line } = require('react-chartjs-2');
    expect(Line).toBeDefined();
    expect(typeof Line).toBe('function');
  });

  test('FontAwesome mock is working', () => {
    const { FontAwesomeIcon } = require('@fortawesome/react-fontawesome');
    expect(FontAwesomeIcon).toBeDefined();
    expect(typeof FontAwesomeIcon).toBe('function');
  });

  test('Axios mock is working', () => {
    const axios = require('axios');
    expect(axios.default).toBeDefined();
    expect(typeof axios.default.get).toBe('function');
    expect(typeof axios.default.post).toBe('function');
    expect(typeof axios.default.create).toBe('function');
  });
});
