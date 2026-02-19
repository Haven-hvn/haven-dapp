# Task 4.4: Video Preloading & Prefetch Strategy

## Objective

Implement intelligent prefetching that proactively caches videos the user is likely to watch next, further reducing perceived latency. When a user is browsing the library, begin caching videos in the background before they click play.

## Background

Even with the cache-first architecture, the first play of an encrypted video still requires the full fetch → decrypt pipeline (5-30+ seconds). Prefetching can eliminate this wait by caching videos before the user requests them.

### Prefetch Triggers

1. **Hover prefetch**: When a user hovers over a video card for >1 second, begin caching it
2. **Viewport prefetch**: When video cards scroll into view, queue them for background caching
3. **Sequential prefetch**: When watching a video, prefetch the next video in the list
4. **Manual prefetch**: User can explicitly request "Cache for later" on a video

### Constraints

- Prefetching requires wallet authentication (Lit Protocol)
- We should NOT trigger wallet popups for prefetch — only prefetch if session is already cached
- Prefetch should be low-priority and cancellable
- Prefetch should respect storage quotas and battery status

## Requirements

### Prefetch Service (`src/lib/video-prefetch.ts`)

1. **`prefetchVideo(video)`** — Queue a video for background caching
   - Check if already cached (skip if so)
   - Check if Lit session is cached (skip if not — don't trigger wallet popup)
   - Check storage quota (skip if near limit)
   - Add to prefetch queue
   - Process queue with low priority

2. **`cancelPrefetch(videoId)`** — Cancel a pending prefetch
   - Remove from queue
   - Abort in-progress fetch/decrypt

3. **`getPrefetchQueue()`** — Get current prefetch queue status
   - Return list of queued/in-progress/completed prefetches

4. **`setPrefetchEnabled(enabled)`** — Enable/disable prefetching globally
   - Respect user preference
   - Disable on metered connections by default

### Prefetch Hook (`src/hooks/usePrefetch.ts`)

```typescript
interface UsePrefetchReturn {
  /** Queue a video for prefetching */
  prefetch: (video: Video) => void
  
  /** Cancel a pending prefetch */
  cancel: (videoId: string) => void
  
  /** Whether prefetching is enabled */
  isEnabled: boolean
  
  /** Number of videos currently being prefetched */
  activeCount: number
  
  /** Number of videos queued for prefetch */
  queuedCount: number
}

function usePrefetch(): UsePrefetchReturn
```

### Hover Prefetch Hook

```typescript
// For use on video cards
function useHoverPrefetch(video: Video, delay: number = 1000) {
  // Returns onMouseEnter/onMouseLeave handlers
  // Triggers prefetch after hovering for `delay` ms
}
```

## Implementation Details

### Prefetch Queue

```typescript
// src/lib/video-prefetch.ts

import { hasVideo, putVideo, getCacheStorageEstimate } from './video-cache'
import { getCachedAuthContext } from './lit-session-cache'
import { getCachedKey } from './aes-key-cache'
import type { Video } from '@/types'

interface PrefetchItem {
  video: Video
  priority: number // Lower = higher priority
  status: 'queued' | 'fetching' | 'decrypting' | 'complete' | 'failed' | 'cancelled'
  abortController: AbortController
  addedAt: number
}

const prefetchQueue: Map<string, PrefetchItem> = new Map()
let isProcessing = false
let isEnabled = true

const MAX_CONCURRENT = 1 // Only prefetch one at a time
const MAX_QUEUE_SIZE = 5
const STORAGE_THRESHOLD = 0.7 // Don't prefetch if storage > 70%

export function setPrefetchEnabled(enabled: boolean): void {
  isEnabled = enabled
  if (!enabled) {
    // Cancel all pending prefetches
    for (const [id, item] of prefetchQueue) {
      if (item.status === 'queued' || item.status === 'fetching') {
        item.abortController.abort()
        item.status = 'cancelled'
      }
    }
  }
}

export async function prefetchVideo(video: Video): Promise<void> {
  if (!isEnabled) return
  if (!video.isEncrypted) return // Non-encrypted don't need prefetch
  if (prefetchQueue.has(video.id)) return // Already queued
  if (prefetchQueue.size >= MAX_QUEUE_SIZE) return // Queue full
  
  // Check if already cached
  const cached = await hasVideo(video.id).catch(() => false)
  if (cached) return
  
  // Check if we have a Lit session (don't trigger wallet popup)
  // This is checked at process time, not queue time
  
  // Check storage
  const estimate = await getCacheStorageEstimate()
  if (estimate.percent > STORAGE_THRESHOLD * 100) return
  
  // Add to queue
  prefetchQueue.set(video.id, {
    video,
    priority: Date.now(), // FIFO by default
    status: 'queued',
    abortController: new AbortController(),
    addedAt: Date.now(),
  })
  
  // Start processing if not already
  processQueue()
}

export function cancelPrefetch(videoId: string): void {
  const item = prefetchQueue.get(videoId)
  if (item) {
    item.abortController.abort()
    item.status = 'cancelled'
    prefetchQueue.delete(videoId)
  }
}

async function processQueue(): Promise<void> {
  if (isProcessing) return
  isProcessing = true
  
  try {
    while (true) {
      // Find next queued item
      const next = Array.from(prefetchQueue.values())
        .filter(item => item.status === 'queued')
        .sort((a, b) => a.priority - b.priority)[0]
      
      if (!next) break
      
      // Check if Lit session is available (don't trigger wallet popup)
      // We need the wallet address — this would come from the app state
      // For now, skip if no cached session
      
      try {
        next.status = 'fetching'
        await executePrefetch(next)
        next.status = 'complete'
      } catch (err) {
        if (next.abortController.signal.aborted) {
          next.status = 'cancelled'
        } else {
          next.status = 'failed'
          console.warn(`[Prefetch] Failed for ${next.video.id}:`, err)
        }
      }
      
      // Clean up completed/failed items
      if (next.status !== 'queued') {
        prefetchQueue.delete(next.video.id)
      }
    }
  } finally {
    isProcessing = false
  }
}

async function executePrefetch(item: PrefetchItem): Promise<void> {
  const { video, abortController } = item
  const signal = abortController.signal
  
  // This would use the same pipeline as useVideoCache
  // but with lower priority and the abort signal
  // Implementation depends on how we expose the pipeline
  
  // Simplified: fetch → decrypt → cache
  // Full implementation would reuse the decryption pipeline
}
```

### Hover Prefetch Hook

```typescript
// src/hooks/useHoverPrefetch.ts
'use client'

import { useCallback, useRef } from 'react'
import { prefetchVideo, cancelPrefetch } from '@/lib/video-prefetch'
import type { Video } from '@/types'

export function useHoverPrefetch(video: Video | null, delay: number = 1500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  const onMouseEnter = useCallback(() => {
    if (!video?.isEncrypted) return
    
    timerRef.current = setTimeout(() => {
      prefetchVideo(video)
    }, delay)
  }, [video, delay])
  
  const onMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    
    if (video) {
      cancelPrefetch(video.id)
    }
  }, [video])
  
  return { onMouseEnter, onMouseLeave }
}
```

### Connection-Aware Prefetching

```typescript
function shouldPrefetch(): boolean {
  if (!isEnabled) return false
  
  // Check connection type
  const connection = (navigator as any).connection
  if (connection) {
    // Don't prefetch on slow or metered connections
    if (connection.saveData) return false
    if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') return false
    if (connection.type === 'cellular' && connection.downlink < 5) return false
  }
  
  // Check battery
  if ('getBattery' in navigator) {
    // Don't prefetch on low battery
    // (async check, would need to be cached)
  }
  
  return true
}
```

## Acceptance Criteria

- [ ] `prefetchVideo()` queues videos for background caching
- [ ] Prefetch does NOT trigger wallet popups (only works with cached Lit session)
- [ ] Prefetch respects storage quota limits
- [ ] Prefetch is cancellable via `cancelPrefetch()`
- [ ] `useHoverPrefetch` triggers prefetch after configurable hover delay
- [ ] Hover leave cancels pending prefetch
- [ ] Prefetch queue has a maximum size limit
- [ ] Only one prefetch runs at a time (low priority)
- [ ] Prefetch is disabled on metered/slow connections
- [ ] `setPrefetchEnabled()` allows global enable/disable
- [ ] Prefetch doesn't interfere with active video playback
- [ ] Already-cached videos are skipped

## Dependencies

- Task 1.2 (Cache API Wrapper)
- Task 1.3 (`useVideoCache` — for the decryption pipeline)
- Task 3.1 (Lit Session Cache — to check if session exists without triggering popup)
- Task 3.2 (AES Key Cache — to check if key is cached)

## Estimated Effort

Large (6-8 hours)