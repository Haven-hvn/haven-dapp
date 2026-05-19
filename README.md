# Haven - Decentralized Video Library

A Web3-powered video streaming platform with encrypted content using [Always Online (AOL)](https://github.com/HavenCTO/haven-aol), IPFS/Filecoin storage, and wallet-based authentication.

**Always Online (AOL)** is an ICP-native protocol for conditional, token-gated access using VetKD keys. AOL enables smart access patterns across web3—DAOs, DataDAOs, agent swarms, and shared resources.

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) with App Router
- **Styling**: Tailwind CSS + shadcn/ui
- **Web3**: wagmi, viem, @reown/appkit (Web3Modal)
- **Encryption / access control**: [Haven-AOL](https://github.com/HavenCTO/haven-aol) (ICP VetKD + EIP-712 gates)
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

# Haven-AOL (ICP + VetKD decryption)
NEXT_PUBLIC_ICP_HOST=https://icp-api.io
NEXT_PUBLIC_HAVEN_AOL_CANISTER_ID=your_canister_id
NEXT_PUBLIC_EIP712_CHAIN_ID=1
NEXT_PUBLIC_EIP712_VERIFYING_CONTRACT=0x0000000000000000000000000000000000000000
```

See [.env.local.example](.env.local.example) for the full list of optional variables (Arkiv, Synapse CDN, etc.).

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
│   │   ├── providers/    # Context providers (Web3, Haven-AOL)
│   │   └── ui/           # UI components
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utility libraries
│   │   ├── crypto.ts     # Encryption utilities
│   │   ├── haven-aol/    # Haven-AOL gate decrypt (ICP VetKD)
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
- 🔒 **Encrypted Video** - Token-gated decryption via Haven-AOL (VetKD on ICP)
- 📦 **Decentralized Storage** - Videos stored on IPFS/Filecoin
- 📱 **Responsive Design** - Works on desktop and mobile
- 🌙 **Dark Mode** - Built-in theme switching
- ⚡ **Fast Playback** - Optimized video streaming with local cache
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

### Haven-AOL (playback)

Content keys are released through conditional gates: the user signs an EIP-712 `GateRequest`, the Haven-AOL ICP canister verifies access (e.g. token balance on EVM), and the browser unwraps the VetKD-protected AES key. See the [haven-aol](https://github.com/HavenCTO/haven-aol) repository for the protocol spec and TypeScript SDK.

```typescript
import { decryptContentKey } from '@/lib/haven-aol';
import type { WalletClientLike } from '@/lib/haven-aol';

// Decrypt AES content key for playback (after fetch from IPFS/Filecoin)
const { aesKey, fromCache } = await decryptContentKey({
  encryptionMetadata: video.encryptionMetadata,
  encryptedCid: video.encryptedCid,
  walletClient: walletClient as WalletClientLike,
});
```

Upload and encryption are handled by [haven-cli](https://github.com/HavenCTO/haven-cli); this dapp focuses on read/playback.

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

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

## Documentation

- [E2E Testing Guide](e2e/README.md)
- [Web3 E2E Testing](e2e/web3/README.md)
- [Deployment Guide](DEPLOYMENT.md)
- [Video Cache Documentation](docs/video-cache/README.md)
  - [Architecture](docs/video-cache/architecture.md)
  - [API Reference](docs/video-cache/api-reference.md)
  - [Developer Guide](docs/video-cache/developer-guide.md)
  - [Troubleshooting](docs/video-cache/troubleshooting.md)

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [wagmi Documentation](https://wagmi.sh/)
- [Haven-AOL (Always Online)](https://github.com/HavenCTO/haven-aol)
- [AppKit Documentation](https://docs.reown.com/appkit/overview)
- [Playwright Documentation](https://playwright.dev/)

## License

MIT
