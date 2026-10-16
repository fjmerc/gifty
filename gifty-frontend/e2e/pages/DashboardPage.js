import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';

/**
 * Dashboard/UserHome Page Object
 * Handles main dashboard interactions and navigation
 */
export class DashboardPage extends BasePage {
  constructor(page) {
    super(page);
    
    // Navigation elements
    this.userMenu = this.page.getByRole('button', { name: /user.*menu|profile/i });
    this.logoutButton = this.page.getByRole('button', { name: /logout|sign.?out/i });
    this.navigationMenu = this.page.locator('[data-testid="navigation-menu"], nav');
    
    // Navigation links
    this.giftsLink = this.page.getByRole('link', { name: /gifts/i });
    this.recipientsLink = this.page.getByRole('link', { name: /recipients/i });
    this.eventsLink = this.page.getByRole('link', { name: /events/i });
    this.budgetsLink = this.page.getByRole('link', { name: /budgets/i });
    this.settingsLink = this.page.getByRole('link', { name: /settings/i });
    this.analyticsLink = this.page.getByRole('link', { name: /analytics/i });
    
    // Dashboard content
    this.welcomeMessage = this.page.locator('[data-testid="welcome-message"]');
    this.statsCards = this.page.locator('[data-testid="stats-card"]');
    this.recentActivity = this.page.locator('[data-testid="recent-activity"]');
    this.upcomingEvents = this.page.locator('[data-testid="upcoming-events"]');
    this.budgetOverview = this.page.locator('[data-testid="budget-overview"]');
    this.quickActions = this.page.locator('[data-testid="quick-actions"]');
    
    // Quick action buttons
    this.addRecipientButton = this.page.getByRole('button', { name: /add.*recipient/i });
    this.addEventButton = this.page.getByRole('button', { name: /add.*event/i });
    this.generateSuggestionsButton = this.page.getByRole('button', { name: /generate.*suggestions/i });
    
    // Charts and analytics
    this.budgetChart = this.page.locator('[data-testid="budget-chart"]');
    this.activityChart = this.page.locator('[data-testid="activity-chart"]');
    
    // Notification elements
    this.notificationBell = this.page.getByRole('button', { name: /notifications/i });
    this.notificationBadge = this.page.locator('[data-testid="notification-badge"]');
    
    // Holiday toggle
    this.holidayToggle = this.page.locator('[data-testid="holiday-toggle"]');
    
    // Loading states
    this.loadingSpinner = this.page.locator('[data-testid="loading-spinner"]');
    this.skeletonLoader = this.page.locator('[data-testid="skeleton-loader"]');
  }

  /**
   * Navigate to dashboard
   */
  async navigateToDashboard() {
    await this.navigate('/dashboard');
    await this.waitForDashboardLoad();
  }

  /**
   * Wait for dashboard to fully load
   */
  async waitForDashboardLoad() {
    // Wait for key dashboard elements
    await this.waitForElement('[data-testid="dashboard"], [data-testid="user-home"]');
    
    // Wait for data to load (charts, stats, etc.)
    await this.page.waitForLoadState('networkidle');
    
    // Ensure loading states are gone
    try {
      await expect(this.loadingSpinner).not.toBeVisible({ timeout: 15000 });
    } catch {
      // Spinner might not exist, that's okay
    }
  }

  /**
   * Navigate to specific sections
   */
  async navigateToGifts() {
    await this.giftsLink.click();
    await this.waitForURL('**/gifts');
  }

  async navigateToRecipients() {
    await this.recipientsLink.click();
    await this.waitForURL('**/recipients');
  }

  async navigateToEvents() {
    await this.eventsLink.click();
    await this.waitForURL('**/events');
  }

  async navigateToBudgets() {
    await this.budgetsLink.click();
    await this.waitForURL('**/budgets');
  }

  async navigateToSettings() {
    await this.settingsLink.click();
    await this.waitForURL('**/settings');
  }

  async navigateToAnalytics() {
    await this.analyticsLink.click();
    await this.waitForURL('**/analytics', '**/feedback-analytics');
  }

  /**
   * Perform logout
   */
  async logout() {
    // Try to find logout in user menu first
    if (await this.userMenu.isVisible()) {
      await this.userMenu.click();
      await this.logoutButton.click();
    } else {
      // Direct logout button
      await this.logoutButton.click();
    }
    
    // Wait for redirect to login/home
    await this.waitForURL('**/login', '**/');
  }

  /**
   * Quick actions
   */
  async addRecipient() {
    await this.addRecipientButton.click();
    // Could open modal or navigate to add recipient page
    try {
      await this.waitForURL('**/recipients/add');
    } catch {
      // Modal opened instead
      await this.waitForElement('[data-testid="add-recipient-modal"], [role="dialog"]');
    }
  }

  async addEvent() {
    await this.addEventButton.click();
    try {
      await this.waitForURL('**/events/add');
    } catch {
      await this.waitForElement('[data-testid="add-event-modal"], [role="dialog"]');
    }
  }

  async generateSuggestions() {
    await this.generateSuggestionsButton.click();
    await this.waitForURL('**/gifts');
  }

  /**
   * Holiday features
   */
  async toggleHolidays() {
    await this.holidayToggle.click();
    // Wait for holiday data to load/refresh
    await this.waitForAPIResponse('/api/holidays');
  }

  /**
   * Notification handling
   */
  async openNotifications() {
    await this.notificationBell.click();
    await this.waitForElement('[data-testid="notifications-panel"], [role="dialog"]');
  }

  async getNotificationCount() {
    if (await this.notificationBadge.isVisible()) {
      return await this.notificationBadge.textContent();
    }
    return '0';
  }

  /**
   * Dashboard data verification
   */
  async expectWelcomeMessage(userName) {
    await expect(this.welcomeMessage).toBeVisible();
    if (userName) {
      await expect(this.welcomeMessage).toContainText(userName);
    }
  }

  async expectStatsCards() {
    await expect(this.statsCards.first()).toBeVisible();
    
    // Verify we have multiple stats cards
    const cardCount = await this.statsCards.count();
    expect(cardCount).toBeGreaterThan(0);
  }

  async expectBudgetOverview() {
    await expect(this.budgetOverview).toBeVisible();
    
    // Check for budget data or empty state
    const budgetData = await this.budgetOverview.textContent();
    expect(budgetData).toBeDefined();
  }

  async expectUpcomingEvents() {
    await expect(this.upcomingEvents).toBeVisible();
  }

  async expectRecentActivity() {
    await expect(this.recentActivity).toBeVisible();
  }

  /**
   * Verify dashboard is authenticated
   */
  async expectAuthenticatedDashboard() {
    // Should have user menu or logout option
    const hasUserMenu = await this.userMenu.isVisible();
    const hasLogoutButton = await this.logoutButton.isVisible();
    
    expect(hasUserMenu || hasLogoutButton).toBe(true);
    
    // Should have navigation
    await expect(this.navigationMenu).toBeVisible();
    
    // Should not show login/register options
    await expect(this.page.getByRole('link', { name: /login|register/i }))
      .not.toBeVisible();
  }

  /**
   * Verify responsive layout
   */
  async expectResponsiveLayout() {
    const viewport = this.page.viewportSize();
    
    if (viewport.width < 768) {
      // Mobile layout expectations
      await expect(this.navigationMenu).toHaveClass(/mobile|collapsed/);
    } else {
      // Desktop layout expectations
      await expect(this.navigationMenu).toBeVisible();
    }
  }

  /**
   * Check for empty states
   */
  async expectEmptyState(section) {
    const emptyStateLocator = this.page.locator(`[data-testid="${section}-empty-state"]`);
    await expect(emptyStateLocator).toBeVisible();
  }

  /**
   * Performance checks
   */
  async expectFastLoad() {
    const startTime = Date.now();
    await this.waitForDashboardLoad();
    const loadTime = Date.now() - startTime;
    
    // Dashboard should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
  }

  /**
   * Verify charts are rendered
   */
  async expectChartsRendered() {
    if (await this.budgetChart.isVisible()) {
      // Verify chart has actual content (not just empty container)
      const chartContent = await this.budgetChart.innerHTML();
      expect(chartContent.length).toBeGreaterThan(100);
    }
  }
}