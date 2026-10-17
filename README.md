# Haven - Decentralized Video Library

Web3 video streaming with encrypted content via [Always Online (AOL)](https://github.com/haven-hvn/haven-aol), IPFS/Filecoin storage, and wallet auth. AOL is an ICP-native protocol for conditional, token-gated access using VetKD keys.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS + shadcn/ui
- **Web3**: wagmi, viem, @reown/appkit
- **Encryption**: Haven-AOL (ICP VetKD + EIP-712 gates)
- **Storage**: IPFS/Filecoin via Arkiv SDK
- **Testing**: Playwright + Synpress (MetaMask automation)

## Getting Started

### Prerequisites

- Node.js >= 18, npm >= 9

### Installation

```bash
npm install
cp .env.local.example .env.local
```

Fill in required env vars (WalletConnect project ID, Alchemy RPC, chain ID, Haven-AOL canister ID, etc.). See [.env.local.example](.env.local.example) for the full list.

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Testing

```bash
npm run test:install   # install Playwright browsers
npm run test           # run all tests
npm run test:ui        # UI mode
npm run test:chrome    # specific browser
```

Web3 tests need a test wallet:

```bash
cp .env.test.example .env.test
# set TEST_WALLET_MNEMONIC and TEST_WALLET_PASSWORD
npm run test:web3        # run Web3 tests
npm run test:web3:headed # visible browser
```

See [e2e/web3/README.md](e2e/web3/README.md) for details.

## Project Structure

```
src/
├── app/            # Next.js App Router
├── components/     # auth/, providers/, ui/
├── hooks/          # custom React hooks
├── lib/            # crypto.ts, haven-aol/, wagmi.ts
└── stores/         # Zustand stores
e2e/                # Playwright + Web3 tests
public/             # static assets
```

## Features

- 🔐 Wallet authentication (MetaMask or any Web3 wallet)
- 🔒 Encrypted video (token-gated via Haven-AOL VetKD)
- 📦 Decentralized storage (IPFS/Filecoin)
- 📱 Responsive design
- 🌙 Dark mode
- ⚡ Fast playback with local cache
- 🧪 E2E tested (incl. Web3 flows)

## Web3 Integration

Wallet connection uses @reown/appkit:

```typescript
import { useAppKitAccount } from '@reown/appkit/react';
const { address, isConnected } = useAppKitAccount();
```

Haven-AOL releases content keys through conditional gates: user signs an EIP-712 `GateRequest`, the ICP canister verifies access, and the browser unwraps the VetKD-protected AES key. See [haven-aol](https://github.com/haven-hvn/haven-aol). Upload/encryption is handled by [haven-cli](https://github.com/haven-hvn/haven-cli); this dapp focuses on playback:

```typescript
import { decryptContentKey } from '@/lib/haven-aol';
const { aesKey, fromCache } = await decryptContentKey({ encryptionMetadata, encryptedCid, walletClient });
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md).

## Documentation

- [E2E Testing](e2e/README.md) · [Web3 E2E](e2e/web3/README.md) · [Deployment](DEPLOYMENT.md)
- [Video Cache](docs/video-cache/README.md): [Architecture](docs/video-cache/architecture.md) · [API](docs/video-cache/api-reference.md) · [Dev Guide](docs/video-cache/developer-guide.md) · [Troubleshooting](docs/video-cache/troubleshooting.md)

## Resources

- [Next.js](https://nextjs.org/docs) · [wagmi](https://wagmi.sh/) · [Haven-AOL](https://github.com/haven-hvn/haven-aol) · [AppKit](https://docs.reown.com/appkit/overview) · [Playwright](https://playwright.dev/)

## License

MIT
```