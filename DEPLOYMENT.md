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

- Node.js 18+ and npm 9+
- Git
- WalletConnect Project ID
- Alchemy API Key (optional but recommended)

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
| `NEXT_PUBLIC_ARKIV_RPC_URL` | Arkiv RPC URL | `https://mendoza.hoodi.arkiv.network/rpc` |
| `NEXT_PUBLIC_ARKIV_API_URL` | Arkiv HTTP API URL | `https://mendoza.hoodi.arkiv.network/api` |
| `NEXT_PUBLIC_LIT_NETWORK` | Lit Protocol network | `naga-dev` |
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

### IPFS (Fully Decentralized)

1. **Build static export**:
   ```bash
   npm run export
   ```

2. **Upload to IPFS** using one of:
   - [Pinata](https://pinata.cloud)
   - [Fleek](https://fleek.co)
   - [Web3.Storage](https://web3.storage)
   - CLI: `npx ipfs-deploy out/`

3. **Configure custom domain** (optional):
   - Use [ENS](https://ens.domains) for `.eth` domains
   - Use [Unstoppable Domains](https://unstoppabledomains.com)
   - Configure DNSLink for traditional domains

### Other Hosting Options

- **Netlify**: Connect GitHub repo and set build command to `npm run build`
- **Railway**: Use Dockerfile or Nixpacks deployment
- **AWS Amplify**: Connect repository and use default Next.js settings

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
   node --version  # Should be 18+
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
2. **Lit Protocol errors**: Check `NEXT_PUBLIC_LIT_NETWORK` is set to a valid network
3. **IPFS loading failures**: Verify IPFS gateway URLs in next.config.js

### Performance Issues

1. **Large bundle size**: Run `npm run analyze` to identify large dependencies
2. **Slow images**: Verify `next/image` is being used instead of `img` tags
3. **High memory usage**: Consider implementing virtualization for large lists

## Rollback Procedure

### GitHub Actions

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