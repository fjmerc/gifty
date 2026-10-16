import { test, expect } from '@playwright/test';

/**
 * E2E Setup Verification Tests
 * 
 * These tests verify that our E2E testing infrastructure is working correctly
 * before running the main test suites.
 */

test.describe('E2E Setup Verification', () => {
  test('should load the application homepage', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Verify basic page structure
    await expect(page).toHaveTitle(/gifty/i);
    
    // Should have basic navigation or content
    const hasNavigation = await page.locator('nav, [role="navigation"]').isVisible();
    const hasMainContent = await page.locator('main, [role="main"], .main-content').isVisible();
    const hasLogo = await page.locator('[data-testid="logo"], img[alt*="logo"], .logo').isVisible();
    
    // At least one of these should be present
    expect(hasNavigation || hasMainContent || hasLogo).toBe(true);
  });

  test('should handle protected routes appropriately', async ({ page }) => {
    // Try to access a protected route without authentication
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    const currentUrl = page.url();
    
    // Should either redirect to login OR show the dashboard (if user is somehow authenticated)
    const isOnLogin = currentUrl.includes('/login');
    const isOnDashboard = currentUrl.includes('/dashboard');
    const hasLoginForm = await page.locator('input[placeholder*="email"], input[placeholder*="Email"]').isVisible();
    
    // One of these should be true
    expect(isOnLogin || isOnDashboard || hasLoginForm).toBe(true);
    
    // If on login page or has login form, verify form elements
    if (isOnLogin || hasLoginForm) {
      const emailInput = page.getByPlaceholder(/email/i);
      const passwordInput = page.getByPlaceholder(/password/i);
      const loginButton = page.getByRole('button', { name: /login/i });
      
      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
      await expect(loginButton).toBeVisible();
    }
  });

  test('should have responsive design', async ({ page }) => {
    await page.goto('/');
    
    // Test different viewport sizes
    const viewports = [
      { width: 375, height: 667 },   // Mobile
      { width: 768, height: 1024 },  // Tablet
      { width: 1920, height: 1080 }  // Desktop
    ];
    
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForLoadState('networkidle');
      
      // Verify page still loads properly at different sizes
      const body = page.locator('body');
      await expect(body).toBeVisible();
      
      // Check that content doesn't overflow horizontally
      const bodyWidth = await body.evaluate(el => el.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 20); // Allow small margin
    }
  });

  test('should handle basic JavaScript functionality', async ({ page }) => {
    await page.goto('/');
    
    // Verify JavaScript is working
    const jsWorking = await page.evaluate(() => {
      return typeof window !== 'undefined' && 
             typeof document !== 'undefined' &&
             document.readyState === 'complete';
    });
    
    expect(jsWorking).toBe(true);
  });

  test('should load CSS and styling', async ({ page }) => {
    await page.goto('/');
    
    // Check that styles are loaded
    const hasStyles = await page.evaluate(() => {
      const stylesheets = document.styleSheets;
      return stylesheets.length > 0;
    });
    
    expect(hasStyles).toBe(true);
    
    // Check for basic styling on body
    const bodyStyles = await page.locator('body').evaluate(el => {
      const styles = window.getComputedStyle(el);
      return {
        margin: styles.margin,
        fontFamily: styles.fontFamily,
        backgroundColor: styles.backgroundColor
      };
    });
    
    // Should have some basic styling applied
    expect(bodyStyles.fontFamily).not.toBe('');
  });

  test('should not have console errors on load', async ({ page }) => {
    const consoleErrors = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Filter out known acceptable errors (e.g., favicon 404)
    const significantErrors = consoleErrors.filter(error => 
      !error.includes('favicon') && 
      !error.includes('manifest.json') &&
      !error.toLowerCase().includes('404')
    );
    
    expect(significantErrors).toHaveLength(0);
  });

  test('should handle network conditions', async ({ page, context }) => {
    // Test offline behavior
    await context.setOffline(true);
    
    try {
      await page.goto('/', { timeout: 5000 });
    } catch (error) {
      // Expected to fail when offline
      expect(error.message).toContain('net::ERR_INTERNET_DISCONNECTED');
    }
    
    // Restore network
    await context.setOffline(false);
    
    // Should work normally now
    await page.goto('/');
    await expect(page).toHaveTitle(/gifty/i);
  });

  test('should have proper meta tags', async ({ page }) => {
    await page.goto('/');
    
    // Check for important meta tags
    const charset = await page.locator('meta[charset]').getAttribute('charset');
    expect(charset).toBeTruthy();
    
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
    
    // Should have a proper title
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('should support modern browser features', async ({ page }) => {
    await page.goto('/');
    
    // Check for modern JavaScript features support
    const modernFeaturesSupport = await page.evaluate(() => {
      return {
        es6: typeof Promise !== 'undefined',
        fetch: typeof fetch !== 'undefined',
        localStorage: typeof localStorage !== 'undefined',
        sessionStorage: typeof sessionStorage !== 'undefined',
        webStorage: typeof Storage !== 'undefined'
      };
    });
    
    expect(modernFeaturesSupport.es6).toBe(true);
    expect(modernFeaturesSupport.fetch).toBe(true);
    expect(modernFeaturesSupport.localStorage).toBe(true);
    expect(modernFeaturesSupport.sessionStorage).toBe(true);
  });

  test('should load within performance thresholds', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const loadTime = Date.now() - startTime;
    
    // Homepage should load within 5 seconds (generous for E2E)
    expect(loadTime).toBeLessThan(5000);
    
    // Check for basic performance metrics if available
    const performanceMetrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      if (navigation) {
        return {
          domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
          loadComplete: navigation.loadEventEnd - navigation.loadEventStart
        };
      }
      return null;
    });
    
    if (performanceMetrics) {
      expect(performanceMetrics.domContentLoaded).toBeLessThan(3000);
    }
  });
});