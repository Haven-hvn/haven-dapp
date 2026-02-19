# Task 1.4 — Cache Service Layer

**Sprint:** 1 — Foundation  
**Estimate:** 4–5 hours  
**File:** `src/services/cacheService.ts`

## Objective

Create a high-level cache service that orchestrates the IndexedDB operations and transform utilities into a clean API for the rest of the application. This service is the single entry point for all cache operations — no other code should interact with `src/lib/cache/db.ts` directly.

## Background

The low-level `db.ts` module handles raw IndexedDB CRUD. The `transforms.ts` module handles type conversion. The cache service combines these into business-logic-aware operations like "sync videos from Arkiv to cache" and "get videos, preferring cache when Arkiv is unavailable."

## Prerequisites

- Task 1.1 (cache types)
- Task 1.2 (IndexedDB service)
- Task 1.3 (transform utilities)

## Requirements

### 1. Core Cache Service API

```typescript
// src/services/cacheService.ts

export class VideoCacheService {
  private walletAddress: string

  constructor(walletAddress: string)

  // ── Read Operations ──────────────────────────────────────────────

  /** Get all cached videos as Video[] (ready for UI consumption) */
  async getVideos(): Promise<Video[]>

  /** Get a single cached video by ID */
  async getVideo(videoId: string): Promise<Video | null>

  /** Get cache statistics */
  async getStats(): Promise<CacheStats>

  /** Check if a video exists in cache */
  async hasVideo(videoId: string): Promise<boolean>

  // ── Write Operations ─────────────────────────────────────────────

  /** Cache a single video (from Arkiv fetch) */
  async cacheVideo(video: Video): Promise<void>

  /** Cache multiple videos (from Arkiv bulk fetch) */
  async cacheVideos(videos: Video[]): Promise<CacheSyncResult>

  /** Mark a video as expired (no longer on Arkiv) */
  async markVideoExpired(videoId: string): Promise<void>

  /** Update last accessed timestamp for a video */
  async touchVideo(videoId: string): Promise<void>

  // ── Sync Operations ──────────────────────────────────────────────

  /** 
   * Full sync: compare Arkiv videos with cache, update accordingly.
   * - New videos → add to cache
   * - Changed videos → update in cache
   * - Missing from Arkiv but in cache → mark as expired
   * - Unchanged → skip
   */
  async syncWithArkiv(arkivVideos: Video[]): Promise<CacheSyncResult>

  /** 
   * Get merged video list: cached + Arkiv, with Arkiv taking precedence
   * for active entities and cache filling in for expired ones.
   */
  async getMergedVideos(arkivVideos: Video[]): Promise<Video[]>

  // ── Maintenance Operations ───────────────────────────────────────

  /** Clear all cached data for this wallet */
  async clearAll(): Promise<void>

  /** Evict oldest entries to stay under maxEntries limit */
  async evictOldEntries(maxEntries?: number): Promise<number>

  /** Get the timestamp of the last full sync */
  async getLastSyncTime(): Promise<number | null>

  /** Set the timestamp of the last full sync */
  async setLastSyncTime(timestamp: number): Promise<void>

  // ── Video Content Cache Integration ──────────────────────────────
  // These methods are called by the Video Content Cache system
  // (Service Worker + Cache API) to keep metadata in sync with
  // cached video content. See: ../../video-cache/README.md

  /** 
   * Update video content cache status for a video.
   * Called by video-cache after putVideo() or deleteVideo().
   */
  async updateVideoCacheStatus(
    videoId: string, 
    status: 'not-cached' | 'cached' | 'stale',
    cachedAt?: number
  ): Promise<void>

  /**
   * Get videos that have cached content (videoCacheStatus === 'cached').
   * Used by video-cache management UI to show content cache entries
   * alongside their metadata.
   */
  async getContentCachedVideos(): Promise<Video[]>
}
```

### 2. `syncWithArkiv` Implementation Detail

This is the most critical method. It performs a three-way reconciliation:

```typescript
async syncWithArkiv(arkivVideos: Video[]): Promise<CacheSyncResult> {
  const result: CacheSyncResult = {
    added: 0,
    updated: 0,
    expired: 0,
    unchanged: 0,
    errors: [],
    syncedAt: Date.now(),
  }

  // 1. Get all currently cached videos
  const cachedMap = new Map<string, CachedVideo>()
  const allCached = await getAllCachedVideos(this.walletAddress)
  allCached.forEach(cv => cachedMap.set(cv.id, cv))

  // 2. Build set of Arkiv video IDs
  const arkivIds = new Set(arkivVideos.map(v => v.id))

  // 3. Process Arkiv videos (add or update)
  const toWrite: CachedVideo[] = []
  for (const video of arkivVideos) {
    const existing = cachedMap.get(video.id)
    if (!existing) {
      // New video — add to cache
      toWrite.push(videoToCachedVideo(video))
      result.added++
    } else if (await hasVideoChanged(video, existing)) {
      // Changed video — update in cache
      toWrite.push(videoToCachedVideo(video, existing))
      result.updated++
    } else {
      // Unchanged
      result.unchanged++
    }
  }

  // 4. Detect expired entities (in cache but not in Arkiv)
  for (const [id, cached] of cachedMap) {
    if (!arkivIds.has(id) && cached.arkivEntityStatus === 'active') {
      toWrite.push(markAsExpired(cached))
      result.expired++
    }
  }

  // 5. Bulk write all changes
  if (toWrite.length > 0) {
    await putCachedVideos(this.walletAddress, toWrite)
  }

  // 6. Update last sync time
  await this.setLastSyncTime(result.syncedAt)

  return result
}
```

### 3. `getMergedVideos` Implementation Detail

Returns a unified list combining fresh Arkiv data with cached expired entries:

```typescript
async getMergedVideos(arkivVideos: Video[]): Promise<Video[]> {
  // First, sync to update cache
  await this.syncWithArkiv(arkivVideos)

  // Get all cached videos (includes newly expired ones)
  const allCached = await getAllCachedVideos(this.walletAddress)

  // Build map: Arkiv videos take precedence
  const videoMap = new Map<string, Video>()

  // Add cached expired videos first (these are the ones Arkiv no longer has)
  for (const cached of allCached) {
    if (cached.arkivEntityStatus === 'expired') {
      videoMap.set(cached.id, cachedVideoToVideo(cached))
    }
  }

  // Overlay with fresh Arkiv videos (overwrite any that exist)
  for (const video of arkivVideos) {
    videoMap.set(video.id, video)
  }

  // Return sorted by createdAt descending
  return Array.from(videoMap.values())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}
```

### 4. Factory Function

Provide a convenience factory to avoid `new` keyword:

```typescript
export function createVideoCacheService(walletAddress: string): VideoCacheService {
  return new VideoCacheService(walletAddress)
}
```

### 5. Singleton Management

Cache service instances per wallet, similar to DB connection pooling:

```typescript
const serviceInstances = new Map<string, VideoCacheService>()

export function getVideoCacheService(walletAddress: string): VideoCacheService {
  const key = walletAddress.toLowerCase()
  if (!serviceInstances.has(key)) {
    serviceInstances.set(key, new VideoCacheService(key))
  }
  return serviceInstances.get(key)!
}
```

## Error Handling Strategy

All cache service methods should be **fail-safe**:

```typescript
async getVideos(): Promise<Video[]> {
  try {
    const cached = await getAllCachedVideos(this.walletAddress)
    return cached.map(cachedVideoToVideo)
  } catch (error) {
    console.warn('[CacheService] Failed to read cache, returning empty:', error)
    return []
  }
}
```

- Cache reads that fail → return empty/null, proceed with Arkiv fetch
- Cache writes that fail → log warning, don't block the user
- Sync operations that fail → return partial results with errors array populated

## Acceptance Criteria

- [ ] `VideoCacheService` class implements all methods listed above
- [ ] `syncWithArkiv` correctly handles add/update/expire/unchanged cases
- [ ] `getMergedVideos` returns unified list with Arkiv data taking precedence
- [ ] All methods are fail-safe (never throw to caller)
- [ ] Singleton management prevents duplicate service instances
- [ ] `getStats` returns accurate cache statistics
- [ ] `evictOldEntries` removes least-recently-accessed entries
- [ ] Factory function and singleton getter are exported
- [ ] All methods have JSDoc documentation

## Video Content Cache Integration

> **Cross-reference:** [Video Content Cache](../../video-cache/) — Service Worker + Cache API for decrypted video bytes.

The `updateVideoCacheStatus` and `getContentCachedVideos` methods are the **bridge** between the arkiv-cache (metadata) and video-cache (content) systems. They allow the video-cache to:

1. **Report back** when it caches or evicts decrypted video bytes, so the arkiv-cache metadata stays in sync.
2. **Query** which videos have cached content, enabling the unified cache management UI.

During arkiv-cache implementation, these methods should be fully functional (they just update/query IndexedDB fields). The video-cache system will call them once it's implemented.

```typescript
async updateVideoCacheStatus(
  videoId: string,
  status: 'not-cached' | 'cached' | 'stale',
  cachedAt?: number
): Promise<void> {
  try {
    const cached = await getCachedVideo(this.walletAddress, videoId)
    if (cached) {
      cached.videoCacheStatus = status
      cached.videoCachedAt = status === 'cached' ? (cachedAt ?? Date.now()) : undefined
      await putCachedVideo(this.walletAddress, cached)
    }
  } catch (error) {
    console.warn('[CacheService] Failed to update video cache status:', error)
  }
}
```

## Testing Notes

- Mock `src/lib/cache/db.ts` functions for unit testing
- Test sync scenarios: empty cache + new videos, partial overlap, all expired, no changes
- Test error resilience: simulate IndexedDB failures, verify errors are logged silently
- Test eviction: add more than `maxEntries` videos, verify oldest are removed
- Test `updateVideoCacheStatus`: verify it updates the correct fields without affecting other metadata
- Test `getContentCachedVideos`: verify it filters by `videoCacheStatus === 'cached'`
