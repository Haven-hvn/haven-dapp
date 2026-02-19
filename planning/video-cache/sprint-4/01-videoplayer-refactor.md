# Task 4.1: VideoPlayer Component Refactor

## Objective

Refactor `VideoPlayer.tsx` to use the new `useVideoCache` hook as its primary video loading mechanism, replacing the current direct Synapse fetch + `useVideoDecryption` flow. The refactored component should be simpler, with all caching logic delegated to the hook.

## Background

> **Note:** Content retrieval now uses the **Synapse SDK** (`@filoz/synapse-sdk`) instead of direct IPFS HTTP gateway URLs. The `ipfsService.ts` module wraps Synapse SDK calls, so all references to "IPFS fetch" in the codebase actually go through Synapse. Non-encrypted videos are fetched via Synapse and served as blob URLs (no direct gateway URL construction).

### Current VideoPlayer Flow

```typescript
// Current: VideoPlayer.tsx manages the entire pipeline
const decryption = useVideoDecryption()

const loadVideo = async (video: Video) => {
  if (!video.isEncrypted) {
    // Fetches via Synapse SDK (through ipfsService), creates blob URL
    const data = await ipfsFetch.fetch(cid)
    const blob = new Blob([data as BlobPart], { type: 'video/mp4' })
    setVideoUrl(URL.createObjectURL(blob))
  } else {
    const encryptedData = await ipfsFetch.fetch(cid)
    const decryptedUrl = await decryption.decrypt(video, encryptedData)
    setVideoUrl(decryptedUrl)
  }
}
```

### New VideoPlayer Flow

```typescript
// New: VideoPlayer.tsx delegates to useVideoCache
const { videoUrl, isCached, isLoading, loadingStage, progress, error, retry } = useVideoCache(video)

// That's it. The hook handles:
// - Cache check
// - Synapse fetch (if needed)
// - Lit auth (if needed)
// - AES decrypt (if needed)
// - Cache write (if needed)
// - URL generation
```

## Requirements

### Simplified VideoPlayer

1. Replace Synapse fetch + `useVideoDecryption` with `useVideoCache`
2. Remove manual blob URL management (handled by hook)
3. Remove manual Synapse fetch and blob URL construction for non-encrypted (handled by hook)
4. Keep all UI rendering logic (header, controls, info panel)
5. Update progress/loading UI to use new `loadingStage` states
6. Add cache status indicator (Task 4.2)

### Updated Loading States

Map the new `loadingStage` values to user-friendly UI:

| `loadingStage` | UI Display |
|----------------|------------|
| `checking-cache` | "Checking cache..." (brief, often invisible) |
| `fetching` | "Downloading encrypted video..." with progress bar |
| `authenticating` | "Authenticating with wallet..." |
| `decrypting` | "Decrypting video..." with progress bar |
| `caching` | "Saving for offline..." (brief) |
| `ready` | Video player visible |
| `error` | Error overlay with retry button |

### Requirements

The refactored component must:
- Handle non-encrypted videos correctly
- Handle encrypted videos with clear error messages
- Support the same props interface

## Implementation Details

### Refactored VideoPlayer

```typescript
// src/components/player/VideoPlayer.tsx (refactored)
'use client'

import { useVideo } from '@/hooks/useVideos'
import { useVideoCache } from '@/hooks/useVideoCache'
import { VideoPlayerControls } from './VideoPlayerControls'
import { CacheAwareProgress } from './CacheAwareProgress'
import { CacheIndicator } from './CacheIndicator'
import { ErrorOverlay } from './ErrorOverlay'
import { ArrowLeft, Loader2, Lock } from 'lucide-react'
import Link from 'next/link'

interface VideoPlayerProps {
  videoId: string
}

export function VideoPlayer({ videoId }: VideoPlayerProps) {
  const { video, isLoading: isVideoLoading, isFound } = useVideo(videoId)
  
  // Single hook replaces Synapse fetch + useVideoDecryption + manual URL management
  const {
    videoUrl,
    isCached,
    isLoading,
    loadingStage,
    progress,
    error,
    retry,
    evict,
  } = useVideoCache(video ?? null)
  
  // Loading state
  if (isVideoLoading) {
    return <PlayerLoadingState />
  }
  
  // Not found
  if (!isFound || !video) {
    return <VideoNotFoundState />
  }
  
  return (
    <div className="flex flex-col h-screen bg-black">
      {/* Header */}
      <div className="flex items-center justify-between p-3 sm:p-4 border-b border-white/10 safe-area-x">
        <Link 
          href="/library"
          className="flex items-center gap-2 text-white/80 hover:text-white transition-colors touch-manipulation min-h-[44px]"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="hidden sm:inline">Back to Library</span>
          <span className="sm:hidden">Back</span>
        </Link>
        
        <div className="flex items-center gap-2">
          {/* Cache status indicator */}
          {video.isEncrypted && (
            <CacheIndicator isCached={isCached} videoId={video.id} onEvict={evict} />
          )}
          
          {video.isEncrypted && (
            <div className="flex items-center gap-1 px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm">
              <Lock className="w-4 h-4" />
              <span>Encrypted</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Video container */}
      <div className="flex-1 relative flex items-center justify-center">
        {/* Error overlay */}
        {error && (
          <ErrorOverlay 
            error={error.message} 
            onRetry={retry}
            isEncrypted={video.isEncrypted}
          />
        )}
        
        {/* Loading/decryption progress */}
        {isLoading && !error && (
          <CacheAwareProgress 
            stage={loadingStage}
            progress={progress}
            isCached={isCached}
          />
        )}
        
        {/* Video element */}
        {videoUrl && !error && !isLoading && (
          <VideoPlayerControls 
            src={videoUrl}
            title={video.title}
            poster={video.thumbnailUrl}
          />
        )}
        
        {/* Initial loading for non-encrypted */}
        {!videoUrl && !error && !isLoading && !video.isEncrypted && (
          <div className="flex items-center gap-3 text-white/60">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Loading video...</span>
          </div>
        )}
      </div>
      
      {/* Video info */}
      <div className="p-3 sm:p-4 border-t border-white/10 safe-area-x safe-area-bottom overflow-y-auto">
        <h1 className="text-base sm:text-lg font-semibold text-white">{video.title}</h1>
        {video.description && (
          <p className="text-white/60 mt-1 text-sm">{video.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 text-xs sm:text-sm text-white/40">
          <span>{formatDuration(video.duration)}</span>
          <span className="hidden sm:inline">•</span>
          <span>{new Date(video.createdAt).toLocaleDateString()}</span>
          {video.creatorHandle && (
            <>
              <span className="hidden sm:inline">•</span>
              <span>@{video.creatorHandle}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

### What's Removed

- Direct Synapse/IPFS fetch imports and usage (now handled by `useVideoCache`)
- `useVideoDecryption` import and usage
- `useState` for `videoUrl` and `error`
- pdVideo()` function with manual pipeline orchestration
- `useEffect` for video loading with manual cleanup
- `URL.revokeObjectURL` calls (handled by hook)
- Manual blob URL construction for non-encrypted videos (handled by hook)
- Manual CID resolution logic

### What's Added

- `useVideoCache` hook (single import)
- `CacheIndicator` component (Task 4.2)
- `CacheAwareProgress` component (replaces `DecryptionProgress`)
- `evict` callback for cache management

## Arkiv Cache Integration

> **Cross-reference:** [Arkiv Cache](../../arkiv-cache/) — IndexedDB metadata persistence for video entities.

The refactored VideoPlayer benefits from both cache systems working together:

### Expired Entity Support

When a user navigates to a video whose Arkiv entity has expired, the `Video` object comes from the arkiv-cache (IndexedDB). The VideoPlayer should handle this gracefully:

```tsx
// The video object may have arkivEntityStatus from the cache
// Show the expired entity banner from arkiv-cache sprint 4
{video.arkivEntityStatus === 'expired' && (
  <ExpiredEntityBanner 
    videoCacheStatus={isCached ? 'cached' : 'not-cached'}
  />
)}
```

If the video content is already in the video cache → **instant playback** even for expired entities. If not, the hook attempts fetch + decrypt as normal.

### Unified Cache Status Display

The `CacheIndicator` component (Task 4.2) should use the shared `CacheStatusBadge` from [arkiv-cache sprint 4](../../arkiv-cache/sprint-4/01-expired-video-ui-indicators.md) rather than creating a separate component:

```tsx
<CacheStatusBadge 
  arkivStatus={video.arkivEntityStatus ?? 'active'}
  videoCacheStatus={isCached ? 'cached' : 'not-cached'}
  size="md"
  showLabel={true}
/>
```

This ensures a consistent visual language across the library and player views.

### Video Object Source Transparency

The VideoPlayer doesn't need to know whether the `Video` object came from a live Arkiv fetch or from the arkiv-cache. The `useVideo(videoId)` hook (which calls `fetchVideoByIdWithCache`) handles this transparently. The refactored VideoPlayer just passes the `Video` to `useVideoCache` and everything works.

## Acceptance Criteria

- [ ] VideoPlayer uses `useVideoCache` as sole video loading mechanism
- [ ] No direct usage of Synapse fetch or `useVideoDecryption` in VideoPlayer
- [ ] Non-encrypted videos play identically to before
- [ ] Encrypted videos play with cache-first strategy
- [ ] Cached videos play instantly (no loading UI)
- [ ] Loading stages are displayed with appropriate UI
- [ ] Error handling works with retry functionality
- [ ] Cache indicator uses shared `CacheStatusBadge` from arkiv-cache
- [ ] Expired entity banner shown for videos from arkiv-cache
- [ ] Component is simpler (fewer state variables, fewer hooks)
- [ ] No memory leaks (blob URLs properly managed by hook)
- [ ] Works correctly with expired Arkiv entities (metadata from arkiv-cache)

## Dependencies

- Task 1.3 (`useVideoCache` Hook)
- Task 4.2 (Cache Indicator Component)
- [Arkiv Cache Sprint 4](../../arkiv-cache/sprint-4/01-expired-video-ui-indicators.md) — provides shared `CacheStatusBadge` component

## Estimated Effort

Medium (4-6 hours)
