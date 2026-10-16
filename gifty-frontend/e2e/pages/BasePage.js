import { expect } from '@playwright/test';

/**
 * Base Page Object Model class
 * Provides common functionality for all page objects
 */
export class BasePage {
  constructor(page) {
    this.page = page;
  }

  /**
   * Navigate to a specific URL
   * @param {string} url - The URL to navigate to
   */
  async navigate(url) {
    await this.page.goto(url);
    await this.waitForPageLoad();
  }

  /**
   * Wait for page to fully load
   */
  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Wait for element to be visible
   * @param {string} selector - Element selector
   * @param {Object} options - Wait options
   */
  async waitForElement(selector, options = {}) {
    return await this.page.waitForSelector(selector, { 
      state: 'visible', 
      timeout: 10000,
      ...options 
    });
  }

  /**
   * Get element by role (semantic selectors for reliability)
   * @param {string} role - ARIA role
   * @param {Object} options - Additional options
   */
  getByRole(role, options = {}) {
    return this.page.getByRole(role, options);
  }

  /**
   * Get element by label (highest reliability for forms)
   * @param {string} label - Label text
   */
  getByLabel(label) {
    return this.page.getByLabel(label);
  }

  /**
   * Get element by text content
   * @param {string} text - Text content
   */
  getByText(text) {
    return this.page.getByText(text);
  }

  /**
   * Get element by test ID
   * @param {string} testId - Test ID attribute
   */
  getByTestId(testId) {
    return this.page.getByTestId(testId);
  }

  /**
   * Wait for URL to match pattern
   * @param {string} pattern - URL pattern
   */
  async waitForURL(pattern) {
    await this.page.waitForURL(pattern, { timeout: 10000 });
  }

  /**
   * Take screenshot for debugging
   * @param {string} name - Screenshot name
   */
  async screenshot(name) {
    await this.page.screenshot({ 
      path: `e2e/screenshots/${name}.png`,
      fullPage: true 
    });
  }

  /**
   * Check if element is visible
   * @param {string} selector - Element selector
   */
  async isVisible(selector) {
    try {
      return await this.page.isVisible(selector);
    } catch (error) {
      return false;
    }
  }

  /**
   * Wait for API response
   * @param {string} urlPattern - API URL pattern to wait for
   */
  async waitForAPIResponse(urlPattern) {
    return await this.page.waitForResponse(response => 
      response.url().includes(urlPattern) && response.status() === 200
    );
  }

  /**
   * Simulate network conditions
   * @param {string} condition - Network condition (offline, slow, fast)
   */
  async setNetworkCondition(condition) {
    const conditions = {
      offline: { offline: true },
      slow: { 
        offline: false,
        downloadThroughput: 50 * 1024, // 50kb/s
        uploadThroughput: 20 * 1024,   // 20kb/s
        latency: 2000 // 2s
      },
      fast: {
        offline: false,
        downloadThroughput: 50 * 1024 * 1024, // 50mb/s
        uploadThroughput: 10 * 1024 * 1024,   // 10mb/s
        latency: 10 // 10ms
      }
    };

    if (conditions[condition]) {
      await this.page.context().setOffline(conditions[condition].offline);
      if (!conditions[condition].offline) {
        await this.page.context().route('**/*', route => {
          setTimeout(() => route.continue(), conditions[condition].latency);
        });
      }
    }
  }

  /**
   * Common assertion helpers
   */
  async expectVisible(selector) {
    await expect(this.page.locator(selector)).toBeVisible();
  }

  async expectText(selector, text) {
    await expect(this.page.locator(selector)).toContainText(text);
  }

  async expectURL(pattern) {
    await expect(this.page).toHaveURL(pattern);
  }
}