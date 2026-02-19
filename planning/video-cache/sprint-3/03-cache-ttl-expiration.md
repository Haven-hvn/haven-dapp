# Task 3.3: Cache TTL & Expiration Strategy

## Objective

Implement a time-to-live (TTL) system for cached videos so that stale content is automatically cleaned up, preventing unbounded storage growth. Include both passive expiration (checked on access) and active expiration (periodic cleanup).

## Background

Without TTL enforcement, the video cache will grow indefinitely. Users who watch many videos over weeks will accumulate gigabytes of cached content. We need a strategy that:

1. Automatically removes old cached videos
2. Respects storage quotas
3. Allows users to configure retention periods
4. Doesn't interfere with active playback

## Requirements

### TTL Configuration

```typescript
interface CacheTTLConfig {
  /** Default TTL for cached videos (milliseconds). Default: 7 days */
  defaultTTL: number
  
  /** Maximum TTL allowed (milliseconds). Default: 30 days */
  maxTTL: number
  
  /** Minimum TTL allowed (milliseconds). Default: 1 hour */
  minTTL: number
  
  /** Storage usage threshold to trigger aggressive cleanup (0-1). Default: 0.8 */
  storageThreshold: number
  
  /** How often to run the cleanup sweep (milliseconds). Default: 1 hour */
  cleanupInterval: number
  
  /** Maximum number of videos to keep in cache. Default: 50 */
  maxCachedVideos: number
}
```

### Expiration Service (`src/lib/cache-expiration.ts`)

1. **`isExpired(metadata)`** — Check if a cached video has expired
   - Compare `cachedAt + ttl` against current time
   - Return `boolean`

2. **`getExpirationTime(metadata)`** — Get when a cached video will expire
   - Return `Date` or `null` if no TTL set

3. **`runCleanupSweep()`** — Scan cache and remove expired entries
   - Iterate all cached videos via `listCachedVideos()`
   - Remove entries where `isExpired()` returns `true`
   - Return count of removed entries

4. **`runStoragePressureCleanup()`** — Remove oldest entries when storage is high
   - Check `getCacheStorageEstimate()`
   - If usage exceeds `storageThreshold`, remove oldest entries until below threshold
   - Use LRU (Least Recently Used) or oldest-first strategy

5. **`startPeriodicCleanup()`** — Start background cleanup timer
   - Run `runCleanupSweep()` on the configured interval
   - Run `runStoragePressureCleanup()` if storage is high
   - Return a cleanup function to stop the timer

6. **`touchVideo(videoId)`** — Update last-accessed time for LRU
   - Update a metadata header or separate tracking store
   - Used to keep frequently-watched videos in cache longer

### Expiration Strategies

#### Strategy 1: TTL-Based (Primary)
Each cached video has a TTL set at cache time. After the TTL expires, the entry is eligible for removal.

#### Strategy 2: LRU (Secondary)
When storage pressure is high, remove the least-recently-accessed videos first, regardless of TTL.

#### Strategy 3: Size-Based (Tertiary)
When storage pressure is critical, remove the largest videos first to free space quickly.

## Implementation Details

### Expiration Checking

```typescript
// src/lib/cache-expiration.ts

import { listCachedVideos, deleteVideo, getCacheStorageEstimate } from './video-cache'
import type { CacheMetadata } from './video-cache'

const DEFAULT_CONFIG: CacheTTLConfig = {
  defaultTTL: 7 * 24 * 60 * 60 * 1000,  // 7 days
  maxTTL: 30 * 24 * 60 * 60 * 1000,     // 30 days
  minTTL: 60 * 60 * 1000,                // 1 hour
  storageThreshold: 0.8,                  // 80%
  cleanupInterval: 60 * 60 * 1000,       // 1 hour
  maxCachedVideos: 50,
}

// Last-accessed tracking (in-memory, supplemented by X-Haven-Cached-At header)
const lastAccessed = new Map<string, number>()

export function isExpired(metadata: CacheMetadata): boolean {
  const ttl = metadata.ttl || DEFAULT_CONFIG.defaultTTL
  const expiresAt = metadata.cachedAt.getTime() + ttl
  return Date.now() >= expiresAt
}

export function touchVideo(videoId: string): void {
  lastAccessed.set(videoId, Date.now())
}

export async function runCleanupSweep(): Promise<number> {
  const entries = await listCachedVideos()
  let removed = 0
  
  for (const entry of entries) {
    if (isExpired(entry)) {
      await deleteVideo(entry.videoId)
      lastAccessed.delete(entry.videoId)
      removed++
    }
  }
  
  return removed
}

export async function runStoragePressureCleanup(): Promise<number> {
  const estimate = await getCacheStorageEstimate()
  
  if (estimate.percent < DEFAULT_CONFIG.storageThreshold * 100) {
    return 0 // Storage is fine
  }
  
  const entries = await listCachedVideos()
  
  // Sort by last accessed (oldest first), then by cached time
  const sorted = entries.sort((a, b) => {
    const aAccessed = lastAccessed.get(a.videoId) || a.cachedAt.getTime()
    const bAccessed = lastAccessed.get(b.videoId) || b.cachedAt.getTime()
    return aAccessed - bAccessed
  })
  
  let removed = 0
  const targetPercent = DEFAULT_CONFIG.storageThreshold * 100 * 0.7 // Clean to 70% of threshold
  
  for (const entry of sorted) {
    if (estimate.percent <= targetPercent) break
    
    await deleteVideo(entry.videoId)
    lastAccessed.delete(entry.videoId)
    removed++
    
    // Re-check estimate
    const newEstimate = await getCacheStorageEstimate()
    estimate.percent = newEstimate.percent
  }
  
  return removed
}

export async function enforceMaxVideos(): Promise<number> {
  const entries = await listCachedVideos()
  
  if (entries.length <= DEFAULT_CONFIG.maxCachedVideos) {
    return 0
  }
  
  // Sort by last accessed (oldest first)
  const sorted = entries.sort((a, b) => {
    const aAccessed = lastAccessed.get(a.videoId) || a.cachedAt.getTime()
    const bAccessed = lastAccessed.get(b.videoId) || b.cachedAt.getTime()
    return aAccessed - bAccessed
  })
  
  const toRemove = sorted.slice(0, entries.length - DEFAULT_CONFIG.maxCachedVideos)
  
  for (const entry of toRemove) {
    await deleteVideo(entry.videoId)
    lastAccessed.delete(entry.videoId)
  }
  
  return toRemove.length
}
```

### Periodic Cleanup

```typescript
let cleanupTimer: ReturnType<typeof setInterval> | null = null

export function startPeriodicCleanup(
  config: Partial<CacheTTLConfig> = {}
): () => void {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  
  // Run immediately on start
  runFullCleanup()
  
  // Then run periodically
  cleanupTimer = setInterval(runFullCleanup, mergedConfig.cleanupInterval)
  
  return () => {
    if (cleanupTimer) {
      clearInterval(cleanupTimer)
      cleanupTimer = null
    }
  }
}

async function runFullCleanup(): Promise<void> {
  try {
    const expired = await runCleanupSweep()
    const pressured = await runStoragePressureCleanup()
    const maxEnforced = await enforceMaxVideos()
    
    const total = expired + pressured + maxEnforced
    if (total > 0) {
      console.info(
        `[CacheExpiration] Cleaned up ${total} videos ` +
        `(${expired} expired, ${pressured} storage pressure, ${maxEnforced} max limit)`
      )
    }
  } catch (err) {
    console.warn('[CacheExpiration] Cleanup failed:', err)
  }
}
```

### Integration with `useVideoCache`

```typescript
// In useVideoCache hook — touch video on access
import { touchVideo } from '@/lib/cache-expiration'

// When serving from cache:
if (cached) {
  touchVideo(video.id) // Update LRU tracking
  setVideoUrl(`/haven/v/${video.id}`)
}
```

### Integration with App Lifecycle

```typescript
// In ServiceWorkerProvider or app root
import { startPeriodicCleanup } from '@/lib/cache-expiration'

useEffect(() => {
  const stopCleanup = startPeriodicCleanup()
  return stopCleanup
}, [])
```

## Acceptance Criteria

- [ ] `isExpired()` correctly identifies expired cache entries
- [ ] `runCleanupSweep()` removes all expired entries
- [ ] `runStoragePressureCleanup()` removes oldest entries when storage is high
- [ ] `enforceMaxVideos()` limits the number of cached videos
- [ ] `touchVideo()` updates LRU tracking for accessed videos
- [ ] Periodic cleanup runs on the configured interval
- [ ] Cleanup doesn't interfere with active video playback
- [ ] Configuration is customizable via `CacheTTLConfig`
- [ ] Cleanup logs are informative but not noisy
- [ ] Cleanup stops when the component unmounts

## Dependencies

- Task 1.2 (Cache API Wrapper — `listCachedVideos`, `deleteVideo`, `getCacheStorageEstimate`)

## Estimated Effort

Medium (4-5 hours)