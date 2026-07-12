/**
 * React Hook for Hover-based Video Prefetching
 *
 * Provides mouse event handlers that trigger video prefetching after a delay
 * when the user hovers over a video card. The prefetch is cancelled if the
 * user leaves before the delay expires.
 *
 * Features:
 * - Configurable hover delay (default: 1500ms)
 * - Automatic cleanup on unmount
 * - Respects prefetch enabled state
 * - Type-safe mouse event handlers
 *
 * @module hooks/useHoverPrefetch
 * @see ./usePrefetch - Core prefetch hook
 * @see ../lib/video-prefetch - Prefetch service
 *
 * @example
 * ```tsx
 * function VideoCard({ video }: { video: Video }) {
 *   const { onMouseEnter, onMouseLeave } = useHoverPrefetch(video, 1000)
 *
 *   return (
 *     <div
 *       onMouseEnter={onMouseEnter}
 *       onMouseLeave={onMouseLeave}
 *       className="video-card"
 *     >
 *       <Thumbnail src={video.thumbnailUrl} />
 *       <Title>{video.title}</Title>
 *     </div>
 *   )
 * }
 * ```
 */

'use client'

import { useCallback, useRef, useEffect } from 'react'
import { prefetchVideo, cancelPrefetch, isPrefetchEnabled } from '@/lib/video-prefetch'
import type { Video } from '@/types'

// ============================================================================
// Types
// ============================================================================

/**
 * Return type for the useHoverPrefetch hook.
 */
export interface UseHoverPrefetchReturn {
  /** Handler for mouse enter event - starts the prefetch timer */
  onMouseEnter: () => void

  /** Handler for mouse leave event - cancels the prefetch timer */
  onMouseLeave: () => void

  /** Handler for focus event - starts the prefetch timer (accessibility) */
  onFocus: () => void

  /** Handler for blur event - cancels the prefetch timer (accessibility) */
  onBlur: () => void
}

/**
 * Options for the useHoverPrefetch hook.
 */
export interface UseHoverPrefetchOptions {
  /**
   * Delay in milliseconds before prefetching starts.
   * Default: 1500ms
   */
  delay?: number

  /**
   * Whether to enable focus-based prefetching for accessibility.
   * Default: true
   */
  enableFocus?: boolean

  /**
   * Priority for the prefetch (lower = higher priority).
   * Default: undefined (uses FIFO)
   */
  priority?: number
}

// ============================================================================
// Constants
// ============================================================================

/** Default hover delay before prefetching starts */
const DEFAULT_HOVER_DELAY = 1500

/** Minimum delay to prevent accidental triggers */
const MIN_HOVER_DELAY = 500

/** Maximum delay to ensure responsiveness */
const MAX_HOVER_DELAY = 5000

// ============================================================================
// Hook
// ============================================================================

/**
 * React hook for hover-based video prefetching.
 *
 * Returns event handlers that trigger video prefetching after a configurable
 * delay when the user hovers over an element. The prefetch is cancelled if
 * the user leaves the element before the delay expires.
 *
 * @param video - The video to prefetch (null to disable)
 * @param options - Options or delay in milliseconds
 * @returns UseHoverPrefetchReturn with event handlers
 *
 * @example
 * ```tsx
 * // Basic usage with default 1500ms delay
 * function VideoCard({ video }: { video: Video }) {
 *   const { onMouseEnter, onMouseLeave } = useHoverPrefetch(video)
 *
 *   return (
 *     <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
 *       <Thumbnail src={video.thumbnailUrl} />
 *     </div>
 *   )
 * }
 * ```
 *
 * @example
 * ```tsx
 * // With custom delay
 * function VideoCard({ video }: { video: Video }) {
 *   const { onMouseEnter, onMouseLeave } = useHoverPrefetch(video, 1000)
 *
 *   return (
 *     <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
 *       <Thumbnail src={video.thumbnailUrl} />
 *     </div>
 *   )
 * }
 * ```
 *
 * @example
 * ```tsx
 * // With options object
 * function VideoCard({ video }: { video: Video }) {
 *   const handlers = useHoverPrefetch(video, {
 *     delay: 1000,
 *     enableFocus: true,
 *     priority: 1
 *   })
 *
 *   return (
 *     <div {...handlers} tabIndex={0} role="button">
 *       <Thumbnail src={video.thumbnailUrl} />
 *     </div>
 *   )
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Disabled when video is null
 * function ConditionalVideoCard({ video }: { video?: Video }) {
 *   const { onMouseEnter, onMouseLeave } = useHoverPrefetch(video ?? null)
 *
 *   return (
 *     <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
 *       {video ? <Thumbnail src={video.thumbnailUrl} /> : <Placeholder />}
 *     </div>
 *   )
 * }
 * ```
 */
export function useHoverPrefetch(
  video: Video | null,
  options: number | UseHoverPrefetchOptions = {}
): UseHoverPrefetchReturn {
  // Normalize options
  const opts: UseHoverPrefetchOptions =
    typeof options === 'number' ? { delay: options } : options

  const { delay = DEFAULT_HOVER_DELAY, enableFocus = true, priority } = opts

  // Clamp delay to valid range
  const clampedDelay = Math.max(MIN_HOVER_DELAY, Math.min(delay, MAX_HOVER_DELAY))

  // Timer ref for cleanup
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track if component is mounted
  const isMountedRef = useRef(true)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  /**
   * Start the prefetch timer.
   */
  const startPrefetch = useCallback(() => {
    // Clear any existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    // Check preconditions
    if (!video?.isEncrypted) return
    if (!isPrefetchEnabled()) return

    // Start the timer
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      if (isMountedRef.current && video) {
        prefetchVideo(video, priority)
      }
    }, clampedDelay)
  }, [video, clampedDelay, priority])

  /**
   * Cancel the prefetch timer and any pending prefetch.
   */
  const cancelPrefetchOp = useCallback(() => {
    // Clear the timer
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    // Cancel any pending prefetch
    if (video) {
      cancelPrefetch(video.id)
    }
  }, [video])

  /**
   * Handler for mouse enter event.
   */
  const onMouseEnter = useCallback(() => {
    startPrefetch()
  }, [startPrefetch])

  /**
   * Handler for mouse leave event.
   */
  const onMouseLeave = useCallback(() => {
    cancelPrefetchOp()
  }, [cancelPrefetchOp])

  /**
   * Handler for focus event (accessibility).
   */
  const onFocus = useCallback(() => {
    if (enableFocus) {
      startPrefetch()
    }
  }, [enableFocus, startPrefetch])

  /**
   * Handler for blur event (accessibility).
   */
  const onBlur = useCallback(() => {
    if (enableFocus) {
      cancelPrefetchOp()
    }
  }, [enableFocus, cancelPrefetchOp])

  return {
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
  }
}

/**
 * Simplified hook that returns just the mouse event handlers.
 *
 * This is a convenience wrapper that returns only onMouseEnter and onMouseLeave
 * for simple use cases where focus handling is not needed.
 *
 * @param video - The video to prefetch (null to disable)
 * @param delay - Delay in milliseconds (default: 1500ms)
 * @returns Object with onMouseEnter and onMouseLeave handlers
 *
 * @example
 * ```tsx
 * function VideoCard({ video }: { video: Video }) {
 *   const handlers = useHoverPrefetchHandlers(video, 1000)
 *
 *   return (
 *     <div {...handlers}>
 *       <Thumbnail src={video.thumbnailUrl} />
 *     </div>
 *   )
 * }
 * ```
 */
export function useHoverPrefetchHandlers(
  video: Video | null,
  delay: number = DEFAULT_HOVER_DELAY
): { onMouseEnter: () => void; onMouseLeave: () => void } {
  const { onMouseEnter, onMouseLeave } = useHoverPrefetch(video, { delay, enableFocus: false })
  return { onMouseEnter, onMouseLeave }
}

/**
 * Hook for prefetching on long press (touch devices).
 *
 * Similar to useHoverPrefetch but designed for touch interactions.
 * Triggers prefetch after a long press duration.
 *
 * @param video - The video to prefetch (null to disable)
 * @param duration - Long press duration in milliseconds (default: 800ms)
 * @returns Object with touch event handlers
 *
 * @example
 * ```tsx
 * function TouchVideoCard({ video }: { video: Video }) {
 *   const { onTouchStart, onTouchEnd } = useTouchPrefetch(video, 800)
 *
 *   return (
 *     <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
 *       <Thumbnail src={video.thumbnailUrl} />
 *     </div>
 *   )
 * }
 * ```
 */
export function useTouchPrefetch(
  video: Video | null,
  duration: number = 800
): { onTouchStart: () => void; onTouchEnd: () => void } {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const onTouchStart = useCallback(() => {
    if (!video?.isEncrypted) return
    if (!isPrefetchEnabled()) return

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null
      if (isMountedRef.current && video) {
        prefetchVideo(video)
      }
    }, duration)
  }, [video, duration])

  const onTouchEnd = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (video) {
      cancelPrefetch(video.id)
    }
  }, [video])

  return { onTouchStart, onTouchEnd }
}
