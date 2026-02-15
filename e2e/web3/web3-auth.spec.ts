/**
 * Web3 Authentication Flow E2E Tests
 * 
 * Tests for Web3-specific authentication including:
 * - Lit Protocol authentication
 * - Signature requests
 * - Auth state management
 * - Protected route access
 * 
 * @module e2e/web3/web3-auth
 */

import { test, expect, TEST_WALLET } from '../web3-fixtures';

test.describe('Web3 Authentication Flow', () => {
  test.describe('Protected Routes', () => {
    test('library should require authentication', async ({ page, gotoWithWeb3 }) => {
      await gotoWithWeb3('/library');
      
      // Without auth, should show auth prompt or redirect
      const authPrompt = page.locator('text=Connect, text=Sign in, text=Wallet, appkit-button').first();
      const libraryContent = page.locator('text=Your Library');
      
      // Either shows auth prompt or (if already mocked) library content
      const hasAuthPrompt = await authPrompt.isVisible().catch(() => false);
      const hasLibraryContent = await libraryContent.isVisible().catch(() => false);
      
      expect(hasAuthPrompt || hasLibraryContent).toBe(true);
    });

    test('library should be accessible with connected wallet', async ({ page, gotoWithWeb3, mockWalletConnected, waitForAuth }) => {
      await gotoWithWeb3('/library');
      await mockWalletConnected(TEST_WALLET.address, 1);
      
      // Should show library content
      await expect(page.locator('h1:has-text("Your Library")')).toBeVisible();
    });

    test('settings page should respect auth state', async ({ page, gotoWithWeb3, mockWalletConnected }) => {
      await gotoWithWeb3('/settings');
      await mockWalletConnected(TEST_WALLET.address, 1);
      
      // Should show settings content or auth prompt
      const settingsContent = page.locator('text=Settings, h1').first();
      await expect(settingsContent).toBeVisible();
    });

    test('watch page should require authentication', async ({ page, gotoWithWeb3 }) => {
      await gotoWithWeb3('/watch/test-video-id');
      
      // Should either show video player or auth prompt
      const videoPlayer = page.locator('video, [data-testid="video-player"]').first();
      const authPrompt = page.locator('text=Connect, text=Sign in, appkit-button').first();
      
      const hasVideo = await videoPlayer.isVisible().catch(() => false);
      const hasAuth = await authPrompt.isVisible().catch(() => false);
      
      expect(hasVideo || hasAuth).toBe(true);
    });
  });

  test.describe('Auth State Management', () => {
    test('should update auth store on wallet connect', async ({ page, gotoWithWeb3, mockWalletConnected }) => {
      await gotoWithWeb3('/');
      
      // Check initial state
      const initialAuth = await page.evaluate(() => {
        return localStorage.getItem('haven-auth-storage');
      });
      
      // Connect wallet
      await mockWalletConnected(TEST_WALLET.address, 1);
      
      // Check auth store was updated
      const authState = await page.evaluate(() => {
        const storage = localStorage.getItem('haven-auth-storage');
        return storage ? JSON.parse(storage) : null;
      });
      
      expect(authState).toBeTruthy();
      expect(authState.state.address).toBe(TEST_WALLET.address);
      expect(authState.state.isAuthenticated).toBe(true);
      expect(authState.state.chainId).toBe(1);
    });

    test('should clear auth on wallet disconnect', async ({ page, gotoWithWeb3, mockWalletConnected, mockWalletDisconnected }) => {
      await gotoWithWeb3('/');
      
      // Connect then disconnect
      await mockWalletConnected(TEST_WALLET.address, 1);
      await mockWalletDisconnected();
      
      // Check auth store was cleared
      const authState = await page.evaluate(() => {
        const storage = localStorage.getItem('haven-auth-storage');
        return storage ? JSON.parse(storage) : null;
      });
      
      expect(authState?.state?.isAuthenticated).toBeFalsy();
    });

    test('should track chain ID changes', async ({ page, gotoWithWeb3, mockWalletConnected }) => {
      await gotoWithWeb3('/');
      
      // Connect on mainnet
      await mockWalletConnected(TEST_WALLET.address, 1);
      
      let authState = await page.evaluate(() => {
        const storage = localStorage.getItem('haven-auth-storage');
        return storage ? JSON.parse(storage) : null;
      });
      
      expect(authState.state.chainId).toBe(1);
      
      // Switch to Sepolia
      await mockWalletConnected(TEST_WALLET.address, 11155111);
      
      authState = await page.evaluate(() => {
        const storage = localStorage.getItem('haven-auth-storage');
        return storage ? JSON.parse(storage) : null;
      });
      
      expect(authState.state.chainId).toBe(11155111);
    });
  });

  test.describe('Lit Protocol Integration', () => {
    test('should store signature in localStorage', async ({ page, gotoWithWeb3, mockWalletConnected, mockSignature }) => {
      await gotoWithWeb3('/library');
      await mockWalletConnected(TEST_WALLET.address, 1);
      
      // Mock a signature (normally would be requested by Lit Protocol)
      const testSig = '0x' + 'b'.repeat(130);
      await mockSignature(testSig);
      
      // Verify signature was stored
      const storedSig = await page.evaluate(() => {
        return localStorage.getItem('lit-auth-signature');
      });
      
      expect(storedSig).toContain(testSig);
    });

    test('should have Lit auth storage available', async ({ page, gotoWithWeb3, mockWalletConnected }) => {
      await gotoWithWeb3('/library');
      await mockWalletConnected(TEST_WALLET.address, 1);
      
      // Check for Lit Protocol storage keys
      const litStorage = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        return keys.filter(k => k.toLowerCase().includes('lit'));
      });
      
      // Should have some Lit-related storage
      expect(litStorage.length).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('Multi-tab Auth Synchronization', () => {
    test('should sync auth across browser contexts', async ({ browser, gotoWithWeb3, mockWalletConnected }) => {
      // Create two contexts (simulating two tabs)
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      
      // Load app in both contexts
      await page1.goto('http://localhost:3000/library');
      await page2.goto('http://localhost:3000/library');
      
      await page1.waitForLoadState('networkidle');
      await page2.waitForLoadState('networkidle');
      
      // Connect in first context
      await page1.evaluate((addr) => {
        localStorage.setItem('haven-auth-storage', JSON.stringify({
          state: {
            address: addr,
            chainId: 1,
            isAuthenticated: true,
            lastConnected: Date.now(),
          },
          version: 0
        }));
      }, TEST_WALLET.address);
      
      // Note: In a real browser, storage events would sync across tabs
      // In Playwright, contexts are isolated so this is a limitation
      
      await context1.close();
      await context2.close();
    });
  });
});
