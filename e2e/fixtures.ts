import { test as base, expect, type Page } from '@playwright/test';

/**
 * Extended test fixture with custom helpers for Haven app testing
 */
export const test = base.extend<{
  /** Navigate to page and wait for hydration */
  gotoAndHydrate: (path: string) => Promise<void>;
  /** Check if element is visually visible */
  isVisuallyVisible: (selector: string) => Promise<boolean>;
  /** Mock Web3 wallet connection state */
  mockWalletConnected: (address?: string) => Promise<void>;
  /** Mock Web3 wallet disconnected state */
  mockWalletDisconnected: () => Promise<void>;
}>({
  gotoAndHydrate: async ({ page }, use) => {
    await use(async (path: string) => {
      await page.goto(path);
      // Wait for React hydration to complete
      await page.waitForFunction(() => {
        return document.querySelector('[data-nextjs-page]') !== null || 
               document.readyState === 'complete';
      });
      // Additional wait for any loading states
      await page.waitForLoadState('networkidle');
    });
  },

  isVisuallyVisible: async ({ page }, use) => {
    await use(async (selector: string) => {
      const element = await page.locator(selector);
      const box = await element.boundingBox();
      const isVisible = await element.isVisible();
      return isVisible && box !== null && box.width > 0 && box.height > 0;
    });
  },

  mockWalletConnected: async ({ page }, use) => {
    await use(async (address = '0x1234567890123456789012345678901234567890') => {
      // Mock localStorage to simulate connected wallet
      await page.evaluate((addr) => {
        localStorage.setItem('wagmi.store', JSON.stringify({
          state: {
            connections: {
              __type: 'Map',
              value: [['default', {
                accounts: [addr],
                chainId: 1,
                connector: { id: 'mock', name: 'Mock', type: 'injected' }
              }]]
            },
            chainId: 1,
            current: 'default'
          }
        }));
        localStorage.setItem('wagmi.connected', 'true');
      }, address);
    });
  },

  mockWalletDisconnected: async ({ page }, use) => {
    await use(async () => {
      await page.evaluate(() => {
        localStorage.removeItem('wagmi.store');
        localStorage.removeItem('wagmi.connected');
      });
    });
  },
});

export { expect };
