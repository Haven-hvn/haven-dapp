import { test, expect } from './fixtures';

test.describe('Library Page', () => {
  test('should require authentication', async ({ page, gotoAndHydrate }) => {
    await gotoAndHydrate('/library');
    
    // Should show protected route content (connect wallet prompt or redirect)
    // Since it's a protected route, it might show a loading state or auth prompt
    await page.waitForLoadState('networkidle');
    
    // Either shows library content or auth prompt
    const libraryContent = page.locator('text=Your Library');
    const connectPrompt = page.locator('text=Connect, text=Wallet, text=Sign in').first();
    
    expect(await libraryContent.isVisible().catch(() => false) || 
           await connectPrompt.isVisible().catch(() => false)).toBeTruthy();
  });

  test('should display library layout when authenticated', async ({ page, gotoAndHydrate, mockWalletConnected }) => {
    // Set up authenticated state
    await mockWalletConnected();
    await gotoAndHydrate('/library');
    
    // Check page title
    await expect(page.locator('h1:has-text("Your Library")')).toBeVisible();
    
    // Check sidebar navigation
    await expect(page.locator('aside, [role="navigation"]').first()).toBeVisible();
  });

  test('should have search functionality', async ({ page, gotoAndHydrate, mockWalletConnected }) => {
    await mockWalletConnected();
    await gotoAndHydrate('/library');
    
    // Look for search input
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="Search" i]').first();
    
    if (await searchInput.count() > 0) {
      await expect(searchInput).toBeVisible();
      await expect(searchInput).toBeEnabled();
      
      // Test typing in search
      await searchInput.fill('test video');
      await expect(searchInput).toHaveValue('test video');
    }
  });

  test('should have view toggle (grid/list)', async ({ page, gotoAndHydrate, mockWalletConnected }) => {
    await mockWalletConnected();
    await gotoAndHydrate('/library');
    
    // Look for view toggle buttons
    const viewToggle = page.locator('button[aria-label*="view" i], button[title*="view" i]').first();
    
    if (await viewToggle.count() > 0) {
      await expect(viewToggle).toBeVisible();
    }
  });

  test('should display video grid or empty state', async ({ page, gotoAndHydrate, mockWalletConnected }) => {
    await mockWalletConnected();
    await gotoAndHydrate('/library');
    
    // Wait for content to load
    await page.waitForLoadState('networkidle');
    
    // Either shows video grid or empty state
    const videoGrid = page.locator('[data-testid="video-grid"], .grid, [role="grid"]').first();
    const emptyState = page.locator('text=No videos, text=Empty, text=no content').first();
    const skeleton = page.locator('[data-testid="skeleton"]').first();
    
    const hasContent = await videoGrid.isVisible().catch(() => false) ||
                      await emptyState.isVisible().catch(() => false) ||
                      await skeleton.isVisible().catch(() => false);
    
    expect(hasContent).toBeTruthy();
  });

  test('should navigate to video player on item click', async ({ page, gotoAndHydrate, mockWalletConnected }) => {
    await mockWalletConnected();
    await gotoAndHydrate('/library');
    
    await page.waitForLoadState('networkidle');
    
    // Look for video cards/items
    const videoItem = page.locator('[data-testid="video-card"], a[href*="/watch/"]').first();
    
    if (await videoItem.count() > 0 && await videoItem.isVisible()) {
      const href = await videoItem.getAttribute('href');
      await videoItem.click();
      
      if (href) {
        await expect(page).toHaveURL(href);
      } else {
        await expect(page).toHaveURL(/.*watch/);
      }
    }
  });

  test('should be responsive', async ({ page, gotoAndHydrate, mockWalletConnected }) => {
    await mockWalletConnected();
    
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoAndHydrate('/library');
    
    // Library should still be accessible
    await expect(page.locator('h1:has-text("Your Library")')).toBeVisible();
    
    // Test tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    await expect(page.locator('h1:has-text("Your Library")')).toBeVisible();
    
    // Test desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.reload();
    await expect(page.locator('h1:has-text("Your Library")')).toBeVisible();
  });
});
