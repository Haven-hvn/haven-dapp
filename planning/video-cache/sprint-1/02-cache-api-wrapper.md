# Task 1.2: Cache API Wrapper (`video-cache.ts`)

## Objective

Create a typed wrapper around the browser Cache API specifically for storing and retrieving decrypted video content. This module provides the core `put` / `get` / `delete` / `has` operations that the rest of the system uses.

## Background

The Cache API stores `Request` → `Response` pairs on disk. We use synthetic URLs (`/haven/v/{videoId}`) as keys and store the decrypted video bytes as the `Response` body. This wrapper abstracts the Cache API details and adds metadata tracking (MIME type, size, timestamps) via custom response headers.

## Requirements

### Core API (`src/lib/video-cache.ts`)

1. **`putVideo(videoId, data, mimeType)`** — Store decrypted video in cache
   - Accept `Uint8Array | ArrayBuffer | Blob` as input
   - Create a `Response` with correct `Content-Type`, `Content-Length`, and custom metadata headers
   - Store under the synthetic URL `/haven/v/{videoId}`
   - Add metadata headers: `X-Haven-Cached-At`, `X-Haven-Video-Id`, `X-Haven-Size`

2. **`getVideo(videoId)`** — Retrieve cached video
   - Return `{ response: Response, metadata: CacheMetadata } | null`
   - Return `null` on cache miss

3. **`hasVideo(videoId)`** — Check if video is cached (without reading body)
   - Use `cache.match()` and check existence
   - Return `boolean`

4. **`deleteVideo(videoId)`** — Remove video from cache
   - Return `boolean` indicating success

5. **`listCachedVideos()`** — List all cached video IDs with metadata
   - Iterate cache keys, extract video IDs and metadata from headers
   - Return `CacheEntry[]`

6. **`getCacheStorageEstimate()`** — Get storage usage info
   - Use `navigator.storage.estimate()` for quota/usage
   - Return `{ usage: number, quota: number, percent: number }`

7. **`clearAllVideos()`** — Delete the entire video cache
   - Delete and recreate the cache store

### Types

```typescript
interface CacheMetadata {
  videoId: string
  mimeType: string
  size: number
  cachedAt: Date
  ttl?: number // milliseconds until expiry
}

interface CacheEntry extends CacheMetadata {
  url: string
}

interface StorageEstimate {
  usage: number   // bytes used
  quota: number   // bytes available
  percent: number // 0-100
}
```

## Implementation Details

### Synthetic URL Construction

```typescript
const CACHE_NAME = 'haven-video-cache-v1'
const VIDEO_URL_PREFIX = '/haven/v/'

function getVideoUrl(videoId: string): string {
  return `${self.location.origin}${VIDEO_URL_PREFIX}${videoId}`
}
```

### Storing with Metadata Headers

```typescript
async function putVideo(
  videoId: string,
  data: Uint8Array | ArrayBuffer | Blob,
  mimeType: string = 'video/mp4',
  ttl?: number
): Promise<void> {
  const cache = await caches.open(CACHE_NAME)
  const url = getVideoUrl(videoId)
  
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType })
  
  const response = new Response(blob, {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(blob.size),
      'Accept-Ranges': 'bytes',
      'X-Haven-Video-Id': videoId,
      'X-Haven-Cached-At': new Date().toISOString(),
      'X-Haven-Size': String(blob.size),
      ...(ttl ? { 'X-Haven-TTL': String(ttl) } : {}),
    },
  })
  
  await cache.put(url, response)
}
```

### Reading Metadata Without Body

```typescript
async function hasVideo(videoId: string): Promise<boolean> {
  const cache = await caches.open(CACHE_NAME)
  const url = getVideoUrl(videoId)
  const response = await cache.match(url)
  return response !== undefined
}

function extractMetadata(response: Response, videoId: string): CacheMetadata {
  return {
    videoId,
    mimeType: response.headers.get('Content-Type') || 'video/mp4',
    size: parseInt(response.headers.get('X-Haven-Size') || '0', 10),
    cachedAt: new Date(response.headers.get('X-Haven-Cached-At') || Date.now()),
    ttl: response.headers.has('X-Haven-TTL')
      ? parseInt(response.headers.get('X-Haven-TTL')!, 10)
      : undefined,
  }
}
```

### Storage Estimate

```typescript
async function getCacheStorageEstimate(): Promise<StorageEstimate> {
  if (!navigator.storage?.estimate) {
    return { usage: 0, quota: 0, percent: 0 }
  }
  
  const estimate = await navigator.storage.estimate()
  const usage = estimate.usage || 0
  const quota = estimate.quota || 0
  const percent = quota > 0 ? (usage / quota) * 100 : 0
  
  return { usage, quota, percent }
}
```

## Arkiv Cache Integration

> **Cross-reference:** [Arkiv Cache](../../arkiv-cache/) — IndexedDB metadata persistence for video entities.

After each `putVideo()` or `deleteVideo()` call, the arkiv-cache's IndexedDB metadata should be updated to reflect the video content cache status. This is done by calling the `VideoCacheService.updateVideoCacheStatus()` method from the [arkiv-cache service layer](../../arkiv-cache/sprint-1/04-cache-service-layer.md).

### Integration Pattern

The Cache API wrapper itself stays **pure** — it only deals with Cache API operations. The arkiv-cache notification happens at the **hook level** (`useVideoCache`) or in a thin integration layer, not inside these functions. This keeps the wrapper testable and decoupled.

```typescript
// In useVideoCache hook (NOT in video-cache.ts):
await putVideo(video.id, blob, mimeType)

// After successful cache write, notify arkiv-cache
const cacheService = getVideoCacheService(video.owner)
cacheService.updateVideoCacheStatus(video.id, 'cached').catch(() => {})
```

Similarly for eviction:
```typescript
await deleteVideo(videoId)

// Notify arkiv-cache
cacheService.updateVideoCacheStatus(videoId, 'not-cached').catch(() => {})
```

The `listCachedVideos()` function returns `CacheEntry[]` with `videoId` and size info. The management UI can cross-reference these with arkiv-cache metadata (via `cacheService.getContentCachedVideos()`) to display video titles and descriptions alongside cache entries.

## Acceptance Criteria

- [ ] `putVideo()` stores decrypted video bytes in Cache API with correct headers
- [ ] `getVideo()` retrieves cached video and parses metadata from headers
- [ ] `hasVideo()` returns `true`/`false` without reading the response body
- [ ] `deleteVideo()` removes a specific video from cache
- [ ] `listCachedVideos()` returns all cached entries with metadata
- [ ] `getCacheStorageEstimate()` returns storage usage information
- [ ] `clearAllVideos()` removes all cached videos
- [ ] All functions handle the case where Cache API is not available (SSR, unsupported browser)
- [ ] TypeScript types are exported for use by other modules
- [ ] Cache name constant matches the Service Worker's cache name
- [ ] Wrapper stays decoupled from arkiv-cache (integration happens at hook level)

## Dependencies

- Task 1.1 (Service Worker Setup) — shares the `CACHE_NAME` constant
- [Arkiv Cache](../../arkiv-cache/) — must be implemented first; provides `VideoCacheService.updateVideoCacheStatus()` for metadata sync

## Estimated Effort

Medium (3-5 hours)
