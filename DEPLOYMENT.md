# Haven Web Deployment Guide

This guide covers the deployment process for the Haven Web DApp, including environment setup, build configuration, and deployment options.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Build Configuration](#build-configuration)
- [Deployment Options](#deployment-options)
- [Performance Monitoring](#performance-monitoring)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Node.js 26.7+ and npm 11+ (pinned via `.nvmrc` / `engines`)
- Git
- WalletConnect Project ID
- Alchemy API Key (optional but recommended)
- PinMe AppKey (for `pinme upload` — get via `pinme login` → `pinme show-appkey` at https://pinme.eth.limo)

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in the required values:

```bash
cp .env.local.example .env.local
```

### Required Variables

| Variable | Description | Source |
|----------|-------------|--------|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID | [WalletConnect Cloud](https://cloud.walletconnect.com) |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_ALCHEMY_API_KEY` | Alchemy API key for RPC | - |
| `NEXT_PUBLIC_ALCHEMY_RPC` | Custom Alchemy RPC URL | - |
| `NEXT_PUBLIC_CHAIN_ID` | Default chain ID | 1 (Ethereum) |
| `NEXT_PUBLIC_ARKIV_RPC_URL` | Arkiv RPC URL | `https://braga.hoodi.arkiv.network/rpc` |
| `NEXT_PUBLIC_ARKIV_API_URL` | Arkiv HTTP API URL | `https://braga.hoodi.arkiv.network/api` |
| `NEXT_PUBLIC_ICP_HOST` | ICP API host for Haven-AOL | `https://icp-api.io` |
| `NEXT_PUBLIC_HAVEN_AOL_CANISTER_ID` | Haven-AOL canister ID | (see `.env.local.example`) |
| `NEXT_PUBLIC_EIP712_CHAIN_ID` | EIP-712 chain ID for gate signatures | `1` |
| `NEXT_PUBLIC_EIP712_VERIFYING_CONTRACT` | EIP-712 verifying contract | (see `.env.local.example`) |
| `NEXT_PUBLIC_HAVEN_AOL_FETCH_ROOT_KEY` | Fetch ICP root key (local dev only) | `false` |
| `NEXT_PUBLIC_APP_URL` | Application URL | `https://haven.video` |

## Build Configuration

### Development

```bash
npm install
npm run dev
```

### Production Build

```bash
npm run build
```

### Static Export (for IPFS)

```bash
npm run export
```

### Bundle Analysis

```bash
npm run analyze
```

## Deployment Options

### PinMe (Primary — IPFS, current)

Haven is a static export (`next.config.mjs` `output: 'export'` → `out/`) and is deployed via [PinMe](https://github.com/glitternetwork/pinme) (IPFS, `pinme upload`).

**Local deploy:**
```bash
npm ci --legacy-peer-deps
npm run build          # verifies ./out/index.html
npm install -g pinme   # or npx pinme@2.0.12
pinme login            # browser login
pinme show-appkey      # copy AppKey
pinme set-appkey <AppKey>
pinme upload ./out                    # IPFS upload → CID + gateway URL
pinme upload ./out --domain my-site   # optional subdomain binding (requires wallet balance)
pinme upload ./out --domain example.com --dns  # DNS domain
```

**CI deploy (GitHub Actions `Deploy to PinMe`):**
- Workflow: [.github/workflows/deploy.yaml](.github/workflows/deploy.yaml) on `push` to `main`
- Node `26.7`, `npm ci --legacy-peer-deps`, `haven-aol` checkout, `npm run build` → verify `./out`
- Auth: `npx pinme@2.0.12 set-appkey ${{ secrets.PINME_APPKEY }}` (fail fast if missing, links to https://pinme.eth.limo)
- Upload: `npx pinme@2.0.12 upload ./out` (or `--domain ${{ vars.PINME_DOMAIN || secrets.PINME_DOMAIN }}` if set)
- Secrets: `PINME_APPKEY` (required), optional `PINME_DOMAIN` (via `vars`/`secrets`), plus `NEXT_PUBLIC_*` (WalletConnect, Alchemy, Arkiv, Lit)
- Previous Orbiter secrets (`ORBITER_API_KEY`/`ORBITER_SITE_ID` / `npx orbiter-cli`) are deprecated — see rollback note below.

**Custom domain:**
- Subdomain (no dot): `pinme upload ./out --domain my-site` → `https://my-site.pinme.eth.limo`
- DNS (dot): `pinme upload ./out --domain example.com` (or `--dns` force) — requires DNS ownership
- Check domains: `pinme my-domains` / `pinme domain`

**Previous Orbiter flow (archived):**
- Used `npx orbiter-cli update ./out --siteId $ORBITER_SITE_ID` with `ORBITER_API_KEY`/`ORBITER_SITE_ID` at `https://app.orbiter.host`. Revert `deploy.yaml` to the pre-PinMe commit to rollback; `out/` is reproducible via `npm run build`.

### Other Hosting Options

- **Netlify**: Connect GitHub repo and set build command to `npm run build`
- **Railway**: Use Dockerfile or Nixpacks deployment
- **AWS Amplify**: Connect repository and use default Next.js settings
- **IPFS alternatives** (if not using PinMe): [Pinata](https://pinata.cloud), [Fleek](https://fleek.co), [Web3.Storage](https://web3.storage), `npx ipfs-deploy out/`

## Performance Monitoring

### Web Vitals

Custom Web Vitals reporting is implemented in `src/components/analytics/WebVitals.tsx`. Metrics are logged to console in development and can be sent to analytics in production.

### Performance Budgets

| Metric | Target | Maximum |
|--------|--------|---------|
| First Contentful Paint | < 1.0s | 1.5s |
| Largest Contentful Paint | < 2.5s | 4.0s |
| Time to Interactive | < 3.0s | 4.5s |
| Cumulative Layout Shift | < 0.1 | 0.25 |
| Total Bundle Size | < 500KB | 1MB |
| First JS Load | < 200KB | 300KB |

### Lighthouse CI

Run Lighthouse audits locally:

```bash
npm install -g @lhci/cli
lhci autorun
```

Target scores:
- Performance: > 90
- Accessibility: > 90
- Best Practices: > 90
- SEO: > 90

## Security Headers

The following security headers are configured in `next.config.mjs`:

- `Strict-Transport-Security` - HSTS for HTTPS enforcement
- `X-Content-Type-Options` - Prevent MIME type sniffing
- `X-Frame-Options` - Prevent clickjacking
- `X-XSS-Protection` - XSS filter
- `Referrer-Policy` - Control referrer information

## Troubleshooting

### Build Failures

1. **Check Node.js version**:
   ```bash
   node --version  # Should be 26.7.0 (see .nvmrc / engines)
   ```

2. **Clear cache**:
   ```bash
   rm -rf .next node_modules
   npm install
   npm run build
   ```

3. **Check environment variables**:
   Ensure all required variables are set in `.env.local`

### Runtime Errors

1. **WalletConnect issues**: Verify `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set
2. **Haven-AOL / decryption errors**: Verify `NEXT_PUBLIC_ICP_HOST`, `NEXT_PUBLIC_HAVEN_AOL_CANISTER_ID`, and EIP-712 variables match your deployment (see [haven-aol](https://github.com/HavenCTO/haven-aol))
3. **IPFS loading failures**: Verify IPFS gateway URLs in next.config.js

### Performance Issues

1. **Large bundle size**: Run `npm run analyze` to identify large dependencies
2. **Slow images**: Verify `next/image` is being used instead of `img` tags
3. **High memory usage**: Consider implementing virtualization for large lists

## Rollback Procedure

### GitHub Actions (PinMe)

1. Revert the `deploy.yaml` PinMe commit (`git revert <sha>`) to restore `orbiter-cli` flow (requires `ORBITER_API_KEY`/`ORBITER_SITE_ID` secrets)
2. Push to `main` to trigger redeploy, or manually trigger from Actions tab
3. `out/` is reproducible: `npm ci --legacy-peer-deps && npm run build` on Node 26.7

### Rollback to Orbiter (archived)

- Orbiter used `npx orbiter-cli update ./out --siteId $ORBITER_SITE_ID` at `https://app.orbiter.host`. Keep Orbiter secrets until PinMe is verified.

### GitHub Actions (general)

1. Revert the problematic commit
2. Push to trigger new deployment
3. Or manually trigger deployment from Actions tab

## Post-Deployment Checklist

- [ ] Application loads without errors
- [ ] Wallet connection works
- [ ] Videos load from IPFS
- [ ] Theme toggle works
- [ ] Mobile responsive design works
- [ ] SEO meta tags are present (check with [metatags.io](https://metatags.io))
- [ ] Lighthouse score > 90
- [ ] Web Vitals data is being collected
- [ ] Error boundaries are functional

## Support

For deployment issues:
1. Review GitHub Actions logs
2. Check browser console for errors
3. Open an issue in the repository