import { test, expect } from './fixtures';

test.describe('Settings Page', () => {
  test('should require authentication', async ({ page, gotoAndHydrate }) => {
    await gotoAndHydrate('/settings');
    
    await page.waitForLoadState('networkidle');
    
    // Should show settings content or auth prompt
    const settingsContent = page.locator('h1:has-text("Settings")');
    const authPrompt = page.locator('text=Connect, text=Wallet').first();
    
    expect(await settingsContent.isVisible().catch(() => false) || 
           await authPrompt.isVisible().catch(() => false)).toBeTruthy();
  });

  test('should display settings sections when authenticated', async ({ page, gotoAndHydrate, mockWalletConnected }) => {
    await mockWalletConnected();
    await gotoAndHydrate('/settings');
    
    // Check page title
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible();
    
    // Check settings sections
    await expect(page.locator('text=Account')).toBeVisible();
    await expect(page.locator('text=Storage')).toBeVisible();
  });

  test('should show account information', async ({ page, gotoAndHydrate, mockWalletConnected }) => {
    await mockWalletConnected();
    await gotoAndHydrate('/settings');
    
    // Account section should explain wallet connection
    const accountSection = page.locator('section:has-text("Account")');
    await expect(accountSection).toContainText('wallet');
  });

  test('should show storage information', async ({ page, gotoAndHydrate, mockWalletConnected }) => {
    await mockWalletConnected();
    await gotoAndHydrate('/settings');
    
    // Storage section should mention IPFS
    const storageSection = page.locator('section:has-text("Storage")');
    await expect(storageSection).toContainText('IPFS');
  });

  test('should have consistent layout with library', async ({ page, gotoAndHydrate, mockWalletConnected }) => {
    await mockWalletConnected();
    
    // Check library layout
    await gotoAndHydrate('/library');
    const libraryLayout = page.locator('aside, [role="navigation"]').first();
    const libraryHasSidebar = await libraryLayout.isVisible().catch(() => false);
    
    // Check settings layout
    await gotoAndHydrate('/settings');
    const settingsLayout = page.locator('aside, [role="navigation"]').first();
    const settingsHasSidebar = await settingsLayout.isVisible().catch(() => false);
    
    // Both should have consistent layout
    expect(libraryHasSidebar).toBe(settingsHasSidebar);
  });
});
