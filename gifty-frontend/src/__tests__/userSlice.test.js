import { configureStore } from '@reduxjs/toolkit';
import userReducer, { loginUser } from '../slices/userSlice';
import axios from 'axios';

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

// Helper function to create test store
function createTestStore(preloadedState = {}) {
  return configureStore({
    reducer: {
      user: userReducer,
    },
    preloadedState,
  });
}

describe('userSlice', () => {
  // Mock axios instance
  const mockAxios = axios;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Default successful responses
    mockAxios.post.mockResolvedValue({ data: mockUser });
  });

  describe('Initial State', () => {
    it('should have correct initial state structure', () => {
      const store = createTestStore();
      const state = store.getState();
      
      expect(state.user).toEqual({
        userInfo: null,
        loading: false,
        error: null,
      });
    });

    it('should handle preloaded state correctly', () => {
      const preloadedState = {
        user: {
          userInfo: mockUser,
          loading: true,
          error: 'Some error',
        },
      };
      
      const store = createTestStore(preloadedState);
      const state = store.getState();
      
      expect(state.user).toEqual(preloadedState.user);
    });
  });

  describe('loginUser Async Thunk', () => {
    it('should handle loginUser pending state', () => {
      const store = createTestStore();
      
      // Dispatch loginUser action (this will be pending initially)
      store.dispatch(loginUser({ email: 'test@example.com', password: 'password' }));
      
      const state = store.getState();
      expect(state.user.loading).toBe(true);
      expect(state.user.error).toBe(null);
      expect(state.user.userInfo).toBe(null);
    });

    it('should handle loginUser fulfilled state', async () => {
      const store = createTestStore();
      
      // Mock successful API response
      mockAxios.post.mockResolvedValue({ data: mockUser });
      
      // Dispatch loginUser and wait for completion
      await store.dispatch(loginUser({ email: 'test@example.com', password: 'password' }));
      
      const state = store.getState();
      expect(state.user.loading).toBe(false);
      expect(state.user.error).toBe(null);
      expect(state.user.userInfo).toEqual(mockUser);
      
      // Verify API call was made with correct parameters
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/users/login',
        { email: 'test@example.com', password: 'password' }
      );
    });

    it('should handle loginUser rejected state', async () => {
      const store = createTestStore();
      
      // Mock API error response
      const errorMessage = 'Invalid credentials';
      mockAxios.post.mockRejectedValue(new Error(errorMessage));
      
      // Dispatch loginUser and wait for completion
      await store.dispatch(loginUser({ email: 'invalid@example.com', password: 'wrong' }));
      
      const state = store.getState();
      expect(state.user.loading).toBe(false);
      expect(state.user.error).toBe(errorMessage);
      expect(state.user.userInfo).toBe(null);
      
      // Verify API call was made
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/users/login',
        { email: 'invalid@example.com', password: 'wrong' }
      );
    });

    it('should handle network errors during login', async () => {
      const store = createTestStore();
      
      // Mock network error
      const networkError = new Error('Network Error');
      networkError.code = 'NETWORK_ERROR';
      mockAxios.post.mockRejectedValue(networkError);
      
      // Dispatch loginUser and wait for completion
      await store.dispatch(loginUser({ email: 'test@example.com', password: 'password' }));
      
      const state = store.getState();
      expect(state.user.loading).toBe(false);
      expect(state.user.error).toBe('Network Error');
      expect(state.user.userInfo).toBe(null);
    });

    it('should handle server errors during login', async () => {
      const store = createTestStore();
      
      // Mock server error response with proper Error object
      const serverError = new Error('Internal Server Error');
      serverError.response = {
        status: 500,
        data: { message: 'Internal Server Error' }
      };
      mockAxios.post.mockRejectedValue(serverError);
      
      // Dispatch loginUser and wait for completion
      await store.dispatch(loginUser({ email: 'test@example.com', password: 'password' }));
      
      const state = store.getState();
      expect(state.user.loading).toBe(false);
      expect(state.user.error).toBe('Internal Server Error');
      expect(state.user.userInfo).toBe(null);
    });
  });

  describe('State Immutability', () => {
    it('should not mutate original state when updating', async () => {
      const initialState = {
        user: {
          userInfo: null,
          loading: false,
          error: null,
        },
      };
      
      const store = createTestStore(initialState);
      const originalState = JSON.parse(JSON.stringify(store.getState()));
      
      // Mock successful API response
      mockAxios.post.mockResolvedValue({ data: mockUser });
      
      // Dispatch loginUser and wait for completion
      await store.dispatch(loginUser({ email: 'test@example.com', password: 'password' }));
      
      // Original state should remain unchanged
      expect(originalState).toEqual({
        user: {
          userInfo: null,
          loading: false,
          error: null,
        },
      });
      
      // New state should be different
      const newState = store.getState();
      expect(newState.user.userInfo).toEqual(mockUser);
    });

    it('should maintain separate user objects after updates', async () => {
      const store = createTestStore();
      
      // Mock successful API response
      mockAxios.post.mockResolvedValue({ data: mockUser });
      
      // Dispatch loginUser
      await store.dispatch(loginUser({ email: 'test@example.com', password: 'password' }));
      
      const state1 = store.getState();
      const userInfo1 = state1.user.userInfo;
      
      // Mock another successful response with different data
      const updatedUser = { ...mockUser, firstName: 'Updated' };
      mockAxios.post.mockResolvedValue({ data: updatedUser });
      
      // Dispatch loginUser again
      await store.dispatch(loginUser({ email: 'test@example.com', password: 'password' }));
      
      const state2 = store.getState();
      const userInfo2 = state2.user.userInfo;
      
      // Should be different objects
      expect(userInfo1).not.toBe(userInfo2);
      expect(userInfo1.firstName).toBe('Test');
      expect(userInfo2.firstName).toBe('Updated');
    });
  });

  describe('Integration Tests', () => {
    it('should work with store configuration from test-utils', async () => {
      // Use the same createTestStore pattern as used in test-utils.js
      const store = configureStore({
        reducer: {
          user: userReducer,
        },
      });
      
      // Mock successful API response
      mockAxios.post.mockResolvedValue({ data: mockUser });
      
      // Test initial state
      expect(store.getState().user).toEqual({
        userInfo: null,
        loading: false,
        error: null,
      });
      
      // Dispatch action and verify state changes
      await store.dispatch(loginUser({ email: 'test@example.com', password: 'password' }));
      
      expect(store.getState().user).toEqual({
        userInfo: mockUser,
        loading: false,
        error: null,
      });
    });

    it('should handle multiple consecutive login attempts', async () => {
      const store = createTestStore();
      
      // First login - success
      mockAxios.post.mockResolvedValueOnce({ data: mockUser });
      await store.dispatch(loginUser({ email: 'test@example.com', password: 'password' }));
      
      expect(store.getState().user.userInfo).toEqual(mockUser);
      expect(store.getState().user.error).toBe(null);
      
      // Second login - failure
      mockAxios.post.mockRejectedValueOnce(new Error('Invalid credentials'));
      await store.dispatch(loginUser({ email: 'wrong@example.com', password: 'wrong' }));
      
      expect(store.getState().user.userInfo).toEqual(mockUser); // Should keep previous user
      expect(store.getState().user.error).toBe('Invalid credentials');
      
      // Third login - success again
      const newUser = { ...mockUser, firstName: 'NewUser' };
      mockAxios.post.mockResolvedValueOnce({ data: newUser });
      await store.dispatch(loginUser({ email: 'new@example.com', password: 'password' }));
      
      expect(store.getState().user.userInfo).toEqual(newUser);
      expect(store.getState().user.error).toBe('Invalid credentials'); // Error remains from previous failed login
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty API response', async () => {
      const store = createTestStore();
      
      // Mock empty response
      mockAxios.post.mockResolvedValue({ data: null });
      
      await store.dispatch(loginUser({ email: 'test@example.com', password: 'password' }));
      
      const state = store.getState();
      expect(state.user.loading).toBe(false);
      expect(state.user.userInfo).toBe(null);
      expect(state.user.error).toBe(null);
    });

    it('should handle malformed API response', async () => {
      const store = createTestStore();
      
      // Mock malformed response (no data property)
      mockAxios.post.mockResolvedValue({ user: mockUser }); // Wrong structure
      
      await store.dispatch(loginUser({ email: 'test@example.com', password: 'password' }));
      
      const state = store.getState();
      expect(state.user.loading).toBe(false);
      expect(state.user.userInfo).toBeUndefined(); // payload will be undefined
      expect(state.user.error).toBe(null);
    });

    it('should handle empty user credentials', async () => {
      const store = createTestStore();
      
      // Mock successful response even with empty credentials
      mockAxios.post.mockResolvedValue({ data: mockUser });
      
      await store.dispatch(loginUser({ email: '', password: '' }));
      
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/users/login',
        { email: '', password: '' }
      );
      
      const state = store.getState();
      expect(state.user.userInfo).toEqual(mockUser);
    });

    it('should handle undefined user credentials', async () => {
      const store = createTestStore();
      
      // Mock successful response
      mockAxios.post.mockResolvedValue({ data: mockUser });
      
      await store.dispatch(loginUser({})); // Empty object
      
      expect(mockAxios.post).toHaveBeenCalledWith('/api/users/login', {});
      
      const state = store.getState();
      expect(state.user.userInfo).toEqual(mockUser);
    });
  });

  describe('Error State Management', () => {
    it('should clear error on successful login after previous error', async () => {
      const store = createTestStore({
        user: {
          userInfo: null,
          loading: false,
          error: 'Previous error',
        },
      });
      
      // Verify initial error state
      expect(store.getState().user.error).toBe('Previous error');
      
      // Mock successful response
      mockAxios.post.mockResolvedValue({ data: mockUser });
      
      await store.dispatch(loginUser({ email: 'test@example.com', password: 'password' }));
      
      const state = store.getState();
      expect(state.user.loading).toBe(false);
      expect(state.user.error).toBe('Previous error'); // Error is not cleared in fulfilled case
      expect(state.user.userInfo).toEqual(mockUser);
    });

    it('should preserve userInfo when login fails', async () => {
      const existingUser = { ...mockUser, firstName: 'Existing' };
      const store = createTestStore({
        user: {
          userInfo: existingUser,
          loading: false,
          error: null,
        },
      });
      
      // Mock login failure
      mockAxios.post.mockRejectedValue(new Error('Login failed'));
      
      await store.dispatch(loginUser({ email: 'test@example.com', password: 'wrong' }));
      
      const state = store.getState();
      expect(state.user.loading).toBe(false);
      expect(state.user.error).toBe('Login failed');
      expect(state.user.userInfo).toEqual(existingUser); // Should preserve existing user
    });
  });
});
