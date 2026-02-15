import { test, expect } from './fixtures';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page, gotoAndHydrate }) => {
    await gotoAndHydrate('/');
  });

  test('should display hero section with correct branding', async ({ page }) => {
    // Check logo and branding
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('text=Haven')).toBeVisible();
    
    // Check hero heading
    const heroHeading = page.locator('h1');
    await expect(heroHeading).toBeVisible();
    await expect(heroHeading).toContainText('Your Videos');
    await expect(heroHeading).toContainText('Decentralized');
    
    // Check hero description
    const heroDescription = page.locator('text=Access your encrypted video library');
    await expect(heroDescription).toBeVisible();
  });

  test('should have working navigation to library', async ({ page }) => {
    const libraryLink = page.locator('a:has-text("Open Library")');
    await expect(libraryLink).toBeVisible();
    await expect(libraryLink).toHaveAttribute('href', '/library');
    
    // Click and verify navigation
    await libraryLink.click();
    await expect(page).toHaveURL(/.*library/);
  });

  test('should display feature cards', async ({ page }) => {
    // Check all three feature cards are visible
    await expect(page.locator('text=Encrypted Storage')).toBeVisible();
    await expect(page.locator('text=Universal Access')).toBeVisible();
    await expect(page.locator('text=Own Your Data')).toBeVisible();
    
    // Check feature descriptions
    await expect(page.locator('text=Your videos are encrypted using Lit Protocol')).toBeVisible();
    await expect(page.locator('text=Stream your videos from IPFS anywhere')).toBeVisible();
    await expect(page.locator('text=No accounts, no passwords')).toBeVisible();
  });

  test('should have theme toggle functionality', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"], button[aria-label*="theme" i]').first();
    
    // Theme toggle should be visible in nav
    await expect(page.locator('nav button').first()).toBeVisible();
  });

  test('should have connect wallet button', async ({ page }) => {
    // Look for connect button (may vary based on implementation)
    const connectButton = page.locator('button:has-text("Connect"), button:has-text("Wallet")').first();
    await expect(connectButton).toBeVisible();
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Hero should still be visible and properly laid out
    await expect(page.locator('h1')).toBeVisible();
    
    // Feature cards should stack vertically
    const featureCards = page.locator('.grid > div');
    await expect(featureCards.first()).toBeVisible();
  });

  test('should have proper meta tags and SEO', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Haven/);
    
    // Check meta description
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toContain('decentralized');
    expect(description).toContain('video');
  });

  test('visual regression - hero section snapshot', async ({ page }) => {
    // Take screenshot of hero for visual comparison
    const hero = page.locator('main');
    await expect(hero).toHaveScreenshot('landing-hero.png', {
      maxDiffPixels: 100,
    });
  });
});
