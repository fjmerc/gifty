import React from 'react';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import userReducer from '../slices/userSlice';
import giftLibraryReducer from '../slices/giftLibrarySlice';

// Simple mock for AuthContext
let mockAuthValue = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
  login: jest.fn(),
  logout: jest.fn(),
  updateUser: jest.fn(),
  fetchUserProfile: jest.fn(),
  validateAuth: jest.fn(),
};

// Mock the entire AuthContext module
jest.mock('../AuthContext', () => ({
  useAuth: () => mockAuthValue,
  AuthProvider: ({ children }) => children,
}));

// Import ProtectedRoute after mocking
import ProtectedRoute from '../ProtectedRoute';

// Test components
function TestProtectedContent() {
  return (
    <div data-testid="protected-content">
      This is protected content
    </div>
  );
}

function LoginPage() {
  const location = useLocation();
  return (
    <div data-testid="login-page">
      <div data-testid="login-from-state">
        {location.state?.from ? location.state.from.pathname : 'no-from-state'}
      </div>
    </div>
  );
}

// Test store
function createTestStore() {
  return configureStore({
    reducer: {
      user: userReducer,
      giftLibrary: giftLibraryReducer,
    },
  });
}

// Test wrapper
function TestWrapper({ children, initialEntries = ['/protected'] }) {
  const store = createTestStore();
  
  return (
    <Provider store={store}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route 
            path="/protected" 
            element={
              <ProtectedRoute>
                {children}
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <div data-testid="dashboard-content">Dashboard</div>
              </ProtectedRoute>
            } 
          />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

// Helper function
function renderWithAuth(children, authValue = {}, routerOptions = {}) {
  // Update mock auth value
  mockAuthValue = { ...mockAuthValue, ...authValue };
  
  const { initialEntries = ['/protected'] } = routerOptions;
  
  return rtlRender(
    <TestWrapper initialEntries={initialEntries}>
      {children}
    </TestWrapper>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockAuthValue = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
      login: jest.fn(),
      logout: jest.fn(),
      updateUser: jest.fn(),
      fetchUserProfile: jest.fn(),
      validateAuth: jest.fn(),
    };
  });

  it('should show loading spinner when isLoading is true', () => {
    renderWithAuth(<TestProtectedContent />, {
      isLoading: true,
      isAuthenticated: false,
    });

    expect(document.querySelector('.loading-container')).toBeInTheDocument();
    expect(document.querySelector('.loading-spinner')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('should redirect to login when not authenticated', async () => {
    renderWithAuth(<TestProtectedContent />, {
      isLoading: false,
      isAuthenticated: false,
    });

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
    
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('should render protected content when authenticated', async () => {
    renderWithAuth(<TestProtectedContent />, {
      isLoading: false,
      isAuthenticated: true,
      user: { id: '1', name: 'Test User' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
    
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('should preserve location state during redirect', async () => {
    renderWithAuth(<TestProtectedContent />, {
      isLoading: false,
      isAuthenticated: false,
    }, { initialEntries: ['/protected'] });

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
    
    expect(screen.getByTestId('login-from-state')).toHaveTextContent('/protected');
  });

  it('should handle different route paths correctly', async () => {
    renderWithAuth(<TestProtectedContent />, {
      isLoading: false,
      isAuthenticated: false,
    }, { initialEntries: ['/dashboard'] });

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
    
    expect(screen.getByTestId('login-from-state')).toHaveTextContent('/dashboard');
  });

  it('should prioritize loading state over authentication', () => {
    renderWithAuth(<TestProtectedContent />, {
      isLoading: true,
      isAuthenticated: true,
      user: { id: '1', name: 'Test User' },
    });

    expect(document.querySelector('.loading-container')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('should handle undefined authentication state', async () => {
    renderWithAuth(<TestProtectedContent />, {
      isLoading: false,
      isAuthenticated: undefined,
    });

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
  });

  it('should handle null children gracefully', async () => {
    renderWithAuth(null, {
      isLoading: false,
      isAuthenticated: true,
      user: { id: '1', name: 'Test User' },
    });

    // Should not crash
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(document.querySelector('.loading-container')).not.toBeInTheDocument();
  });

  it('should render custom content correctly', async () => {
    const customContent = <div data-testid="custom-content">Custom Protected Content</div>;
    
    renderWithAuth(customContent, {
      isLoading: false,
      isAuthenticated: true,
      user: { id: '1', name: 'Test User' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('custom-content')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Custom Protected Content')).toBeInTheDocument();
  });
});
