# Task 2.1 — Integrate Cache into Video Service

**Sprint:** 2 — Core Integration  
**Estimate:** 4–5 hours  
**File:** `src/services/videoService.ts` (modify)

## Objective

Modify the existing `videoService.ts` to use the cache service as a write-through layer. Every successful Arkiv fetch should automatically persist results to IndexedDB. The cache preserves metadata for entities that Arkiv has expired (removed as part of normal blockchain operations).

## Background

Currently, `videoService.ts` fetches directly from Arkiv via the SDK and returns `Video[]`. There is no persistence — if the user refreshes the page, all data is re-fetched from Arkiv. If the Arkiv entity has expired, the data is gone forever.

After this task, the data flow becomes:

```
fetchAllVideos() 
  → Try Arkiv SDK
    → Success: sync results to cache, return merged list (Arkiv + expired cache entries)
    → Merge: combine Arkiv results with cached expired entities
```

## Prerequisites

- Sprint 1 fully completed (cache types, IndexedDB, transforms, cache service, tests)

## Requirements

### 1. Add Cache Service Import

```typescript
import { getVideoCacheService } from '@/services/cacheService'
```

### 2. Modify `fetchAllVideos`

Current signature stays the same, but behavior changes:

```typescript
export async function fetchAllVideos(
  ownerAddress: string, 
  maxResults: number = 1000
): Promise<Video[]> {
  const cacheService = getVideoCacheService(ownerAddress)

  try {
    // 1. Fetch from Arkiv (primary source)
    const client = getClient()
    const entities = await getAllEntitiesByOwner(client, ownerAddress, maxResults)
    const arkivVideos = entities.map(entity => parseArkivEntity(entity))

    // 2. Sync to cache (write-through) — fire and forget, don't block return
    cacheService.syncWithArkiv(arkivVideos).catch(err => {
      console.warn('[VideoService] Cache sync failed:', err)
    })

    // 3. Return merged list (Arkiv + expired cached entries)
    return await cacheService.getMergedVideos(arkivVideos)
  } catch (arkivError) {
    // 4. Arkiv fetch error — log and return cached data
    console.warn('[VideoService] Arkiv fetch error:', arkivError)
    
    const cachedVideos = await cacheService.getVideos()
    if (cachedVideos.length > 0) {
      return cachedVideos
    }
    
    // 5. Both Arkiv and cache failed — throw original error
    throw arkivError
  }
}
```

### 3. Modify `fetchVideos` (Paginated)

Same pattern as `fetchAllVideos` but for paginated queries:

```typescript
export async function fetchVideos(options: FetchVideosOptions): Promise<Video[]> {
  const cacheService = getVideoCacheService(options.ownerAddress)

  try {
    const client = getClient()
    const { ownerAddress, maxResults = 50 } = options
    const entities = await queryEntitiesByOwner(client, ownerAddress, { maxResults, ... })
    const arkivVideos = entities.map(entity => parseArkivEntity(entity))

    // Write-through to cache
    cacheService.cacheVideos(arkivVideos).catch(err => {
      console.warn('[VideoService] Cache write failed:', err)
    })

    return arkivVideos
  } catch (arkivError) {
    console.warn('[VideoService] Arkiv fetch failed, using cache:', arkivError)
    const cachedVideos = await cacheService.getVideos()
    if (cachedVideos.length > 0) {
      return cachedVideos.slice(0, options.maxResults || 50)
    }
    throw arkivError
  }
}
```

### 4. Modify `fetchVideoById`

```typescript
export async function fetchVideoById(entityKey: string): Promise<Video | null> {
  // Try Arkiv first
  try {
    const client = getClient()
    const entity = await getEntity(client, entityKey)

    if (entity) {
      const video = parseArkivEntity(entity)
      
      // Write-through to cache (need wallet address from the video)
      const cacheService = getVideoCacheService(video.owner)
      cacheService.cacheVideo(video).catch(err => {
        console.warn('[VideoService] Cache write failed:', err)
      })
      // Update last accessed
      cacheService.touchVideo(video.id).catch(() => {})

      return video
    }
  } catch (error) {
    console.warn('[VideoService] Arkiv fetch failed for entity:', entityKey, error)
  }

  // Return cached data — try all known wallet databases
  // Note: This is a limitation since we don't know the owner address
  // The hook layer (useVideoQuery) should pass the owner address when available
  return null
}
```

### 5. New: `fetchVideoByIdWithCache`

Add a new function that accepts owner address for cache lookup:

```typescript
export async function fetchVideoByIdWithCache(
  entityKey: string,
  ownerAddress: string
): Promise<Video | null> {
  const cacheService = getVideoCacheService(ownerAddress)

  try {
    const client = getClient()
    const entity = await getEntity(client, entityKey)

    if (entity) {
      const video = parseArkivEntity(entity)
      cacheService.cacheVideo(video).catch(() => {})
      cacheService.touchVideo(video.id).catch(() => {})
      return video
    }

    // Entity not found on Arkiv — check cache (may be expired)
    return await cacheService.getVideo(entityKey)
  } catch (error) {
    console.warn('[VideoService] Arkiv fetch failed, checking cache:', error)
    return await cacheService.getVideo(entityKey)
  }
}
```

## Key Design Decisions

1. **Cache sync is fire-and-forget** — We don't block the UI waiting for IndexedDB writes. The `syncWithArkiv` call runs in the background.
2. **Arkiv is always the primary source** — We always try Arkiv first. Cache preserves expired entity metadata that Arkiv has removed as part of normal operations.
3. **Merged results include expired entries** — The `getMergedVideos` call returns both active Arkiv videos AND expired cached videos, giving users access to their full history.
4. **API compatible** — Function signatures don't change, so existing hooks continue to work without modification.

## Error Handling

- Cache failures are **never** propagated to the caller
- All cache operations use `.catch()` to prevent unhandled rejections
- If both Arkiv AND cache fail, the original Arkiv error is thrown (existing behavior)
- Console warnings are logged for debugging but don't affect UX

## Acceptance Criteria

- [ ] `fetchAllVideos` writes through to cache on successful Arkiv fetch
- [ ] `fetchAllVideos` returns cached expired entities merged with Arkiv results
- [ ] `fetchAllVideos` returns merged list (Arkiv + expired cache entries)
- [ ] `fetchVideos` writes through to cache
- [ ] `fetchVideoById` writes through to cache
- [ ] `fetchVideoByIdWithCache` returns cached data for expired entities
- [ ] Cache failures never block or break the UI
- [ ] Existing function signatures are preserved (API compatible)
- [ ] Console warnings logged for cache failures (not errors)
- [ ] No new dependencies added (uses existing cacheService)

## Relationship to Video Content Cache

> **Cross-reference:** [Video Content Cache](../../video-cache/) — Service Worker + Cache API for decrypted video bytes.

The video service modifications here establish the **metadata persistence layer** that the video-cache system depends on. Key interactions:

1. **CID preservation:** The `fetchAllVideos` → `syncWithArkiv` flow ensures `filecoinCid` and `encryptedCid` are persisted in IndexedDB. When the video-cache's `useVideoCache` hook later needs to fetch content for an expired entity, it can still resolve the CID from the cached `Video` object returned by `getMergedVideos`.

2. **Merged results feed the video player:** The `getMergedVideos` return value includes expired entities with their full metadata (CIDs, encryption info). The video-cache's `useVideoCache(video)` hook receives these `Video` objects and can still initiate fetch + decrypt + cache for expired entities — as long as the content is still on Filecoin/IPFS.

3. **No video-cache dependency yet:** This task does NOT import or reference the video-cache system. It only ensures metadata is persisted. The video-cache integration comes later in the [video-cache sprint plan](../../video-cache/).

## Testing Notes

- Mock both Arkiv SDK and cache service for unit tests
- Test scenario: Arkiv returns 5 videos, cache has 3 expired → merged list has 8
- Test scenario: Arkiv throws network error, cache has 10 videos → returns 10 from cache
- Test scenario: Both Arkiv and cache fail → throws Arkiv error
- Test scenario: Arkiv returns video, cache write fails → still returns video
- Test scenario: Expired video in cache still has valid `filecoinCid` — verify it's included in merged results
