# Video Cache API Reference

Complete reference for all public functions and hooks in the Haven video cache system.

## Table of Contents

- [React Hooks](#react-hooks)
  - [useVideoCache](#usevideocache)
  - [useCacheStatus](#usecachestatus)
  - [useCapabilities](#usecapabilities)
- [Cache API Wrapper](#cache-api-wrapper)
  - [putVideo](#putvideo)
  - [getVideo](#getvideo)
  - [hasVideo](#hasvideo)
  - [deleteVideo](#deletevideo)
- [OPFS Utilities](#opfs-utilities)
  - [writeToStaging](#writetostaging)
  - [readFromStaging](#readfromstaging)
- [Lit Session Cache](#lit-session-cache)
  - [getCachedAuthContext](#getcachedauthcontext)
  - [setCachedAuthContext](#setcachedauthcontext)
- [AES Key Cache](#aes-key-cache)
  - [getCachedKey](#getcachedkey)
  - [setCachedKey](#setcachedkey)
- [Security Cleanup](#security-cleanup)
  - [onWalletDisconnect](#onwalletdisconnect)
  - [onSecurityClear](#onsecurityclear)
- [Expiration Service](#expiration-service)
  - [startPeriodicCleanup](#startperiodiccleanup)
- [Storage Persistence](#storage-persistence)
  - [requestPersistentStorage](#requestpersistentstorage)

---

## React Hooks

### useVideoCache

The primary React hook for video playback. Implements the cache-first loading strategy.

```typescript
function useVideoCache(video: Video | null): UseVideoCacheReturn
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `video` | `Video \| null` | The video to load, or null to reset state |

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| `videoUrl` | `string \| null` | URL to set as `<video src>` — `/haven/v/{id}` served by Service Worker |
| `isCached` | `boolean` | Whether the video was served from cache |
| `isLoading` | `boolean` | Whether the video is currently being loaded |
| `loadingStage` | `LoadingStage` | Current loading stage for progress display |
| `progress` | `number` | Progress percentage (0-100) |
| `error` | `Error \| null` | Error if loading failed |
| `retry` | `() => void` | Retry loading the video |
| `evict` | `() => Promise<void>` | Evict this video from cache |

**Loading Stages:**

```typescript
type LoadingStage = 
  | 'checking-cache'  // Checking if video is in Cache API
  | 'fetching'        // Downloading encrypted data
  | 'authenticating'  // Authenticating with Lit Protocol
  | 'decrypting'      // Decrypting AES key and video content
  | 'caching'         // Storing decrypted content in Cache API
  | 'ready'           // Video ready for playback
  | 'error'           // Loading failed
```

**Example:**

```tsx
import { useVideoCache } from '@/hooks/useVideoCache'

function VideoPlayer({ video }: { video: Video }) {
  const {
    videoUrl,
    isCached,
    isLoading,
    loadingStage,
    progress,
    error,
    retry,
    evict
  } = useVideoCache(video)

  if (isLoading) {
    return <LoadingProgress stage={loadingStage} progress={progress} />
  }

  if (error) {
    return <ErrorDisplay error={error} onRetry={retry} />
  }

  return (
    <div>
      {isCached && <CacheBadge />}
      <video src={videoUrl} controls />
      <button onClick={evict}>Remove from cache</button>
    </div>
  )
}
```

---

### useCacheStatus

Hook for checking cache status. Supports two modes:

1. **No arguments**: Returns global cache stats (for settings page)
2. **With videoIds**: Returns per-video cache status (for library grid)

```typescript
// Global stats mode (settings page)
function useCacheStatus(): UseCacheStatusReturn

// Per-video mode (library grid)
function useCacheStatus(videoIds: string[]): UseVideoCacheStatusReturn
```

**Global Stats Return:**

| Property | Type | Description |
|----------|------|-------------|
| `metadataStats` | `CacheStats \| null` | Metadata cache stats from arkiv-cache |
| `contentStats` | `ContentCacheStats \| null` | Video content cache stats |
| `totalCacheSize` | `number` | Combined total cache size in bytes |
| `isLoading` | `boolean` | Whether cache data is loading |
| `error` | `Error \| null` | Error if cache status fetch failed |
| `refresh` | `() => Promise<void>` | Refresh cache stats |

**Per-Video Return:**

| Property | Type | Description |
|----------|------|-------------|
| `cacheStatus` | `Map<string, boolean>` | Map of videoId → isCached |
| `isLoading` | `boolean` | Whether the cache check is still loading |
| `refresh` | `() => void` | Refresh cache status for all videos |
| `cachedCount` | `number` | Total number of cached videos |
| `totalCacheSize` | `number` | Total cache size (approximate) |

**Example (Library Grid):**

```tsx
import { useCacheStatus } from '@/hooks/useCacheStatus'

function LibraryView({ videos }: { videos: Video[] }) {
  const videoIds = videos.filter(v => v.isEncrypted).map(v => v.id)
  const { cacheStatus, cachedCount, isLoading } = useCacheStatus(videoIds)

  return (
    <div>
      <p>{cachedCount} videos cached</p>
      <div className="grid">
        {videos.map(video => (
          <VideoCard
            key={video.id}
            video={video}
            isCached={cacheStatus.get(video.id) ?? false}
          />
        ))}
      </div>
    </div>
  )
}
```

**Example (Settings Page):**

```tsx
import { useCacheStatus } from '@/hooks/useCacheStatus'
import { formatBytes } from '@/lib/utils'

function CacheSettings() {
  const { metadataStats, contentStats, totalCacheSize, isLoading, refresh } = useCacheStatus()

  if (isLoading) return <Loading />

  return (
    <div>
      <p>Metadata: {metadataStats?.totalVideos} videos</p>
      <p>Content cached: {contentStats?.cachedCount ?? 0} videos</p>
      <p>Total size: {formatBytes(totalCacheSize)}</p>
      <button onClick={refresh}>Refresh</button>
    </div>
  )
}
```

---

### useCapabilities

Hook to access browser capability detection. Used to check if video caching is supported and what features are available.

```typescript
function useCapabilities(): CapabilitiesContextValue
```

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| `capabilities` | `BrowserCapabilities` | Detected browser capabilities |
| `cacheConfig` | `CacheSystemConfig` | Cache system configuration |

**BrowserCapabilities:**

| Property | Type | Description |
|----------|------|-------------|
| `serviceWorker` | `boolean` | Service Worker API available |
| `cacheApi` | `boolean` | Cache API available |
| `opfs` | `boolean` | Origin Private File System available |
| `persistentStorage` | `boolean` | Persistent storage API available |
| `canUseVideoCache` | `boolean` | Video cache can be used (SW + Cache API) |
| `canUseOpfsStaging` | `boolean` | OPFS staging can be used |
| `browser` | `'chrome' \| 'firefox' \| 'safari' \| 'edge' \| 'other'` | Detected browser |
| `isMobile` | `boolean` | Device is mobile |
| `isSecureContext` | `boolean` | Running in secure context (HTTPS) |

**CacheSystemConfig:**

| Property | Type | Description |
|----------|------|-------------|
| `enabled` | `boolean` | Whether video cache is enabled |
| `useServiceWorker` | `boolean` | Whether to use Service Worker |
| `useOpfsStaging` | `boolean` | Whether to use OPFS for staging |
| `requestPersistence` | `boolean` | Whether to request persistent storage |
| `enablePrefetch` | `boolean` | Whether prefetching is enabled |
| `memoryStrategy` | `'api' \| 'heuristic' \| 'conservative'` | Memory detection strategy |
| `maxInMemorySize` | `number` | Maximum file size for in-memory decryption |
| `disabledReasons` | `string[]` | Reasons for disabled features |

**Example:**

```tsx
import { useCapabilities } from '@/components/providers/CapabilitiesProvider'

function VideoPlayer() {
  const { capabilities, cacheConfig } = useCapabilities()

  if (!cacheConfig.enabled) {
    return (
      <div>
        Video caching not available:
        {cacheConfig.disabledReasons.join(', ')}
      </div>
    )
  }

  return <video src={...} />
}
```

---

## Cache API Wrapper

### putVideo

Store decrypted video content in the cache.

```typescript
async function putVideo(
  videoId: string,
  data: Uint8Array | ArrayBuffer | Blob,
  mimeType?: string,
  options?: PutVideoOptions
): Promise<void>
```

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `videoId` | `string` | (required) | Unique identifier for the video |
| `data` | `Uint8Array \| ArrayBuffer \| Blob` | (required) | Video data to cache |
| `mimeType` | `string` | `'video/mp4'` | MIME type of the video |
| `options.ttl` | `number` | - | TTL in milliseconds for cache expiration |
| `options.retryOnQuotaExceeded` | `boolean` | `true` | Retry on quota exceeded |
| `options.evictOnQuotaExceeded` | `boolean` | `true` | Evict oldest entries on quota exceeded |

**Example:**

```typescript
import { putVideo } from '@/lib/video-cache'

const blob = await fetch(videoUrl).then(r => r.blob())
await putVideo('0x123...', blob, 'video/mp4', { ttl: 7 * 24 * 60 * 60 * 1000 })
```

---

### getVideo

Retrieve cached video content.

```typescript
async function getVideo(videoId: string): Promise<VideoCacheResult | null>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `videoId` | `string` | The video ID to retrieve |

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| `response` | `Response` | The cached Response object (contains the video blob) |
| `metadata` | `CacheMetadata` | Metadata extracted from response headers |

**CacheMetadata:**

| Property | Type | Description |
|----------|------|-------------|
| `videoId` | `string` | Video ID |
| `mimeType` | `string` | MIME type of the video |
| `size` | `number` | Size of the video in bytes |
| `cachedAt` | `Date` | When the video was cached |
| `ttl` | `number?` | Optional TTL in milliseconds |

**Example:**

```typescript
import { getVideo } from '@/lib/video-cache'

const result = await getVideo('0x123...')
if (result) {
  const { response, metadata } = result
  console.log(`Cached video: ${metadata.size} bytes`)
  const blob = await response.blob()
}
```

---

### hasVideo

Check if a video is cached without reading the response body.

```typescript
async function hasVideo(videoId: string): Promise<boolean>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `videoId` | `string` | The video ID to check |

**Returns:** `true` if the video is cached, `false` otherwise.

**Example:**

```typescript
import { hasVideo } from '@/lib/video-cache'

if (await hasVideo('0x123...')) {
  console.log('Video is available offline')
}
```

---

### deleteVideo

Remove a video from the cache.

```typescript
async function deleteVideo(videoId: string): Promise<boolean>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `videoId` | `string` | The video ID to remove |

**Returns:** `true` if the video was found and removed, `false` otherwise.

**Example:**

```typescript
import { deleteVideo } from '@/lib/video-cache'

const wasDeleted = await deleteVideo('0x123...')
if (wasDeleted) {
  console.log('Video removed from cache')
}
```

---

## OPFS Utilities

### writeToStaging

Write a stream of encrypted data to an OPFS staging file.

```typescript
async function writeToStaging(
  videoId: string,
  stream: ReadableStream<Uint8Array>,
  onProgress?: (bytesWritten: number) => void
): Promise<number>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `videoId` | `string` | Unique identifier for the video |
| `stream` | `ReadableStream<Uint8Array>` | ReadableStream of encrypted data |
| `onProgress` | `(bytesWritten: number) => void` | Optional callback for progress updates |

**Returns:** Total bytes written to staging.

**Example:**

```typescript
import { writeToStaging } from '@/lib/opfs'

const stream = await streamFromIpfs(cid)
const bytesWritten = await writeToStaging(video.id, stream, (bytes) => {
  setProgress((bytes / estimatedSize) * 100)
})
```

---

### readFromStaging

Read staged encrypted data back from OPFS.

```typescript
async function readFromStaging(videoId: string): Promise<Uint8Array>
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `videoId` | `string` | The video ID to read |

**Returns:** The encrypted data as Uint8Array.

**Example:**

```typescript
import { readFromStaging, deleteStaging } from '@/lib/opfs'
import { putVideo } from '@/lib/video-cache'

const encryptedData = await readFromStaging(video.id)
const decryptedData = await aesDecrypt(encryptedData, aesKey, iv)
await putVideo(video.id, decryptedData, mimeType)
await deleteStaging(video.id) // Clean up staging
```

---

## Lit Session Cache

### getCachedAuthContext

Get cached auth context for a wallet address.

```typescript
function getCachedAuthContext(address: string): LitAuthContext | null
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `address` | `string` | The wallet address to look up |

**Returns:** The cached `LitAuthContext` if valid, `null` if not found or expired.

**Example:**

```typescript
import { getCachedAuthContext } from '@/lib/lit-session-cache'

const authContext = getCachedAuthContext('0x123...')
if (authContext) {
  // Use cached context - no wallet popup needed
  const decryptedKey = await decryptWithLit(authContext, encryptedKey)
} else {
  // Need to create new context - will trigger wallet popup
  const newContext = await createLitAuthContext()
}
```

---

### setCachedAuthContext

Cache an auth context for a wallet address.

```typescript
function setCachedAuthContext(
  address: string,
  authContext: LitAuthContext,
  expirationMs?: number
): void
```

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `address` | `string` | (required) | The wallet address to cache for |
| `authContext` | `LitAuthContext` | (required) | The auth context to cache |
| `expirationMs` | `number` | `3600000` (1 hour) | Expiration time in milliseconds |

**Example:**

```typescript
import { setCachedAuthContext } from '@/lib/lit-session-cache'

const authContext = await authManager.createEoaAuthContext(config)
setCachedAuthContext('0x123...', authContext, 60 * 60 * 1000)
```

---

## AES Key Cache

### getCachedKey

Get cached AES key for a video.

```typescript
function getCachedKey(videoId: string): CachedKeyResult | null
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `videoId` | `string` | The unique video identifier |

**Returns:** Object with `key` (Uint8Array) and `iv` (Uint8Array), or `null` if not found/expired.

**Example:**

```typescript
import { getCachedKey } from '@/lib/aes-key-cache'

const cached = getCachedKey('video-123')
if (cached) {
  // Use cached.key and cached.iv for decryption
  const decrypted = await aesDecrypt(encryptedData, cached.key, cached.iv)
} else {
  // Need to decrypt key via Lit nodes
  const key = await decryptKeyViaLit(encryptedKey)
}
```

---

### setCachedKey

Cache an AES key for a video.

```typescript
function setCachedKey(
  videoId: string,
  key: Uint8Array,
  iv: Uint8Array,
  ttl?: number
): void
```

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `videoId` | `string` | (required) | The unique video identifier |
| `key` | `Uint8Array` | (required) | The AES key to cache |
| `iv` | `Uint8Array` | (required) | The IV to cache |
| `ttl` | `number` | `3600000` (1 hour) | Time to live in milliseconds |

**Example:**

```typescript
import { setCachedKey } from '@/lib/aes-key-cache'

const aesKey = await decryptKeyViaLit(encryptedKey) // expensive!
const iv = base64ToUint8Array(metadata.iv)
setCachedKey('video-123', aesKey, iv)
// Next time, getCachedKey('video-123') will return without Lit contact
```

---

## Security Cleanup

### onWalletDisconnect

Handle wallet disconnect - clears auth-related caches.

```typescript
function onWalletDisconnect(address: string): void
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `address` | `string` | The wallet address that disconnected |

**What it clears:**
- Lit session cache for the address
- All AES keys
- OPFS staging files
- Video cache (configurable, default: keep)

**Example:**

```typescript
import { onWalletDisconnect } from '@/lib/security-cleanup'

// In wallet disconnect handler
wallet.on('disconnect', ({ address }) => {
  onWalletDisconnect(address)
})
```

---

### onSecurityClear

Nuclear option: clear everything (sessions, keys, videos, staging).

```typescript
async function onSecurityClear(): Promise<SecurityClearResult>
```

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| `sessionsCleared` | `boolean` | Whether Lit sessions were cleared |
| `keysCleared` | `boolean` | Whether AES keys were cleared |
| `videosCleared` | `boolean` | Whether video cache was cleared |
| `stagingCleared` | `boolean` | Whether OPFS staging was cleared |

**Example:**

```typescript
import { onSecurityClear } from '@/lib/security-cleanup'

// In "Clear All Data" button handler
async function handleClearAll() {
  const results = await onSecurityClear()
  console.log('Cleared:', results)
  // { sessionsCleared: true, keysCleared: true, videosCleared: true, stagingCleared: true }
}
```

---

## Expiration Service

### startPeriodicCleanup

Start the periodic background cleanup timer.

```typescript
function startPeriodicCleanup(config?: Partial<CacheTTLConfig>): () => void
```

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `config.defaultTTL` | `number` | `7 days` | Default TTL for cached videos |
| `config.maxTTL` | `number` | `30 days` | Maximum TTL allowed |
| `config.minTTL` | `number` | `1 hour` | Minimum TTL allowed |
| `config.storageThreshold` | `number` | `0.8` | Storage threshold for cleanup (0-1) |
| `config.cleanupInterval` | `number` | `1 hour` | How often to run cleanup |
| `config.maxCachedVideos` | `number` | `50` | Maximum videos to keep in cache |

**Returns:** Cleanup function to stop the timer (call on component unmount).

**Example:**

```tsx
import { startPeriodicCleanup } from '@/lib/cache-expiration'
import { useEffect } from 'react'

function App() {
  useEffect(() => {
    const stopCleanup = startPeriodicCleanup({
      cleanupInterval: 30 * 60 * 1000, // 30 minutes
      storageThreshold: 0.75, // 75%
    })
    return stopCleanup
  }, [])

  return <div>...</div>
}
```

---

## Storage Persistence

### requestPersistentStorage

Request persistent storage from the browser.

```typescript
async function requestPersistentStorage(): Promise<boolean>
```

**Returns:** `true` if persistence was granted or already active, `false` otherwise.

**Behavior:**
- Chrome: Auto-grants if site is bookmarked, installed as PWA, or has push notifications
- Firefox: Shows a permission dialog to the user
- Safari: No API available, will always return `false`

**Example:**

```typescript
import { requestPersistentStorage } from '@/lib/storage-persistence'

const granted = await requestPersistentStorage()
if (granted) {
  console.log('Storage is now persistent - cache won\'t be evicted')
} else {
  console.log('Storage may be evicted under pressure')
}
```

---

## Additional Utilities

### listCachedVideos

List all cached videos with their metadata.

```typescript
async function listCachedVideos(): Promise<CacheEntry[]>
```

**Returns:** Array of cache entries with metadata.

### getCacheStorageEstimate

Get storage usage estimate.

```typescript
async function getCacheStorageEstimate(): Promise<StorageEstimate>
```

**Returns:**

| Property | Type | Description |
|----------|------|-------------|
| `usage` | `number` | Bytes used by the origin |
| `quota` | `number` | Bytes available to the origin |
| `percent` | `number` | Percentage of quota used (0-100) |

### clearAllVideos

Clear all cached videos.

```typescript
async function clearAllVideos(): Promise<void>
```

### clearAllKeys

Remove all cached AES keys (zero-fills before removal).

```typescript
function clearAllKeys(): void
```

### clearAuthContext

Clear cached auth context.

```typescript
function clearAuthContext(address?: string): void
```

### clearAllStaging

Clear all OPFS staging files.

```typescript
async function clearAllStaging(): Promise<void>
```
