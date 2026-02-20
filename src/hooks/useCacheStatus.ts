/**
 * useCacheStatus Hook
 *
 * Provides cache status information for video content caching.
 * Supports two modes:
 * 1. No arguments: Returns global cache stats (metadata + content)
 * 2. With videoIds: Returns per-video cache status for library grid view
 *
 * @module hooks/useCacheStatus
 * @see ../../../src/lib/video-cache.ts - Video cache API wrapper
 */

'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAppKitAccount } from '@reown/appkit/react'
import type { CacheStats } from '../types/cache'
import { useCacheStore, useCacheHealth } from '../stores/cacheStore'
import { hasVideo, getCacheStorageEstimate, listCachedVideos } from '../lib/video-cache'

// =============================================================================
// Types - Global Cache Status (No Arguments)
// =============================================================================

/**
 * Video content cache statistics (forward-compatible).
 * This will be populated by the video-cache system when implemented.
 */
export interface ContentCacheStats {
  /** Number of videos with cached decrypted content */
  cachedCount: number
  /** Estimated total size of cached video content in bytes */
  totalSize: number
  /** Number of stale entries */
  staleCount: number
  /** Timestamp of last content cache update */
  lastUpdated: number | null
}

/**
 * Unified cache stats interface that includes both metadata and content cache.
 * This extends the base CacheStats with optional video content cache fields.
 */
export interface UnifiedCacheStats extends CacheStats {
  /** Videos with cached decrypted content */
  contentCachedVideos?: number
  /** Estimated size of cached video content */
  contentCacheSize?: number
}

/**
 * Return type for useCacheStatus hook (no arguments - global stats).
 * Provides both metadata and content cache information.
 */
export interface UseCacheStatusReturn {
  /** Metadata cache stats (arkiv-cache) */
  metadataStats: CacheStats | null
  /** Video content cache stats (video-cache — null until implemented) */
  contentStats: ContentCacheStats | null
  /** Combined total cache size (metadata + content) */
  totalCacheSize: number
  /** Whether cache data is loading */
  isLoading: boolean
  /** Error if cache status fetch failed */
  error: Error | null
  /** Refresh cache stats */
  refresh: () => Promise<void>
}

// =============================================================================
// Types - Per-Video Cache Status (With videoIds)
// =============================================================================

/**
 * Return type for useCacheStatus hook (with videoIds - per-video status).
 * Used in library grid view to show cache badges on individual videos.
 */
export interface UseVideoCacheStatusReturn {
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

// =============================================================================
// Hook - Per-Video Cache Status (Library Grid View)
// =============================================================================

/**
 * Hook that checks cache status for multiple videos without reading their content.
 * Optimized for the library grid view - checks videos in parallel for efficiency.
 *
 * Features:
 * - Returns a Map of videoId → isCached for easy lookup
 * - Checks all videos in parallel (not sequentially)
 * - Provides refresh function to re-check cache status
 * - Calculates cachedCount and totalCacheSize
 * - Handles errors gracefully (returns false for failed checks)
 *
 * @param videoIds - Array of video IDs to check
 * @returns UseVideoCacheStatusReturn with per-video cache status
 *
 * @example
 * ```tsx
 * function LibraryView({ videos }: { videos: Video[] }) {
 *   const videoIds = videos.filter(v => v.isEncrypted).map(v => v.id)
 *   const { cacheStatus, cachedCount, isLoading } = useCacheStatus(videoIds)
 *
 *   return (
 *     <div>
 *       <p>{cachedCount} videos cached</p>
 *       <div className="grid">
 *         {videos.map(video => (
 *           <VideoCard
 *             key={video.id}
 *             video={video}
 *             isCached={cacheStatus.get(video.id) ?? false}
 *           />
 *         ))}
 *       </div>
 *     </div>
 *   )
 * }
 * ```
 */
export function useCacheStatus(videoIds: string[]): UseVideoCacheStatusReturn

// =============================================================================
// Hook - Global Cache Status (Settings Page)
// =============================================================================

/**
 * Hook that provides comprehensive cache status information.
 *
 * Features:
 * - Returns metadata cache stats from arkiv-cache
 * - Returns content cache stats (null until video-cache is implemented)
 * - Calculates combined total cache size
 * - Provides refresh function to update stats
 *
 * @returns UseCacheStatusReturn with global cache status information
 *
 * @example
 * ```tsx
 * function CacheSettings() {
 *   const { metadataStats, contentStats, totalCacheSize, isLoading, refresh } = useCacheStatus()
 *
 *   if (isLoading) return <Loading />
 *
 *   return (
 *     <div>
 *       <p>Metadata: {metadataStats?.totalVideos} videos</p>
 *       <p>Content cached: {contentStats?.cachedCount ?? 0} videos</p>
 *       <p>Total size: {formatBytes(totalCacheSize)}</p>
 *       <button onClick={refresh}>Refresh</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useCacheStatus(): UseCacheStatusReturn

// =============================================================================
// Implementation
// =============================================================================

/**
 * Implementation of useCacheStatus that handles both signatures:
 * - useCacheStatus() → Global cache stats for settings page
 * - useCacheStatus(videoIds: string[]) → Per-video cache status for library grid
 */
export function useCacheStatus(
  videoIds?: string[]
): UseCacheStatusReturn | UseVideoCacheStatusReturn {
  const { address, isConnected } = useAppKitAccount()
  const { stats: storeStats } = useCacheHealth()

  // ============================================================================
  // Global Stats State (for no-argument version)
  // ============================================================================
  const [metadataStats, setMetadataStats] = useState<CacheStats | null>(null)
  const [contentStats, setContentStats] = useState<ContentCacheStats | null>(null)
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // ============================================================================
  // Per-Video Status State (for videoIds argument version)
  // ============================================================================
  const [cacheStatus, setCacheStatus] = useState<Map<string, boolean>>(new Map())
  const [isLoadingVideos, setIsLoadingVideos] = useState(false)
  const [totalCacheSize, setTotalCacheSize] = useState(0)

  // ============================================================================
  // Per-Video Cache Check Logic
  // ============================================================================
  const checkVideoCacheStatus = useCallback(async (ids: string[]) => {
    setIsLoadingVideos(true)

    try {
      // Check all video IDs in parallel for efficiency
      const results = await Promise.all(
        ids.map(async (id) => {
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
      // On error, set all to false
      setCacheStatus(new Map(ids.map(id => [id, false])))
    } finally {
      setIsLoadingVideos(false)
    }
  }, [])

  // Refresh function for per-video version
  const refreshVideos = useCallback(() => {
    if (videoIds && videoIds.length > 0) {
      checkVideoCacheStatus(videoIds)
    }
  }, [videoIds, checkVideoCacheStatus])

  // Effect to check cache status when videoIds change
  useEffect(() => {
    if (videoIds && videoIds.length > 0) {
      checkVideoCacheStatus(videoIds)
    }
  }, [videoIds?.join(','), checkVideoCacheStatus])

  // Calculate cached count for per-video version
  const cachedCount = useMemo(() => {
    return Array.from(cacheStatus.values()).filter(Boolean).length
  }, [cacheStatus])

  // ============================================================================
  // Global Stats Logic (for no-argument version)
  // ============================================================================

  /**
   * Fetch content cache stats from the video-cache system.
   * Queries the Cache API for cached video content and returns statistics.
   */
  const fetchContentStats = useCallback(async (): Promise<ContentCacheStats | null> => {
    try {
      // Get all cached video entries from Cache API
      const entries = await listCachedVideos()
      
      // Get storage estimate
      const estimate = await getCacheStorageEstimate()
      
      // Calculate statistics
      const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0)
      
      // Count stale entries (TTL expired)
      const now = Date.now()
      const staleCount = entries.filter(entry => {
        if (!entry.ttl) return false
        const expiryTime = entry.cachedAt.getTime() + entry.ttl
        return now > expiryTime
      }).length
      
      // Get most recent cache update
      const lastUpdated = entries.length > 0
        ? Math.max(...entries.map(e => e.cachedAt.getTime()))
        : null

      return {
        cachedCount: entries.length,
        totalSize,
        staleCount,
        lastUpdated,
      }
    } catch (error) {
      console.warn('[useCacheStatus] Failed to fetch content stats:', error)
      return null
    }
  }, [])

  /**
   * Refresh cache stats from both metadata and content caches.
   */
  const refreshGlobal = useCallback(async () => {
    if (!isConnected || !address) {
      setMetadataStats(null)
      setContentStats(null)
      return
    }

    setIsLoadingGlobal(true)
    setError(null)

    try {
      // Metadata stats come from the store or can be fetched directly
      // Prioritize store stats if available
      if (storeStats) {
        setMetadataStats(storeStats)
      }

      // Content stats are null until video-cache is implemented
      const content = await fetchContentStats()
      setContentStats(content)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      console.error('[useCacheStatus] Failed to refresh cache stats:', error)
    } finally {
      setIsLoadingGlobal(false)
    }
  }, [address, isConnected, storeStats, fetchContentStats])

  // Initial load and when store stats change
  useEffect(() => {
    if (storeStats) {
      setMetadataStats(storeStats)
    }
  }, [storeStats])

  // Initial load for global stats
  useEffect(() => {
    // Only run global refresh if videoIds is undefined (no-argument version)
    if (videoIds === undefined) {
      refreshGlobal()
    }
  }, [refreshGlobal, videoIds])

  // Calculate total cache size for global version
  const totalCacheSizeGlobal =
    (metadataStats?.cacheSize ?? 0) + (contentStats?.totalSize ?? 0)

  // ============================================================================
  // Return Values Based on Call Signature
  // ============================================================================

  // If videoIds was provided, return per-video cache status
  if (videoIds !== undefined) {
    return {
      cacheStatus,
      isLoading: isLoadingVideos,
      refresh: refreshVideos,
      cachedCount,
      totalCacheSize,
    }
  }

  // Otherwise, return global cache stats
  return {
    metadataStats,
    contentStats,
    totalCacheSize: totalCacheSizeGlobal,
    isLoading: isLoadingGlobal,
    error,
    refresh: refreshGlobal,
  }
}

// =============================================================================
// Selector Hooks (for backward compatibility)
// =============================================================================

/**
 * Selector hook for just the content cache status.
 * Returns null until video-cache is implemented.
 *
 * @returns ContentCacheStats | null
 */
export function useContentCacheStatus(): ContentCacheStats | null {
  const { contentStats } = useCacheStatus()
  return contentStats
}

/**
 * Selector hook for combined cache statistics.
 * Returns unified stats including both metadata and content cache.
 *
 * @returns UnifiedCacheStats | null
 */
export function useUnifiedCacheStats(): UnifiedCacheStats | null {
  const { metadataStats, contentStats } = useCacheStatus()

  if (!metadataStats) return null

  return {
    ...metadataStats,
    contentCachedVideos: contentStats?.cachedCount ?? 0,
    contentCacheSize: contentStats?.totalSize ?? 0,
  }
}
