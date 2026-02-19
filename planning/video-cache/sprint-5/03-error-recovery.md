# Task 5.3: Error Recovery & Retry Logic

## Objective

Implement proper error handling and retry logic for cache-related operations. Errors should be surfaced clearly to the user with actionable retry options.

## Background

The caching system has several potential failure points:

1. **Cache API write fails** (quota exceeded, permission denied)
2. **Cache API read fails** (corrupted entry, evicted by browser)
3. **Service Worker serves corrupted data**

Each failure should be handled with clear error messages and retry capability.

## Requirements

### Error Handling Strategy

```
For every cache operation:
  try {
    Perform operation
  } catch (error) {
    Log error with context
    Surface to user with retry option
  }
```

### Specific Error Scenarios

#### 1. Cache API Write Failure (Quota Exceeded)

```typescript
try {
  await putVideo(videoId, decryptedData, mimeType)
} catch (err) {
  if (err.name === 'QuotaExceededError') {
    // Evict oldest cached videos to make room, then retry
    await evictOldestVideos(estimatedSize)
    await putVideo(videoId, decryptedData, mimeType)
  } else {
    throw err
  }
}
```

#### 2. Corrupted Cache Entry

```typescript
const cached = await hasVideo(videoId)
if (cached) {
  try {
    const response = await getVideo(videoId)
    if (!response || response.response.status !== 200) {
      throw new Error('Invalid cache entry')
    }
  } catch {
    console.warn('[VideoCache] Corrupted cache entry, removing:', videoId)
    await deleteVideo(videoId)
    // Proceed as cache miss — re-fetch and re-decrypt
  }
}
```

#### 3. Service Worker Serves Bad Data

```typescript
// In the video element error handler
videoElement.addEventListener('error', async () => {
  if (isCached && videoUrl.startsWith('/haven/v/')) {
    console.warn('[VideoCache] Cached video failed to play, evicting and retrying')
    await deleteVideo(videoId)
    retry() // Re-triggers the full pipeline
  }
})
```

### Cache Integrity Verification

```typescript
// src/lib/cache-integrity.ts

/**
 * Verify a cached video entry is valid and playable.
 * Returns true if the entry appears valid, false if it should be evicted.
 */
export async function verifyCacheEntry(videoId: string): Promise<boolean> {
  try {
    const result = await getVideo(videoId)
    if (!result) return false
    
    const { response, metadata } = result
    
    if (response.status !== 200) return false
    
    const contentType = response.headers.get('Content-Type') || ''
    if (!contentType.startsWith('video/') && !contentType.startsWith('application/')) {
      return false
    }
    
    const blob = await response.clone().blob()
    if (blob.size < 1024) return false
    if (metadata.size > 0 && Math.abs(blob.size - metadata.size) > 1024) {
      return false
    }
    
    return true
  } catch {
    return false
  }
}
```

### Error Reporting

```typescript
// src/lib/cache-errors.ts

export type CacheErrorCode =
  | 'CACHE_WRITE_FAILED'
  | 'CACHE_READ_FAILED'
  | 'CACHE_CORRUPTED'
  | 'QUOTA_EXCEEDED'
  | 'INTEGRITY_CHECK_FAILED'

interface CacheError {
  code: CacheErrorCode
  message: string
  videoId?: string
  timestamp: Date
}

const errorLog: CacheError[] = []
const MAX_ERROR_LOG = 50

export function logCacheError(error: CacheError): void {
  errorLog.push(error)
  if (errorLog.length > MAX_ERROR_LOG) {
    errorLog.shift()
  }
  console.warn(`[CacheError] ${error.code}: ${error.message}`)
}

export function getCacheErrors(): CacheError[] {
  return [...errorLog]
}

export function clearCacheErrors(): void {
  errorLog.length = 0
}
```

## Acceptance Criteria

- [ ] Quota exceeded errors trigger automatic eviction of oldest entries and retry
- [ ] Corrupted cache entries are detected and evicted automatically
- [ ] Video element errors trigger cache eviction and retry
- [ ] `verifyCacheEntry()` validates cache integrity
- [ ] Error log captures cache failures for debugging
- [ ] All errors are logged with context
- [ ] Settings page can display recent cache errors for debugging

## Dependencies

- All Sprint 1-4 tasks (this task adds error handling to all of them)

## Estimated Effort

Medium (4-6 hours)