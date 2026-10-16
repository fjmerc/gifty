import { configureStore } from '@reduxjs/toolkit';
import giftLibraryReducer, {
  fetchGifts,
  fetchCategories,
  fetchTrendingGifts,
  submitFeedback,
  getDiscoveryStatus,
  triggerDiscovery,
  deleteGift,
  clearError,
  clearSuggestions,
  clearFeedbackError,
  removeGift,
} from '../slices/giftLibrarySlice';
// Mock the axios instance that giftLibrarySlice actually uses
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

import axiosInstance from '../axiosInstance';

// Mock gift data
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

const mockGift2 = {
  _id: 'gift-2',
  name: 'Another Gift',
  description: 'Another test gift',
  price: 49.99,
  category: 'books',
  imageUrl: 'https://example.com/gift2.jpg',
  popularityScore: 75,
  tags: ['reading', 'education'],
};

const mockCategories = [
  { _id: 'cat-1', name: 'Electronics', count: 150 },
  { _id: 'cat-2', name: 'Books', count: 200 },
  { _id: 'cat-3', name: 'Home & Garden', count: 100 },
];

const mockPagination = {
  currentPage: 1,
  totalPages: 5,
  totalItems: 100,
  itemsPerPage: 20,
};

const mockSuggestions = [
  { ...mockGift, suggestion_reason: 'Based on user preferences' },
  { ...mockGift2, suggestion_reason: 'Popular among similar users' },
];

const mockDiscoveryStatus = {
  isRunning: false,
  lastRun: '2024-01-01T00:00:00.000Z',
  nextScheduled: '2024-01-02T00:00:00.000Z',
  status: 'completed',
};

// Helper function to create test store
function createTestStore(preloadedState = {}) {
  return configureStore({
    reducer: {
      giftLibrary: giftLibraryReducer,
    },
    preloadedState,
  });
}

describe('giftLibrarySlice', () => {
  // Mock axios instance
  const mockAxios = axiosInstance;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state structure', () => {
      const store = createTestStore();
      const state = store.getState();
      
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

    it('should handle preloaded state correctly', () => {
      const preloadedState = {
        giftLibrary: {
          gifts: [mockGift],
          categories: mockCategories,
          trendingGifts: [mockGift2],
          currentSuggestions: mockSuggestions,
          discoveryStatus: mockDiscoveryStatus,
          pagination: mockPagination,
          loading: true,
          error: 'Some error',
          feedbackLoading: true,
          feedbackError: 'Feedback error',
          suggestionsLoading: true,
          suggestionsError: 'Suggestions error',
        },
      };
      
      const store = createTestStore(preloadedState);
      const state = store.getState();
      
      expect(state.giftLibrary).toEqual(preloadedState.giftLibrary);
    });
  });

  describe('Sync Reducers', () => {
    it('should clear error when clearError action is dispatched', () => {
      const store = createTestStore({
        giftLibrary: {
          gifts: [],
          categories: [],
          trendingGifts: [],
          currentSuggestions: [],
          discoveryStatus: null,
          pagination: { currentPage: 1, totalPages: 1, totalItems: 0, itemsPerPage: 20 },
          loading: false,
          error: 'Some error message',
          feedbackLoading: false,
          feedbackError: null,
          suggestionsLoading: false,
          suggestionsError: null,
        },
      });

      store.dispatch(clearError());
      
      const state = store.getState();
      expect(state.giftLibrary.error).toBe(null);
    });

    it('should clear suggestions when clearSuggestions action is dispatched', () => {
      const store = createTestStore({
        giftLibrary: {
          gifts: [],
          categories: [],
          trendingGifts: [],
          currentSuggestions: mockSuggestions,
          discoveryStatus: null,
          pagination: { currentPage: 1, totalPages: 1, totalItems: 0, itemsPerPage: 20 },
          loading: false,
          error: null,
          feedbackLoading: false,
          feedbackError: null,
          suggestionsLoading: false,
          suggestionsError: 'Some suggestions error',
        },
      });

      store.dispatch(clearSuggestions());
      
      const state = store.getState();
      expect(state.giftLibrary.currentSuggestions).toEqual([]);
      expect(state.giftLibrary.suggestionsError).toBe(null);
    });

    it('should clear feedback error when clearFeedbackError action is dispatched', () => {
      const store = createTestStore({
        giftLibrary: {
          gifts: [],
          categories: [],
          trendingGifts: [],
          currentSuggestions: [],
          discoveryStatus: null,
          pagination: { currentPage: 1, totalPages: 1, totalItems: 0, itemsPerPage: 20 },
          loading: false,
          error: null,
          feedbackLoading: false,
          feedbackError: 'Feedback error message',
          suggestionsLoading: false,
          suggestionsError: null,
        },
      });

      store.dispatch(clearFeedbackError());
      
      const state = store.getState();
      expect(state.giftLibrary.feedbackError).toBe(null);
    });

    it('should remove gift when removeGift action is dispatched', () => {
      const store = createTestStore({
        giftLibrary: {
          gifts: [mockGift, mockGift2],
          categories: [],
          trendingGifts: [mockGift, mockGift2],
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
      });

      store.dispatch(removeGift('gift-1'));
      
      const state = store.getState();
      expect(state.giftLibrary.gifts).toEqual([mockGift2]);
      expect(state.giftLibrary.trendingGifts).toEqual([mockGift2]);
    });
  });

  describe('fetchGifts Async Thunk', () => {
    it('should handle fetchGifts pending state', () => {
      const store = createTestStore();
      
      // Dispatch fetchGifts action (this will be pending initially)
      store.dispatch(fetchGifts({ category: 'electronics', page: 1 }));
      
      const state = store.getState();
      expect(state.giftLibrary.loading).toBe(true);
      expect(state.giftLibrary.error).toBe(null);
    });

    it('should handle fetchGifts fulfilled state - first page', async () => {
      const store = createTestStore();
      
      // Mock successful API response
      const mockResponse = {
        gifts: [mockGift, mockGift2],
        pagination: mockPagination,
      };
      mockAxios.get.mockResolvedValue({ data: mockResponse });
      
      // Dispatch fetchGifts and wait for completion
      await store.dispatch(fetchGifts({ category: 'electronics', page: 1 }));
      
      const state = store.getState();
      expect(state.giftLibrary.loading).toBe(false);
      expect(state.giftLibrary.error).toBe(null);
      expect(state.giftLibrary.gifts).toEqual([mockGift, mockGift2]);
      expect(state.giftLibrary.pagination).toEqual(mockPagination);
      
      // Verify API call was made with correct parameters
      expect(mockAxios.get).toHaveBeenCalledWith('/gift-library/explore?category=electronics&page=1');
    });

    it('should handle fetchGifts fulfilled state - pagination (append)', async () => {
      const initialGifts = [mockGift];
      const store = createTestStore({
        giftLibrary: {
          gifts: initialGifts,
          categories: [],
          trendingGifts: [],
          currentSuggestions: [],
          discoveryStatus: null,
          pagination: { currentPage: 1, totalPages: 5, totalItems: 100, itemsPerPage: 20 },
          loading: false,
          error: null,
          feedbackLoading: false,
          feedbackError: null,
          suggestionsLoading: false,
          suggestionsError: null,
        },
      });
      
      // Mock successful API response for page 2
      const mockResponse = {
        gifts: [mockGift2],
        pagination: { currentPage: 2, totalPages: 5, totalItems: 100, itemsPerPage: 20 },
      };
      mockAxios.get.mockResolvedValue({ data: mockResponse });
      
      // Dispatch fetchGifts for page 2
      await store.dispatch(fetchGifts({ category: 'electronics', page: 2 }));
      
      const state = store.getState();
      expect(state.giftLibrary.loading).toBe(false);
      expect(state.giftLibrary.error).toBe(null);
      expect(state.giftLibrary.gifts).toEqual([mockGift, mockGift2]); // Should append
      expect(state.giftLibrary.pagination.currentPage).toBe(2);
    });

    it('should handle fetchGifts rejected state', async () => {
      const store = createTestStore();
      
      // Mock API error response
      const errorMessage = 'Failed to fetch gifts';
      mockAxios.get.mockRejectedValue({
        response: { data: { message: errorMessage } }
      });
      
      // Dispatch fetchGifts and wait for completion
      await store.dispatch(fetchGifts({ category: 'electronics' }));
      
      const state = store.getState();
      expect(state.giftLibrary.loading).toBe(false);
      expect(state.giftLibrary.error).toBe(errorMessage);
      expect(state.giftLibrary.gifts).toEqual([]);
    });

    it('should filter empty parameters before API call', async () => {
      const store = createTestStore();
      
      const mockResponse = {
        gifts: [mockGift],
        pagination: mockPagination,
      };
      mockAxios.get.mockResolvedValue({ data: mockResponse });
      
      // Dispatch with empty/null parameters
      await store.dispatch(fetchGifts({ 
        category: 'electronics', 
        priceRange: '', 
        recipients: [],
        tags: ['tech', 'gadget'],
        nullParam: null,
        undefinedParam: undefined 
      }));
      
      // Should only include non-empty parameters (recipients=[] becomes recipients=&)
      expect(mockAxios.get).toHaveBeenCalledWith('/gift-library/explore?category=electronics&recipients=&tags=tech%2Cgadget');
    });
  });

  describe('fetchCategories Async Thunk', () => {
    it('should handle fetchCategories pending state', () => {
      const store = createTestStore();
      
      store.dispatch(fetchCategories());
      
      const state = store.getState();
      expect(state.giftLibrary.loading).toBe(true);
    });

    it('should handle fetchCategories fulfilled state', async () => {
      const store = createTestStore();
      
      mockAxios.get.mockResolvedValue({ data: { categories: mockCategories } });
      
      await store.dispatch(fetchCategories());
      
      const state = store.getState();
      expect(state.giftLibrary.loading).toBe(false);
      expect(state.giftLibrary.categories).toEqual(mockCategories);
      expect(mockAxios.get).toHaveBeenCalledWith('/gift-library/categories');
    });

    it('should handle fetchCategories rejected state', async () => {
      const store = createTestStore();
      
      const errorMessage = 'Failed to fetch categories';
      mockAxios.get.mockRejectedValue({
        response: { data: { message: errorMessage } }
      });
      
      await store.dispatch(fetchCategories());
      
      const state = store.getState();
      expect(state.giftLibrary.loading).toBe(false);
      expect(state.giftLibrary.error).toBe(errorMessage);
    });
  });

  describe('fetchTrendingGifts Async Thunk', () => {
    it('should handle fetchTrendingGifts fulfilled state', async () => {
      const store = createTestStore();
      
      mockAxios.get.mockResolvedValue({ data: { trendingGifts: [mockGift, mockGift2] } });
      
      await store.dispatch(fetchTrendingGifts({ limit: 10 }));
      
      const state = store.getState();
      expect(state.giftLibrary.loading).toBe(false);
      expect(state.giftLibrary.trendingGifts).toEqual([mockGift, mockGift2]);
      expect(mockAxios.get).toHaveBeenCalledWith('/gift-library/trending?limit=10');
    });

    it('should handle fetchTrendingGifts with empty params', async () => {
      const store = createTestStore();
      
      mockAxios.get.mockResolvedValue({ data: { trendingGifts: [] } });
      
      await store.dispatch(fetchTrendingGifts());
      
      expect(mockAxios.get).toHaveBeenCalledWith('/gift-library/trending?');
    });
  });

  describe('submitFeedback Async Thunk', () => {
    it('should handle submitFeedback pending state', () => {
      const store = createTestStore();
      
      store.dispatch(submitFeedback({ giftId: 'gift-1', rating: 5 }));
      
      const state = store.getState();
      expect(state.giftLibrary.feedbackLoading).toBe(true);
      expect(state.giftLibrary.feedbackError).toBe(null);
    });

    it('should handle submitFeedback fulfilled state and update gift', async () => {
      const store = createTestStore({
        giftLibrary: {
          gifts: [mockGift, mockGift2],
          categories: [],
          trendingGifts: [mockGift],
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
      });
      
      const updatedGift = { ...mockGift, popularityScore: 90 };
      mockAxios.post.mockResolvedValue({ data: { gift: updatedGift } });
      
      await store.dispatch(submitFeedback({ giftId: 'gift-1', rating: 5 }));
      
      const state = store.getState();
      expect(state.giftLibrary.feedbackLoading).toBe(false);
      expect(state.giftLibrary.gifts[0]).toEqual(updatedGift);
      expect(state.giftLibrary.trendingGifts[0]).toEqual(updatedGift);
    });
  });

  describe('getDiscoveryStatus Async Thunk', () => {
    it('should handle getDiscoveryStatus fulfilled state', async () => {
      const store = createTestStore();
      
      mockAxios.get.mockResolvedValue({ data: mockDiscoveryStatus });
      
      await store.dispatch(getDiscoveryStatus());
      
      const state = store.getState();
      expect(state.giftLibrary.loading).toBe(false);
      expect(state.giftLibrary.discoveryStatus).toEqual(mockDiscoveryStatus);
      expect(mockAxios.get).toHaveBeenCalledWith('/gift-library/discover/status');
    });
  });

  describe('triggerDiscovery Async Thunk', () => {
    it('should handle triggerDiscovery fulfilled state', async () => {
      const store = createTestStore();
      
      mockAxios.post.mockResolvedValue({ data: { message: 'Discovery triggered' } });
      
      await store.dispatch(triggerDiscovery());
      
      const state = store.getState();
      expect(state.giftLibrary.loading).toBe(false);
      expect(mockAxios.post).toHaveBeenCalledWith('/gift-library/discover/trigger');
    });
  });

  describe('deleteGift Async Thunk', () => {
    it('should handle deleteGift fulfilled state', async () => {
      const store = createTestStore({
        giftLibrary: {
          gifts: [mockGift, mockGift2],
          categories: [],
          trendingGifts: [mockGift, mockGift2],
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
      });
      
      mockAxios.delete.mockResolvedValue({});
      
      await store.dispatch(deleteGift('gift-1'));
      
      const state = store.getState();
      expect(state.giftLibrary.loading).toBe(false);
      expect(state.giftLibrary.gifts).toEqual([mockGift2]);
      expect(state.giftLibrary.trendingGifts).toEqual([mockGift2]);
      expect(mockAxios.delete).toHaveBeenCalledWith('/gift-library/gifts/gift-1');
    });

    it('should handle deleteGift rejected state', async () => {
      const store = createTestStore();
      
      const errorMessage = 'Failed to delete gift';
      mockAxios.delete.mockRejectedValue({
        response: { data: { message: errorMessage } }
      });
      
      await store.dispatch(deleteGift('gift-1'));
      
      const state = store.getState();
      expect(state.giftLibrary.loading).toBe(false);
      expect(state.giftLibrary.error).toBe(errorMessage);
    });
  });

  describe('State Immutability', () => {
    it('should not mutate original state when updating', async () => {
      const initialState = {
        giftLibrary: {
          gifts: [],
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
      
      const store = createTestStore(initialState);
      const originalState = JSON.parse(JSON.stringify(store.getState()));
      
      // Mock successful API response
      mockAxios.get.mockResolvedValue({ 
        data: { gifts: [mockGift], pagination: mockPagination } 
      });
      
      // Dispatch fetchGifts and wait for completion
      await store.dispatch(fetchGifts({ category: 'electronics' }));
      
      // Original state should remain unchanged
      expect(originalState.giftLibrary.gifts).toEqual([]);
      
      // New state should be different
      const newState = store.getState();
      expect(newState.giftLibrary.gifts).toEqual([mockGift]);
    });
  });

  describe('Integration Tests', () => {
    it('should work with store configuration', async () => {
      const store = configureStore({
        reducer: {
          giftLibrary: giftLibraryReducer,
        },
      });
      
      // Test initial state
      expect(store.getState().giftLibrary.gifts).toEqual([]);
      
      // Mock successful response
      mockAxios.get.mockResolvedValue({ 
        data: { gifts: [mockGift], pagination: mockPagination } 
      });
      
      // Dispatch action and verify state changes
      await store.dispatch(fetchGifts({ category: 'electronics' }));
      
      expect(store.getState().giftLibrary.gifts).toEqual([mockGift]);
      expect(store.getState().giftLibrary.loading).toBe(false);
    });

    it('should handle multiple consecutive operations', async () => {
      const store = createTestStore();
      
      // First - fetch gifts
      mockAxios.get.mockResolvedValueOnce({ 
        data: { gifts: [mockGift], pagination: mockPagination } 
      });
      await store.dispatch(fetchGifts({ category: 'electronics' }));
      
      expect(store.getState().giftLibrary.gifts).toEqual([mockGift]);
      
      // Second - submit feedback
      const updatedGift = { ...mockGift, popularityScore: 90 };
      mockAxios.post.mockResolvedValueOnce({ data: { gift: updatedGift } });
      await store.dispatch(submitFeedback({ giftId: 'gift-1', rating: 5 }));
      
      expect(store.getState().giftLibrary.gifts[0]).toEqual(updatedGift);
      
      // Third - delete gift
      mockAxios.delete.mockResolvedValueOnce({});
      await store.dispatch(deleteGift('gift-1'));
      
      expect(store.getState().giftLibrary.gifts).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty API response for fetchGifts', async () => {
      const store = createTestStore();
      
      mockAxios.get.mockResolvedValue({ data: { gifts: [], pagination: mockPagination } });
      
      await store.dispatch(fetchGifts({ category: 'electronics' }));
      
      const state = store.getState();
      expect(state.giftLibrary.loading).toBe(false);
      expect(state.giftLibrary.gifts).toEqual([]);
      expect(state.giftLibrary.error).toBe(null);
    });

    it('should handle network errors', async () => {
      const store = createTestStore();
      
      const networkError = new Error('Network Error');
      mockAxios.get.mockRejectedValue(networkError);
      
      await store.dispatch(fetchGifts({ category: 'electronics' }));
      
      const state = store.getState();
      expect(state.giftLibrary.loading).toBe(false);
      expect(state.giftLibrary.error).toBe('Failed to fetch gifts');
    });

    it('should handle malformed API response', async () => {
      const store = createTestStore();
      
      // Mock malformed response (no gifts property but has pagination)
      mockAxios.get.mockResolvedValue({ 
        data: { 
          items: [mockGift],
          pagination: mockPagination 
        } 
      });
      
      await store.dispatch(fetchGifts({ category: 'electronics' }));
      
      const state = store.getState();
      expect(state.giftLibrary.loading).toBe(false);
      expect(state.giftLibrary.gifts).toBeUndefined();
      expect(state.giftLibrary.pagination).toEqual(mockPagination);
    });
  });

  describe('Error State Management', () => {
    it('should clear error on successful fetch after previous error', async () => {
      const store = createTestStore({
        giftLibrary: {
          gifts: [],
          categories: [],
          trendingGifts: [],
          currentSuggestions: [],
          discoveryStatus: null,
          pagination: { currentPage: 1, totalPages: 1, totalItems: 0, itemsPerPage: 20 },
          loading: false,
          error: 'Previous error',
          feedbackLoading: false,
          feedbackError: null,
          suggestionsLoading: false,
          suggestionsError: null,
        },
      });
      
      // Verify initial error state
      expect(store.getState().giftLibrary.error).toBe('Previous error');
      
      // Mock successful response
      mockAxios.get.mockResolvedValue({ 
        data: { gifts: [mockGift], pagination: mockPagination } 
      });
      
      await store.dispatch(fetchGifts({ category: 'electronics' }));
      
      const state = store.getState();
      expect(state.giftLibrary.loading).toBe(false);
      expect(state.giftLibrary.error).toBe(null);
      expect(state.giftLibrary.gifts).toEqual([mockGift]);
    });

    it('should preserve gifts when subsequent operations fail', async () => {
      const store = createTestStore({
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
      });
      
      // Mock failed categories fetch
      mockAxios.get.mockRejectedValue({
        response: { data: { message: 'Categories fetch failed' } }
      });
      
      await store.dispatch(fetchCategories());
      
      const state = store.getState();
      expect(state.giftLibrary.loading).toBe(false);
      expect(state.giftLibrary.error).toBe('Categories fetch failed');
      expect(state.giftLibrary.gifts).toEqual([mockGift]); // Should preserve existing gifts
    });
  });

  // The server answers feedback with the new score only
  test('feedback merges the new popularity into the gift shown, keeping the rest', () => {
    const shown = { _id: 'g1', name: 'Lamp', popularityScore: 10, categories: ['Home'] };
    const start = giftLibraryReducer(undefined, { type: '@@init' });
    const state = giftLibraryReducer({ ...start, gifts: [shown], trendingGifts: [shown] }, {
      type: submitFeedback.fulfilled.type,
      payload: { message: 'ok', gift: { _id: 'g1', popularityScore: 12 } }
    });
    expect(state.gifts[0]).toEqual({ ...shown, popularityScore: 12 });
    expect(state.trendingGifts[0]).toEqual({ ...shown, popularityScore: 12 });
  });
});
