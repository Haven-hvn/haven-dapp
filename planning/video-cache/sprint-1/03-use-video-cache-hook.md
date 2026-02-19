# Task 1.3: `useVideoCache` React Hook

## Objective

Create the primary React hook that implements the cache-first video loading strategy. This hook is the main integration point between the VideoPlayer component and the caching layer.

## Background

Currently, `VideoPlayer.tsx` calls `ipfsService.fetch` (which uses Synapse SDK under the hood) → `useVideoDecryption` → creates a blob URL. The new `useVideoCache` hook wraps this entire flow with a cache check at the beginning and a cache write at the end, providing a single unified API for the VideoPlayer.

## Requirements

### Hook API (`src/hooks/useVideoCache.ts`)

```typescript
interface UseVideoCacheReturn {
  /** URL to set as <video src> — /haven/v/{id} served by Service Worker */
  videoUrl: string | null
  
  /** Whether the video was served from cache */
  isCached: boolean
  
  /** Whether the video is currently being loaded (fetch + decrypt + cache) */
  isLoading: boolean
  
  /** Current loading stage for progress display */
  loadingStage: 'checking-cache' | 'fetching' | 'authenticating' | 'decrypting' | 'caching' | 'ready' | 'error'
  
  /** Progress percentage (0-100) */
  progress: number
  
  /** Error if loading failed */
  error: Error | null
  
  /** Retry loading */
  retry: () => void
  
  /** Evict this video from cache */
  evict: () => Promise<void>
}

function useVideoCache(video: Video | null): UseVideoCacheReturn
```

### Cache-First Flow

1. **Check cache**: Call `hasVideo(videoId)` from `video-cache.ts`
2. **Cache HIT**: 
   - Set `videoUrl` to `/haven/v/{videoId}` (Service Worker will serve it)
   - Set `isCached: true`, `loadingStage: 'ready'`
   - No Synapse fetch, no Lit auth, no decryption
3. **Cache MISS**:
   - Fetch encrypted data via Synapse SDK
   - Authenticate with Lit Protocol, decrypt AES key
   - Decrypt video with AES-GCM
   - Store decrypted bytes in Cache API via `putVideo()`
   - Set `videoUrl` to `/haven/v/{videoId}`
4. **Error handling**:
   - If any step fails, surface error with retry option

## Implementation Details

### Hook Skeleton

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useServiceWorker } from './useServiceWorker'
import { fetchFromIpfs } from '@/services/ipfsService'
import { useVideoDecryption } from './useVideoDecryption'
import { hasVideo, putVideo, deleteVideo } from '@/lib/video-cache'
import type { Video } from '@/types'

type LoadingStage = 'checking-cache' | 'fetching' | 'authenticating' | 'decrypting' | 'caching' | 'ready' | 'error'

export function useVideoCache(video: Video | null): UseVideoCacheReturn {
  const sw = useServiceWorker()
  const decryption = useVideoDecryption()
  
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [isCached, setIsCached] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('checking-cache')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  
  const loadVideo = useCallback(async (video: Video) => {
    setIsLoading(true)
    setError(null)
    
    try {
      // Non-encrypted videos: fetch via Synapse, store in cache, serve via SW
      if (!video.isEncrypted) {
        const data = await fetchFromIpfs(video.filecoinCid)
        const mimeType = 'video/mp4'
        await putVideo(video.id, new Blob([data as BlobPart], { type: mimeType }), mimeType)
        setVideoUrl(`/haven/v/${video.id}`)
        setLoadingStage('ready')
        setIsLoading(false)
        return
      }
      
      // Step 1: Check cache
      setLoadingStage('checking-cache')
      setProgress(5)
      
      const cached = await hasVideo(video.id)
      
      if (cached) {
        // Cache HIT — instant playback
        setVideoUrl(`/haven/v/${video.id}`)
        setIsCached(true)
        setLoadingStage('ready')
        setProgress(100)
        setIsLoading(false)
        return
      }
      
      // Step 2: Cache MISS — fetch encrypted data via Synapse SDK
      setLoadingStage('fetching')
      setProgress(10)
      
      const cid = video.encryptedCid || video.filecoinCid
      if (!cid) throw new Error('No CID available')
      
      const encryptedData = await fetchFromIpfs(cid)
      if (!encryptedData) throw new Error('Failed to fetch encrypted data')
      
      // Step 3: Decrypt
      setLoadingStage('authenticating')
      setProgress(30)
      
      const decryptedUrl = await decryption.decrypt(video, encryptedData)
      if (!decryptedUrl) throw new Error(decryption.error?.message || 'Decryption failed')
      
      // Step 4: Store decrypted content in Cache API
      setLoadingStage('caching')
      setProgress(90)
      
      const response = await fetch(decryptedUrl)
      const blob = await response.blob()
      const mimeType = video.litEncryptionMetadata?.originalMimeType || 'video/mp4'
      
      await putVideo(video.id, blob, mimeType)
      URL.revokeObjectURL(decryptedUrl)
      
      // Serve via Service Worker
      setVideoUrl(`/haven/v/${video.id}`)
      setIsCached(true)
      setLoadingStage('ready')
      setProgress(100)
      
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load video'))
      setLoadingStage('error')
    } finally {
      setIsLoading(false)
    }
  }, [decryption])
  
  // Load video when it changes
  useEffect(() => {
    if (video) loadVideo(video)
  }, [video?.id])
  
  const retry = useCallback(() => {
    if (video) loadVideo(video)
  }, [video, loadVideo])
  
  const evict = useCallback(async () => {
    if (video) {
      await deleteVideo(video.id)
      setIsCached(false)
    }
  }, [video])
  
  return {
    videoUrl,
    isCached,
    isLoading,
    loadingStage,
    progress,
    error,
    retry,
    evict,
  }
}
```

## Arkiv Cache Integration

> **Cross-reference:** [Arkiv Cache](../../arkiv-cache/) — IndexedDB metadata persistence for video entities.

This hook is the **primary integration point** between the video-cache and arkiv-cache systems. After each successful content cache operation, it notifies the arkiv-cache to keep metadata in sync.

### After `putVideo()` — Notify Arkiv Cache

```typescript
// After successful cache write in loadVideo():
await putVideo(video.id, blob, mimeType)

// Notify arkiv-cache that content is now cached
import { getVideoCacheService } from '@/services/cacheService'
const cacheService = getVideoCacheService(video.owner)
cacheService.updateVideoCacheStatus(video.id, 'cached', Date.now()).catch(() => {})
```

### After `evict()` — Notify Arkiv Cache

```typescript
const evict = useCallback(async () => {
  if (video) {
    await deleteVideo(video.id)
    setIsCached(false)
    
    // Notify arkiv-cache that content is no longer cached
    const cacheService = getVideoCacheService(video.owner)
    cacheService.updateVideoCacheStatus(video.id, 'not-cached').catch(() => {})
  }
}, [video])
```

### Video Object Source

The `Video` object passed to this hook may come from:
1. **Live Arkiv fetch** — entity still active on-chain
2. **Arkiv cache (IndexedDB)** — entity expired, metadata preserved by [arkiv-cache](../../arkiv-cache/)

In both cases, the hook works identically. The `video.filecoinCid` / `video.encryptedCid` fields are always available because the arkiv-cache preserved them. This is the key reason arkiv-cache must be implemented first.

### Expired Entity Handling

When the `Video` object comes from arkiv-cache with `arkivEntityStatus === 'expired'`:
- The CID is still valid (content is on Filecoin/IPFS)
- Lit Protocol auth may still work (depends on access control conditions)
- If content is already in the video cache → instant playback (no Lit auth needed)
- If content is NOT cached → attempt fetch + decrypt as normal; if Lit auth fails, show appropriate error

## Acceptance Criteria

- [ ] Hook checks Cache API before initiating Synapse fetch
- [ ] Cache HIT results in instant playback with zero network/crypto operations
- [ ] Cache MISS triggers the full fetch → decrypt pipeline, then caches the result
- [ ] Decrypted video is stored in Cache API after successful decryption
- [ ] Video is served via Service Worker at `/haven/v/{id}`
- [ ] Non-encrypted videos are also cached and served via SW
- [ ] `isCached` correctly reflects whether content was served from cache
- [ ] `loadingStage` provides granular progress for UI display
- [ ] `retry()` re-triggers the full loading flow
- [ ] `evict()` removes the video from cache
- [ ] After `putVideo()`, arkiv-cache metadata is updated to `videoCacheStatus: 'cached'`
- [ ] After `evict()`, arkiv-cache metadata is updated to `videoCacheStatus: 'not-cached'`
- [ ] Hook works correctly with expired Arkiv entities (metadata from arkiv-cache)

## Dependencies

- Task 1.1 (Service Worker Setup)
- Task 1.2 (Cache API Wrapper)
- [Arkiv Cache](../../arkiv-cache/) — must be implemented first; provides `VideoCacheService.updateVideoCacheStatus()` and ensures `Video` objects survive entity expiration

## Estimated Effort

Large (6-8 hours)
