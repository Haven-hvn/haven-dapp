/**
 * Cache Service Layer
 * 
 * High-level cache service that orchestrates IndexedDB operations and transform
 * utilities into a clean API for the rest of the application.
 * 
 * This is the single entry point for all cache operations — no other code should
 * interact with src/lib/cache/db.ts directly.
 */

import type { Video } from '../types/video'
import type { CachedVideo, CacheStats, CacheSyncResult, CacheMetadataEntry } from '../types/cache'
import {
  getAllCachedVideos,
  getCachedVideo,
  putCachedVideo,
  putCachedVideos,
  deleteCachedVideo,
  clearCachedVideos,
  getCacheMetadata,
  setCacheMetadata,
  getVideosByLastAccessed,
  getCacheStats as getDBCacheStats,
} from '../lib/cache/db'
import {
  videoToCachedVideo,
  cachedVideoToVideo,
  hasVideoChanged,
  markAsExpired,
  updateLastAccessed,
  updateVideoCacheStatus as transformUpdateVideoCacheStatus,
} from '../lib/cache/transforms'

/**
 * Service instances per wallet (singleton pattern)
 */
const serviceInstances = new Map<string, VideoCacheService>()

/**
 * Default maximum number of cache entries before eviction
 */
const DEFAULT_MAX_ENTRIES = 5000

/**
 * Video Cache Service
 * 
 * Provides business-logic-aware cache operations for video metadata.
 * All methods are fail-safe and will not throw to callers.
 */
export class VideoCacheService {
  private walletAddress: string

  /**
   * Create a new VideoCacheService instance
   * @param walletAddress - The wallet address for this cache instance
   */
  constructor(walletAddress: string) {
    this.walletAddress = walletAddress.toLowerCase()
  }

  // ── Read Operations ──────────────────────────────────────────────

  /**
   * Get all cached videos as Video[] (ready for UI consumption)
   * @returns Array of Video objects, empty array on error
   */
  async getVideos(): Promise<Video[]> {
    try {
      const cached = await getAllCachedVideos(this.walletAddress)
      return cached.map(cachedVideoToVideo)
    } catch (error) {
      console.warn('[CacheService] Failed to read cache, returning empty:', error)
      return []
    }
  }

  /**
   * Get a single cached video by ID
   * @param videoId - The video ID to look up
   * @returns Video object or null if not found or on error
   */
  async getVideo(videoId: string): Promise<Video | null> {
    try {
      const cached = await getCachedVideo(this.walletAddress, videoId)
      if (!cached) {
        return null
      }
      return cachedVideoToVideo(cached)
    } catch (error) {
      console.warn(`[CacheService] Failed to get video ${videoId}:`, error)
      return null
    }
  }

  /**
   * Get cache statistics
   * @returns CacheStats object with default values on error
   */
  async getStats(): Promise<CacheStats> {
    try {
      return await getDBCacheStats(this.walletAddress)
    } catch (error) {
      console.warn('[CacheService] Failed to get cache stats:', error)
      return {
        totalVideos: 0,
        activeVideos: 0,
        expiredVideos: 0,
        cacheSize: 0,
        lastFullSync: null,
        oldestEntry: null,
        newestEntry: null,
      }
    }
  }

  /**
   * Check if a video exists in cache
   * @param videoId - The video ID to check
   * @returns true if video exists in cache, false otherwise
   */
  async hasVideo(videoId: string): Promise<boolean> {
    try {
      const cached = await getCachedVideo(this.walletAddress, videoId)
      return cached !== null
    } catch (error) {
      console.warn(`[CacheService] Failed to check video ${videoId}:`, error)
      return false
    }
  }

  // ── Write Operations ─────────────────────────────────────────────

  /**
   * Cache a single video (from Arkiv fetch)
   * @param video - The Video object to cache
   */
  async cacheVideo(video: Video): Promise<void> {
    try {
      const cachedVideo = await videoToCachedVideo(video)
      await putCachedVideo(this.walletAddress, cachedVideo)
    } catch (error) {
      console.warn(`[CacheService] Failed to cache video ${video.id}:`, error)
    }
  }

  /**
   * Cache multiple videos (from Arkiv bulk fetch)
   * @param videos - Array of Video objects to cache
   * @returns CacheSyncResult with counts of operations
   */
  async cacheVideos(videos: Video[]): Promise<CacheSyncResult> {
    const result: CacheSyncResult = {
      added: 0,
      updated: 0,
      expired: 0,
      unchanged: 0,
      errors: [],
      syncedAt: Date.now(),
    }

    try {
      const toWrite: CachedVideo[] = []

      for (const video of videos) {
        try {
          const existing = await getCachedVideo(this.walletAddress, video.id)
          
          if (!existing) {
            // New video
            const cached = await videoToCachedVideo(video)
            toWrite.push(cached)
            result.added++
          } else {
            // Update existing
            const cached = await videoToCachedVideo(video, existing)
            toWrite.push(cached)
            result.updated++
          }
        } catch (error) {
          const errorMsg = `Failed to process video ${video.id}: ${error instanceof Error ? error.message : String(error)}`
          console.warn('[CacheService]', errorMsg)
          result.errors.push(errorMsg)
        }
      }

      if (toWrite.length > 0) {
        await putCachedVideos(this.walletAddress, toWrite)
      }

      return result
    } catch (error) {
      const errorMsg = `Failed to cache videos: ${error instanceof Error ? error.message : String(error)}`
      console.warn('[CacheService]', errorMsg)
      result.errors.push(errorMsg)
      return result
    }
  }

  /**
   * Mark a video as expired (no longer on Arkiv)
   * @param videoId - The video ID to mark as expired
   */
  async markVideoExpired(videoId: string): Promise<void> {
    try {
      const cached = await getCachedVideo(this.walletAddress, videoId)
      if (cached) {
        const expired = markAsExpired(cached)
        await putCachedVideo(this.walletAddress, expired)
      }
    } catch (error) {
      console.warn(`[CacheService] Failed to mark video ${videoId} as expired:`, error)
    }
  }

  /**
   * Update last accessed timestamp for a video
   * @param videoId - The video ID to touch
   */
  async touchVideo(videoId: string): Promise<void> {
    try {
      const cached = await getCachedVideo(this.walletAddress, videoId)
      if (cached) {
        const updated = updateLastAccessed(cached)
        await putCachedVideo(this.walletAddress, updated)
      }
    } catch (error) {
      console.warn(`[CacheService] Failed to touch video ${videoId}:`, error)
    }
  }

  // ── Sync Operations ──────────────────────────────────────────────

  /**
   * Full sync: compare Arkiv videos with cache, update accordingly.
   * - New videos → add to cache
   * - Changed videos → update in cache
   * - Missing from Arkiv but in cache → mark as expired
   * - Unchanged → skip
   * @param arkivVideos - Array of Video objects from Arkiv
   * @returns CacheSyncResult with detailed sync statistics
   */
  async syncWithArkiv(arkivVideos: Video[]): Promise<CacheSyncResult> {
    const result: CacheSyncResult = {
      added: 0,
      updated: 0,
      expired: 0,
      unchanged: 0,
      errors: [],
      syncedAt: Date.now(),
    }

    try {
      // 1. Get all currently cached videos
      const cachedMap = new Map<string, CachedVideo>()
      const allCached = await getAllCachedVideos(this.walletAddress)
      allCached.forEach(cv => cachedMap.set(cv.id, cv))

      // 2. Build set of Arkiv video IDs
      const arkivIds = new Set(arkivVideos.map(v => v.id))

      // 3. Process Arkiv videos (add or update)
      const toWrite: CachedVideo[] = []
      for (const video of arkivVideos) {
        try {
          const existing = cachedMap.get(video.id)
          if (!existing) {
            // New video — add to cache
            toWrite.push(await videoToCachedVideo(video))
            result.added++
          } else if (await hasVideoChanged(video, existing)) {
            // Changed video — update in cache
            toWrite.push(await videoToCachedVideo(video, existing))
            result.updated++
          } else {
            // Unchanged
            result.unchanged++
          }
        } catch (error) {
          const errorMsg = `Failed to process video ${video.id}: ${error instanceof Error ? error.message : String(error)}`
          console.warn('[CacheService]', errorMsg)
          result.errors.push(errorMsg)
        }
      }

      // 4. Detect expired entities (in cache but not in Arkiv)
      for (const [id, cached] of cachedMap) {
        if (!arkivIds.has(id) && cached.arkivEntityStatus === 'active') {
          toWrite.push(markAsExpired(cached))
          result.expired++
        }
      }

      // 5. Bulk write all changes
      if (toWrite.length > 0) {
        await putCachedVideos(this.walletAddress, toWrite)
      }

      // 6. Update last sync time
      await this.setLastSyncTime(result.syncedAt)

      return result
    } catch (error) {
      const errorMsg = `Failed to sync with Arkiv: ${error instanceof Error ? error.message : String(error)}`
      console.warn('[CacheService]', errorMsg)
      result.errors.push(errorMsg)
      return result
    }
  }

  /**
   * Get merged video list: cached + Arkiv, with Arkiv taking precedence
   * for active entities and cache filling in for expired ones.
   * @param arkivVideos - Array of Video objects from Arkiv
   * @returns Unified array of Video objects sorted by createdAt descending
   */
  async getMergedVideos(arkivVideos: Video[]): Promise<Video[]> {
    try {
      // First, sync to update cache
      await this.syncWithArkiv(arkivVideos)

      // Get all cached videos (includes newly expired ones)
      const allCached = await getAllCachedVideos(this.walletAddress)

      // Build map: Arkiv videos take precedence
      const videoMap = new Map<string, Video>()

      // Add cached expired videos first (these are the ones Arkiv no longer has)
      for (const cached of allCached) {
        if (cached.arkivEntityStatus === 'expired') {
          videoMap.set(cached.id, cachedVideoToVideo(cached))
        }
      }

      // Overlay with fresh Arkiv videos (overwrite any that exist)
      for (const video of arkivVideos) {
        videoMap.set(video.id, video)
      }

      // Return sorted by createdAt descending
      return Array.from(videoMap.values())
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    } catch (error) {
      console.warn('[CacheService] Failed to get merged videos:', error)
      // Fall back to just returning Arkiv videos
      return arkivVideos.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    }
  }

  // ── Maintenance Operations ───────────────────────────────────────

  /**
   * Clear all cached data for this wallet
   */
  async clearAll(): Promise<void> {
    try {
      await clearCachedVideos(this.walletAddress)
    } catch (error) {
      console.warn('[CacheService] Failed to clear cache:', error)
    }
  }

  /**
   * Evict oldest entries to stay under maxEntries limit
   * @param maxEntries - Maximum number of entries to keep (default: 5000)
   * @returns Number of entries evicted
   */
  async evictOldEntries(maxEntries: number = DEFAULT_MAX_ENTRIES): Promise<number> {
    try {
      const allVideos = await getAllCachedVideos(this.walletAddress)
      
      if (allVideos.length <= maxEntries) {
        return 0
      }

      // Sort by lastAccessedAt (oldest first)
      const sortedByAccess = [...allVideos].sort(
        (a, b) => a.lastAccessedAt - b.lastAccessedAt
      )

      // Calculate how many to evict
      const toEvictCount = allVideos.length - maxEntries
      const toEvict = sortedByAccess.slice(0, toEvictCount)

      // Delete the oldest entries
      for (const video of toEvict) {
        try {
          await deleteCachedVideo(this.walletAddress, video.id)
        } catch (error) {
          console.warn(`[CacheService] Failed to evict video ${video.id}:`, error)
        }
      }

      return toEvict.length
    } catch (error) {
      console.warn('[CacheService] Failed to evict old entries:', error)
      return 0
    }
  }

  /**
   * Get the timestamp of the last full sync
   * @returns Unix timestamp (ms) or null if never synced
   */
  async getLastSyncTime(): Promise<number | null> {
    try {
      const entry = await getCacheMetadata(this.walletAddress, 'lastFullSync')
      return entry?.value ? Number(entry.value) : null
    } catch (error) {
      console.warn('[CacheService] Failed to get last sync time:', error)
      return null
    }
  }

  /**
   * Set the timestamp of the last full sync
   * @param timestamp - Unix timestamp (ms)
   */
  async setLastSyncTime(timestamp: number): Promise<void> {
    try {
      const entry: CacheMetadataEntry = {
        key: 'lastFullSync',
        value: timestamp,
        updatedAt: Date.now(),
      }
      await setCacheMetadata(this.walletAddress, entry)
    } catch (error) {
      console.warn('[CacheService] Failed to set last sync time:', error)
    }
  }

  // ── Video Content Cache Integration ──────────────────────────────

  /**
   * Update video content cache status for a video.
   * Called by video-cache after putVideo() or deleteVideo().
   * @param videoId - The video ID to update
   * @param status - The new cache status
   * @param cachedAt - Optional timestamp when content was cached
   */
  async updateVideoCacheStatus(
    videoId: string,
    status: 'not-cached' | 'cached' | 'stale',
    cachedAt?: number
  ): Promise<void> {
    try {
      const cached = await getCachedVideo(this.walletAddress, videoId)
      if (cached) {
        const updated = transformUpdateVideoCacheStatus(cached, status)
        if (status === 'cached' && cachedAt) {
          updated.videoCachedAt = cachedAt
        }
        await putCachedVideo(this.walletAddress, updated)
      }
    } catch (error) {
      console.warn('[CacheService] Failed to update video cache status:', error)
    }
  }

  /**
   * Get videos that have cached content (videoCacheStatus === 'cached').
   * Used by video-cache management UI to show content cache entries
   * alongside their metadata.
   * @returns Array of Video objects with cached content
   */
  async getContentCachedVideos(): Promise<Video[]> {
    try {
      const allCached = await getAllCachedVideos(this.walletAddress)
      const contentCached = allCached.filter(
        cached => cached.videoCacheStatus === 'cached'
      )
      return contentCached.map(cachedVideoToVideo)
    } catch (error) {
      console.warn('[CacheService] Failed to get content cached videos:', error)
      return []
    }
  }
}

// ── Factory Functions ────────────────────────────────────────────

/**
 * Create a new VideoCacheService instance
 * @param walletAddress - The wallet address for this cache instance
 * @returns A new VideoCacheService instance
 */
export function createVideoCacheService(walletAddress: string): VideoCacheService {
  return new VideoCacheService(walletAddress)
}

/**
 * Get or create a VideoCacheService singleton for a wallet.
 * Cache service instances are shared per wallet to prevent duplicate connections.
 * @param walletAddress - The wallet address for this cache instance
 * @returns The shared VideoCacheService instance for this wallet
 */
export function getVideoCacheService(walletAddress: string): VideoCacheService {
  const key = walletAddress.toLowerCase()
  if (!serviceInstances.has(key)) {
    serviceInstances.set(key, new VideoCacheService(key))
  }
  return serviceInstances.get(key)!
}

/**
 * Clear all service instances (useful for testing)
 */
export function clearServiceInstances(): void {
  serviceInstances.clear()
}
