# Haven - Decentralized Video Library

A Web3-powered video streaming platform with encrypted content using Lit Protocol, IPFS/Filecoin storage, and wallet-based authentication.

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) with App Router
- **Styling**: Tailwind CSS + shadcn/ui
- **Web3**: wagmi, viem, @reown/appkit (Web3Modal)
- **Encryption**: Lit Protocol
- **Storage**: IPFS/Filecoin via Arkiv SDK
- **Testing**: Playwright + Synpress (MetaMask automation)

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9

### Installation

```bash
npm install
```

### Environment Setup

Copy the example environment file:

```bash
cp .env.local.example .env.local
```

Required environment variables:

```env
# WalletConnect Project ID (get from https://cloud.walletconnect.com)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id

# Alchemy RPC URL
NEXT_PUBLIC_ALCHEMY_RPC=https://eth-sepolia.g.alchemy.com/v2/your_api_key

# Chain ID (1 = Mainnet, 11155111 = Sepolia)
NEXT_PUBLIC_CHAIN_ID=11155111

# Lit Protocol Network
tNEXT_PUBLIC_LIT_NETWORK=datil-dev
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Testing

### Standard E2E Tests

```bash
# Install Playwright browsers
npm run test:install

# Run all tests
npm run test

# Run with UI mode
npm run test:ui

# Run specific browser
npm run test:chrome
npm run test:firefox
```

### Web3 E2E Tests (MetaMask Automation)

Web3 tests require additional setup for MetaMask automation:

```bash
# Setup test wallet configuration
cp .env.test.example .env.test

# Edit .env.test with your test wallet (NEVER use a wallet with real funds!)
TEST_WALLET_MNEMONIC=test test test test test test test test test test test junk
TEST_WALLET_PASSWORD=TestPassword123!

# Run Web3 tests
npm run test:web3

# Run with visible browser (for debugging)
npm run test:web3:headed
```

See [e2e/web3/README.md](e2e/web3/README.md) for detailed Web3 testing documentation.

## Project Structure

```
├── src/
│   ├── app/              # Next.js App Router
│   ├── components/       # React components
│   │   ├── auth/         # Authentication components
│   │   ├── providers/    # Context providers (Web3, Auth, Lit)
│   │   └── ui/           # UI components
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utility libraries
│   │   ├── crypto.ts     # Encryption utilities
│   │   ├── lit.ts        # Lit Protocol integration
│   │   └── wagmi.ts      # Web3 configuration
│   └── stores/           # Zustand state stores
├── e2e/                  # Playwright E2E tests
│   ├── web3/             # Web3-specific tests
│   ├── fixtures.ts       # Test fixtures
│   └── web3-fixtures.ts  # Web3 test fixtures
├── public/               # Static assets
└── ...config files
```

## Features

- 🔐 **Wallet Authentication** - Connect with MetaMask or any Web3 wallet
- 🔒 **Encrypted Video** - Content encrypted with Lit Protocol
- 📦 **Decentralized Storage** - Videos stored on IPFS/Filecoin
- 📱 **Responsive Design** - Works on desktop and mobile
- 🌙 **Dark Mode** - Built-in theme switching
- ⚡ **Fast Playback** - Optimized video streaming
- 🧪 **E2E Tested** - Comprehensive Playwright tests including Web3 flows

## Web3 Integration

### Wallet Connection

Uses @reown/appkit (formerly Web3Modal) for wallet connections:

```typescript
import { useAppKitAccount } from '@reown/appkit/react';

function MyComponent() {
  const { address, isConnected } = useAppKitAccount();
  // ...
}
```

### Lit Protocol

Content encryption/decryption with Lit Protocol:

```typescript
import { encryptVideo, decryptVideo } from '@/lib/lit';

// Encrypt before upload
const encrypted = await encryptVideo(videoFile, walletAddress);

// Decrypt for playback
const decrypted = await decryptVideo(encryptedData, accessControlConditions);
```

### E2E Testing with MetaMask

Automated Web3 testing using Playwright + Synpress:

```typescript
import { test, expect, TEST_WALLET } from './web3-fixtures';

test('user can connect wallet', async ({ 
  page, 
  mockWalletConnected,
  isWalletConnected 
}) => {
  await page.goto('/');
  await mockWalletConnected(TEST_WALLET.address);
  
  expect(await isWalletConnected()).toBe(true);
});
```

## Deployment

### Vercel

The easiest way to deploy is using [Vercel](https://vercel.com):

```bash
vercel --prod
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

## Documentation

- [E2E Testing Guide](e2e/README.md)
- [Web3 E2E Testing](e2e/web3/README.md)
- [Deployment Guide](DEPLOYMENT.md)

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [wagmi Documentation](https://wagmi.sh/)
- [Lit Protocol Documentation](https://developer.litprotocol.com/)
- [AppKit Documentation](https://docs.reown.com/appkit/overview)
- [Playwright Documentation](https://playwright.dev/)

## License

MIT
