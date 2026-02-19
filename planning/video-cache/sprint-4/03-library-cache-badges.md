# Task 4.3: Library View Cache Status Badges

## Objective

Add cache status indicators to the video library/grid view so users can see at a glance which videos are cached (instant playback) and which will require decryption on first play.

## Background

The library view shows a grid of video cards. Currently, encrypted videos show a lock icon but there's no indication of whether the video is cached. Adding a small cache badge helps users:

1. Know which videos will play instantly
2. Understand the value of the caching system
3. Make informed decisions about which videos to watch (e.g., on slow connections)

## Requirements

### Cache Status Hook (`src/hooks/useCacheStatus.ts`)

A lightweight hook that checks cache status for multiple videos without reading their content:

```typescript
interface UseCacheStatusReturn {
  /** Map of videoId → isCached */
  cacheStatus: Map<string, boolean>
  
  /** Whether the cache check is still loading */
  isLoading: boolean
  
  /** Refresh cache status for all videos */
  refresh: () => void
  
  /** Total number of cached videos */
  cachedCount: number
  
  /** Total cache size (approximate) */
  totalCacheSize: number
}

function useCacheStatus(videoIds: string[]): UseCacheStatusReturn
```

### Video Card Badge

Add a small badge to the existing video card component:

- **Cached**: Small green cloud icon in the corner of the thumbnail
- **Not cached + encrypted**: Small gray lock icon (existing behavior)
- **Not encrypted**: No badge needed

### Library Header Stats

Optional: Show aggregate cache stats in the library header:
- "12 of 45 videos cached"
- "Using 2.3 GB of cache storage"

## Implementation Details

### Cache Status Hook

```typescript
// src/hooks/useCacheStatus.ts
'use client'

import { useState, useEffect, useCallback } from 'react'
import { hasVideo, listCachedVideos, getCacheStorageEstimate } from '@/lib/video-cache'

export function useCacheStatus(videoIds: string[]): UseCacheStatusReturn {
  const [cacheStatus, setCacheStatus] = useState<Map<string, boolean>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [totalCacheSize, setTotalCacheSize] = useState(0)
  
  const refresh = useCallback(async () => {
    setIsLoading(true)
    
    try {
      // Check all video IDs in parallel
      const results = await Promise.all(
        videoIds.map(async (id) => {
          const cached = await hasVideo(id).catch(() => false)
          return [id, cached] as [string, boolean]
        })
      )
      
      setCacheStatus(new Map(results))
      
      // Get total cache size
      const estimate = await getCacheStorageEstimate()
      setTotalCacheSize(estimate.usage)
    } catch (err) {
      console.warn('[useCacheStatus] Failed to check cache status:', err)
    } finally {
      setIsLoading(false)
    }
  }, [videoIds])
  
  useEffect(() => {
    if (videoIds.length > 0) {
      refresh()
    }
  }, [videoIds.join(',')]) // Re-check when video list changes
  
  const cachedCount = Array.from(cacheStatus.values()).filter(Boolean).length
  
  return {
    cacheStatus,
    isLoading,
    refresh,
    cachedCount,
    totalCacheSize,
  }
}
```

### Video Card Integration

```typescript
// In the video card component (wherever it's defined)
import { Cloud } from 'lucide-react'

interface VideoCardProps {
  video: Video
  isCached?: boolean
  // ... existing props
}

function VideoCard({ video, isCached, ...props }: VideoCardProps) {
  return (
    <div className="relative group">
      {/* Thumbnail */}
      <div className="relative aspect-video rounded-lg overflow-hidden">
        <img src={video.thumbnailUrl} alt={video.title} className="..." />
        
        {/* Cache badge overlay */}
        {video.isEncrypted && isCached && (
          <div 
            className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 bg-green-500/80 text-white rounded text-xs"
            title="Cached — instant playback"
          >
            <Cloud className="w-3 h-3" />
          </div>
        )}
        
        {/* Duration overlay */}
        <div className="absolute bottom-2 right-2 ...">
          {formatDuration(video.duration)}
        </div>
      </div>
      
      {/* Title, etc. */}
    </div>
  )
}
```

### Library View Integration

```typescript
// In the library page/component
import { useCacheStatus } from '@/hooks/useCacheStatus'

function LibraryView({ videos }: { videos: Video[] }) {
  const videoIds = videos.filter(v => v.isEncrypted).map(v => v.id)
  const { cacheStatus, cachedCount, totalCacheSize } = useCacheStatus(videoIds)
  
  return (
    <div>
      {/* Optional: Cache stats header */}
      {cachedCount > 0 && (
        <div className="text-sm text-white/40 mb-4">
          {cachedCount} video{cachedCount !== 1 ? 's' : ''} cached for instant playback
          {totalCacheSize > 0 && ` • ${formatBytes(totalCacheSize)}`}
        </div>
      )}
      
      {/* Video grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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

## Acceptance Criteria

- [ ] `useCacheStatus` hook checks cache status for multiple videos efficiently
- [ ] Cache status is checked in parallel (not sequentially)
- [ ] Video cards show green cloud badge for cached encrypted videos
- [ ] No badge shown for non-encrypted videos
- [ ] Badge is subtle and doesn't interfere with thumbnail visibility
- [ ] `refresh()` function allows re-checking cache status
- [ ] `cachedCount` and `totalCacheSize` are accurate
- [ ] Hook handles errors gracefully (returns false for failed checks)
- [ ] Performance: cache checks complete quickly for 50+ videos
- [ ] Badge is responsive and works on mobile grid layouts

## Dependencies

- Task 1.2 (Cache API Wrapper — `hasVideo`, `getCacheStorageEstimate`)

## Estimated Effort

Small-Medium (3-4 hours)