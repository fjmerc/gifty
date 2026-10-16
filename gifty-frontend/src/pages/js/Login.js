import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import styles from '../css/Login.module.css';
import { useAuth } from '../../AuthContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    // Only redirect if authenticated and not in loading state
    if (isAuthenticated && !isLoading) {
      const { from } = location.state || { from: { pathname: '/userhome' } };
      navigate(from);
    }
  }, [isAuthenticated, isLoading, navigate, location]);

  const validateForm = () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address');
      return false;
    }
    return true;
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');

    if (!validateForm()) return;

    try {
      await login({ email, password });
      // Navigation will happen automatically via the useEffect
    } catch (error) {
      console.error('Error logging in:', error);
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        if (error.response.data && error.response.data.message) {
          setError(error.response.data.message);
        } else if (error.response.status === 401) {
          setError('Invalid email or password');
        } else {
          setError('An error occurred. Please try again later.');
        }
      } else if (error.request) {
        // The request was made but no response was received
        setError('Unable to connect to the server. Please try again later.');
      } else {
        // Something happened in setting up the request that triggered an Error
        setError('An unexpected error occurred. Please try again.');
      }
    }
  };

  return (
    <div className={styles['login-container']}>
      <form className={styles['login-form']} onSubmit={handleLogin} aria-labelledby="login-title">
        <h1 id="login-title" className={styles.title}>Sign in to Gifty</h1>
        {error && <p className={styles['error-message']} role="alert">{error}</p>}
        <label htmlFor="login-email" className="sr-only">Email</label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        <div className={styles['password-container']}>
          <label htmlFor="login-password" className="sr-only">Password</label>
          <input
            id="login-password"
            autoComplete="current-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
          />
          <button
            type="button"
            className={styles['password-toggle']}
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <FontAwesomeIcon icon={faEyeSlash} /> : <FontAwesomeIcon icon={faEye} />}
          </button>
        </div>
        <button type="submit" className={styles['submit-button']}>Login</button>
        <div className={styles['form-footer']}>
          <Link to="/register" className={styles['register-link']}>
            Don't have an account? Sign up
          </Link>
        </div>
      </form>
    </div>
  );
};

export default Login;
