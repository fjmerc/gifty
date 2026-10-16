import React from 'react';
import { render, screen, waitFor, act } from '../test-utils';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../AuthContext';
import axios from 'axios';

// The profile is fetched through the app's client (axiosInstance, which
// refreshes an expired session); here it forwards to the mocked axios so
// these tests keep watching one set of calls
jest.mock('../axiosInstance', () => {
  const mockedAxios = require('axios').default;
  return {
    __esModule: true,
    default: { get: (url) => mockedAxios.get(`/api${url}`, { withCredentials: true }) },
  };
});

// Mock user data
const mockUser = {
  id: 'test-user-id',
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  profilePicture: null,
  createdAt: '2023-01-01T00:00:00.000Z',
  updatedAt: '2023-01-01T00:00:00.000Z',
};

// Test component that uses AuthContext
function AuthTestComponent() {
  const {
    isAuthenticated,
    isLoading,
    user,
    login,
    logout,
    updateUser,
    fetchUserProfile,
    validateAuth
  } = useAuth();

  return (
    <div>
      <div data-testid="auth-status">
        {isLoading ? 'loading' : isAuthenticated ? 'authenticated' : 'unauthenticated'}
      </div>
      <div data-testid="user-data">{user ? JSON.stringify(user) : 'no-user'}</div>
      <button
        data-testid="login-button"
        onClick={async () => {
          try {
            await login({ email: 'test@example.com', password: 'password' });
          } catch (error) {
            // Error handled in test
          }
        }}
      >
        Login
      </button>
      <button
        data-testid="login-invalid-button"
        onClick={async () => {
          try {
            await login({ email: 'invalid@example.com', password: 'wrong' });
          } catch (error) {
            // Error handled in test
          }
        }}
      >
        Login Invalid
      </button>
      <button data-testid="logout-button" onClick={logout}>
        Logout
      </button>
      <button
        data-testid="update-user-button"
        onClick={() => updateUser({ firstName: 'Updated' })}
      >
        Update User
      </button>
      <button
        data-testid="fetch-profile-button"
        onClick={async () => {
          try {
            await fetchUserProfile();
          } catch (error) {
            // Error handled in test
          }
        }}
      >
        Fetch Profile
      </button>
      <button
        data-testid="validate-auth-button"
        onClick={validateAuth}
      >
        Validate Auth
      </button>
    </div>
  );
}

describe('AuthContext', () => {
  // Mock axios instance
  const mockAxios = axios;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Default successful responses
    mockAxios.get.mockResolvedValue({ data: mockUser });
    mockAxios.post.mockResolvedValue({ data: mockUser });
  });

  // Helper function to render with fresh AuthProvider
  const renderWithAuthProvider = (component) => {
    return render(
      <AuthProvider>
        {component}
      </AuthProvider>
    );
  };

  describe('Initial State', () => {
    it('should initialize with loading state', async () => {
      renderWithAuthProvider(<AuthTestComponent />);
      
      // Should start in loading state
      expect(screen.getByTestId('auth-status')).toHaveTextContent('loading');
      expect(screen.getByTestId('user-data')).toHaveTextContent('no-user');
    });

    it('should complete initialization and set unauthenticated state when no valid session', async () => {
      // Mock profile fetch to fail (no valid session)
      mockAxios.get.mockRejectedValue({
        response: { status: 401, data: { message: 'Unauthorized' } }
      });

      renderWithAuthProvider(<AuthTestComponent />);
      
      // Wait for initialization to complete
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });
      
      expect(screen.getByTestId('user-data')).toHaveTextContent('no-user');
    });

    it('should complete initialization and set authenticated state when valid session exists', async () => {
      renderWithAuthProvider(<AuthTestComponent />);
      
      // Wait for initialization to complete (should fetch profile and authenticate)
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });
      
      expect(screen.getByTestId('user-data')).toHaveTextContent(JSON.stringify(mockUser));
      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/users/profile'),
        { withCredentials: true }
      );
    });
  });

  describe('Login Functionality', () => {
    it('should login successfully with valid credentials', async () => {
      const user = userEvent.setup();
      
      // Mock profile fetch to fail initially (no session)
      mockAxios.get.mockRejectedValueOnce({
        response: { status: 401, data: { message: 'Unauthorized' } }
      });

      renderWithAuthProvider(<AuthTestComponent />);
      
      // Wait for initialization to complete (unauthenticated)
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      // Mock successful login
      mockAxios.post.mockResolvedValue({ data: mockUser });

      // Perform login
      await act(async () => {
        await user.click(screen.getByTestId('login-button'));
      });

      // Should be authenticated after login
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });
      
      expect(screen.getByTestId('user-data')).toHaveTextContent(JSON.stringify(mockUser));
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/users/login'),
        { email: 'test@example.com', password: 'password' },
        { withCredentials: true }
      );
    });

    it('should handle login failure with invalid credentials', async () => {
      const user = userEvent.setup();
      
      // Mock profile fetch to fail initially (no session)
      mockAxios.get.mockRejectedValue({
        response: { status: 401, data: { message: 'Unauthorized' } }
      });

      renderWithAuthProvider(<AuthTestComponent />);
      
      // Wait for initialization to complete (unauthenticated)
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      // Mock login failure
      mockAxios.post.mockRejectedValue({
        response: { status: 401, data: { message: 'Invalid credentials' } }
      });

      // Attempt login with invalid credentials - errors are caught in button handler
      await act(async () => {
        await user.click(screen.getByTestId('login-invalid-button'));
      });

      // Should remain unauthenticated
      expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      expect(screen.getByTestId('user-data')).toHaveTextContent('no-user');
    });

    it('should handle network errors during login', async () => {
      const user = userEvent.setup();
      
      // Mock profile fetch to fail initially
      mockAxios.get.mockRejectedValue({
        response: { status: 401, data: { message: 'Unauthorized' } }
      });

      renderWithAuthProvider(<AuthTestComponent />);
      
      // Wait for initialization
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      // Mock login to fail with network error
      mockAxios.post.mockRejectedValue({
        response: { status: 500, data: { message: 'Network error' } }
      });

      // Attempt login - errors are caught in button handler
      await act(async () => {
        await user.click(screen.getByTestId('login-button'));
      });

      // Should remain unauthenticated
      expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
    });
  });

  describe('Logout Functionality', () => {
    it('should logout successfully and clear user state', async () => {
      const user = userEvent.setup();
      
      renderWithAuthProvider(<AuthTestComponent />);
      
      // Wait for initialization (should be authenticated)
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });

      // Mock successful logout
      mockAxios.post.mockResolvedValue({ data: { message: 'Logout successful' } });

      // Perform logout
      await act(async () => {
        await user.click(screen.getByTestId('logout-button'));
      });

      // Should be unauthenticated after logout
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });
      
      expect(screen.getByTestId('user-data')).toHaveTextContent('no-user');
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/users/logout'),
        {},
        { withCredentials: true }
      );
    });

    it('should handle logout even when server request fails', async () => {
      const user = userEvent.setup();
      
      renderWithAuthProvider(<AuthTestComponent />);
      
      // Wait for initialization (should be authenticated)
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });

      // Mock logout to fail
      mockAxios.post.mockRejectedValue({
        response: { status: 500, data: { message: 'Server error' } }
      });

      // Perform logout - should still work locally even if server fails
      await act(async () => {
        await user.click(screen.getByTestId('logout-button'));
      });

      // Should be unauthenticated after logout (local state cleared)
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });
      
      expect(screen.getByTestId('user-data')).toHaveTextContent('no-user');
    });
  });

  describe('User Data Management', () => {
    it('should update user data locally', async () => {
      const user = userEvent.setup();
      
      renderWithAuthProvider(<AuthTestComponent />);
      
      // Wait for initialization (should be authenticated)
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });

      // Update user data
      await act(async () => {
        await user.click(screen.getByTestId('update-user-button'));
      });

      // Should see updated user data
      const updatedUser = { ...mockUser, firstName: 'Updated' };
      expect(screen.getByTestId('user-data')).toHaveTextContent(JSON.stringify(updatedUser));
    });

    it('should fetch fresh user profile data', async () => {
      const user = userEvent.setup();
      
      // Mock profile fetch to fail initially
      mockAxios.get.mockRejectedValueOnce({
        response: { status: 401, data: { message: 'Unauthorized' } }
      });

      renderWithAuthProvider(<AuthTestComponent />);
      
      // Wait for initialization (should be unauthenticated)
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      // Mock successful profile fetch
      mockAxios.get.mockResolvedValue({ data: mockUser });

      // Fetch profile
      await act(async () => {
        await user.click(screen.getByTestId('fetch-profile-button'));
      });

      // Should have user data now
      expect(screen.getByTestId('user-data')).toHaveTextContent(JSON.stringify(mockUser));
    });

    it('should handle profile fetch errors gracefully', async () => {
      const user = userEvent.setup();
      
      // Start authenticated
      renderWithAuthProvider(<AuthTestComponent />);
      
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });

      // Mock profile fetch to fail
      mockAxios.get.mockRejectedValue({
        response: { status: 500, data: { message: 'Server error' } }
      });

      // Fetch profile - errors are caught in button handler
      await act(async () => {
        await user.click(screen.getByTestId('fetch-profile-button'));
      });

      // Should still be authenticated (error was handled)
      expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    });
  });

  describe('Auth Validation', () => {
    it('should validate authentication successfully', async () => {
      const user = userEvent.setup();
      
      // Mock profile fetch to fail initially
      mockAxios.get.mockRejectedValueOnce({
        response: { status: 401, data: { message: 'Unauthorized' } }
      });

      renderWithAuthProvider(<AuthTestComponent />);
      
      // Wait for initialization (should be unauthenticated)
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      // Mock successful profile fetch for validation
      mockAxios.get.mockResolvedValue({ data: mockUser });

      // Validate auth
      await act(async () => {
        await user.click(screen.getByTestId('validate-auth-button'));
      });

      // Should be authenticated after validation
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });
      
      expect(screen.getByTestId('user-data')).toHaveTextContent(JSON.stringify(mockUser));
    });

    it('should handle validation failure', async () => {
      const user = userEvent.setup();
      
      renderWithAuthProvider(<AuthTestComponent />);
      
      // Wait for initialization (should be authenticated)
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });

      // Mock profile fetch to fail
      mockAxios.get.mockRejectedValue({
        response: { status: 401, data: { message: 'Unauthorized' } }
      });

      // Validate auth - should fail and clear state
      await act(async () => {
        await user.click(screen.getByTestId('validate-auth-button'));
      });

      // Should be unauthenticated after failed validation
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });
      
      expect(screen.getByTestId('user-data')).toHaveTextContent('no-user');
    });
  });

  describe('Auth Error Event Handling', () => {
    it('should handle auth-error events by clearing state', async () => {
      renderWithAuthProvider(<AuthTestComponent />);
      
      // Wait for initialization (should be authenticated)
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });

      // Dispatch auth-error event
      act(() => {
        window.dispatchEvent(new Event('auth-error'));
      });

      // Should be unauthenticated after auth error
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });
      
      expect(screen.getByTestId('user-data')).toHaveTextContent('no-user');
    });
  });

  describe('Context Provider', () => {
    it('should return null when useAuth is used outside AuthProvider', () => {
      // Mock console.error to prevent error output in test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Create a simple component that uses useAuth to check context
      const TestContextComponent = () => {
        const auth = useAuth();
        return (
          <div data-testid="context-value">
            {auth ? 'has-context' : 'no-context'}
          </div>
        );
      };
      
      // Render without any providers (use rtlRender directly to bypass test-utils)
      const { render: rtlRender } = require('@testing-library/react');
      rtlRender(<TestContextComponent />);
      expect(screen.getByTestId('context-value')).toHaveTextContent('no-context');
      
      consoleSpy.mockRestore();
    });

    it('should provide all required context values', () => {
      renderWithAuthProvider(<AuthTestComponent />);
      
      // All buttons should be rendered (indicating all context values are available)
      expect(screen.getByTestId('login-button')).toBeInTheDocument();
      expect(screen.getByTestId('logout-button')).toBeInTheDocument();
      expect(screen.getByTestId('update-user-button')).toBeInTheDocument();
      expect(screen.getByTestId('fetch-profile-button')).toBeInTheDocument();
      expect(screen.getByTestId('validate-auth-button')).toBeInTheDocument();
    });
  });

  describe('Console Logging', () => {
    it('should not emit console.log noise during authentication', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const user = userEvent.setup();

      // Mock profile fetch to fail initially
      mockAxios.get.mockRejectedValueOnce({
        response: { status: 401, data: { message: 'Unauthorized' } }
      });

      renderWithAuthProvider(<AuthTestComponent />);

      // Wait for initialization
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      // Mock successful login
      mockAxios.post.mockResolvedValue({ data: mockUser });

      await act(async () => {
        await user.click(screen.getByTestId('login-button'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
      });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('API Call Verification', () => {
    it('should make correct API calls with proper parameters', async () => {
      const user = userEvent.setup();
      
      // Mock profile fetch to fail initially
      mockAxios.get.mockRejectedValueOnce({
        response: { status: 401, data: { message: 'Unauthorized' } }
      });

      renderWithAuthProvider(<AuthTestComponent />);
      
      // Wait for initialization
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      });

      // Verify initial profile call was made
      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/users/profile'),
        { withCredentials: true }
      );

      // Mock successful login
      mockAxios.post.mockResolvedValue({ data: mockUser });

      // Perform login
      await act(async () => {
        await user.click(screen.getByTestId('login-button'));
      });

      // Verify login call was made with correct parameters
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/users/login'),
        { email: 'test@example.com', password: 'password' },
        { withCredentials: true }
      );
    });
  });
});
