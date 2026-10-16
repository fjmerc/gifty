import { configureStore } from '@reduxjs/toolkit';
import { store } from '../store';
import { createTestStore } from '../test-utils';
import userReducer, { loginUser } from '../slices/userSlice';
import giftLibraryReducer, { fetchGifts, clearError, removeGift } from '../slices/giftLibrarySlice';

// Mock both axios and axiosInstance that slices use
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    put: jest.fn(() => Promise.resolve({ data: {} })),
    delete: jest.fn(() => Promise.resolve({ data: {} })),
    patch: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));

jest.mock('../axiosInstance', () => ({
  __esModule: true,
  default: {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    put: jest.fn(() => Promise.resolve({ data: {} })),
    delete: jest.fn(() => Promise.resolve({ data: {} })),
    patch: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));

import axios from 'axios';
import axiosInstance from '../axiosInstance';

// Mock data for testing
const mockUser = {
  id: 'test-user-id',
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  profilePicture: null,
};

const mockGift = {
  _id: 'gift-1',
  name: 'Test Gift',
  description: 'A test gift description',
  price: 29.99,
  category: 'electronics',
  imageUrl: 'https://example.com/gift1.jpg',
  popularityScore: 85,
  tags: ['tech', 'gadget'],
};

const mockPagination = {
  currentPage: 1,
  totalPages: 5,
  totalItems: 100,
  itemsPerPage: 20,
};

describe('Redux Store Configuration', () => {
  const mockAxios = axiosInstance;
  const mockAxiosRegular = axios;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('Store Initialization', () => {
    it('should create store with correct initial state structure', () => {
      const state = store.getState();
      
      // Verify store has both slices
      expect(state).toHaveProperty('user');
      expect(state).toHaveProperty('giftLibrary');
      
      // Verify user slice initial state
      expect(state.user).toEqual({
        userInfo: null,
        loading: false,
        error: null,
      });
      
      // Verify giftLibrary slice initial state
      expect(state.giftLibrary).toEqual({
        gifts: [],
        categories: [],
        trendingGifts: [],
        currentSuggestions: [],
        discoveryStatus: null,
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalItems: 0,
          itemsPerPage: 20,
        },
        loading: false,
        error: null,
        feedbackLoading: false,
        feedbackError: null,
        suggestionsLoading: false,
        suggestionsError: null,
      });
    });

    it('should have Redux Toolkit default middleware configured', () => {
      // Store should be created successfully with RTK defaults
      expect(store).toBeDefined();
      expect(typeof store.dispatch).toBe('function');
      expect(typeof store.getState).toBe('function');
      expect(typeof store.subscribe).toBe('function');
    });

    it('should be immutable by default', () => {
      const state1 = store.getState();
      const state2 = store.getState();
      
      // Should return same reference for unchanged state
      expect(state1).toBe(state2);
      
      // Should not allow direct mutation (RTK throws in development)
      expect(() => {
        state1.user.userInfo = mockUser;
      }).toThrow(); // RTK throws when trying to mutate state
      
      // State should remain unchanged
      const state3 = store.getState();
      expect(state3.user.userInfo).toBe(null);
    });
  });

  describe('Reducer Integration', () => {
    it('should integrate user reducer correctly', async () => {
      const testStore = createTestStore();
      
      // Mock successful login (userSlice uses regular axios)
      mockAxiosRegular.post.mockResolvedValue({ data: mockUser });
      
      // Dispatch user action
      await testStore.dispatch(loginUser({ email: 'test@example.com', password: 'password' }));
      
      const state = testStore.getState();
      
      // User state should be updated
      expect(state.user.userInfo).toEqual(mockUser);
      expect(state.user.loading).toBe(false);
      expect(state.user.error).toBe(null);
      
      // Gift library state should remain unchanged
      expect(state.giftLibrary.gifts).toEqual([]);
      expect(state.giftLibrary.loading).toBe(false);
    });

    it('should integrate giftLibrary reducer correctly', async () => {
      const testStore = createTestStore();
      
      // Mock successful gifts fetch
      mockAxios.get.mockResolvedValue({ 
        data: { gifts: [mockGift], pagination: mockPagination } 
      });
      
      // Dispatch gift library action
      await testStore.dispatch(fetchGifts({ category: 'electronics' }));
      
      const state = testStore.getState();
      
      // Gift library state should be updated
      expect(state.giftLibrary.gifts).toEqual([mockGift]);
      expect(state.giftLibrary.pagination).toEqual(mockPagination);
      expect(state.giftLibrary.loading).toBe(false);
      
      // User state should remain unchanged
      expect(state.user.userInfo).toBe(null);
      expect(state.user.loading).toBe(false);
    });

    it('should handle actions in correct reducers', () => {
      const testStore = createTestStore();
      
      // Dispatch giftLibrary sync action
      testStore.dispatch(clearError());
      
      const state1 = testStore.getState();
      expect(state1.giftLibrary.error).toBe(null);
      expect(state1.user.error).toBe(null); // User error should remain unchanged
      
      // Add some error to giftLibrary to test clearError
      testStore.dispatch(removeGift('nonexistent-gift')); // This won't cause error but tests action routing
      
      const state2 = testStore.getState();
      expect(state2.giftLibrary.gifts).toEqual([]); // Should process removeGift action
      expect(state2.user.userInfo).toBe(null); // User state unchanged
    });
  });

  describe('Cross-Slice Independence', () => {
    it('should maintain state independence between slices', async () => {
      const testStore = createTestStore();
      
      // Set up initial states
      mockAxiosRegular.post.mockResolvedValue({ data: mockUser });
      mockAxios.get.mockResolvedValue({ 
        data: { gifts: [mockGift], pagination: mockPagination } 
      });
      
      // Dispatch actions to both slices
      await testStore.dispatch(loginUser({ email: 'test@example.com', password: 'password' }));
      await testStore.dispatch(fetchGifts({ category: 'electronics' }));
      
      const state = testStore.getState();
      
      // Both slices should have their own independent state
      expect(state.user.userInfo).toEqual(mockUser);
      expect(state.giftLibrary.gifts).toEqual([mockGift]);
      
      // Verify no cross-contamination
      expect(state.user).not.toHaveProperty('gifts');
      expect(state.giftLibrary).not.toHaveProperty('userInfo');
    });

    it('should handle errors independently in each slice', async () => {
      const testStore = createTestStore();
      
      // Make user login fail
      mockAxiosRegular.post.mockRejectedValue(new Error('Login failed'));
      await testStore.dispatch(loginUser({ email: 'invalid@example.com', password: 'wrong' }));
      
      // Make gift fetch succeed
      mockAxios.get.mockResolvedValue({ 
        data: { gifts: [mockGift], pagination: mockPagination } 
      });
      await testStore.dispatch(fetchGifts({ category: 'electronics' }));
      
      const state = testStore.getState();
      
      // User should have error, gift library should not
      expect(state.user.error).toBe('Login failed');
      expect(state.user.userInfo).toBe(null);
      expect(state.giftLibrary.error).toBe(null);
      expect(state.giftLibrary.gifts).toEqual([mockGift]);
    });

    it('should handle loading states independently', () => {
      const testStore = createTestStore();
      
      // Start user login (will be pending)
      testStore.dispatch(loginUser({ email: 'test@example.com', password: 'password' }));
      
      const state1 = testStore.getState();
      expect(state1.user.loading).toBe(true);
      expect(state1.giftLibrary.loading).toBe(false);
      
      // Start gift fetch (will be pending)
      testStore.dispatch(fetchGifts({ category: 'electronics' }));
      
      const state2 = testStore.getState();
      expect(state2.user.loading).toBe(true);
      expect(state2.giftLibrary.loading).toBe(true);
    });
  });

  describe('Preloaded State Support', () => {
    it('should accept preloaded state correctly', () => {
      const preloadedState = {
        user: {
          userInfo: mockUser,
          loading: false,
          error: null,
        },
        giftLibrary: {
          gifts: [mockGift],
          categories: [],
          trendingGifts: [],
          currentSuggestions: [],
          discoveryStatus: null,
          pagination: mockPagination,
          loading: false,
          error: null,
          feedbackLoading: false,
          feedbackError: null,
          suggestionsLoading: false,
          suggestionsError: null,
        },
      };
      
      const testStore = createTestStore(preloadedState);
      const state = testStore.getState();
      
      expect(state.user.userInfo).toEqual(mockUser);
      expect(state.giftLibrary.gifts).toEqual([mockGift]);
      expect(state.giftLibrary.pagination).toEqual(mockPagination);
    });

    it('should handle partial preloaded state', () => {
      const partialPreloadedState = {
        user: {
          userInfo: mockUser,
          loading: true,
          error: 'Some error',
        },
        // giftLibrary will use default initial state
      };
      
      const testStore = createTestStore(partialPreloadedState);
      const state = testStore.getState();
      
      // User state should use preloaded values
      expect(state.user.userInfo).toEqual(mockUser);
      expect(state.user.loading).toBe(true);
      expect(state.user.error).toBe('Some error');
      
      // Gift library should use default initial state
      expect(state.giftLibrary.gifts).toEqual([]);
      expect(state.giftLibrary.loading).toBe(false);
      expect(state.giftLibrary.error).toBe(null);
    });

    it('should handle empty preloaded state', () => {
      const testStore = createTestStore({});
      const state = testStore.getState();
      
      // Should match the default store state
      const defaultStore = createTestStore();
      const defaultState = defaultStore.getState();
      
      expect(state).toEqual(defaultState);
    });
  });

  describe('Test Utilities Integration', () => {
    it('should work with createTestStore from test-utils', () => {
      const testStore = createTestStore();
      
      // Should have same structure as main store
      expect(testStore.getState()).toEqual(store.getState());
      
      // Should be functional
      expect(typeof testStore.dispatch).toBe('function');
      expect(typeof testStore.getState).toBe('function');
      expect(typeof testStore.subscribe).toBe('function');
    });

    it('should match store configuration exactly', () => {
      const testStore = configureStore({
        reducer: {
          user: userReducer,
          giftLibrary: giftLibraryReducer,
        },
      });
      
      // State structure should match main store
      expect(testStore.getState()).toEqual(store.getState());
      
      // Should have same reducer behavior
      testStore.dispatch(clearError());
      const mainStore = configureStore({
        reducer: {
          user: userReducer,
          giftLibrary: giftLibraryReducer,
        },
      });
      mainStore.dispatch(clearError());
      
      expect(testStore.getState()).toEqual(mainStore.getState());
    });

    it('should support store replacement in test environment', () => {
      const customInitialState = {
        user: { userInfo: mockUser, loading: false, error: null },
        giftLibrary: {
          gifts: [mockGift],
          categories: [],
          trendingGifts: [],
          currentSuggestions: [],
          discoveryStatus: null,
          pagination: { currentPage: 1, totalPages: 1, totalItems: 0, itemsPerPage: 20 },
          loading: false,
          error: null,
          feedbackLoading: false,
          feedbackError: null,
          suggestionsLoading: false,
          suggestionsError: null,
        },
      };
      
      const customStore = createTestStore(customInitialState);
      const state = customStore.getState();
      
      expect(state.user.userInfo).toEqual(mockUser);
      expect(state.giftLibrary.gifts).toEqual([mockGift]);
    });
  });

  describe('Store Persistence and Consistency', () => {
    it('should maintain state consistency across multiple operations', async () => {
      const testStore = createTestStore();
      
      // Perform multiple operations
      mockAxiosRegular.post.mockResolvedValueOnce({ data: mockUser });
      await testStore.dispatch(loginUser({ email: 'test@example.com', password: 'password' }));
      
      mockAxios.get.mockResolvedValueOnce({ 
        data: { gifts: [mockGift], pagination: mockPagination } 
      });
      await testStore.dispatch(fetchGifts({ category: 'electronics' }));
      
      testStore.dispatch(clearError());
      
      const finalState = testStore.getState();
      
      // All operations should be reflected correctly
      expect(finalState.user.userInfo).toEqual(mockUser);
      expect(finalState.giftLibrary.gifts).toEqual([mockGift]);
      expect(finalState.giftLibrary.error).toBe(null);
    });

    it('should handle store state snapshots correctly', () => {
      const testStore = createTestStore();
      
      const snapshot1 = testStore.getState();
      
      // Modify state with an action that actually changes something
      testStore.dispatch(removeGift('some-id')); // This will create a new state even if removing nonexistent gift
      
      const snapshot2 = testStore.getState();
      
      // Snapshots should be different references (removeGift always creates new state)
      expect(snapshot1).not.toBe(snapshot2);
      expect(snapshot1.giftLibrary.gifts).toEqual(snapshot2.giftLibrary.gifts); // Both should be empty arrays
    });

    it('should support state time-travel debugging', () => {
      const testStore = createTestStore();
      const states = [];
      
      // Collect state snapshots
      states.push(JSON.parse(JSON.stringify(testStore.getState())));
      
      testStore.dispatch(clearError());
      states.push(JSON.parse(JSON.stringify(testStore.getState())));
      
      testStore.dispatch(removeGift('some-id'));
      states.push(JSON.parse(JSON.stringify(testStore.getState())));
      
      // Should have captured state evolution
      expect(states).toHaveLength(3);
      expect(states[0].giftLibrary.error).toBe(null);
      expect(states[1].giftLibrary.error).toBe(null);
      expect(states[2].giftLibrary.gifts).toEqual([]);
    });
  });
});
