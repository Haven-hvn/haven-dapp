/**
 * Web3 E2E Test Fixtures with MetaMask Automation
 * 
 * Provides fixtures for testing Web3 interactions including:
 * - MetaMask wallet connection
 * - Signature requests
 * - Network switching
 * - Transaction confirmation
 * 
 * @module e2e/web3-fixtures
 */

import { test as baseTest, expect, type Page, type BrowserContext } from '@playwright/test';

// Test wallet configuration
export const TEST_WALLET = {
  mnemonic: process.env.TEST_WALLET_MNEMONIC || 
    'test test test test test test test test test test test junk',
  password: process.env.TEST_WALLET_PASSWORD || 'TestPassword123!',
  address: process.env.TEST_WALLET_ADDRESS || 
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
};

// Network configurations for testing
export const TEST_NETWORKS = {
  mainnet: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    rpcUrl: process.env.NEXT_PUBLIC_ALCHEMY_RPC || 'https://eth-mainnet.g.alchemy.com/v2/demo',
    symbol: 'ETH',
  },
  sepolia: {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    rpcUrl: process.env.NEXT_PUBLIC_ALCHEMY_RPC || 'https://eth-sepolia.g.alchemy.com/v2/demo',
    symbol: 'ETH',
  },
  hardhat: {
    chainId: 31337,
    name: 'Hardhat Local',
    rpcUrl: 'http://127.0.0.1:8545',
    symbol: 'ETH',
  },
  anvil: {
    chainId: 31337,
    name: 'Anvil Local',
    rpcUrl: 'http://127.0.0.1:8545',
    symbol: 'ETH',
  },
};

// Types for Web3 fixtures
type Web3Fixtures = {
  /** Navigate and wait for wallet connection UI to be ready */
  gotoWithWeb3: (path: string) => Promise<void>;
  
  /** Mock wallet connection without MetaMask */
  mockWalletConnected: (address?: string, chainId?: number) => Promise<void>;
  
  /** Mock wallet disconnection */
  mockWalletDisconnected: () => Promise<void>;
  
  /** Mock signature response */
  mockSignature: (signature?: string) => Promise<void>;
  
  /** Wait for wallet modal to appear */
  waitForWalletModal: () => Promise<void>;
  
  /** Connect wallet via UI (AppKit/Reown) */
  connectWalletViaUI: () => Promise<void>;
  
  /** Disconnect wallet via UI */
  disconnectWalletViaUI: () => Promise<void>;
  
  /** Switch network via UI */
  switchNetworkViaUI: (chainId: number) => Promise<void>;
  
  /** Wait for authentication to complete */
  waitForAuth: () => Promise<void>;
  
  /** Check if wallet is connected */
  isWalletConnected: () => Promise<boolean>;
  
  /** Get connected wallet address from UI */
  getWalletAddress: () => Promise<string | null>;
};

/**
 * Extended test fixture with Web3 capabilities
 * 
 * Note: Full MetaMask automation via Synpress requires additional setup:
 * - Run tests with `synpress run` command
 * - MetaMask extension is automatically injected
 * 
 * For basic testing, we provide UI-based wallet interactions that work
 * with AppKit (Reown) without requiring the full MetaMask extension.
 */
export const test = baseTest.extend<Web3Fixtures>({
  // Extend timeout for Web3 operations
  page: async ({ page }, use) => {
    // Set default timeout for Web3 operations
    page.setDefaultTimeout(30000);
    await use(page);
  },

  /** Navigate to page and wait for Web3 UI to be ready */
  gotoWithWeb3: async ({ page }, use) => {
    await use(async (path: string) => {
      await page.goto(path);
      
      // Wait for React hydration
      await page.waitForFunction(() => {
        return document.querySelector('[data-nextjs-page]') !== null || 
               document.readyState === 'complete';
      });
      
      // Wait for Web3 providers to initialize
      await page.waitForTimeout(1000);
      
      // Wait for network idle
      await page.waitForLoadState('networkidle');
    });
  },

  /** Mock wallet connection by injecting state into localStorage */
  mockWalletConnected: async ({ page }, use) => {
    await use(async (address = TEST_WALLET.address, chainId = 1) => {
      await page.evaluate(({ addr, chain }) => {
        // Mock wagmi store
        localStorage.setItem('wagmi.store', JSON.stringify({
          state: {
            connections: {
              __type: 'Map',
              value: [['default', {
                accounts: [addr],
                chainId: chain,
                connector: { id: 'mock', name: 'Mock', type: 'injected' }
              }]]
            },
            chainId: chain,
            current: 'default'
          }
        }));
        localStorage.setItem('wagmi.connected', 'true');
        
        // Mock auth store
        localStorage.setItem('haven-auth-storage', JSON.stringify({
          state: {
            address: addr,
            chainId: chain,
            isAuthenticated: true,
            lastConnected: Date.now(),
            preferredConnector: 'mock'
          },
          version: 0
        }));
        
        // Dispatch storage event for listeners
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'wagmi.store',
          newValue: localStorage.getItem('wagmi.store')
        }));
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'haven-auth-storage',
          newValue: localStorage.getItem('haven-auth-storage')
        }));
      }, { addr: address, chain: chainId });
      
      // Reload to apply mocked state
      await page.reload();
      await page.waitForLoadState('networkidle');
    });
  },

  /** Mock wallet disconnection */
  mockWalletDisconnected: async ({ page }, use) => {
    await use(async () => {
      await page.evaluate(() => {
        localStorage.removeItem('wagmi.store');
        localStorage.removeItem('wagmi.connected');
        localStorage.removeItem('haven-auth-storage');
        localStorage.removeItem('lit-auth-signature');
        localStorage.removeItem('lit-auth-storage');
        
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'wagmi.store',
          newValue: null
        }));
      });
      
      await page.reload();
      await page.waitForLoadState('networkidle');
    });
  },

  /** Mock signature by injecting into localStorage */
  mockSignature: async ({ page }, use) => {
    await use(async (signature = '0x' + 'a'.repeat(130)) => {
      await page.evaluate((sig) => {
        localStorage.setItem('lit-auth-signature', JSON.stringify({
          signature: sig,
          timestamp: Date.now()
        }));
      }, signature);
    });
  },

  /** Wait for wallet modal/modal to appear */
  waitForWalletModal: async ({ page }, use) => {
    await use(async () => {
      // AppKit/Reown modal selectors
      const modalSelectors = [
        '[role="dialog"]',
        '[data-testid="w3m-modal"]',
        '.w3m-modal',
        '[data-testid="connect-modal"]',
        'text=Connect Wallet',
        'text=Select Wallet',
      ];
      
      for (const selector of modalSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          return;
        } catch {
          continue;
        }
      }
      
      throw new Error('Wallet modal did not appear');
    });
  },

  /** Connect wallet via UI interactions */
  connectWalletViaUI: async ({ page, waitForWalletModal }, use) => {
    await use(async () => {
      // Look for connect button
      const connectButtonSelectors = [
        'appkit-button',
        '[data-testid="connect-button"]',
        'button:has-text("Connect")',
        'button:has-text("Connect Wallet")',
        'w3m-button',
      ];
      
      let connectButton = null;
      for (const selector of connectButtonSelectors) {
        const button = page.locator(selector).first();
        if (await button.isVisible().catch(() => false)) {
          connectButton = button;
          break;
        }
      }
      
      if (!connectButton) {
        throw new Error('Connect button not found');
      }
      
      await connectButton.click();
      await waitForWalletModal();
      
      // In a real MetaMask test, we would interact with the MetaMask popup here
      // For UI-only tests, we mock the connection
    });
  },

  /** Disconnect wallet via UI */
  disconnectWalletViaUI: async ({ page }, use) => {
    await use(async () => {
      // Look for disconnect button
      const disconnectSelectors = [
        'button:has-text("Disconnect")',
        'button:has-text("Exit")',
        '[data-testid="disconnect-button"]',
      ];
      
      for (const selector of disconnectSelectors) {
        const button = page.locator(selector).first();
        if (await button.isVisible().catch(() => false)) {
          await button.click();
          return;
        }
      }
      
      throw new Error('Disconnect button not found');
    });
  },

  /** Switch network via UI */
  switchNetworkViaUI: async ({ page }, use) => {
    await use(async (chainId: number) => {
      // Click on network indicator if present
      const networkButton = page.locator('[data-testid="network-button"], button:has-text("Ethereum"), button:has-text("Sepolia"), button:has-text("Wrong")').first();
      
      if (await networkButton.isVisible().catch(() => false)) {
        await networkButton.click();
        
        // Select target network
        const networkName = chainId === 1 ? 'Ethereum' : 'Sepolia';
        const networkOption = page.locator(`text=${networkName}`).first();
        
        if (await networkOption.isVisible().catch(() => false)) {
          await networkOption.click();
        }
      }
    });
  },

  /** Wait for authentication to complete */
  waitForAuth: async ({ page }, use) => {
    await use(async () => {
      // Wait for auth state indicators
      await Promise.race([
        page.waitForSelector('[data-testid="authenticated"]', { timeout: 30000 }),
        page.waitForSelector('text=Your Library', { timeout: 30000 }),
        page.waitForFunction(() => {
          const auth = localStorage.getItem('haven-auth-storage');
          if (auth) {
            const parsed = JSON.parse(auth);
            return parsed.state?.isAuthenticated === true;
          }
          return false;
        }, { timeout: 30000 }),
      ]);
    });
  },

  /** Check if wallet is connected */
  isWalletConnected: async ({ page }, use) => {
    await use(async () => {
      // Check for wallet address display
      const addressIndicators = [
        '[data-testid="wallet-address"]',
        'text=0x',
        'button:has-text("Disconnect")',
        'button:has-text("Exit")',
      ];
      
      for (const selector of addressIndicators) {
        const element = page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          return true;
        }
      }
      
      // Check localStorage
      const isConnected = await page.evaluate(() => {
        const wagmi = localStorage.getItem('wagmi.connected');
        const auth = localStorage.getItem('haven-auth-storage');
        return wagmi === 'true' || (auth && JSON.parse(auth).state?.isAuthenticated);
      });
      
      return isConnected;
    });
  },

  /** Get wallet address from UI */
  getWalletAddress: async ({ page }, use) => {
    await use(async () => {
      // Try to get from UI
      const addressElement = page.locator('[data-testid="wallet-address"]').first();
      if (await addressElement.isVisible().catch(() => false)) {
        return await addressElement.textContent();
      }
      
      // Try to get from localStorage
      const address = await page.evaluate(() => {
        const auth = localStorage.getItem('haven-auth-storage');
        if (auth) {
          return JSON.parse(auth).state?.address || null;
        }
        const wagmi = localStorage.getItem('wagmi.store');
        if (wagmi) {
          const state = JSON.parse(wagmi).state;
          if (state?.connections?.value?.[0]?.[1]?.accounts?.[0]) {
            return state.connections.value[0][1].accounts[0];
          }
        }
        return null;
      });
      
      return address;
    });
  },
});

export { expect };
