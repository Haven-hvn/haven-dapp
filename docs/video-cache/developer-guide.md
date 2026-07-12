# Video Cache Developer Guide

Practical guide for developers working with the Haven video cache system.

## Table of Contents

- [Getting Started](#getting-started)
- [How to Add a New Video Source Type](#how-to-add-a-new-video-source-type)
- [How to Modify Cache TTL Defaults](#how-to-modify-cache-ttl-defaults)
- [How to Debug Cache Issues](#how-to-debug-cache-issues)
- [How to Test Cache Behavior Locally](#how-to-test-cache-behavior-locally)
- [How to Disable Caching for Development](#how-to-disable-caching-for-development)

## Getting Started

### Prerequisites

- Node.js >= 18
- Chrome, Edge, or Firefox (Safari has limited support)
- HTTPS or localhost (Service Workers require secure context)

### Setup

1. Ensure the Service Worker is registered:

```tsx
// In your root layout or app entry
import { ServiceWorkerProvider } from '@/components/providers/ServiceWorkerProvider'

export default function RootLayout({ children }) {
  return (
    <ServiceWorkerProvider>
      {children}
    </ServiceWorkerProvider>
  )
}
```

2. Wrap your app with CapabilitiesProvider for feature detection:

```tsx
import { CapabilitiesProvider } from '@/components/providers/CapabilitiesProvider'

export default function App({ children }) {
  return (
    <CapabilitiesProvider>
      <ServiceWorkerProvider>
        {children}
      </ServiceWorkerProvider>
    </CapabilitiesProvider>
  )
}
```

3. Add the SecurityCleanupProvider for automatic cleanup on wallet changes:

```tsx
import { useSecurityCleanup } from '@/hooks/useSecurityCleanup'

function SecurityCleanupProvider({ children }) {
  useSecurityCleanup()
  return <>{children}</>
}
```

### Basic Usage

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

## How to Add a New Video Source Type

### Overview

To add support for a new video source type (e.g., a new CDN or storage provider), you need to:

1. Create a fetch adapter for the new source
2. Integrate with the `useVideoCache` hook
3. Update the Video type if needed

### Step 1: Create a Fetch Adapter

Create a new file for your video source:

```typescript
// src/lib/videoSources/mySource.ts

import { VideoSourceAdapter, VideoFetchResult } from '@/types/video'

export const mySourceAdapter: VideoSourceAdapter = {
  name: 'my-source',
  
  async canHandle(video: Video): Promise<boolean> {
    // Check if this adapter can handle the video
    return video.sourceType === 'my-source' || !!video.mySourceId
  },
  
  async fetchEncrypted(video: Video, onProgress?: (bytes: number) => void): Promise<VideoFetchResult> {
    // Fetch encrypted data from your source
    const response = await fetch(`https://my-cdn.com/videos/${video.mySourceId}`)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`)
    }
    
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }
    
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      chunks.push(value)
      totalBytes += value.byteLength
      onProgress?.(totalBytes)
    }
    
    // Concatenate chunks
    const encryptedData = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
      encryptedData.set(chunk, offset)
      offset += chunk.byteLength
    }
    
    return {
      data: encryptedData,
      mimeType: response.headers.get('content-type') || 'video/mp4',
      size: totalBytes,
    }
  },
  
  async fetchWithStreaming(video: Video): Promise<ReadableStream<Uint8Array>> {
    // Return a stream for OPFS staging
    const response = await fetch(`https://my-cdn.com/videos/${video.mySourceId}`)
    
    if (!response.body) {
      throw new Error('No response body')
    }
    
    return response.body
  }
}
```

### Step 2: Register the Adapter

Add your adapter to the video source registry:

```typescript
// src/lib/videoSources/index.ts

import { mySourceAdapter } from './mySource'
import { ipfsAdapter } from './ipfs'
import { synapseAdapter } from './synapse'

export const videoSourceAdapters = [
  synapseAdapter,  // Primary source
  ipfsAdapter,     // Fallback
  mySourceAdapter, // Your new source
]

export async function fetchFromSource(
  video: Video,
  onProgress?: (bytes: number) => void
): Promise<VideoFetchResult> {
  // Find an adapter that can handle this video
  for (const adapter of videoSourceAdapters) {
    if (await adapter.canHandle(video)) {
      console.log(`[VideoSources] Using adapter: ${adapter.name}`)
      return adapter.fetchEncrypted(video, onProgress)
    }
  }
  
  throw new Error('No adapter found for video')
}
```

### Step 3: Update the Video Type

Add your source-specific fields to the Video type:

```typescript
// src/types/video.ts

export interface Video {
  id: string
  title: string
  // ... other fields
  
  // Source identifiers
  filecoinCid?: string
  encryptedCid?: string
  mySourceId?: string  // Your new field
  
  sourceType?: 'ipfs' | 'synapse' | 'my-source'
}
```

### Step 4: Test Your Integration

Create a test video with your source:

```typescript
const testVideo: Video = {
  id: 'test-video-1',
  title: 'Test Video',
  mySourceId: 'video-123',
  sourceType: 'my-source',
  isEncrypted: true,
  // ... other required fields
}

// Use with the cache hook
const { videoUrl, isLoading } = useVideoCache(testVideo)
```

## How to Modify Cache TTL Defaults

### Understanding TTL Configuration

The cache TTL (Time To Live) system is configured in `src/lib/cache-expiration.ts`:

```typescript
// src/lib/cache-expiration.ts

export const DEFAULT_CONFIG: CacheTTLConfig = {
  defaultTTL: 7 * 24 * 60 * 60 * 1000,    // 7 days
  maxTTL: 30 * 24 * 60 * 60 * 1000,       // 30 days
  minTTL: 60 * 60 * 1000,                 // 1 hour
  storageThreshold: 0.8,                   // 80%
  cleanupInterval: 60 * 60 * 1000,         // 1 hour
  maxCachedVideos: 50,
}
```

### Option 1: Modify Global Defaults

Edit the `DEFAULT_CONFIG` object directly:

```typescript
// src/lib/cache-expiration.ts

export const DEFAULT_CONFIG: CacheTTLConfig = {
  defaultTTL: 14 * 24 * 60 * 60 * 1000,   // Change to 14 days
  maxTTL: 60 * 24 * 60 * 60 * 1000,       // Change to 60 days
  minTTL: 24 * 60 * 60 * 1000,            // Change to 24 hours
  storageThreshold: 0.9,                   // Change to 90%
  cleanupInterval: 2 * 60 * 60 * 1000,     // Change to 2 hours
  maxCachedVideos: 100,                    // Change to 100 videos
}
```

### Option 2: Pass Custom Config at Runtime

Override config for specific operations:

```typescript
import { putVideo } from '@/lib/video-cache'
import { startPeriodicCleanup, runCleanupSweep } from '@/lib/cache-expiration'

// Custom TTL for a specific video
await putVideo(videoId, data, mimeType, {
  ttl: 14 * 24 * 60 * 60 * 1000  // 14 days
})

// Custom cleanup configuration
const stopCleanup = startPeriodicCleanup({
  defaultTTL: 14 * 24 * 60 * 60 * 1000,
  cleanupInterval: 30 * 60 * 1000,  // 30 minutes
  maxCachedVideos: 100,
})

// One-time cleanup with custom config
const removed = await runCleanupSweep({
  defaultTTL: 3 * 24 * 60 * 60 * 1000  // 3 days
})
```

### Option 3: Environment-Based Configuration

Create different configs for different environments:

```typescript
// src/lib/cache-config.ts

const isDev = process.env.NODE_ENV === 'development'
const isMobile = typeof navigator !== 'undefined' && /Mobile/.test(navigator.userAgent)

export const CACHE_CONFIG: CacheTTLConfig = {
  defaultTTL: isDev 
    ? 60 * 60 * 1000        // 1 hour in dev
    : 7 * 24 * 60 * 60 * 1000,  // 7 days in prod
  
  maxTTL: 30 * 24 * 60 * 60 * 1000,
  
  minTTL: isDev 
    ? 5 * 60 * 1000         // 5 minutes in dev
    : 60 * 60 * 1000,       // 1 hour in prod
  
  storageThreshold: isMobile ? 0.7 : 0.8,
  
  cleanupInterval: isDev 
    ? 5 * 60 * 1000         // 5 minutes in dev
    : 60 * 60 * 1000,       // 1 hour in prod
  
  maxCachedVideos: isMobile ? 20 : 50,
}
```

## How to Debug Cache Issues

### Chrome DevTools Walkthrough

#### 1. Check Service Worker Status

1. Open DevTools (F12)
2. Go to **Application** tab
3. Select **Service Workers** in the left panel

What to look for:
- Status should show "activated and is running"
- Source should point to `haven-sw.js`
- Check "Update on reload" during development

#### 2. Inspect Cache Contents

1. Go to **Application** tab
2. Select **Cache Storage** in the left panel
3. Click on `haven-video-cache-v1`

You'll see:
- List of cached videos with synthetic URLs (`/haven/v/{videoId}`)
- Response headers including `X-Haven-Cached-At`, `X-Haven-Size`

#### 3. Monitor Network Requests

1. Go to **Network** tab
2. Filter by "Img" or "Media" to see video requests
3. Look for requests to `/haven/v/{videoId}`

Indicators:
- **Size column**: Shows "(disk cache)" for cache hits
- **Time column**: Should be <100ms for cache hits
- **Initiator**: Shows "haven-sw.js" for SW-served requests

#### 4. Check Console Logs

Enable debug logging:

```typescript
// In browser console
localStorage.setItem('haven-debug', 'true')
```

Look for:
```
[VideoCache] Cache hit for: 0x123...
[VideoCache] Cache miss for: 0x456...
[useVideoCache] Loading stage: decrypting
[CacheExpiration] Cleanup sweep removed 2 expired videos
```

#### 5. Storage Usage

1. Go to **Application** tab
2. Select **Storage** in the left panel
3. Check usage for your origin

Useful metrics:
- **Cache Storage**: Video content size
- **IndexedDB**: Metadata storage
- **Origin Private File System**: Staging files (if OPFS used)

### Firefox DevTools

Similar to Chrome:
1. **Storage** tab → **Cache Storage** for cached content
2. **Service Workers** section for SW status
3. **Network** tab to monitor requests

### Safari DevTools

Note: Safari has limited Service Worker support.

1. **Develop** menu → **Service Workers** (if available)
2. **Storage** tab for cache inspection

### Common Debug Scenarios

#### Cache Not Being Used

Check these in order:

1. **Is the Service Worker registered?**
   ```javascript
   // In console
   await navigator.serviceWorker.ready
   // Should return ServiceWorkerRegistration
   ```

2. **Is the video actually cached?**
   ```javascript
   // In console
   const cache = await caches.open('haven-video-cache-v1')
   const keys = await cache.keys()
   console.log('Cached videos:', keys.map(k => k.url))
   ```

3. **Are requests being intercepted?**
   ```javascript
   // Add logging to Service Worker (temporarily)
   // In public/haven-sw.js
   self.addEventListener('fetch', (event) => {
     console.log('[SW] Intercepting:', event.request.url)
     // ... rest of handler
   })
   ```

#### Video Plays But Shows "Not Cached"

This could mean:
- Cache check is happening before cache write completes
- Race condition in `useVideoCache`
- Check the `isCached` flag is being set after `putVideo` completes

#### High Memory Usage

Check if OPFS is being used:

```javascript
// In console
import('@/lib/opfs').then(({ isOpfsAvailable }) => {
  console.log('OPFS available:', isOpfsAvailable())
})
```

If OPFS is not available, large videos will be buffered in memory.

## How to Test Cache Behavior Locally

### Manual Testing

#### Test 1: Cache Hit Performance

1. Load a video (this will cache it)
2. Wait for "Ready" state
3. Refresh the page
4. Play the same video again
5. **Expected**: Should show "Cached" badge and play instantly (<100ms)

#### Test 2: Cache Miss Flow

1. Clear cache: DevTools → Application → Cache Storage → Delete `haven-video-cache-v1`
2. Unregister SW: DevTools → Application → Service Workers → Unregister
3. Refresh and play a video
4. **Expected**: Should go through all loading stages (fetching → authenticating → decrypting → caching)

#### Test 3: Storage Pressure

1. Cache several large videos
2. Monitor storage: DevTools → Application → Storage
3. Fill up storage until quota exceeded
4. Try caching another video
5. **Expected**: Oldest videos should be evicted automatically

### Automated Testing

Create a test page for cache validation:

```tsx
// app/test/cache-test/page.tsx
'use client'

import { useState } from 'react'
import { putVideo, hasVideo, deleteVideo, listCachedVideos } from '@/lib/video-cache'
import { runCleanupSweep } from '@/lib/cache-expiration'

export default function CacheTestPage() {
  const [results, setResults] = useState<string[]>([])
  
  const log = (msg: string) => setResults(prev => [...prev, msg])
  
  const testCacheWrite = async () => {
    log('Testing cache write...')
    const data = new Blob(['test video data'], { type: 'video/mp4' })
    await putVideo('test-video-1', data, 'video/mp4')
    log('✓ Cache write successful')
  }
  
  const testCacheRead = async () => {
    log('Testing cache read...')
    const has = await hasVideo('test-video-1')
    log(has ? '✓ Video found in cache' : '✗ Video not found')
  }
  
  const testCacheList = async () => {
    log('Listing cached videos...')
    const videos = await listCachedVideos()
    log(`Found ${videos.length} videos: ${videos.map(v => v.videoId).join(', ')}`)
  }
  
  const testCacheDelete = async () => {
    log('Testing cache delete...')
    const deleted = await deleteVideo('test-video-1')
    log(deleted ? '✓ Video deleted' : '✗ Video not found')
  }
  
  const testCleanup = async () => {
    log('Running cleanup sweep...')
    const removed = await runCleanupSweep()
    log(`✓ Cleanup removed ${removed} videos`)
  }
  
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Cache Test Page</h1>
      
      <div className="space-x-2 mb-4">
        <button onClick={testCacheWrite} className="px-4 py-2 bg-blue-500 text-white rounded">
          Test Write
        </button>
        <button onClick={testCacheRead} className="px-4 py-2 bg-green-500 text-white rounded">
          Test Read
        </button>
        <button onClick={testCacheList} className="px-4 py-2 bg-purple-500 text-white rounded">
          List Videos
        </button>
        <button onClick={testCacheDelete} className="px-4 py-2 bg-red-500 text-white rounded">
          Test Delete
        </button>
        <button onClick={testCleanup} className="px-4 py-2 bg-orange-500 text-white rounded">
          Run Cleanup
        </button>
      </div>
      
      <div className="bg-gray-900 p-4 rounded font-mono text-sm">
        {results.map((r, i) => (
          <div key={i}>{r}</div>
        ))}
      </div>
    </div>
  )
}
```

### Performance Benchmarks

Run the built-in benchmarks:

```javascript
// In browser console (dev mode)
await havenBenchmarks.run()

// Or specific benchmarks
await havenBenchmarks.cacheOps()
await havenBenchmarks.memory()
await havenBenchmarks.latency()
```

### Unit Tests

Run the cache test suite:

```bash
npm test -- src/lib/__tests__/video-cache.test.ts
npm test -- src/lib/__tests__/cache-expiration.test.ts
npm test -- src/lib/__tests__/opfs.test.ts
```

## How to Disable Caching for Development

### Option 1: Disable in Code

Add a feature flag:

```typescript
// src/lib/video-cache.ts

const CACHE_ENABLED = process.env.NEXT_PUBLIC_ENABLE_VIDEO_CACHE !== 'false'

export async function putVideo(...) {
  if (!CACHE_ENABLED) {
    console.log('[VideoCache] Caching disabled, skipping put')
    return
  }
  // ... rest of function
}

export async function hasVideo(...) {
  if (!CACHE_ENABLED) {
    return false
  }
  // ... rest of function
}
```

Then set the env variable:

```bash
# .env.local
NEXT_PUBLIC_ENABLE_VIDEO_CACHE=false
```

### Option 2: Use CapabilitiesProvider

Override capabilities to disable cache:

```tsx
// In development, force disable
function DevCapabilitiesProvider({ children }) {
  const value = useMemo(() => ({
    capabilities: {
      ...detectCapabilities(),
      canUseVideoCache: false,
    },
    cacheConfig: {
      enabled: false,
      disabledReasons: ['Disabled in development'],
      // ... other config
    }
  }), [])
  
  return (
    <CapabilitiesContext.Provider value={value}>
      {children}
    </CapabilitiesContext.Provider>
  )
}
```

### Option 3: DevTools Bypass

Add a bypass in `useVideoCache`:

```typescript
// src/hooks/useVideoCache.ts

const BYPASS_CACHE = process.env.NODE_ENV === 'development' && 
  localStorage.getItem('bypass-cache') === 'true'

export function useVideoCache(video: Video | null) {
  // ...
  
  const cached = BYPASS_CACHE ? false : await hasVideo(videoToLoad.id)
  
  // ...
}
```

Toggle in console:

```javascript
localStorage.setItem('bypass-cache', 'true')  // Disable
localStorage.removeItem('bypass-cache')        // Enable
```

### Option 4: Service Worker Bypass

Unregister the Service Worker in development:

```typescript
// src/components/providers/ServiceWorkerProvider.tsx

useEffect(() => {
  if (process.env.NODE_ENV === 'development' && 
      localStorage.getItem('disable-sw') === 'true') {
    console.log('[SW] Service Worker disabled in development')
    return
  }
  
  // ... normal registration
}, [])
```

### Option 5: Clear Cache on Every Reload

Add to your app initialization:

```typescript
// src/app/layout.tsx or similar

if (process.env.NODE_ENV === 'development') {
  // Clear cache on every reload in development
  import('@/lib/video-cache').then(({ clearAllVideos }) => {
    clearAllVideos()
  })
}
```

### Recommended Development Setup

```typescript
// src/lib/dev-config.ts

export const DEV_CONFIG = {
  // Disable caching entirely
  DISABLE_CACHE: false,
  
  // Clear cache on every reload
  CLEAR_ON_RELOAD: true,
  
  // Short TTL for testing expiration
  DEBUG_TTL: 60 * 1000, // 1 minute
  
  // Log all cache operations
  VERBOSE_LOGGING: true,
  
  // Skip Service Worker (serve directly)
  BYPASS_SW: false,
}

if (process.env.NODE_ENV === 'development') {
  if (DEV_CONFIG.CLEAR_ON_RELOAD) {
    import('./video-cache').then(({ clearAllVideos }) => {
      clearAllVideos().then(() => console.log('[Dev] Cache cleared'))
    })
  }
}
```
