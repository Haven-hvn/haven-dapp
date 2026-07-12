/**
 * React Hook for Video Prefetching
 *
 * Provides a React interface to the video prefetch service. This hook allows
 * components to queue videos for background caching, cancel pending prefetches,
 * and monitor prefetch status.
 *
 * Features:
 * - Queue videos for prefetching
 * - Cancel pending prefetches
 * - Monitor prefetch status and queue state
 * - Respect connection and battery conditions
 *
 * @module hooks/usePrefetch
 * @see ../lib/video-prefetch - Core prefetch service
 *
 * @example
 * ```tsx
 * function VideoGrid({ videos }: { videos: Video[] }) {
 *   const { prefetch, cancel, isEnabled, activeCount, queuedCount } = usePrefetch()
 *
 *   return (
 *     <div>
 *       {videos.map(video => (
 *         <VideoCard
 *           key={video.id}
 *           video={video}
 *           onMouseEnter={() => prefetch(video)}
 *           onMouseLeave={() => cancel(video.id)}
 *         />
 *       ))}
 *       <PrefetchStatus active={activeCount} queued={queuedCount} />
 *     </div>
 *   )
 * }
 * ```
 */

'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { useAccount } from 'wagmi'
import {
  prefetchVideo,
  cancelPrefetch,
  getPrefetchQueue,
  setPrefetchEnabled,
  isPrefetchEnabled,
  setPrefetchWalletAddress,
  clearCompletedPrefetches,
  prefetchNextVideos,
  type PrefetchQueueStatus,
} from '@/lib/video-prefetch'
import type { Video } from '@/types'

// ============================================================================
// Types
// ============================================================================

/**
 * Return type for the usePrefetch hook.
 */
export interface UsePrefetchReturn {
  /** Queue a video for prefetching */
  prefetch: (video: Video, priority?: number) => Promise<boolean>

  /** Cancel a pending prefetch */
  cancel: (videoId: string) => boolean

  /** Cancel all pending prefetches */
  cancelAll: () => number

  /** Prefetch multiple videos */
  prefetchMultiple: (videos: Video[]) => Promise<number>

  /** Prefetch next videos in a playlist */
  prefetchNext: (currentVideoId: string, allVideos: Video[], count?: number) => Promise<number>

  /** Whether prefetching is enabled globally */
  isEnabled: boolean

  /** Enable/disable prefetching */
  setEnabled: (enabled: boolean) => void

  /** Number of videos currently being prefetched */
  activeCount: number

  /** Number of videos queued for prefetch */
  queuedCount: number

  /** Number of completed prefetches */
  completedCount: number

  /** Number of failed prefetches */
  failedCount: number

  /** Full queue status */
  queueStatus: PrefetchQueueStatus

  /** Clear completed items from the queue */
  clearCompleted: () => number
}

/**
 * Options for the usePrefetch hook.
 */
export interface UsePrefetchOptions {
  /**
   * Whether to enable prefetching by default.
   * Default: true
   */
  enabled?: boolean

  /**
   * Poll interval for queue status updates in milliseconds.
   * Set to 0 to disable polling.
   * Default: 1000
   */
  pollInterval?: number
}

// ============================================================================
// Hook
// ============================================================================

/**
 * React hook for video prefetching.
 *
 * Provides an interface to queue videos for background caching with
 * automatic session management and queue status monitoring.
 *
 * @param options - Hook options
 * @returns UsePrefetchReturn object with prefetch controls and status
 *
 * @example
 * ```tsx
 * // Basic usage - prefetch on hover
 * function VideoCard({ video }: { video: Video }) {
 *   const { prefetch, cancel } = usePrefetch()
 *
 *   return (
 *     <div
 *       onMouseEnter={() => prefetch(video)}
 *       onMouseLeave={() => cancel(video.id)}
 *     >
 *       <Thumbnail src={video.thumbnailUrl} />
 *       <Title>{video.title}</Title>
 *     </div>
 *   )
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Sequential prefetching for playlist
 * function PlaylistPlayer({ videos }: { videos: Video[] }) {
 *   const { prefetchNext } = usePrefetch()
 *   const [currentVideoId, setCurrentVideoId] = useState(videos[0]?.id)
 *
 *   useEffect(() => {
 *     if (currentVideoId) {
 *       prefetchNext(currentVideoId, videos, 2) // Prefetch next 2 videos
 *     }
 *   }, [currentVideoId, videos, prefetchNext])
 *
 *   return <VideoPlayer videos={videos} onVideoChange={setCurrentVideoId} />
 * }
 * ```
 */
export function usePrefetch(options: UsePrefetchOptions = {}): UsePrefetchReturn {
  const { enabled: initialEnabled = true, pollInterval = 1000 } = options

  // Get wallet state for session management
  const { address, isConnected } = useAccount()

  // Local state for UI updates
  const [isEnabled, setIsEnabled] = useState(initialEnabled)
  const [queueStatus, setQueueStatus] = useState<PrefetchQueueStatus>({
    queued: [],
    inProgress: [],
    completed: [],
    failed: [],
    total: 0,
    isEnabled: initialEnabled,
    isProcessing: false,
  })

  // Refs for cleanup
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isMountedRef = useRef(true)

  // Initialize enabled state
  useEffect(() => {
    setPrefetchEnabled(initialEnabled)
    setIsEnabled(initialEnabled)
  }, [initialEnabled])

  // Update wallet address in prefetch service when it changes
  useEffect(() => {
    if (isConnected && address) {
      setPrefetchWalletAddress(address)
    } else {
      setPrefetchWalletAddress(null)
    }
  }, [address, isConnected])

  // Poll for queue status updates
  useEffect(() => {
    // Initial status check
    setQueueStatus(getPrefetchQueue())

    if (pollInterval > 0) {
      pollIntervalRef.current = setInterval(() => {
        if (isMountedRef.current) {
          setQueueStatus(getPrefetchQueue())
        }
      }, pollInterval)
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [pollInterval])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  /**
   * Queue a video for prefetching.
   */
  const prefetch = useCallback(async (video: Video, priority?: number): Promise<boolean> => {
    if (!isEnabled) return false
    return prefetchVideo(video, priority)
  }, [isEnabled])

  /**
   * Cancel a pending prefetch.
   */
  const cancel = useCallback((videoId: string): boolean => {
    return cancelPrefetch(videoId)
  }, [])

  /**
   * Cancel all pending prefetches.
   */
  const cancelAll = useCallback((): number => {
    const { queued } = getPrefetchQueue()
    let cancelled = 0
    for (const item of queued) {
      if (cancelPrefetch(item.video.id)) {
        cancelled++
      }
    }
    return cancelled
  }, [])

  /**
   * Prefetch multiple videos.
   */
  const prefetchMultiple = useCallback(async (videos: Video[]): Promise<number> => {
    if (!isEnabled) return 0

    let queued = 0
    for (const video of videos) {
      const wasQueued = await prefetchVideo(video)
      if (wasQueued) queued++
    }
    return queued
  }, [isEnabled])

  /**
   * Prefetch next videos in a playlist.
   */
  const prefetchNext = useCallback(
    async (currentVideoId: string, allVideos: Video[], count?: number): Promise<number> => {
      if (!isEnabled) return 0
      return prefetchNextVideos(currentVideoId, allVideos, count)
    },
    [isEnabled]
  )

  /**
   * Enable/disable prefetching.
   */
  const setEnabled = useCallback((enabled: boolean): void => {
    setPrefetchEnabled(enabled)
    setIsEnabled(enabled)
    if (isMountedRef.current) {
      setQueueStatus(getPrefetchQueue())
    }
  }, [])

  /**
   * Clear completed items from the queue.
   */
  const clearCompleted = useCallback((): number => {
    return clearCompletedPrefetches()
  }, [])

  return {
    prefetch,
    cancel,
    cancelAll,
    prefetchMultiple,
    prefetchNext,
    isEnabled,
    setEnabled,
    activeCount: queueStatus.inProgress.length,
    queuedCount: queueStatus.queued.length,
    completedCount: queueStatus.completed.length,
    failedCount: queueStatus.failed.length,
    queueStatus,
    clearCompleted,
  }
}

/**
 * React hook for prefetching with automatic queue status polling.
 *
 * Similar to usePrefetch but automatically updates queue status
 * at a configurable interval.
 *
 * @param pollIntervalMs - Polling interval in milliseconds (default: 1000)
 * @returns UsePrefetchReturn object
 *
 * @example
 * ```tsx
 * function PrefetchMonitor() {
 *   const { activeCount, queuedCount, isEnabled } = usePrefetchPolling(500)
 *
 *   return (
 *     <Badge>
 *       {activeCount > 0 ? `Prefetching ${activeCount}` : 'Idle'}
 *       {queuedCount > 0 && ` (${queuedCount} queued)`}
 *     </Badge>
 *   )
 * }
 * ```
 */
export function usePrefetchPolling(pollIntervalMs: number = 1000): UsePrefetchReturn {
  return usePrefetch({ pollInterval: pollIntervalMs })
}

/**
 * React hook for prefetch status of a specific video.
 *
 * @param videoId - The video ID to monitor
 * @returns Prefetch status for the video or null if not in queue
 *
 * @example
 * ```tsx
 * function VideoCard({ video }: { video: Video }) {
 *   const prefetchStatus = useVideoPrefetchStatus(video.id)
 *
 *   return (
 *     <div>
 *       {prefetchStatus?.status === 'fetching' && <Spinner />}
 *       {prefetchStatus?.status === 'complete' && <CachedIcon />}
 *     </div>
 *   )
 * }
 * ```
 */
export function useVideoPrefetchStatus(videoId: string | null | undefined) {
  const [status, setStatus] = useState<ReturnType<typeof getPrefetchQueue>['queued'][0] | null>(null)

  useEffect(() => {
    if (!videoId) {
      setStatus(null)
      return
    }

    const updateStatus = () => {
      const queue = getPrefetchQueue()
      const item =
        queue.queued.find(i => i.video.id === videoId) ||
        queue.inProgress.find(i => i.video.id === videoId) ||
        queue.completed.find(i => i.video.id === videoId) ||
        queue.failed.find(i => i.video.id === videoId) ||
        null
      setStatus(item || null)
    }

    updateStatus()

    const interval = setInterval(updateStatus, 500)
    return () => clearInterval(interval)
  }, [videoId])

  return status
}
