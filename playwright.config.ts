import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E testing
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  
  /* Exclude web3 tests from regular runs - they need special setup */
  testIgnore: process.env.INCLUDE_WEB3_TESTS ? [] : ['**/web3/**'],
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,
  
  /* Reporter to use */
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000',
    
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Capture screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'on-first-retry',
    
    /* Viewport size for consistency */
    viewport: { width: 1280, height: 720 },
    
    /* Web3 test configuration */
    ...(process.env.INCLUDE_WEB3_TESTS && {
      // Extend timeout for Web3 operations (MetaMask interactions)
      actionTimeout: 30000,
      navigationTimeout: 30000,
    }),
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    /* Test against mobile viewports */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
    /* Web3 tests with MetaMask (chromium only) */
    ...(process.env.INCLUDE_WEB3_TESTS ? [
      {
        name: 'web3-chromium',
        testMatch: /web3\/.*\.spec\.ts/,
        use: { 
          ...devices['Desktop Chrome'],
          // Web3 tests need more time
          actionTimeout: 60000,
        },
        // Web3 tests need to run sequentially
        fullyParallel: false,
        workers: 1,
      }
    ] : []),
  ],

  /* Run local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
