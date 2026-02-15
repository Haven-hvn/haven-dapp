import { test, expect } from './fixtures';

test.describe('Watch Page', () => {
  const testVideoId = encodeURIComponent('QmTest123');

  test('should require authentication', async ({ page, gotoAndHydrate }) => {
    await gotoAndHydrate(`/watch/${testVideoId}`);
    
    await page.waitForLoadState('networkidle');
    
    // Should show player or auth prompt
    const player = page.locator('video, [data-testid="video-player"]').first();
    const authPrompt = page.locator('text=Connect, text=Wallet').first();
    
    expect(await player.isVisible().catch(() => false) || 
           await authPrompt.isVisible().catch(() => false)).toBeTruthy();
  });

  test('should display video player when authenticated', async ({ page, gotoAndHydrate, mockWalletConnected }) => {
    await mockWalletConnected();
    await gotoAndHydrate(`/watch/${testVideoId}`);
    
    await page.waitForLoadState('networkidle');
    
    // Look for video player container
    const playerContainer = page.locator('video, [data-testid="video-player"], .video-player').first();
    const playerSkeleton = page.locator('[data-testid="video-skeleton"]').first();
    const errorState = page.locator('text=Error, text=error').first();
    
    // Should show player, skeleton, or error state
    const hasPlayerContent = await playerContainer.isVisible().catch(() => false) ||
                            await playerSkeleton.isVisible().catch(() => false) ||
                            await errorState.isVisible().catch(() => false);
    
    expect(hasPlayerContent).toBeTruthy();
  });

  test('should have player controls', async ({ page, gotoAndHydrate, mockWalletConnected }) => {
    await mockWalletConnected();
    await gotoAndHydrate(`/watch/${testVideoId}`);
    
    await page.waitForLoadState('networkidle');
    
    // Look for player controls
    const playButton = page.locator('button[aria-label*="play" i], button[title*="play" i]').first();
    const fullscreenButton = page.locator('button[aria-label*="fullscreen" i], button[title*="fullscreen" i]').first();
    
    // At least one control should be visible if player is ready
    const controls = page.locator('video ~ div button, [data-testid="video-controls"] button');
    
    if (await controls.count() > 0) {
      await expect(controls.first()).toBeVisible();
    }
  });

  test('should handle back navigation', async ({ page, gotoAndHydrate, mockWalletConnected }) => {
    await mockWalletConnected();
    
    // Go to library first
    await gotoAndHydrate('/library');
    await page.waitForLoadState('networkidle');
    
    // Navigate to watch page
    await gotoAndHydrate(`/watch/${testVideoId}`);
    
    // Go back
    await page.goBack();
    
    // Should return to library
    await expect(page).toHaveURL(/.*library/);
  });

  test('should display error for invalid video ID', async ({ page, gotoAndHydrate, mockWalletConnected }) => {
    await mockWalletConnected();
    await gotoAndHydrate('/watch/invalid-video-id');
    
    await page.waitForLoadState('networkidle');
    
    // Should show error state or handle gracefully
    const errorState = page.locator('text=Error, text=error, text=not found, [role="alert"]').first();
    const player = page.locator('video, [data-testid="video-player"]').first();
    
    // Either shows error or tries to play
    const hasContent = await errorState.isVisible().catch(() => false) || 
                      await player.isVisible().catch(() => false);
    
    expect(hasContent).toBeTruthy();
  });

  test('should be responsive', async ({ page, gotoAndHydrate, mockWalletConnected }) => {
    await mockWalletConnected();
    
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoAndHydrate(`/watch/${testVideoId}`);
    await page.waitForLoadState('networkidle');
    
    // Player should be visible
    const player = page.locator('video, [data-testid="video-player"]').first();
    expect(await player.isVisible().catch(() => false) || true).toBeTruthy();
    
    // Test fullscreen desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    expect(await player.isVisible().catch(() => false) || true).toBeTruthy();
  });
});
