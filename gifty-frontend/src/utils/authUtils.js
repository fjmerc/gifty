/**
 * Authorization utilities for handling cookie-based authentication
 */
import axios from 'axios';
import { getApiBaseUrl } from './apiBaseUrl';
import axiosInstance from '../axiosInstance';

/**
 * Handles authentication with secure cookie-based approach
 */
const authUtils = {
  /**
   * Login user
   * @param {Object} credentials - User credentials (email, password)
   * @returns {Promise<Object>} User data from server
   */
  async login(credentials) {
    try {
      const response = await axios.post(
        `${getApiBaseUrl()}/users/login`,
        credentials,
        { withCredentials: true } // Important: needed to accept cookies
      );
      
      return response.data;
    } catch (error) {
      console.error('Login error:', error.response?.data || error.message);
      throw error;
    }
  },
  
  /**
   * Register new user
   * @param {Object} userData - New user data
   * @returns {Promise<Object>} Created user data
   */
  async register(userData) {
    try {
      const response = await axios.post(
        `${getApiBaseUrl()}/users/register`,
        userData,
        { withCredentials: true }
      );
      
      return response.data;
    } catch (error) {
      console.error('Registration error:', error.response?.data || error.message);
      throw error;
    }
  },
  
  /**
   * Logout user by clearing cookies
   * @returns {Promise<Object>} Logout status
   */
  async logout() {
    try {
      const response = await axios.post(
        `${getApiBaseUrl()}/users/logout`,
        {},
        { withCredentials: true }
      );
      
      return response.data;
    } catch (error) {
      console.error('Logout error:', error.response?.data || error.message);
      // Continue with local logout even if server request failed
    }
  },
  
  /**
   * Refresh access token using refresh token cookie
   * @returns {Promise<boolean>} True if successfully refreshed
   */
  async refreshToken() {
    try {
      await axios.post(
        `${getApiBaseUrl()}/users/refresh-token`,
        {},
        { withCredentials: true }
      );
      
      return true;
    } catch (error) {
      console.error('Token refresh error:', error.response?.data || error.message);
      return false;
    }
  },
  
  /**
   * Get user profile data
   * @returns {Promise<Object>} User profile data
   */
  async getUserProfile() {
    try {
      // Through the app's client, so an expired access cookie is refreshed
      const response = await axiosInstance.get('/users/profile');
      
      return response.data;
    } catch (error) {
      // Not signed in is the usual answer before login: no console noise
      if (error.response?.status !== 401) console.error('Get profile error:', error.response?.data || error.message);
      throw error;
    }
  }
};

export default authUtils;
