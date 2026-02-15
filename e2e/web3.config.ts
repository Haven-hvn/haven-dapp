/**
 * Synpress Configuration for Web3 E2E Testing with MetaMask
 * 
 * This configuration sets up automated MetaMask interactions for testing
 * Web3 wallet connections, signatures, and transactions.
 * 
 * @see https://synpress.io/
 */

import { defineConfig } from '@synthetixio/synpress';
import { config as baseConfig } from '../playwright.config';

// Test wallet configuration - Use a dedicated test wallet, never a real one!
// These should be set in .env.test file
const TEST_WALLET = {
  // Default test mnemonic (replace with your test wallet in .env.test)
  // This is a well-known test mnemonic for development purposes only
  mnemonic: process.env.TEST_WALLET_MNEMONIC || 
    'test test test test test test test test test test test junk',
  password: process.env.TEST_WALLET_PASSWORD || 'TestPassword123!',
  // First account derived from the default test mnemonic
  address: process.env.TEST_WALLET_ADDRESS || 
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
};

// MetaMask version to use for testing
const METAMASK_VERSION = process.env.METAMASK_VERSION || 'latest';

export default defineConfig({
  ...baseConfig,
  
  // Test directory for Web3-specific tests
  testDir: './web3',
  
  // Web3 tests need more time due to MetaMask interactions
  timeout: 120 * 1000, // 2 minutes
  
  // Single worker for MetaMask tests to avoid conflicts
  workers: 1,
  
  // Synpress-specific configuration
  use: {
    ...baseConfig.use,
    
    // Synpress injects MetaMask into the browser context
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000',
    
    // Screenshot and video settings for debugging
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    trace: 'on-first-retry',
  },
  
  // Synpress projects with MetaMask
  projects: [
    {
      name: 'web3-chromium',
      use: {
        browserName: 'chromium',
        // Synpress handles the MetaMask extension setup
      },
    },
  ],
  
  // Environment variables available to tests
  env: {
    TEST_WALLET_MNEMONIC: TEST_WALLET.mnemonic,
    TEST_WALLET_PASSWORD: TEST_WALLET.password,
    TEST_WALLET_ADDRESS: TEST_WALLET.address,
    METAMASK_VERSION,
  },
});

// Export test wallet for use in tests
export { TEST_WALLET };
