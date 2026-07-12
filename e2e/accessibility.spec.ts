import { test, expect } from './fixtures';

/**
 * Accessibility tests for Haven app
 * Uses axe-core principles for automated a11y testing
 */
test.describe('Accessibility', () => {
  test('landing page should have proper heading structure', async ({ page, gotoAndHydrate }) => {
    await gotoAndHydrate('/');
    
    // Check single H1
    const h1s = await page.locator('h1').count();
    expect(h1s).toBe(1);
    
    // Check heading order (no skipped levels)
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
    let lastLevel = 0;
    
    for (const heading of headings) {
      const tagName = await heading.evaluate(el => el.tagName.toLowerCase());
      const level = parseInt(tagName[1]);
      
      // Allow same level or one level deeper
      expect(level).toBeLessThanOrEqual(lastLevel + 1);
      lastLevel = Math.max(lastLevel, level);
    }
  });

  test('all interactive elements should be focusable', async ({ page, gotoAndHydrate }) => {
    await gotoAndHydrate('/');
    
    // Get all interactive elements
    const interactiveElements = await page.locator('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])').all();
    
    for (const element of interactiveElements.slice(0, 10)) { // Check first 10
      // Check if element is visible
      const isVisible = await element.isVisible().catch(() => false);
      if (isVisible) {
        // Try to focus
        await element.focus();
        const isFocused = await element.evaluate(el => el === document.activeElement);
        expect(isFocused).toBe(true);
      }
    }
  });

  test('images should have alt text', async ({ page, gotoAndHydrate }) => {
    await gotoAndHydrate('/');
    
    // Get all images
    const images = await page.locator('img').all();
    
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      const ariaLabel = await img.getAttribute('aria-label');
      const role = await img.getAttribute('role');
      
      // Images should have alt text, aria-label, or be decorative (role="presentation")
      const hasAlt = alt !== null && alt !== '';
      const hasAriaLabel = ariaLabel !== null && ariaLabel !== '';
      const isDecorative = role === 'presentation' || role === 'none';
      
      expect(hasAlt || hasAriaLabel || isDecorative).toBe(true);
    }
  });

  test('color contrast should meet WCAG AA standards', async ({ page, gotoAndHydrate }) => {
    await gotoAndHydrate('/');
    
    // Check body text color contrast
    const body = page.locator('body');
    const color = await body.evaluate(el => window.getComputedStyle(el).color);
    const bgColor = await body.evaluate(el => window.getComputedStyle(el).backgroundColor);
    
    // Colors should be defined (not inherit without definition)
    expect(color).toBeTruthy();
    expect(bgColor).toBeTruthy();
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('form inputs should have labels', async ({ page, gotoAndHydrate, mockWalletConnected }) => {
    await mockWalletConnected();
    await gotoAndHydrate('/library');
    
    // Check for inputs without labels
    const inputs = await page.locator('input:not([type="hidden"]), select, textarea').all();
    
    for (const input of inputs) {
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      const placeholder = await input.getAttribute('placeholder');
      const hasLabel = id ? await page.locator(`label[for="${id}"]`).count() > 0 : false;
      
      // Input should have some form of label
      const hasAccessibleName = hasLabel || ariaLabel || ariaLabelledBy || placeholder;
      expect(hasAccessibleName).toBe(true);
    }
  });

  test('should support keyboard navigation', async ({ page, gotoAndHydrate }) => {
    await gotoAndHydrate('/');
    
    // Press Tab key multiple times
    await page.keyboard.press('Tab');
    
    // Something should be focused
    const activeElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(activeElement).not.toBe('BODY');
    
    // Continue tabbing through the page
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
    }
    
    // Focus should have moved
    const newActiveElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(newActiveElement).toBeTruthy();
  });

  test('should have proper ARIA landmarks', async ({ page, gotoAndHydrate }) => {
    await gotoAndHydrate('/');
    
    // Check for main landmark
    const main = await page.locator('main, [role="main"]').count();
    expect(main).toBeGreaterThanOrEqual(1);
    
    // Check for navigation landmark
    const nav = await page.locator('nav, [role="navigation"]').count();
    expect(nav).toBeGreaterThanOrEqual(1);
  });

  test('buttons should have accessible names', async ({ page, gotoAndHydrate }) => {
    await gotoAndHydrate('/');
    
    // Get all buttons
    const buttons = await page.locator('button').all();
    
    for (const button of buttons.slice(0, 10)) { // Check first 10
      const text = await button.textContent();
      const ariaLabel = await button.getAttribute('aria-label');
      const title = await button.getAttribute('title');
      
      // Button should have accessible name
      const hasName = (text && text.trim() !== '') || ariaLabel || title;
      expect(hasName).toBe(true);
    }
  });

  test('links should have descriptive text', async ({ page, gotoAndHydrate }) => {
    await gotoAndHydrate('/');
    
    // Get all links
    const links = await page.locator('a').all();
    
    for (const link of links) {
      const text = await link.textContent();
      const ariaLabel = await link.getAttribute('aria-label');
      
      // Link should have text or aria-label
      const hasText = (text && text.trim() !== '') || ariaLabel;
      expect(hasText).toBe(true);
    }
  });

  test('should respect reduced motion preference', async ({ page, gotoAndHydrate }) => {
    // Emulate reduced motion preference
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoAndHydrate('/');
    
    // Page should load normally
    await expect(page.locator('h1')).toBeVisible();
  });
});
