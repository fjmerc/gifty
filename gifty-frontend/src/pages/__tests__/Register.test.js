import React from 'react';
import { render, screen, fireEvent, waitFor } from '../../test-utils';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Register from '../js/Register';
import RegisterForm from '../../components/js/RegisterForm';

// Mock axiosInstance to avoid API calls in tests
jest.mock('../../axiosInstance', () => ({
  post: jest.fn(),
  get: jest.fn(),
}));

// Mock CSS modules
jest.mock('../css/Register.module.css', () => ({
  'register-container': 'register-container',
  'register-form': 'register-form',
  'error-message': 'error-message',
  'form-box': 'form-box',
  'submit-button': 'submit-button',
  'login-link': 'login-link'
}));

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>
}));

// The form itself (fields, validation, the API call) is RegisterForm; on
// /register it goes to sign-in after a registration
const Form = () => <RegisterForm onRegistered={() => mockNavigate('/login')} />;

describe('Register Component', () => {
  it('uses plain labelled inputs with autocomplete hints (no MUI)', () => {
    const { container } = render(<Form />, { routerProps: { initialEntries: ['/register'] } });
    expect(container.querySelector('[class*="Mui"]')).toBeNull();
    expect(screen.getByLabelText('Username')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Confirm Password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('First Name')).toHaveAttribute('autocomplete', 'given-name');
    expect(screen.getByLabelText('Last Name')).toHaveAttribute('autocomplete', 'family-name');
    expect(screen.getByLabelText('Date of Birth')).toHaveAttribute('type', 'date');
  });


  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render without crashing', () => {
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Create Account');
      expect(screen.getByLabelText('Username')).toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });

    it('should render all required form fields', () => {
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      expect(screen.getByLabelText('Username')).toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
      expect(screen.getByLabelText('First Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Last Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Date of Birth')).toBeInTheDocument();
    });

    it('should render submit button', () => {
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    });

    it('should render login link', () => {
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      const loginLink = screen.getByText(/already have an account/i);
      expect(loginLink.closest('a')).toHaveAttribute('href', '/login');
    });

    it('should not show error message initially', () => {
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    });
  });

  describe('Form Interactions', () => {
    it('should update username field on user input', async () => {
      const user = userEvent.setup();
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      const usernameInput = screen.getByLabelText('Username');
      await user.type(usernameInput, 'testuser');
      
      expect(usernameInput).toHaveValue('testuser');
    });

    it('should update email field on user input', async () => {
      const user = userEvent.setup();
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      const emailInput = screen.getByLabelText('Email');
      await user.type(emailInput, 'test@example.com');
      
      expect(emailInput).toHaveValue('test@example.com');
    });

    it('should update password fields on user input', async () => {
      const user = userEvent.setup();
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      const passwordInput = screen.getByLabelText('Password');
      const confirmPasswordInput = screen.getByLabelText('Confirm Password');
      
      await user.type(passwordInput, 'password123');
      await user.type(confirmPasswordInput, 'password123');
      
      expect(passwordInput).toHaveValue('password123');
      expect(confirmPasswordInput).toHaveValue('password123');
    });

    it('should update name fields on user input', async () => {
      const user = userEvent.setup();
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      const firstNameInput = screen.getByLabelText('First Name');
      const lastNameInput = screen.getByLabelText('Last Name');
      
      await user.type(firstNameInput, 'John');
      await user.type(lastNameInput, 'Doe');
      
      expect(firstNameInput).toHaveValue('John');
      expect(lastNameInput).toHaveValue('Doe');
    });

    it('should update date of birth field on user input', async () => {
      const user = userEvent.setup();
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      const dobInput = screen.getByLabelText('Date of Birth');
      await user.type(dobInput, '1990-01-01');
      
      expect(dobInput).toHaveValue('1990-01-01');
    });
  });

  describe('Form Validation', () => {
    it('should show error when passwords do not match', async () => {
      const user = userEvent.setup();
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      // Fill all fields with valid data except confirm password
      await user.type(screen.getByLabelText('Username'), 'testuser');
      await user.type(screen.getByLabelText('Email'), 'test@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.type(screen.getByLabelText('Confirm Password'), 'differentpassword');
      await user.type(screen.getByLabelText('First Name'), 'John');
      await user.type(screen.getByLabelText('Last Name'), 'Doe');
      await user.type(screen.getByLabelText('Date of Birth'), '1990-01-01');
      
      await user.click(screen.getByRole('button', { name: /create account/i }));
      
      await waitFor(() => {
        expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
      });
    });

    it('should clear error when form is resubmitted with valid data', async () => {
      const user = userEvent.setup();
      
      // Mock successful registration for second submission
      const axiosInstance = require('../../axiosInstance');
      axiosInstance.post.mockResolvedValueOnce({
        data: { message: 'Registration successful' }
      });
      
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      // First submission with password mismatch
      await user.type(screen.getByLabelText('Username'), 'testuser');
      await user.type(screen.getByLabelText('Email'), 'test@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.type(screen.getByLabelText('Confirm Password'), 'differentpassword');
      await user.type(screen.getByLabelText('First Name'), 'John');
      await user.type(screen.getByLabelText('Last Name'), 'Doe');
      await user.type(screen.getByLabelText('Date of Birth'), '1990-01-01');
      
      await user.click(screen.getByRole('button', { name: /create account/i }));
      
      await waitFor(() => {
        expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
      });
      
      // Fix password and resubmit
      await user.clear(screen.getByLabelText('Confirm Password'));
      await user.type(screen.getByLabelText('Confirm Password'), 'password123');
      await user.click(screen.getByRole('button', { name: /create account/i }));
      
      // Error should be cleared after valid submission
      await waitFor(() => {
        expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument();
      });
    });
  });

  describe('API Integration', () => {
    it('should handle successful registration', async () => {
      const user = userEvent.setup();
      
      // Mock successful registration response
      const axiosInstance = require('../../axiosInstance');
      axiosInstance.post.mockResolvedValueOnce({
        data: { message: 'Registration successful' }
      });
      
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      // Fill form with valid data
      await user.type(screen.getByLabelText('Username'), 'testuser');
      await user.type(screen.getByLabelText('Email'), 'test@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.type(screen.getByLabelText('Confirm Password'), 'password123');
      await user.type(screen.getByLabelText('First Name'), 'John');
      await user.type(screen.getByLabelText('Last Name'), 'Doe');
      await user.type(screen.getByLabelText('Date of Birth'), '1990-01-01');
      
      await user.click(screen.getByRole('button', { name: /create account/i }));
      
      await waitFor(() => {
        expect(axiosInstance.post).toHaveBeenCalledWith('/users/register', {
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123',
          confirmPassword: 'password123',
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: '1990-01-01'
        });
      });
      
      // Should navigate to login page on success
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/login');
      });
    });

    it('should handle registration error with response message', async () => {
      const user = userEvent.setup();
      
      // Mock registration error with response
      const axiosInstance = require('../../axiosInstance');
      axiosInstance.post.mockRejectedValueOnce({
        response: {
          data: { message: 'Username already exists' }
        }
      });
      
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      // Fill form with valid data
      await user.type(screen.getByLabelText('Username'), 'existinguser');
      await user.type(screen.getByLabelText('Email'), 'test@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.type(screen.getByLabelText('Confirm Password'), 'password123');
      await user.type(screen.getByLabelText('First Name'), 'John');
      await user.type(screen.getByLabelText('Last Name'), 'Doe');
      await user.type(screen.getByLabelText('Date of Birth'), '1990-01-01');
      
      await user.click(screen.getByRole('button', { name: /create account/i }));
      
      await waitFor(() => {
        expect(screen.getByText('Username already exists')).toBeInTheDocument();
      });
      
      // Should not navigate on error
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should handle registration error without response message', async () => {
      const user = userEvent.setup();
      
      // Mock registration error without response
      const axiosInstance = require('../../axiosInstance');
      axiosInstance.post.mockRejectedValueOnce(new Error('Network error'));
      
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      // Fill form with valid data
      await user.type(screen.getByLabelText('Username'), 'testuser');
      await user.type(screen.getByLabelText('Email'), 'test@example.com');
      await user.type(screen.getByLabelText('Password'), 'password123');
      await user.type(screen.getByLabelText('Confirm Password'), 'password123');
      await user.type(screen.getByLabelText('First Name'), 'John');
      await user.type(screen.getByLabelText('Last Name'), 'Doe');
      await user.type(screen.getByLabelText('Date of Birth'), '1990-01-01');
      
      await user.click(screen.getByRole('button', { name: /create account/i }));
      
      await waitFor(() => {
        expect(screen.getByText('An error occurred during registration. Please try again.')).toBeInTheDocument();
      });
      
      // Should not navigate on error
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should make API call with correct data format', async () => {
      const user = userEvent.setup();
      
      // Mock successful registration response
      const axiosInstance = require('../../axiosInstance');
      axiosInstance.post.mockResolvedValueOnce({
        data: { message: 'Registration successful' }
      });
      
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      // Fill form
      await user.type(screen.getByLabelText('Username'), 'newuser');
      await user.type(screen.getByLabelText('Email'), 'newuser@example.com');
      await user.type(screen.getByLabelText('Password'), 'securepassword');
      await user.type(screen.getByLabelText('Confirm Password'), 'securepassword');
      await user.type(screen.getByLabelText('First Name'), 'Jane');
      await user.type(screen.getByLabelText('Last Name'), 'Smith');
      await user.type(screen.getByLabelText('Date of Birth'), '1985-05-15');
      
      await user.click(screen.getByRole('button', { name: /create account/i }));
      
      // Verify API call structure
      await waitFor(() => {
        expect(axiosInstance.post).toHaveBeenCalledWith('/users/register', {
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'securepassword',
          confirmPassword: 'securepassword',
          firstName: 'Jane',
          lastName: 'Smith',
          dateOfBirth: '1985-05-15'
        });
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle form submission with empty fields gracefully', async () => {
      const user = userEvent.setup();
      
      // Mock registration error for empty fields
      const axiosInstance = require('../../axiosInstance');
      axiosInstance.post.mockRejectedValueOnce({
        response: {
          data: { message: 'All fields are required' }
        }
      });
      
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      // Submit without filling any fields
      await user.click(screen.getByRole('button', { name: /create account/i }));
      
      await waitFor(() => {
        expect(screen.getByText('All fields are required')).toBeInTheDocument();
      });
    });

    it('should handle special characters in form fields', async () => {
      const user = userEvent.setup();
      
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      // Test special characters in name fields
      await user.type(screen.getByLabelText('First Name'), "O'Connor");
      await user.type(screen.getByLabelText('Last Name'), 'van der Berg');
      await user.type(screen.getByLabelText('Username'), 'user.name_123');
      
      expect(screen.getByLabelText('First Name')).toHaveValue("O'Connor");
      expect(screen.getByLabelText('Last Name')).toHaveValue('van der Berg');
      expect(screen.getByLabelText('Username')).toHaveValue('user.name_123');
    });

    it('should handle long input values', async () => {
      const user = userEvent.setup();
      
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      const longString = 'a'.repeat(100);
      await user.type(screen.getByLabelText('Username'), longString);
      
      expect(screen.getByLabelText('Username')).toHaveValue(longString);
    });
  });

  describe('Accessibility', () => {
    it('should have proper form structure for screen readers', () => {
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      // All input fields should have proper labels via placeholder
      expect(screen.getByLabelText('Username')).toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
      expect(screen.getByLabelText('First Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Last Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Date of Birth')).toBeInTheDocument();
    });

    it('should mark required fields appropriately', () => {
      render(<Form />, {
        routerProps: { initialEntries: ['/register'] }
      });
      
      // All fields should be marked as required
      expect(screen.getByLabelText('Username')).toHaveAttribute('required');
      expect(screen.getByLabelText('Email')).toHaveAttribute('required');
      expect(screen.getByLabelText('Password')).toHaveAttribute('required');
      expect(screen.getByLabelText('Confirm Password')).toHaveAttribute('required');
      expect(screen.getByLabelText('First Name')).toHaveAttribute('required');
      expect(screen.getByLabelText('Last Name')).toHaveAttribute('required');
      expect(screen.getByLabelText('Date of Birth')).toHaveAttribute('required');
    });
  });

  // A fresh instance: the first account needs the setup code from the server
  describe('First-run setup code', () => {
    const axiosInstance = require('../../axiosInstance');
    const fill = async (user) => {
      await user.type(screen.getByLabelText('Username'), 'owner');
      await user.type(screen.getByLabelText('Email'), 'owner@example.com');
      await user.type(screen.getByLabelText('Password'), 'Passw0rd!x');
      await user.type(screen.getByLabelText('Confirm Password'), 'Passw0rd!x');
      await user.type(screen.getByLabelText('First Name'), 'Own');
      await user.type(screen.getByLabelText('Last Name'), 'Er');
    };

    // A fresh instance's first account is made in the setup wizard, which
    // passes setupRequired; /register itself redirects there (below)
    const SetupForm = () => <RegisterForm setupRequired onRegistered={() => mockNavigate('/login')} />;

    it('shows a Setup code field only while the instance has no accounts', async () => {
      render(<SetupForm />, { routerProps: { initialEntries: ['/setup'] } });

      const field = await screen.findByLabelText('Setup code');
      expect(field).toBeRequired();
      expect(field).toHaveAttribute('autocomplete', 'off');
    });

    it('has no Setup code field once accounts exist', () => {
      render(<Form />, { routerProps: { initialEntries: ['/register'] } });
      expect(screen.queryByLabelText('Setup code')).not.toBeInTheDocument();
    });

    it('sends the code with the registration', async () => {
      const user = userEvent.setup();
      axiosInstance.post.mockResolvedValueOnce({ data: {} });
      render(<SetupForm />, { routerProps: { initialEntries: ['/setup'] } });
      await fill(user);
      await user.type(await screen.findByLabelText('Setup code'), 'ABCD-EFGH-JKMN-PQRS');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => expect(axiosInstance.post).toHaveBeenCalledWith('/users/register', expect.objectContaining({
        username: 'owner', setupCode: 'ABCD-EFGH-JKMN-PQRS'
      })));
    });

    it('shows a wrong code next to the Setup code field', async () => {
      const user = userEvent.setup();
      const message = 'Enter the setup code from the server log or from setup-code.txt in the data folder';
      axiosInstance.post.mockRejectedValueOnce({ response: { status: 400, data: { message, errors: [{ field: 'setupCode', message }] } } });
      render(<SetupForm />, { routerProps: { initialEntries: ['/setup'] } });
      await fill(user);
      await user.type(await screen.findByLabelText('Setup code'), 'WRONG');
      await user.click(screen.getByRole('button', { name: /create account/i }));

      const field = screen.getByLabelText('Setup code');
      await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
      expect(document.getElementById(field.getAttribute('aria-describedby'))).toHaveTextContent(message);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('shows the Setup code field when the server asks for a code the page did not know about', async () => {
      const user = userEvent.setup();
      const message = 'Enter the setup code from the server log or from setup-code.txt in the data folder';
      axiosInstance.post
        .mockRejectedValueOnce({ response: { status: 400, data: { message, errors: [{ field: 'setupCode', message }] } } })
        .mockResolvedValueOnce({ data: {} });
      render(<Form />, { routerProps: { initialEntries: ['/register'] } });
      await fill(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      const field = await screen.findByLabelText('Setup code');
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(document.getElementById(field.getAttribute('aria-describedby'))).toHaveTextContent(message);
      await waitFor(() => expect(field).toHaveFocus());

      // The rest of the form is kept: only the code is typed in
      await user.type(field, 'ABCD-EFGH-JKMN-PQRS');
      await user.click(screen.getByRole('button', { name: /create account/i }));
      await waitFor(() => expect(axiosInstance.post).toHaveBeenLastCalledWith('/users/register', expect.objectContaining({
        username: 'owner', email: 'owner@example.com', setupCode: 'ABCD-EFGH-JKMN-PQRS'
      })));
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  describe('the /register page', () => {
    const axiosInstance = require('../../axiosInstance');

    it('an open instance shows the form', async () => {
      axiosInstance.get.mockResolvedValue({ data: { setupRequired: false, signupMode: 'open' } });
      render(<Register />, { routerProps: { initialEntries: ['/register'] } });
      expect(await screen.findByLabelText('Username')).toBeInTheDocument();
      expect(axiosInstance.get).toHaveBeenCalledWith('/instance');
    });

    it('an invite-only instance explains how to join and shows no form', async () => {
      axiosInstance.get.mockResolvedValue({ data: { setupRequired: false, signupMode: 'invite-only' } });
      render(<Register />, { routerProps: { initialEntries: ['/register'] } });
      expect(await screen.findByText('This Gifty is invite-only. Ask someone who uses it for an invite link.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /create account/i })).toBeNull();
    });

    it('a fresh instance sends the first visitor to the setup wizard', async () => {
      axiosInstance.get.mockResolvedValue({ data: { setupRequired: true, signupMode: 'invite-only' } });
      render(<Register />, { routerProps: { initialEntries: ['/register'] } });
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/setup', { replace: true }));
    });

    it('shows the form when the instance info is unavailable (the server still decides)', async () => {
      axiosInstance.get.mockRejectedValue(new Error('offline'));
      render(<Register />, { routerProps: { initialEntries: ['/register'] } });
      expect(await screen.findByLabelText('Username')).toBeInTheDocument();
    });
  });
});
