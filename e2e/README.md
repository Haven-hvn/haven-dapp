# E2E Testing with Playwright

This directory contains end-to-end tests for the Haven application using [Playwright](https://playwright.dev/).

## Test Coverage

### Pages Tested
- **Landing Page** (`landing.spec.ts`): Hero section, branding, navigation, features
- **Library Page** (`library.spec.ts`): Authentication, search, filters, video grid
- **Settings Page** (`settings.spec.ts`): Account info, storage settings
- **Watch Page** (`watch.spec.ts`): Video player, controls, navigation
- **Navigation** (`navigation.spec.ts`): Routing, 404 handling, redirects
- **Accessibility** (`accessibility.spec.ts`): A11y compliance, keyboard nav, ARIA
- **Performance** (`performance.spec.ts`): Load times, CLS, caching

### Web3 Tests (`web3/`)
- **Wallet Connection** (`wallet-connection.spec.ts`): Connect, disconnect, network switching
- **Web3 Authentication** (`web3-auth.spec.ts`): Lit Protocol auth, signatures, protected routes

## Running Tests

### Standard Tests

```bash
# Run all tests (excluding Web3)
npm run test

# Run tests in headed mode (see browser)
npm run test:headed

# Run tests with UI mode
npm run test:ui

# Debug tests
npm run test:debug

# Run specific browser
npm run test:chrome
npm run test:firefox
npm run test:webkit

# Run mobile tests
npm run test:mobile

# View HTML report
npm run test:report
```

### Web3 Tests

Web3 tests require additional setup for MetaMask automation:

```bash
# Run Web3 tests only
npm run test:web3

# Run Web3 tests in headed mode
npm run test:web3:headed

# Run Web3 tests with UI mode
npm run test:web3:ui

# Run all tests including Web3
npm run test:all
```

## Web3 Testing Setup

### 1. Configure Test Wallet

Copy `.env.test.example` to `.env.test` and configure your test wallet:

```bash
cp .env.test.example .env.test
```

Edit `.env.test`:

```env
# Test Wallet (NEVER use a real wallet with funds!)
TEST_WALLET_MNEMONIC=test test test test test test test test test test test junk
TEST_WALLET_PASSWORD=TestPassword123!
TEST_WALLET_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# RPC and Chain
NEXT_PUBLIC_ALCHEMY_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
NEXT_PUBLIC_CHAIN_ID=11155111
```

⚠️ **Important**: Use a dedicated test wallet with no real funds. The default mnemonic is the standard Hardhat/Anvil test wallet, which is safe for local testing.

### 2. Test Wallet Fixtures

The `web3-fixtures.ts` provides Web3-specific test fixtures:

| Fixture | Description |
|---------|-------------|
| `gotoWithWeb3(path)` | Navigate and wait for Web3 providers to initialize |
| `mockWalletConnected(address, chainId)` | Mock wallet connection state |
| `mockWalletDisconnected()` | Mock wallet disconnection |
| `mockSignature(signature)` | Mock signature response |
| `connectWalletViaUI()` | Click connect and open wallet modal |
| `disconnectWalletViaUI()` | Click disconnect button |
| `switchNetworkViaUI(chainId)` | Switch to different network |
| `waitForAuth()` | Wait for authentication to complete |
| `isWalletConnected()` | Check if wallet is connected |
| `getWalletAddress()` | Get displayed wallet address |

### 3. Writing Web3 Tests

```typescript
import { test, expect, TEST_WALLET } from '../web3-fixtures';

test.describe('My Web3 Feature', () => {
  test.beforeEach(async ({ page, gotoWithWeb3 }) => {
    await gotoWithWeb3('/');
  });

  test('should connect wallet', async ({ mockWalletConnected, isWalletConnected }) => {
    await mockWalletConnected(TEST_WALLET.address, 1);
    expect(await isWalletConnected()).toBe(true);
  });

  test('should access protected route', async ({ gotoWithWeb3, mockWalletConnected }) => {
    await gotoWithWeb3('/library');
    await mockWalletConnected(TEST_WALLET.address, 1);
    
    await expect(page.locator('h1:has-text("Your Library")')).toBeVisible();
  });
});
```

## Test Structure

```
e2e/
├── fixtures.ts               # Standard test fixtures
├── web3-fixtures.ts          # Web3/MetaMask test fixtures
├── web3.config.ts            # Synpress Web3 configuration
├── README.md                 # This file
├── landing.spec.ts           # Landing page tests
├── library.spec.ts           # Library page tests
├── settings.spec.ts          # Settings page tests
├── watch.spec.ts             # Watch page tests
├── navigation.spec.ts        # Navigation/routing tests
├── accessibility.spec.ts     # Accessibility tests
├── performance.spec.ts       # Performance tests
└── web3/                     # Web3-specific tests
    ├── wallet-connection.spec.ts  # Wallet connection tests
    └── web3-auth.spec.ts          # Web3 authentication tests
```

## Fixtures

### Standard Fixtures (`fixtures.ts`)

- `gotoAndHydrate(path)` - Navigate and wait for React hydration
- `isVisuallyVisible(selector)` - Check if element is actually visible
- `mockWalletConnected(address)` - Mock Web3 wallet connection (basic)
- `mockWalletDisconnected()` - Mock wallet disconnection (basic)

### Web3 Fixtures (`web3-fixtures.ts`)

- `gotoWithWeb3(path)` - Navigate with Web3 provider initialization
- `mockWalletConnected(address, chainId)` - Full wallet connection mock
- `mockWalletDisconnected()` - Full disconnection with storage cleanup
- `mockSignature(signature)` - Mock Lit Protocol signature
- `waitForWalletModal()` - Wait for AppKit/Reown modal
- `connectWalletViaUI()` - Connect via UI (opens wallet modal)
- `disconnectWalletViaUI()` - Disconnect via UI
- `switchNetworkViaUI(chainId)` - Switch networks via UI
- `waitForAuth()` - Wait for auth state to be ready
- `isWalletConnected()` - Check connection status
- `getWalletAddress()` - Get connected address

## Web3 Test Utilities

### Test Networks

```typescript
import { TEST_NETWORKS } from './web3-fixtures';

// Available networks
TEST_NETWORKS.mainnet  // Ethereum Mainnet (chainId: 1)
TEST_NETWORKS.sepolia  // Sepolia Testnet (chainId: 11155111)
TEST_NETWORKS.hardhat  // Hardhat Local (chainId: 31337)
TEST_NETWORKS.anvil    // Anvil Local (chainId: 31337)
```

### Test Wallet

```typescript
import { TEST_WALLET } from './web3-fixtures';

TEST_WALLET.mnemonic  // Test wallet mnemonic
TEST_WALLET.password  // MetaMask password
TEST_WALLET.address   // Expected address
```

## MetaMask Automation (Advanced)

For full MetaMask extension automation, use [Synpress](https://synpress.io/):

### Setup

1. Install Synpress (already included):
```bash
npm install --save-dev @synthetixio/synpress
```

2. Run with Synpress:
```bash
npx synpress run --configFile e2e/web3.config.ts
```

### Synpress Features

- Automatic MetaMask extension installation
- Wallet import from mnemonic
- Transaction confirmation
- Signature approval
- Network switching
- Token approval handling

### Example Synpress Test

```typescript
import { test } from '@synthetixio/synpress';
import { metaMaskWallet } from '@synthetixio/synpress/wallets';

test('connect with MetaMask', async ({ page, context }) => {
  // MetaMask is automatically injected
  await page.goto('/');
  
  // Click connect
  await page.click('appkit-button');
  
  // MetaMask popup is handled automatically
  await metaMaskWallet.approve(context);
  
  // Verify connection
  await expect(page.locator('text=0x')).toBeVisible();
});
```

## CI/CD

Tests run automatically on:
- Push to `main`, `master`, or `develop` branches
- Pull requests to these branches

### GitHub Actions Example

```yaml
- name: Run E2E Tests
  run: |
    npm run test:chrome
    
- name: Run Web3 Tests
  env:
    TEST_WALLET_MNEMONIC: ${{ secrets.TEST_WALLET_MNEMONIC }}
    TEST_WALLET_PASSWORD: ${{ secrets.TEST_WALLET_PASSWORD }}
    NEXT_PUBLIC_ALCHEMY_RPC: ${{ secrets.ALCHEMY_RPC }}
  run: |
    npm run test:web3
```

## Best Practices

### General

1. Use `gotoAndHydrate` or `gotoWithWeb3` instead of `page.goto`
2. Mock wallet state for protected routes
3. Use data-testid attributes for reliable selectors
4. Include both positive and negative test cases
5. Test responsive behavior with different viewports

### Web3 Specific

1. **Never use real wallets** - Always use test wallets with no funds
2. **Mock when possible** - Use `mockWalletConnected` for faster tests
3. **Test network switching** - Verify behavior on different chains
4. **Check localStorage** - Auth state is stored there
5. **Wait for Web3 init** - Providers take time to initialize
6. **Use Sepolia for E2E** - Mainnet is too slow/expensive for tests

### Test Isolation

Each test should be independent:

```typescript
test.beforeEach(async ({ page, mockWalletDisconnected }) => {
  // Reset to known state
  await mockWalletDisconnected();
});
```

### Debugging

```bash
# Run single test file
npx playwright test e2e/web3/wallet-connection.spec.ts

# Run with debugging
npx playwright test --debug

# View trace
npx playwright show-trace test-results/trace.zip
```

## Troubleshooting

### Web3 Tests Failing

1. Check `.env.test` is configured
2. Ensure dev server is running (`npm run dev`)
3. Verify test wallet has no pending transactions
4. Check chain ID matches your RPC

### MetaMask Not Connecting

1. Verify `TEST_WALLET_MNEMONIC` is correct
2. Check MetaMask version compatibility
3. Try headed mode to see what's happening:
   ```bash
   npm run test:web3:headed
   ```

### Slow Tests

1. Use mocks instead of real MetaMask for most tests
2. Limit Web3 tests to critical paths
3. Run Web3 tests separately from main suite

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Synpress Documentation](https://synpress.io/)
- [MetaMask Test Dapp](https://metamask.github.io/test-dapp/)
- [AppKit Documentation](https://docs.reown.com/appkit/overview)
