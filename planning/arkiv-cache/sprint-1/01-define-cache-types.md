# Task 1.1 — Define Cache Types & Schema

**Sprint:** 1 — Foundation  
**Estimate:** 2–3 hours  
**File:** `src/types/cache.ts`

## Objective

Define TypeScript interfaces for the local cache layer, including the cached video record schema, cache metadata, and database configuration types.

## Background

The `Video` type in `src/types/video.ts` represents the application-level video entity parsed from Arkiv. We need a `CachedVideo` type that wraps `Video` with additional cache-specific metadata (when it was cached, source status, expiration info, etc.).

## Requirements

### 1. `CachedVideo` Interface

Extends the existing `Video` type with cache metadata:

```typescript
interface CachedVideo {
  // All fields from Video
  ...Video

  // Cache metadata
  cachedAt: number           // Unix timestamp (ms) when first cached
  lastSyncedAt: number       // Unix timestamp (ms) of last successful Arkiv sync
  lastAccessedAt: number     // Unix timestamp (ms) of last user access
  cacheVersion: number       // Schema version for migrations

  // Arkiv entity status
  arkivEntityStatus: 'active' | 'expired' | 'unknown'
  expiresAtBlock?: number    // Block number when Arkiv entity expires
  arkivEntityKey: string     // Original Arkiv entity key (same as Video.id)

  // Sync metadata
  syncHash?: string          // Hash of last synced data for change detection
  isDirty: boolean           // Whether local changes haven't been synced

  // ── Video Content Cache Integration ──────────────────────────────
  // These fields are populated by the Video Content Cache system
  // (Service Worker + Cache API) after it successfully caches decrypted
  // video bytes. During arkiv-cache implementation, these default to
  // 'not-cached' / undefined. See: ../../../video-cache/README.md
  videoCacheStatus: 'not-cached' | 'cached' | 'stale'  // Whether decrypted bytes are in Cache API
  videoCachedAt?: number     // Unix timestamp (ms) when video content was cached
}
```

> **Video Content Cache Integration:** The `videoCacheStatus` and `videoCachedAt` fields bridge the arkiv-cache (metadata in IndexedDB) with the [video-cache](../../video-cache/) (decrypted bytes in Cache API). The video-cache system writes these fields after successful content caching; the arkiv-cache UI reads them to show unified status badges. Default `videoCacheStatus` to `'not-cached'` in all transforms until the video-cache system is implemented.

### 2. `CacheDBSchema` Interface

Defines the IndexedDB database structure:

```typescript
interface CacheDBSchema {
  videos: {
    key: string              // Video ID (Arkiv entity key)
    value: CachedVideo
    indexes: {
      'by-owner': string
      'by-cached-at': number
      'by-last-synced': number
      'by-status': string
    }
  }
  metadata: {
    key: string              // Metadata key (e.g., 'lastFullSync', 'schemaVersion')
    value: CacheMetadataEntry
  }
}
```

### 3. `CacheMetadataEntry` Interface

```typescript
interface CacheMetadataEntry {
  key: string
  value: string | number | boolean
  updatedAt: number
}
```

### 4. `CacheConfig` Interface

```typescript
interface CacheConfig {
  dbName: string             // Default: 'haven-cache'
  dbVersion: number          // Current schema version
  maxEntries: number         // Max cached videos per wallet (default: 5000)
  maxAgeMs: number           // Max cache age before forced re-sync (default: 30 days)
  syncIntervalMs: number     // Background sync interval (default: 5 minutes)
}
```

### 5. `CacheStats` Interface

```typescript
interface CacheStats {
  totalVideos: number
  activeVideos: number       // Still on Arkiv
  expiredVideos: number      // No longer on Arkiv
  cacheSize: number          // Estimated size in bytes
  lastFullSync: number | null
  oldestEntry: number | null
  newestEntry: number | null
}
```

### 6. `CacheSyncResult` Interface

```typescript
interface CacheSyncResult {
  added: number
  updated: number
  expired: number            // Entities that were on Arkiv but are now gone
  unchanged: number
  errors: string[]
  syncedAt: number
}
```

## Acceptance Criteria

- [ ] All interfaces are exported from `src/types/cache.ts`
- [ ] `CachedVideo` properly extends `Video` without breaking existing type usage
- [ ] Types are re-exported from `src/types/index.ts`
- [ ] JSDoc comments on all interfaces and fields
- [ ] No `any` types — all fields are properly typed
- [ ] `cacheVersion` field enables future schema migrations

## Notes

- The `syncHash` field will be a SHA-256 hash of the serialized video data, used to detect whether Arkiv data has changed since last sync.
- `isDirty` is reserved for future use when we support local-first editing.
- Date fields use Unix timestamps (ms) instead of `Date` objects for IndexedDB serialization compatibility.
- `videoCacheStatus` and `videoCachedAt` are part of the [Video Content Cache](../../video-cache/) integration. They are defined here so the schema is forward-compatible, but are only populated once the video-cache system is implemented. Default `videoCacheStatus` to `'not-cached'` in all `videoToCachedVideo` transforms.
