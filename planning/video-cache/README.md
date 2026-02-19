# Video Content Caching — Transparent Decrypted Video Storage

> **Implementation Order:** Video Content Cache is implemented **after** [Arkiv Cache](../arkiv-cache/) (metadata persistence in IndexedDB). The arkiv-cache ensures that video metadata — including the IPFS CIDs needed to fetch content — survives Arkiv entity expiration. This system builds on that foundation by caching the actual decrypted video bytes for instant playback. See [Relationship to Arkiv Cache](#relationship-to-arkiv-cache) below.

## Problem Statement

The current encrypted video playback architecture has three critical UX issues:

1. **Memory Pressure**: Decryption is done entirely in the JS heap. The encrypted file is fetched as a `Uint8Array`, decrypted via Web Crypto API into another `Uint8Array`, then converted to a `Blob` → `URL.createObjectURL()`. For a 500MB video, this means ~1.5GB of JS heap usage (encrypted + decrypted + blob). This is catastrophic on mobile and constrained devices.

2. **Wallet Signing Fatigue**: Every playback of an encrypted video requires a fresh Lit Protocol authentication via SIWE (Sign-In with Ethereum), which prompts the user's wallet for a signature. Re-watching a video you watched 5 minutes ago triggers the same wallet popup. This is a terrible user experience.

3. **Playback Latency**: The full pipeline (Synapse fetch → Lit auth → BLS-IBE key decrypt → AES-GCM file decrypt → blob creation) adds 5-30+ seconds of latency before the first frame appears. Users stare at a loading spinner every time.

## Solution Architecture

Use **Service Worker + Cache API** to transparently store **decrypted** video content on disk, served via synthetic URLs that the `<video>` element can consume directly.

### Flow: First Play (Cache Miss)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  VideoPlayer  │────▶│  Cache API   │────▶│   MISS       │
│  Component    │     │  Check       │     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │Synapse Fetch │
                                          │  (encrypted) │
                                          └──────┬───────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │  Lit Auth +  │
                                          │  AES Decrypt │
                                          │  (as today)  │
                                          └──────┬───────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │  Store in    │
                                          │  Cache API   │
                                          │  /haven/v/{id}│
                                          └──────┬───────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │  Set <video  │
                                          │  src="/haven │
                                          │  /v/{id}">   │
                                          └──────┬───────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │  Service     │
                                          │  Worker      │
                                          │  intercepts  │
                                          │  → serves    │
                                          │  from cache  │
                                          └──────────────┘
```

### Flow: Subsequent Play (Cache Hit)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  VideoPlayer  │────▶│  Cache API   │────▶│   HIT        │
│  Component    │     │  Check       │     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │  Set <video  │
                                          │  src="/haven │
                                          │  /v/{id}">   │
                                          └──────┬───────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │  Service     │
                                          │  Worker      │
                                          │  intercepts  │
                                          │  → serves    │
                                          │  from cache  │
                                          └──────────────┘

Zero Synapse fetch. Zero Lit auth. Zero wallet signing. Zero decryption.
Instant playback from disk.
```

## Key Browser APIs

| API | Purpose | Why |
|-----|---------|-----|
| **Service Worker** | Intercept `<video src>` requests | Transparent to video element; supports Range requests |
| **Cache API** | Store decrypted video as `Response` objects | Disk-backed, persists across sessions, origin-scoped |
| **OPFS** (Origin Private File System) | Stage large encrypted files before decryption | Avoids holding encrypted bytes in JS heap |
| **Web Crypto API** | AES-256-GCM decryption | Already in use today |

## Security Model

- **Origin-scoped**: Cache API is sandboxed per origin — no other site can access cached videos
- **No download button**: Content is served through Service Worker, not exposed as a downloadable file
- **TTL enforcement**: Cached entries expire and are automatically cleaned up
- **User control**: Settings UI allows clearing cache at any time
- **Same security as blob URLs**: The decrypted content is already in the browser during playback today; caching it on disk doesn't change the threat model

## Sprint Overview

| Sprint | Focus | Tasks | Est. Hours |
|--------|-------|-------|-----------|
| **Sprint 1** | Service Worker + Cache API Foundation | 5 tasks | 22-32h |
| **Sprint 2** | Decryption Pipeline Optimization | 4 tasks | 14-19h |
| **Sprint 3** | Session & Key Caching | 4 tasks | 15-20h |
| **Sprint 4** | VideoPlayer Refactor to Cache-First | 4 tasks | 16-22h |
| **Sprint 5** | Cache Management UI & Polish | 4 tasks | 16-22h |
| **Sprint 6** | Testing & Documentation | 4 tasks | 24-32h |
| | **Total** | **25 tasks** | **~107-147h** |

### Sprint 1: Service Worker + Cache API Foundation
| # | Task | File | Est. |
|---|------|------|------|
| 1.1 | [Service Worker Setup](sprint-1/01-service-worker-setup.md) | `public/haven-sw.js`, `src/hooks/useServiceWorker.ts` | 6-8h |
| 1.2 | [Cache API Wrapper](sprint-1/02-cache-api-wrapper.md) | `src/lib/video-cache.ts` | 4-6h |
| 1.3 | [useVideoCache Hook](sprint-1/03-use-video-cache-hook.md) | `src/hooks/useVideoCache.ts` | 6-8h |
| 1.4 | [Next.js Config & SW Headers](sprint-1/04-next-config-sw-headers.md) | `next.config.mjs` | 2-4h |
| 1.5 | [Sprint 1 Integration Test](sprint-1/05-sprint-1-integration-test.md) | `e2e/video-cache.spec.ts` | 4-6h |

### Sprint 2: Decryption Pipeline Optimization
| # | Task | File | Est. |
|---|------|------|------|
| 2.1 | [OPFS Staging](sprint-2/01-opfs-staging.md) | `src/lib/opfs.ts` | 4-6h |
| 2.2 | [Decryption-to-Cache Pipeline](sprint-2/02-decryption-to-cache-pipeline.md) | `src/lib/crypto.ts` | 4-5h |
| 2.3 | [Memory Pressure Detection](sprint-2/03-memory-pressure-detection.md) | `src/lib/memory-detect.ts` | 3-4h |
| 2.4 | [Eager GC & Buffer Cleanup](sprint-2/04-eager-gc-cleanup.md) | `src/lib/buffer-lifecycle.ts` | 3-4h |

### Sprint 3: Session & Key Caching
| # | Task | File | Est. |
|---|------|------|------|
| 3.1 | [Lit Session Cache](sprint-3/01-lit-session-cache.md) | `src/lib/lit-session-cache.ts` | 4-5h |
| 3.2 | [AES Key Cache](sprint-3/02-aes-key-cache.md) | `src/lib/aes-key-cache.ts` | 3-5h |
| 3.3 | [Cache TTL & Expiration](sprint-3/03-cache-ttl-expiration.md) | `src/lib/cache-expiration.ts` | 4-5h |
| 3.4 | [Wallet Disconnect Cleanup](sprint-3/04-wallet-disconnect-cleanup.md) | `src/lib/security-cleanup.ts` | 4-5h |

### Sprint 4: VideoPlayer Refactor & Cache-First Architecture
| # | Task | File | Est. |
|---|------|------|------|
| 4.1 | [VideoPlayer Refactor](sprint-4/01-videoplayer-refactor.md) | `src/components/player/VideoPlayer.tsx` | 4-6h |
| 4.2 | [Cache Indicator Components](sprint-4/02-cache-indicator-component.md) | `src/components/player/CacheIndicator.tsx` | 3-4h |
| 4.3 | [Library Cache Badges](sprint-4/03-library-cache-badges.md) | `src/hooks/useCacheStatus.ts` | 3-4h |
| 4.4 | [Preload & Prefetch](sprint-4/04-preload-prefetch.md) | `src/lib/video-prefetch.ts` | 6-8h |

### Sprint 5: Cache Management UI & Polish
| # | Task | File | Est. |
|---|------|------|------|
| 5.1 | [Cache Management Settings](sprint-5/01-cache-management-settings.md) | `src/components/settings/CacheManagement.tsx` | 6-8h |
| 5.2 | [Persistent Storage Request](sprint-5/02-storage-persistence.md) | `src/lib/storage-persistence.ts` | 2-3h |
| 5.3 | [Error Recovery & Degradation](sprint-5/03-error-recovery.md) | `src/lib/cache-integrity.ts` | 4-6h |
| 5.4 | [Browser Compatibility](sprint-5/04-browser-compatibility.md) | `src/lib/browser-capabilities.ts` | 4-5h |

### Sprint 6: Testing & Documentation
| # | Task | File | Est. |
|---|------|------|------|
| 6.1 | [Unit Tests](sprint-6/01-unit-tests.md) | `__tests__/` | 8-10h |
| 6.2 | [E2E Tests](sprint-6/02-e2e-tests.md) | `e2e/` | 8-10h |
| 6.3 | [Performance Benchmarks](sprint-6/03-performance-benchmarks.md) | `src/lib/perf-benchmarks.ts` | 4-6h |
| 6.4 | [Architecture Documentation](sprint-6/04-architecture-documentation.md) | `docs/video-cache/` | 4-6h |

## Files Affected

### New Files
- `public/haven-sw.js` — Service Worker
- `src/lib/video-cache.ts` — Cache API wrapper
- `src/lib/opfs.ts` — OPFS staging utilities
- `src/lib/lit-session-cache.ts` — Lit auth session caching
- `src/lib/aes-key-cache.ts` — Per-video AES key cache
- `src/hooks/useVideoCache.ts` — React hook for cache-first video loading
- `src/hooks/useServiceWorker.ts` — Service Worker registration hook
- `src/hooks/useCacheStatus.ts` — Cache status/storage hook
- `src/components/settings/CacheManagement.tsx` — Cache management UI
- `src/components/player/CacheIndicator.tsx` — Cache status indicator on player

### Modified Files
- `src/components/player/VideoPlayer.tsx` — Refactor to cache-first architecture
- `src/hooks/useVideoDecryption.ts` — Add OPFS staging, key caching integration
- `src/lib/lit-decrypt.ts` — Accept cached auth context
- `src/lib/lit-auth.ts` — Add session persistence
- `next.config.mjs` — Service Worker headers

## Relationship to Arkiv Cache

This effort works in tandem with the [Arkiv Cache](../arkiv-cache/) (IndexedDB metadata persistence). The two systems serve different purposes but share a critical link: **the IPFS CID stored in Arkiv entity metadata is the key to fetching video content**.

### Dependency on Arkiv Cache

```
Arkiv Entity (on-chain) → has CID → CID used to fetch content → content decrypted → content cached
         ↓                                                                              ↓
   Arkiv Cache (IndexedDB)                                                    Video Cache (Cache API)
   preserves metadata + CID                                                   stores decrypted bytes
```

The `useVideoCache` hook receives a `Video` object as input. That `Video` object — with its `filecoinCid`, `encryptedCid`, `litEncryptionMetadata`, etc. — may come from:
1. **Live Arkiv fetch** (entity still active on-chain)
2. **Arkiv cache** (entity expired, metadata preserved in IndexedDB)

In both cases, the video-cache system works identically. The arkiv-cache ensures the `Video` object is always available, even after entity expiration.

### Integration Points with Arkiv Cache

| Action | Video Cache Does | Arkiv Cache Effect |
|--------|-----------------|-------------------|
| `putVideo()` succeeds | Stores decrypted bytes in Cache API | Calls `cacheService.updateVideoCacheStatus(videoId, 'cached')` to update IndexedDB metadata |
| `deleteVideo()` called | Removes bytes from Cache API | Calls `cacheService.updateVideoCacheStatus(videoId, 'not-cached')` to update IndexedDB metadata |
| `clearAllVideos()` called | Wipes Cache API store | Calls `cacheService.updateVideoCacheStatus()` for all affected videos |
| `listCachedVideos()` called | Returns Cache API entries | Cross-references with `cacheService.getContentCachedVideos()` for metadata (titles, descriptions) |

### Shared UI Components

The following UI components are shared between both cache systems:

| Component | Arkiv Cache Built | Video Cache Extends |
|-----------|------------------|-------------------|
| `CacheStatusBadge` | `arkivStatus` prop (active/expired/expiring-soon) | Passes `videoCacheStatus` prop (cached/not-cached/stale) |
| `CacheManagement.tsx` | Metadata cache section (stats, sync, clear) | Adds video content cache section (size, clear, per-video eviction) |
| `useCacheStatus` hook | Returns `metadataStats` | Fills in `contentStats` (was null during arkiv-cache) |

These components were designed during arkiv-cache implementation with forward-compatible interfaces — the video-cache system passes new props without breaking changes.

### Key Principle

**The video-cache never stores metadata.** It only stores decrypted bytes keyed by `videoId`. All metadata (titles, CIDs, encryption info, cache status) lives in the arkiv-cache's IndexedDB. This separation of concerns means:
- Clearing the video cache doesn't lose any metadata
- Clearing the arkiv cache doesn't delete cached video bytes (but orphans them — the management UI should warn about this)
- Both caches can be managed independently in the settings UI
