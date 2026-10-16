import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';

const SessionTimeout = () => {
  const navigate = useNavigate();
  const timeoutRef = useRef(null);
  const { logout } = useAuth();

  const handleUserActivity = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      // Use the AuthContext logout function to properly update auth state
      logout();
      // Then navigate to login page
      navigate('/login');
    }, 30 * 60 * 1000); // 30 minutes
  }, [navigate, logout]);

  useEffect(() => {
    // Add event listeners for user activity
    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keypress', handleUserActivity);

    // Initialize the timer when the component mounts
    handleUserActivity();

    return () => {
      // Clean up event listeners and timeout on component unmount
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keypress', handleUserActivity);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [handleUserActivity]);

  return null;
};

export default SessionTimeout;
