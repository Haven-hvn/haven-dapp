/**
 * useCacheStatus Hook
 *
 * Provides cache status information for the settings page and other cache
 * management UI. Returns both metadata cache stats and forward-compatible
 * video content cache stats.
 *
 * This hook is designed to accommodate the video content cache (video-cache)
 * when it is implemented. During arkiv-cache implementation, contentStats
 * returns null.
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import type { CacheStats } from '../types/cache'
import { useCacheStore, useCacheHealth } from '../stores/cacheStore'

// Mock for useAppKitAccount - in real app this would come from @reown/appkit
interface AppKitAccount {
  address: string | undefined
  isConnected: boolean
}

function useAppKitAccount(): AppKitAccount {
  // This is a placeholder - in the real app, this would use the actual hook
  // from @reown/appkit or similar wallet connection library
  return {
    address: undefined,
    isConnected: false,
  }
}

// =============================================================================
// Types
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
 * Return type for useCacheStatus hook.
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
// Hook
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
 * During arkiv-cache implementation:
 * - metadataStats: populated from cache store
 * - contentStats: always null
 * - totalCacheSize: same as metadata cache size
 *
 * When video-cache is implemented:
 * - metadataStats: populated from arkiv-cache
 * - contentStats: populated from video-cache service
 * - totalCacheSize: sum of both caches
 *
 * @returns UseCacheStatusReturn with cache status information
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
export function useCacheStatus(): UseCacheStatusReturn {
  const { address, isConnected } = useAppKitAccount()
  const { stats: storeStats } = useCacheHealth()

  const [metadataStats, setMetadataStats] = useState<CacheStats | null>(null)
  const [contentStats, setContentStats] = useState<ContentCacheStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  /**
   * Fetch content cache stats from the video-cache system.
   * This is a placeholder that returns null until video-cache is implemented.
   */
  const fetchContentStats = useCallback(async (): Promise<ContentCacheStats | null> => {
    // TODO: Implement when video-cache system is added
    // This should:
    // 1. Query the Cache API for cached video content
    // 2. Get storage estimate for video content
    // 3. Return ContentCacheStats

    // During arkiv-cache implementation, this always returns null
    return null
  }, [])

  /**
   * Refresh cache stats from both metadata and content caches.
   */
  const refresh = useCallback(async () => {
    if (!isConnected || !address) {
      setMetadataStats(null)
      setContentStats(null)
      return
    }

    setIsLoading(true)
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
      setIsLoading(false)
    }
  }, [address, isConnected, storeStats, fetchContentStats])

  // Initial load and when store stats change
  useEffect(() => {
    if (storeStats) {
      setMetadataStats(storeStats)
    }
  }, [storeStats])

  // Initial load
  useEffect(() => {
    refresh()
  }, [refresh])

  // Calculate total cache size
  const totalCacheSize =
    (metadataStats?.cacheSize ?? 0) + (contentStats?.totalSize ?? 0)

  return {
    metadataStats,
    contentStats,
    totalCacheSize,
    isLoading,
    error,
    refresh,
  }
}

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
