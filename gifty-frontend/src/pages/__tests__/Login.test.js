import React from 'react';
import { render, screen, fireEvent, waitFor } from '../../test-utils';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from '../js/Login';

// Mock CSS modules
// FontAwesome icons render as a span named after the icon
jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: ({ icon, className, style }) => (
    <span data-testid={`${icon.iconName}-icon`} className={className} style={style} />
  ),
}));

jest.mock('../css/Login.module.css', () => ({
  'login-container': 'login-container',
  'login-form': 'login-form',
  'error-message': 'error-message',
  'password-container': 'password-container',
  'password-toggle': 'password-toggle',
  'submit-button': 'submit-button',
  'form-footer': 'form-footer',
  'forgot-password': 'forgot-password',
  'register-link': 'register-link'
}));

describe('Login Component', () => {
  const mockNavigate = jest.fn();
  const mockLogin = jest.fn();

  // Mock react-router-dom
  jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null })
  }));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render without crashing', () => {
      render(<Login />, {
        routerProps: { initialEntries: ['/login'] },
        authContextValue: {
          login: mockLogin,
          isAuthenticated: false,
          isLoading: false
        }
      });
      
      expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
    });

    it('opens with one page title', () => {
      render(<Login />, {
        routerProps: { initialEntries: ['/login'] },
        authContextValue: { login: mockLogin, isAuthenticated: false, isLoading: false }
      });

      expect(screen.getByRole('heading', { level: 1, name: /sign in/i })).toBeInTheDocument();
    });

    it('should render login form fields', () => {
      render(<Login />, {
        routerProps: { initialEntries: ['/login'] },
        authContextValue: {
          login: mockLogin,
          isAuthenticated: false,
          isLoading: false
        }
      });
      
      expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
    });

    it('should render password toggle button', () => {
      render(<Login />, {
        routerProps: { initialEntries: ['/login'] },
        authContextValue: {
          login: mockLogin,
          isAuthenticated: false,
          isLoading: false
        }
      });
      
      expect(screen.getByRole('button', { name: /show password/i })).toBeInTheDocument();
    });

    it('should render navigation links', () => {
      render(<Login />, {
        routerProps: { initialEntries: ['/login'] },
        authContextValue: {
          login: mockLogin,
          isAuthenticated: false,
          isLoading: false
        }
      });
      
      expect(screen.getByText(/don't have an account/i)).toBeInTheDocument();
    });
  });

  describe('Form Interactions', () => {
    it('should update email field on user input', async () => {
      const user = userEvent.setup();
      render(<Login />, {
        routerProps: { initialEntries: ['/login'] },
        authContextValue: {
          login: mockLogin,
          isAuthenticated: false,
          isLoading: false
        }
      });
      
      const emailInput = screen.getByPlaceholderText(/email/i);
      await user.type(emailInput, 'test@example.com');
      
      expect(emailInput).toHaveValue('test@example.com');
    });

    it('should update password field on user input', async () => {
      const user = userEvent.setup();
      render(<Login />, {
        routerProps: { initialEntries: ['/login'] },
        authContextValue: {
          login: mockLogin,
          isAuthenticated: false,
          isLoading: false
        }
      });
      
      const passwordInput = screen.getByPlaceholderText(/password/i);
      await user.type(passwordInput, 'mypassword');
      
      expect(passwordInput).toHaveValue('mypassword');
    });

    it('should toggle password visibility', async () => {
      const user = userEvent.setup();
      render(<Login />, {
        routerProps: { initialEntries: ['/login'] },
        authContextValue: {
          login: mockLogin,
          isAuthenticated: false,
          isLoading: false
        }
      });
      
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const toggleButton = screen.getByRole('button', { name: /show password/i });
      
      // Initially password should be hidden
      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
      
      // Click toggle to show password
      await user.click(toggleButton);
      
      expect(passwordInput).toHaveAttribute('type', 'text');
      expect(screen.getByTestId('eye-slash-icon')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /hide password/i })).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should show error when submitting empty form', async () => {
      const user = userEvent.setup();
      render(<Login />, {
        routerProps: { initialEntries: ['/login'] },
        authContextValue: {
          login: mockLogin,
          isAuthenticated: false,
          isLoading: false
        }
      });
      
      await user.click(screen.getByRole('button', { name: /login/i }));
      
      await waitFor(() => {
        expect(screen.getByText('Please fill in all fields')).toBeInTheDocument();
      });
      
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('should show error for invalid email format', async () => {
      const user = userEvent.setup();
      render(<Login />, {
        routerProps: { initialEntries: ['/login'] },
        authContextValue: {
          login: mockLogin,
          isAuthenticated: false,
          isLoading: false
        }
      });
      
      await user.type(screen.getByPlaceholderText(/email/i), 'invalid-email');
      await user.type(screen.getByPlaceholderText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /login/i }));
      
      await waitFor(() => {
        expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
      });
      
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('should show error when only email is provided', async () => {
      const user = userEvent.setup();
      render(<Login />, {
        routerProps: { initialEntries: ['/login'] },
        authContextValue: {
          login: mockLogin,
          isAuthenticated: false,
          isLoading: false
        }
      });
      
      await user.type(screen.getByPlaceholderText(/email/i), 'test@example.com');
      await user.click(screen.getByRole('button', { name: /login/i }));
      
      await waitFor(() => {
        expect(screen.getByText('Please fill in all fields')).toBeInTheDocument();
      });
    });

    it('should show error when only password is provided', async () => {
      const user = userEvent.setup();
      render(<Login />, {
        routerProps: { initialEntries: ['/login'] },
        authContextValue: {
          login: mockLogin,
          isAuthenticated: false,
          isLoading: false
        }
      });
      
      await user.type(screen.getByPlaceholderText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /login/i }));
      
      await waitFor(() => {
        expect(screen.getByText('Please fill in all fields')).toBeInTheDocument();
      });
    });
  });

  describe('Authentication Integration', () => {
    it('should submit form with valid credentials', async () => {
      const user = userEvent.setup();
      
      render(<Login />, {
        routerProps: { initialEntries: ['/login'] },
        authContextValue: {
          login: mockLogin,
          isAuthenticated: false,
          isLoading: false
        }
      });
      
      await user.type(screen.getByPlaceholderText(/email/i), 'test@example.com');
      await user.type(screen.getByPlaceholderText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /login/i }));
      
      // Should not show validation errors for valid form
      expect(screen.queryByText('Please fill in all fields')).not.toBeInTheDocument();
      expect(screen.queryByText('Please enter a valid email address')).not.toBeInTheDocument();
    });

    it('should show error message on login failure', async () => {
      const user = userEvent.setup();
      
      render(<Login />, {
        routerProps: { initialEntries: ['/login'] },
        authContextValue: {
          login: mockLogin,
          isAuthenticated: false,
          isLoading: false
        }
      });
      
      await user.type(screen.getByPlaceholderText(/email/i), 'test@example.com');
      await user.type(screen.getByPlaceholderText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /login/i }));
      
      // Should show some error message (from AuthContext mock)
      await waitFor(() => {
        expect(screen.getByText(/an unexpected error occurred/i)).toBeInTheDocument();
      });
    });

    it('should clear error when form is resubmitted', async () => {
      const user = userEvent.setup();
      
      render(<Login />, {
        routerProps: { initialEntries: ['/login'] },
        authContextValue: {
          login: mockLogin,
          isAuthenticated: false,
          isLoading: false
        }
      });
      
      // First submission with validation error
      await user.click(screen.getByRole('button', { name: /login/i }));
      
      await waitFor(() => {
        expect(screen.getByText('Please fill in all fields')).toBeInTheDocument();
      });
      
      // Fill form and submit again
      await user.type(screen.getByPlaceholderText(/email/i), 'test@example.com');
      await user.type(screen.getByPlaceholderText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /login/i }));
      
      // Error should be cleared
      expect(screen.queryByText('Please fill in all fields')).not.toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should not render a forgot password link (no reset flow exists)', () => {
      render(<Login />, {
        routerProps: { initialEntries: ['/login'] },
        authContextValue: {
          login: mockLogin,
          isAuthenticated: false,
          isLoading: false
        }
      });

      expect(screen.queryByText(/forgot password/i)).not.toBeInTheDocument();
    });

    it('should render register link', () => {
      render(<Login />, {
        routerProps: { initialEntries: ['/login'] },
        authContextValue: {
          login: mockLogin,
          isAuthenticated: false,
          isLoading: false
        }
      });
      
      const registerLink = screen.getByText(/don't have an account/i);
      expect(registerLink.closest('a')).toHaveAttribute('href', '/register');
    });
  });

  describe('Accessibility', () => {
    const renderLogin = () => render(<Login />, {
      routerProps: { initialEntries: ['/login'] },
      authContextValue: { login: mockLogin, isAuthenticated: false, isLoading: false }
    });

    it('labels the email and password fields', () => {
      renderLogin();
      const email = screen.getByLabelText('Email');
      const password = screen.getByLabelText('Password');
      expect(email).toHaveAttribute('type', 'email');
      expect(email).toHaveAttribute('autocomplete', 'email');
      expect(password).toHaveAttribute('autocomplete', 'current-password');
    });

    it('announces the sign-in error', async () => {
      const user = userEvent.setup();
      renderLogin();
      await user.click(screen.getByRole('button', { name: /login/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Please fill in all fields');
    });
  });
});
