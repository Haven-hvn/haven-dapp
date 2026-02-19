# Haven Video Cache Documentation

Complete documentation for the Haven DApp video caching system.

## Overview

The Haven video cache system provides fast, encrypted video playback with intelligent caching. It implements a **cache-first strategy** where decrypted video content is stored locally after the first play, enabling instant playback on subsequent views.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](./architecture.md) | System design, components, data flow diagrams, and security model |
| [API Reference](./api-reference.md) | Complete reference for all hooks and utility functions |
| [Developer Guide](./developer-guide.md) | How-to guides for common development tasks |
| [Troubleshooting](./troubleshooting.md) | Common issues and solutions |

## Quick Start

```tsx
import { useVideoCache } from '@/hooks/useVideoCache'

function VideoPlayer({ video }) {
  const { videoUrl, isCached, isLoading, loadingStage, progress, error, retry } = useVideoCache(video)

  if (isLoading) {
    return <LoadingProgress stage={loadingStage} progress={progress} />
  }

  if (error) {
    return <ErrorMessage error={error} onRetry={retry} />
  }

  return (
    <div>
      {isCached && <CacheBadge />}
      <video src={videoUrl} controls />
    </div>
  )
}
```

## Key Features

- **Cache-first loading**: Check cache before any network/crypto operations
- **Sub-100ms playback**: Cached videos play instantly via Service Worker
- **Automatic decryption pipeline**: Fetch → Decrypt → Cache on first play
- **Memory-efficient staging**: OPFS reduces peak memory usage by 30-40%
- **Session caching**: Lit Protocol sessions cached to avoid repeated wallet signatures
- **AES key caching**: Decrypted keys cached in memory
- **Periodic cleanup**: Automatic TTL-based expiration

## System Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   useVideoCache │────▶│  Cache API      │◄────│  Service Worker │
│      Hook       │     │  (Persistent)   │     │  (Video Serving)│
└────────┬────────┘     └─────────────────┘     └─────────────────┘
         │
         ├──────────────┬──────────────┬──────────────┐
         ▼              ▼              ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│lit-session- │  │  aes-key-   │  │    opfs     │  │cache-expir- │
│   cache     │  │   cache     │  │  (Staging)  │  │   ation     │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

## Browser Support

| Feature | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| Service Worker | ✅ | ✅ | ✅ | ⚠️ Limited |
| Cache API | ✅ | ✅ | ✅ | ⚠️ Limited |
| OPFS (Staging) | ✅ 86+ | ✅ 86+ | ✅ 111+ | ⚠️ 15.2+ |
| Persistent Storage | ✅ | ✅ | ✅ (dialog) | ❌ |

## File Locations

| Component | Location |
|-----------|----------|
| Service Worker | `public/haven-sw.js` |
| Video Cache API | `src/lib/video-cache.ts` |
| Lit Session Cache | `src/lib/lit-session-cache.ts` |
| AES Key Cache | `src/lib/aes-key-cache.ts` |
| OPFS Utilities | `src/lib/opfs.ts` |
| Cache Expiration | `src/lib/cache-expiration.ts` |
| Security Cleanup | `src/lib/security-cleanup.ts` |
| useVideoCache Hook | `src/hooks/useVideoCache.ts` |
| useCacheStatus Hook | `src/hooks/useCacheStatus.ts` |

## Performance Targets

| Metric | Target |
|--------|--------|
| Cache hit latency | <100ms |
| Memory reduction (OPFS) | 30-40% |
| Session reuse | 100% within TTL |
| Key cache hit rate | >95% |

## Troubleshooting Quick Reference

| Issue | Solution |
|-------|----------|
| Video doesn't play from cache | Check HTTPS, check DevTools → Application → Service Workers |
| Cache not persisting | Request persistent storage, bookmark site, or install as PWA |
| Wallet popup on every video | Check Lit session expiration, ensure wallet stays connected |
| High memory usage | Use Chrome/Edge, OPFS may not be available |
| Video plays but no audio | Check `originalMimeType` in metadata |

See [troubleshooting.md](./troubleshooting.md) for detailed solutions.
