import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from '../axiosInstance';

// Async thunks
export const fetchGifts = createAsyncThunk(
  'giftLibrary/fetchGifts',
  async (params, { rejectWithValue }) => {
    try {
      // Clean up parameters before sending to API
      const cleanParams = {};
      Object.keys(params).forEach(key => {
        const value = params[key];
        if (Array.isArray(value) && value.length > 0) {
          cleanParams[key] = value.join(',');
        } else if (value !== '' && value !== null && value !== undefined) {
          cleanParams[key] = value;
        }
      });

      const queryString = new URLSearchParams(cleanParams).toString();
      const response = await axios.get(`/gift-library/explore?${queryString}`);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch gifts');
    }
  }
);

export const fetchCategories = createAsyncThunk(
  'giftLibrary/fetchCategories',
  async (_, { rejectWithValue }) => {
    try {
      const response = await axios.get('/gift-library/categories');
      return response.data.categories;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch categories');
    }
  }
);

export const fetchTrendingGifts = createAsyncThunk(
  'giftLibrary/fetchTrendingGifts',
  async (params = {}, { rejectWithValue }) => {
    try {
      const queryString = new URLSearchParams(params).toString();
      const response = await axios.get(`/gift-library/trending?${queryString}`);
      return response.data.trendingGifts;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch trending gifts');
    }
  }
);

export const submitFeedback = createAsyncThunk(
  'giftLibrary/submitFeedback',
  async (feedbackData, { rejectWithValue }) => {
    try {
      const response = await axios.post('/gift-library/feedback', feedbackData);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to submit feedback');
    }
  }
);

export const getDiscoveryStatus = createAsyncThunk(
  'giftLibrary/getDiscoveryStatus',
  async (_, { rejectWithValue }) => {
    try {
      const response = await axios.get('/gift-library/discover/status');
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch discovery status');
    }
  }
);

export const triggerDiscovery = createAsyncThunk(
  'giftLibrary/triggerDiscovery',
  async (_, { rejectWithValue }) => {
    try {
      const response = await axios.post('/gift-library/discover/trigger');
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to trigger discovery');
    }
  }
);

export const deleteGift = createAsyncThunk(
  'giftLibrary/deleteGift',
  async (giftId, { rejectWithValue }) => {
    try {
      await axios.delete(`/gift-library/gifts/${giftId}`);
      return giftId;
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete gift');
    }
  }
);

// Slice
const giftLibrarySlice = createSlice({
  name: 'giftLibrary',
  initialState: {
    gifts: [],
    categories: [],
    trendingGifts: [],
    currentSuggestions: [],
    discoveryStatus: null,
    pagination: {
      currentPage: 1,
      totalPages: 1,
      totalItems: 0,
      itemsPerPage: 20
    },
    loading: false,
    error: null,
    feedbackLoading: false,
    feedbackError: null,
    suggestionsLoading: false,
    suggestionsError: null
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearSuggestions: (state) => {
      state.currentSuggestions = [];
      state.suggestionsError = null;
    },
    clearFeedbackError: (state) => {
      state.feedbackError = null;
    },
    removeGift: (state, action) => {
      state.gifts = state.gifts.filter(gift => gift._id !== action.payload);
      state.trendingGifts = state.trendingGifts.filter(gift => gift._id !== action.payload);
    }
  },
  extraReducers: (builder) => {
    // Fetch gifts
    builder
      .addCase(fetchGifts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchGifts.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.pagination.currentPage === 1) {
          state.gifts = action.payload.gifts;
        } else {
          state.gifts = [...state.gifts, ...action.payload.gifts];
        }
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchGifts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // Fetch categories
    builder
      .addCase(fetchCategories.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.loading = false;
        state.categories = action.payload;
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // Fetch trending gifts
    builder
      .addCase(fetchTrendingGifts.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchTrendingGifts.fulfilled, (state, action) => {
        state.loading = false;
        state.trendingGifts = action.payload;
      })
      .addCase(fetchTrendingGifts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // Submit feedback
    builder
      .addCase(submitFeedback.pending, (state) => {
        state.feedbackLoading = true;
        state.feedbackError = null;
      })
      .addCase(submitFeedback.fulfilled, (state, action) => {
        state.feedbackLoading = false;
        // The server answers with the new popularity score only: merge it
        const updatedGift = action.payload.gift;
        state.gifts = state.gifts.map(gift =>
          gift._id === updatedGift._id ? { ...gift, ...updatedGift } : gift
        );
        state.trendingGifts = state.trendingGifts.map(gift =>
          gift._id === updatedGift._id ? { ...gift, ...updatedGift } : gift
        );
      })
      .addCase(submitFeedback.rejected, (state, action) => {
        state.feedbackLoading = false;
        state.feedbackError = action.payload;
      });

    // Get discovery status
    builder
      .addCase(getDiscoveryStatus.pending, (state) => {
        state.loading = true;
      })
      .addCase(getDiscoveryStatus.fulfilled, (state, action) => {
        state.loading = false;
        state.discoveryStatus = action.payload;
      })
      .addCase(getDiscoveryStatus.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // Trigger discovery
    builder
      .addCase(triggerDiscovery.pending, (state) => {
        state.loading = true;
      })
      .addCase(triggerDiscovery.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(triggerDiscovery.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // Delete gift
    builder
      .addCase(deleteGift.pending, (state) => {
        state.loading = true;
      })
      .addCase(deleteGift.fulfilled, (state, action) => {
        state.loading = false;
        state.gifts = state.gifts.filter(gift => gift._id !== action.payload);
        state.trendingGifts = state.trendingGifts.filter(gift => gift._id !== action.payload);
      })
      .addCase(deleteGift.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  }
});

export const { clearError, clearSuggestions, clearFeedbackError, removeGift } = giftLibrarySlice.actions;

export default giftLibrarySlice.reducer;
