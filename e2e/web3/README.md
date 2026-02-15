# Web3 E2E Testing

This directory contains end-to-end tests specifically for Web3 functionality including wallet connections, MetaMask interactions, and Lit Protocol authentication.

## Overview

Web3 testing is separated from standard E2E tests because:
- Requires special MetaMask/extension setup
- Needs longer timeouts for blockchain interactions
- Should run sequentially (MetaMask can't handle parallel sessions)
- Uses different test fixtures with Web3 capabilities

## Quick Start

### 1. Setup Test Wallet

```bash
# Copy example config
cp .env.test.example .env.test

# Edit with your test wallet (NEVER use real funds!)
TEST_WALLET_MNEMONIC=test test test test test test test test test test test junk
TEST_WALLET_PASSWORD=TestPassword123!
```

### 2. Run Tests

```bash
# Run Web3 tests
npm run test:web3

# Run with visible browser
npm run test:web3:headed

# Debug mode
npm run test:web3:ui
```

## Test Files

| File | Description |
|------|-------------|
| `wallet-connection.spec.ts` | Wallet connection, disconnection, network switching |
| `web3-auth.spec.ts` | Lit Protocol auth, signatures, protected routes |

## Test Patterns

### Mocking Wallet Connection (Fast)

```typescript
import { test, expect, TEST_WALLET } from '../web3-fixtures';

test('access library with mocked wallet', async ({ 
  page, 
  gotoWithWeb3, 
  mockWalletConnected,
  waitForAuth 
}) => {
  await gotoWithWeb3('/library');
  await mockWalletConnected(TEST_WALLET.address, 1);
  await waitForAuth();
  
  await expect(page.locator('h1:has-text("Your Library")')).toBeVisible();
});
```

### Testing Connection UI

```typescript
test('connect button opens wallet modal', async ({ 
  page, 
  gotoWithWeb3,
  connectWalletViaUI,
  waitForWalletModal 
}) => {
  await gotoWithWeb3('/');
  await connectWalletViaUI();
  
  // Modal should appear
  await waitForWalletModal();
  await expect(page.locator('[role="dialog"]')).toBeVisible();
});
```

### Network Switching

```typescript
test('switch to Sepolia network', async ({ 
  page, 
  gotoWithWeb3,
  mockWalletConnected,
  switchNetworkViaUI 
}) => {
  await gotoWithWeb3('/library');
  await mockWalletConnected(TEST_WALLET.address, 1); // Mainnet
  
  // Switch to Sepolia
  await switchNetworkViaUI(11155111);
  
  // Verify UI updated
  await expect(page.locator('text=Sepolia')).toBeVisible();
});
```

### Lit Protocol Testing

```typescript
test('Lit Protocol signature storage', async ({ 
  mockWalletConnected,
  mockSignature,
  page 
}) => {
  await mockWalletConnected(TEST_WALLET.address, 1);
  await mockSignature('0x' + 'a'.repeat(130));
  
  // Verify signature stored
  const sig = await page.evaluate(() => {
    return localStorage.getItem('lit-auth-signature');
  });
  
  expect(sig).toBeTruthy();
});
```

## Available Fixtures

From `../web3-fixtures.ts`:

| Fixture | Purpose |
|---------|---------|
| `gotoWithWeb3(path)` | Navigate with Web3 initialization |
| `mockWalletConnected(address, chainId)` | Mock connection |
| `mockWalletDisconnected()` | Clear all wallet state |
| `mockSignature(sig)` | Mock Lit signature |
| `waitForWalletModal()` | Wait for AppKit modal |
| `connectWalletViaUI()` | Click connect button |
| `disconnectWalletViaUI()` | Click disconnect |
| `switchNetworkViaUI(chainId)` | Switch networks |
| `waitForAuth()` | Wait for auth completion |
| `isWalletConnected()` | Check connection status |
| `getWalletAddress()` | Get displayed address |

## Configuration

### Environment Variables

```env
# Required
TEST_WALLET_MNEMONIC=your test wallet mnemonic
TEST_WALLET_PASSWORD=metamask password
TEST_WALLET_ADDRESS=expected address

# Optional
NEXT_PUBLIC_ALCHEMY_RPC=your rpc url
NEXT_PUBLIC_CHAIN_ID=11155111
METAMASK_VERSION=11.15.0
```

### Test Networks

Default test networks available in `TEST_NETWORKS`:

```typescript
TEST_NETWORKS.mainnet   // Chain ID 1
TEST_NETWORKS.sepolia   // Chain ID 11155111
TEST_NETWORKS.hardhat   // Chain ID 31337
TEST_NETWORKS.anvil     // Chain ID 31337
```

## Full MetaMask Automation

For tests requiring real MetaMask interactions (transaction signing, etc.), use Synpress:

```typescript
import { test } from '@synthetixio/synpress';
import { metaMaskWallet } from '@synthetixio/synpress/wallets';

test('real metamask connection', async ({ page, context }) => {
  await page.goto('/library');
  await page.click('appkit-button');
  
  // Handle MetaMask popup
  await metaMaskWallet.connectToDapp(context);
  await metaMaskWallet.approve(context);
  
  // Verify connected
  await expect(page.locator(`text=${TEST_WALLET.address.slice(0, 6)}`)).toBeVisible();
});
```

Run with Synpress:
```bash
npx synpress run --configFile e2e/web3.config.ts
```

## Debugging

### View Browser Actions

```bash
npm run test:web3:headed
```

### Slow Motion

Add to `.env.test`:
```env
SYNPRESS_SLOW_MO=1000  # 1 second delay between actions
```

### Screenshots on Failure

Screenshots are automatically captured on failure in `test-results/`.

### View Traces

```bash
npx playwright show-trace test-results/trace.zip
```

## Common Issues

### "Wallet not connecting"

- Check `TEST_WALLET_MNEMONIC` is correct
- Verify chain ID matches your RPC
- Ensure dev server is running

### "Modal not appearing"

- Wait for Web3 providers to initialize (use `gotoWithWeb3`)
- Check AppKit is properly configured
- Try increasing timeout

### "Auth state not persisting"

- localStorage might be cleared between tests
- Use `mockWalletConnected` before each test
- Check storage event listeners

## Best Practices

1. **Use mocks for speed** - Only use real MetaMask for critical paths
2. **Reset state between tests** - Call `mockWalletDisconnected` in `beforeEach`
3. **Test on Sepolia** - Don't use mainnet for automated tests
4. **Isolate Web3 tests** - They run slower, keep them separate
5. **Never commit real keys** - Always use test wallets

## Resources

- [Playwright Docs](https://playwright.dev/)
- [Synpress Docs](https://synpress.io/)
- [AppKit Docs](https://docs.reown.com/)
- [MetaMask Docs](https://docs.metamask.io/)
