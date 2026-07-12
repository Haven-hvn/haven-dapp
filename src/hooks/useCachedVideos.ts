/**
 * useCachedVideos Hook
 *
 * Provides cache-specific metadata alongside video data.
 * Separates active videos (still on Arkiv) from expired videos (only in cache),
 * and exposes cache statistics for UI display.
 */

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useAppKitAccount } from '@reown/appkit/react'
import type { Video } from '../types/video'
import type { CacheStats } from '../types/cache'
import { getVideoCacheService } from '../services/cacheService'
import { useVideos } from './useVideos'

// Video type already includes arkivStatus field from cache metadata
// No need for extended interface anymore

/**
 * Return type for useCachedVideos hook.
 * Provides detailed cache metadata alongside video data.
 */
export interface UseCachedVideosReturn {
  /** All videos (Arkiv + cached expired) */
  videos: Video[]
  /** Videos currently active on Arkiv */
  activeVideos: Video[]
  /** Videos only available from cache (expired on Arkiv) */
  expiredVideos: Video[]
  /** Whether initial data is from cache */
  isFromCache: boolean
  /** Whether Arkiv fetch is in progress */
  isSyncing: boolean
  /** Cache statistics */
  cacheStats: CacheStats | null
  /** Last successful sync timestamp */
  lastSyncedAt: number | null
  /** Loading state */
  isLoading: boolean
  /** Error state */
  error: Error | null
  /** Force a full re-sync with Arkiv */
  forceSync: () => Promise<void>
}

/**
 * Hook for accessing videos with cache-specific metadata.
 *
 * Features:
 * - Separates active videos (on Arkiv) from expired videos (cache-only)
 * - Provides cache statistics for UI display
 * - Tracks last sync time
 * - Offers force sync capability
 *
 * This hook is ideal for library pages that need to show:
 * - Active videos with full functionality
 * - Expired videos with "archived" or "restore" UI
 * - Cache statistics for power users
 *
 * @returns UseCachedVideosReturn with videos, cache metadata, and sync controls
 */
export function useCachedVideos(): UseCachedVideosReturn {
  const { address } = useAppKitAccount()
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [videosWithStatus, setVideosWithStatus] = useState<Video[]>([])

  const { videos, isLoading, isFetching, error, refetch } = useVideos()

  // Load cache stats and determine video statuses
  useEffect(() => {
    if (address) {
      const cacheService = getVideoCacheService(address)

      // Load cache stats
      cacheService
        .getStats()
        .then(setCacheStats)
        .catch(() => setCacheStats(null))

      // Load last sync time
      cacheService
        .getLastSyncTime()
        .then(setLastSyncedAt)
        .catch(() => setLastSyncedAt(null))

      // Get detailed video statuses from cache
      // We need to check each video's arkivEntityStatus from the cache
      const loadVideoStatuses = async () => {
        try {
          // Get all cached videos to check their status
          const allCached = await cacheService.getVideos()
          const cachedMap = new Map(allCached.map((v) => [v.id, v]))

          // Enhance videos with cache status
          const enhanced = videos.map((video) => {
            const cached = cachedMap.get(video.id)
            if (cached) {
              // This video is in the cache - use its status
              return {
                ...video,
                arkivStatus: cached.arkivStatus,
              }
            }
            // Not in cache means it's fresh from Arkiv (active)
            return {
              ...video,
              arkivStatus: 'active' as const,
            }
          })

          setVideosWithStatus(enhanced)
        } catch {
          // On error, just use videos without status
          setVideosWithStatus(
            videos.map((v) => ({ ...v, arkivStatus: 'unknown' as const }))
          )
        }
      }

      loadVideoStatuses()
    } else {
      setVideosWithStatus([])
      setCacheStats(null)
      setLastSyncedAt(null)
    }
  }, [address, videos])

  // Separate active vs expired videos
  const activeVideos = useMemo(
    () =>
      videosWithStatus.filter(
        (v) => v.arkivStatus === 'active' || v.arkivStatus === 'unknown'
      ),
    [videosWithStatus]
  )

  const expiredVideos = useMemo(
    () => videosWithStatus.filter((v) => v.arkivStatus === 'expired'),
    [videosWithStatus]
  )

  // Determine if data is from cache (we have data but not currently fetching)
  const isFromCache = useMemo(() => {
    // If we have videos and are not currently fetching, data is from cache
    // If we are fetching, data might be from cache but we're updating it
    return videos.length > 0 && !isFetching
  }, [videos.length, isFetching])

  const forceSync = useCallback(async () => {
    await refetch()
  }, [refetch])

  return {
    videos,
    activeVideos,
    expiredVideos,
    isFromCache,
    isSyncing: isFetching,
    cacheStats,
    lastSyncedAt,
    isLoading,
    error,
    forceSync,
  }
}
