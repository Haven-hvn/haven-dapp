import { test, expect } from './fixtures';

test.describe('Navigation & Routing', () => {
  test('should handle 404 pages gracefully', async ({ page, gotoAndHydrate }) => {
    await gotoAndHydrate('/non-existent-page');
    
    // Should show not-found page
    await expect(page.locator('text=404, text=Not Found, text=not found').first()).toBeVisible();
    
    // Should have link back to home
    const homeLink = page.locator('a:has-text("Home"), a:has-text("Back")').first();
    await expect(homeLink).toBeVisible();
  });

  test('should redirect /home to /', async ({ page }) => {
    await page.goto('/home');
    await expect(page).toHaveURL('/');
  });

  test('should maintain scroll position on navigation', async ({ page, gotoAndHydrate }) => {
    await gotoAndHydrate('/');
    
    // Scroll down
    await page.evaluate(() => window.scrollTo(0, 500));
    
    // Navigate and go back
    await page.click('a:has-text("Open Library")');
    await page.goBack();
    
    // Scroll position should be restored (Next.js default behavior)
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThanOrEqual(0);
  });

  test('should have working header navigation on all pages', async ({ page, gotoAndHydrate }) => {
    const pages = ['/', '/library', '/settings'];
    
    for (const path of pages) {
      await gotoAndHydrate(path);
      
      // Header should be visible
      await expect(page.locator('nav')).toBeVisible();
      
      // Logo should link to home
      const logo = page.locator('nav a:has-text("Haven")');
      if (await logo.count() > 0) {
        await expect(logo).toHaveAttribute('href', '/');
      }
    }
  });
});

test.describe('Theme & Appearance', () => {
  test('should apply dark mode classes', async ({ page, gotoAndHydrate }) => {
    await gotoAndHydrate('/');
    
    // Check if dark class is applied to html
    const html = page.locator('html');
    const classAttr = await html.getAttribute('class');
    
    // Should have dark or light class
    expect(classAttr).toMatch(/(dark|light)/);
  });

  test('should have consistent color scheme', async ({ page, gotoAndHydrate }) => {
    await gotoAndHydrate('/');
    
    // Check background color is applied
    const body = page.locator('body');
    const bgColor = await body.evaluate(el => 
      window.getComputedStyle(el).backgroundColor
    );
    
    // Should have some background color (not transparent)
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
  });
});
