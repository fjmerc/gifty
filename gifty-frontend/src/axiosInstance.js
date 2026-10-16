import axios from 'axios';
import { getApiBaseUrl } from './utils/apiBaseUrl';

const axiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true, // Important: Allow credentials (cookies) to be sent
});

// The access cookie lasts an hour; once the browser drops it the server
// answers 401 NO_TOKEN (or TOKEN_EXPIRED). One refresh with the 7-day
// refresh cookie is tried, shared by every request that is waiting for it.
// SESSION_REVOKED (signed out elsewhere, password changed) is never refreshed.
const REFRESHABLE = new Set(['NO_TOKEN', 'TOKEN_EXPIRED']);
const REFRESH_URL = '/users/refresh-token';
let refreshing = null;

const refreshSession = () => {
  if (!refreshing) {
    refreshing = axiosInstance.post(REFRESH_URL, {}, { _noRefresh: true })
      .then(() => true, () => false)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
};

// Add a request interceptor
axiosInstance.interceptors.request.use(
  (config) => {
    // Log requests for debugging

    // Set default Content-Type if not already set and not FormData
    if (!config.headers['Content-Type'] && !(config.data instanceof FormData)) {
      config.headers['Content-Type'] = 'application/json';
    }
    
    // No need to manually add Authorization header anymore, 
    // as cookies are automatically sent with withCredentials: true
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle errors
axiosInstance.interceptors.response.use(
  (response) => {
    // Log responses for debugging
    return response;
  },
  async (error) => {
    // Get config and response information
    const originalRequest = error.config;
    
    // Not signed in yet (or the access cookie expired) is expected, not an error
    const expectedSignedOut = error.response?.status === 401
      && (error.response.data?.code === 'NO_TOKEN' || originalRequest?._noRefresh);
    if (process.env.NODE_ENV !== 'production' && !expectedSignedOut) {
      // Log errors for debugging
      console.error('API Error:', {
        url: originalRequest?.url,
        method: originalRequest?.method,
        status: error.response?.status,
        message: error.message,
        response: error.response?.data,
      });
    }
    
    // Signed out because the access cookie is gone or expired: refresh once
    const isRefreshCall = originalRequest?._noRefresh || originalRequest?.url === REFRESH_URL;
    if (error.response?.status === 401 && REFRESHABLE.has(error.response.data?.code)
        && originalRequest && !originalRequest._retry && !isRefreshCall) {
      originalRequest._retry = true;
      if (await refreshSession()) {
        return axiosInstance(originalRequest);
      }
      window.dispatchEvent(new CustomEvent('auth-error', { detail: { message: 'Session expired' } }));
      return Promise.reject(error);
    }

    // The refresh call's own 401 ends quietly (its caller signs out)
    if (isRefreshCall) return Promise.reject(error);

    // Handle other 401 errors (not token expiry)
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      // Possible unauthorized access, trigger auth error event
      window.dispatchEvent(new CustomEvent('auth-error', { detail: { message: 'Authentication required' } }));
    }
    
    return Promise.reject(error);
  }
);

export default axiosInstance;
