import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import authUtils from './utils/authUtils';

const AuthContext = createContext(null);

// loadProfile: how the signed-in user is read (the app's API client by
// default; the shared test render passes a stand-in so component tests
// don't see an extra profile request on their mocked client)
export const AuthProvider = ({ children, loadProfile = authUtils.getUserProfile }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Function to fetch user profile
  const fetchUserProfile = useCallback(async () => {
    try {
      // This will throw an error if the authentication cookies are invalid
      const userData = await loadProfile();
      setUser(userData);
      return userData;
    } catch (error) {
      // Not signed in is the usual answer before login
      if (error?.response?.status !== 401) console.error('Error fetching user profile:', error);
      throw error;
    }
  }, [loadProfile]);

  // Function to validate authentication status
  const validateAuth = useCallback(async () => {
    try {
      await fetchUserProfile();
      setIsAuthenticated(true);
      return true;
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Authentication validation failed:', error);
      }
      setIsAuthenticated(false);
      setUser(null);
      return false;
    }
  }, [fetchUserProfile]);

  // Effect to validate authentication on mount
  useEffect(() => {
    const validateAuthAndSetState = async () => {
      setIsLoading(true);
      try {
        await validateAuth();
      } catch (error) {
        console.error('Error during authentication validation:', error);
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    
    validateAuthAndSetState();

    // Listen for auth errors to update state accordingly
    const handleAuthError = () => {
      setIsAuthenticated(false);
      setUser(null);
    };

    window.addEventListener('auth-error', handleAuthError);
    
    return () => {
      window.removeEventListener('auth-error', handleAuthError);
    };
  }, [validateAuth]);

  // Login function
  const login = useCallback(async (credentials) => {
    if (process.env.NODE_ENV !== 'production') {
    }
    try {
      const userData = await authUtils.login(credentials);
      setIsAuthenticated(true);
      setUser(userData);
      return userData;
    } catch (error) {
      console.error('Login error in AuthContext:', error);
      throw error;
    }
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    if (process.env.NODE_ENV !== 'production') {
    }
    try {
      await authUtils.logout();
    } catch (error) {
      console.error('Error during logout:', error);
      // Continue with logout even if the server request fails
    } finally {
      setIsAuthenticated(false);
      setUser(null);
    }
  }, []);

  // Function to update user data
  const updateUser = useCallback((newUserData) => {
    setUser(prevUser => ({ ...prevUser, ...newUserData }));
  }, []);

  // Provide context
  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      isLoading, 
      user, 
      login, 
      logout, 
      updateUser, 
      fetchUserProfile,
      validateAuth 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
