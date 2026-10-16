import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';

/**
 * Login Page Object
 * Handles authentication flow interactions
 */
export class LoginPage extends BasePage {
  constructor(page) {
    super(page);
    
    // Page elements using actual structure
    this.emailInput = this.page.getByPlaceholder(/email/i);
    this.passwordInput = this.page.getByPlaceholder(/password/i);
    this.loginButton = this.page.getByRole('button', { name: /login/i });
    this.registerLink = this.page.getByRole('link', { name: /sign.?up/i });
    this.forgotPasswordLink = this.page.getByRole('link', { name: /forgot.*password/i });
    this.errorMessage = this.page.getByRole('alert');
    this.loadingSpinner = this.page.locator('[data-testid="loading-spinner"]');
    this.passwordToggle = this.page.getByRole('button', { name: /show|hide.*password/i });
  }

  /**
   * Navigate to login page
   */
  async navigateToLogin() {
    await this.navigate('/login');
    await this.waitForElement('form');
  }

  /**
   * Perform login with credentials
   * @param {string} email - User email
   * @param {string} password - User password
   */
  async login(email, password) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    
    // Wait for login API call and navigation
    const responsePromise = this.waitForAPIResponse('/api/auth/login');
    await this.loginButton.click();
    
    await responsePromise;
    await this.waitForURL('**/dashboard', '**/user-home');
  }

  /**
   * Attempt login and expect failure
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {string} expectedError - Expected error message
   */
  async attemptInvalidLogin(email, password, expectedError) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    
    // Wait for error message to appear
    await this.expectLoginError(expectedError);
  }

  /**
   * Toggle password visibility
   */
  async togglePasswordVisibility() {
    const isPasswordHidden = await this.passwordInput.getAttribute('type') === 'password';
    await this.passwordToggle.click();
    
    // Verify toggle worked
    const newType = await this.passwordInput.getAttribute('type');
    expect(newType).toBe(isPasswordHidden ? 'text' : 'password');
  }

  /**
   * Navigate to registration page
   */
  async goToRegister() {
    await this.registerLink.click();
    await this.waitForURL('**/register');
  }

  /**
   * Navigate to forgot password page
   */
  async goToForgotPassword() {
    await this.forgotPasswordLink.click();
    await this.waitForURL('**/forgot-password', '**/reset-password');
  }

  /**
   * Check if login form is displayed
   */
  async isLoginFormVisible() {
    return await this.isVisible('form') &&
           await this.emailInput.isVisible() &&
           await this.passwordInput.isVisible() &&
           await this.loginButton.isVisible();
  }

  /**
   * Wait for and verify login error message
   * @param {string} message - Expected error message
   */
  async expectLoginError(message) {
    await expect(this.errorMessage).toBeVisible();
    await expect(this.errorMessage).toContainText(message);
  }

  /**
   * Verify successful login redirect
   */
  async expectSuccessfulLogin() {
    // Should redirect to dashboard/user-home
    await expect(this.page).toHaveURL(/\/(dashboard|user-home)/);
    
    // Verify we're actually logged in by checking for logout option or user menu
    await expect(this.page.getByRole('button', { name: /logout|sign.?out/i }))
      .toBeVisible({ timeout: 10000 });
  }

  /**
   * Verify form validation errors
   */
  async expectFormValidationError(field, message) {
    const errorElement = this.page.locator(`[data-testid="${field}-error"], .error`).first();
    await expect(errorElement).toBeVisible();
    if (message) {
      await expect(errorElement).toContainText(message);
    }
  }

  /**
   * Check loading state during login
   */
  async expectLoadingState() {
    await expect(this.loadingSpinner).toBeVisible();
    await expect(this.loginButton).toBeDisabled();
  }

  /**
   * Clear form fields
   */
  async clearForm() {
    await this.emailInput.clear();
    await this.passwordInput.clear();
  }

  /**
   * Fill form but don't submit
   * @param {string} email - User email
   * @param {string} password - User password
   */
  async fillLoginForm(email, password) {
    if (email) await this.emailInput.fill(email);
    if (password) await this.passwordInput.fill(password);
  }

  /**
   * Verify empty form state
   */
  async expectEmptyForm() {
    await expect(this.emailInput).toHaveValue('');
    await expect(this.passwordInput).toHaveValue('');
  }
}