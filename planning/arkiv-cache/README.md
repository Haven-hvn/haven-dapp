# Haven DApp — Local In-Browser Cache for Arkiv Entities

> **Implementation Order:** Arkiv Cache is implemented **first**, before [Video Content Cache](../video-cache/). Metadata persistence is the foundation — without cached CIDs and encryption metadata, the video content cache cannot function after Arkiv entities expire. See [Relationship to Video Content Cache](#relationship-to-video-content-cache) below.

## Problem Statement

Arkiv only stores entities on the blockchain for a limited period (entities have an `expiresAtBlock` field). Once an entity expires, the metadata — titles, descriptions, CIDs, encryption metadata, AI analysis references, codec variants, segment info — is permanently lost. Users should not have to worry about losing this data.

## Solution

Implement a **local in-browser cache** using IndexedDB that persists the full `Video` metadata (parsed from Arkiv entities) long-term in the user's browser. This cache acts as a durable local copy so that even after the Arkiv entity expires on-chain, the user retains access to all their video metadata.

## Architecture Overview

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Arkiv SDK  │────▶│  Cache Service    │────▶│  IndexedDB  │
│  (on-chain) │     │  (read-through /  │     │  (durable)  │
└─────────────┘     │   write-through)  │     └─────────────┘
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  React Query     │
                    │  (in-memory)     │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  UI Components   │
                    └──────────────────┘
```

### Key Design Decisions

1. **IndexedDB** — Chosen over localStorage for structured data, larger storage limits (~50MB+), and async API that won't block the main thread.
2. **Per-wallet isolation** — Each wallet address gets its own object store/database namespace to prevent data leakage between accounts.
3. **Write-through caching** — Every successful Arkiv fetch writes to IndexedDB. Reads check IndexedDB first for instant display, then sync with Arkiv for fresh data.
4. **Schema versioning** — IndexedDB schema includes a version number for future migrations.
5. **No sensitive data in cache** — Encrypted payloads (Lit encryption keys, etc.) are NOT cached in plaintext. Only metadata references are stored.

## Sprint Overview

| Sprint | Focus | Duration |
|--------|-------|----------|
| [Sprint 1](./sprint-1/) | Foundation — Cache schema, IndexedDB service, types | ~1 week |
| [Sprint 2](./sprint-2/) | Core Integration — Wire cache into data flow | ~1 week |
| [Sprint 3](./sprint-3/) | Sync & Resilience — Background sync, conflict resolution, expiration tracking | ~1 week |
| [Sprint 4](./sprint-4/) | UX & Polish — Offline indicators, cache management UI, export/import, testing | ~1 week |

## Tech Stack Additions

- **`idb`** — Lightweight IndexedDB wrapper with Promise-based API (~1.2KB gzipped)
- No other new dependencies required; leverages existing Zustand, React Query, and TypeScript infrastructure.

## Files Affected (Estimated)

| Area | Files |
|------|-------|
| New: Cache layer | `src/lib/cache/`, `src/services/cacheService.ts` |
| Modified: Data flow | `src/services/videoService.ts`, `src/hooks/useVideos.ts` |
| New: Hooks | `src/hooks/useCachedVideos.ts`, `src/hooks/useCacheStatus.ts` |
| New: UI | `src/components/library/CacheStatusBadge.tsx`, `src/components/settings/CacheManagement.tsx` |
| New: Types | `src/types/cache.ts` |
| Modified: Store | `src/stores/cacheStore.ts` |
| Tests | `src/lib/cache/__tests__/`, `src/services/__tests__/cacheService.test.ts` |

## Relationship to Video Content Cache

This effort works in tandem with the [Video Content Cache](../video-cache/) (Service Worker + Cache API for decrypted video bytes). The two systems serve different purposes but share a critical link: **the IPFS CID stored in Arkiv entity metadata is the key to fetching video content**.

### Why Arkiv Cache Comes First

```
Arkiv Entity (on-chain) → has CID → CID used to fetch content → content decrypted → content cached
```

1. **Metadata is the foundation.** The video-cache's `useVideoCache` hook takes a `Video` object as input. Without the `Video` object — which comes from Arkiv — the video cache has nothing to work with.
2. **CIDs are irreplaceable.** If an Arkiv entity expires before the metadata is cached, the `filecoinCid` and `encryptedCid` are gone forever. The actual video bytes are still on Filecoin/IPFS, but the address to find them is lost.
3. **Video cache is an optimization; arkiv cache is a safety net.** Video caching improves UX (faster playback, no wallet signing). Arkiv caching prevents permanent data loss.

### Integration Points with Video Content Cache

The `CachedVideo` type includes fields that track video content cache status:

| Field | Purpose |
|-------|---------|
| `videoCacheStatus` | Whether decrypted video bytes are cached in Cache API (`'not-cached'` \| `'cached'` \| `'stale'`) |
| `videoCachedAt` | Timestamp when video content was last cached |

These fields are **written by the video-cache system** (after it successfully caches decrypted content) and **read by the arkiv-cache UI** (to show unified cache status badges). During arkiv-cache implementation, these fields are defined but left as `'not-cached'` — the video-cache system will populate them later.

### Shared UI Components

The following UI components are designed to serve **both** cache systems:

| Component | Arkiv Cache Provides | Video Cache Adds |
|-----------|---------------------|------------------|
| `CacheStatusBadge` | `active` / `expired` / `expiring-soon` status | `content-cached` overlay indicator |
| `CacheManagement.tsx` | Metadata cache stats & clear | Video content cache stats & clear |
| `useCacheStatus` hook | Metadata cache stats | Video content cache stats |

When building these during arkiv-cache sprints, include the video-cache fields in the interfaces (typed but returning defaults) so the video-cache implementation can fill them in without breaking changes.
