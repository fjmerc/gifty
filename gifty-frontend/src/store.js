// src/store.js
import { configureStore } from '@reduxjs/toolkit';
import userReducer from './slices/userSlice';
import giftLibraryReducer from './slices/giftLibrarySlice';

export const store = configureStore({
  reducer: {
    user: userReducer,
    giftLibrary: giftLibraryReducer,
  },
});
