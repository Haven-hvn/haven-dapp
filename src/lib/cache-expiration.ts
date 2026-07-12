/**
 * Cache TTL & Expiration Strategy
 *
 * Implements time-to-live (TTL) system for cached videos with:
 * - Passive expiration (checked on access)
 * - Active expiration (periodic cleanup)
 * - LRU tracking for storage pressure management
 * - Storage quota enforcement
 *
 * @module lib/cache-expiration
 * @see ../../../task-3.3-cache-ttl-expiration.md - Task requirements
 */

import {
  listCachedVideos,
  deleteVideo,
  getCacheStorageEstimate,
  type CacheMetadata,
} from './video-cache'

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for TTL and cache expiration behavior.
 */
export interface CacheTTLConfig {
  /** Default TTL for cached videos (milliseconds). Default: 7 days */
  defaultTTL: number

  /** Maximum TTL allowed (milliseconds). Default: 30 days */
  maxTTL: number

  /** Minimum TTL allowed (milliseconds). Default: 1 hour */
  minTTL: number

  /** Storage usage threshold to trigger aggressive cleanup (0-1). Default: 0.8 */
  storageThreshold: number

  /** How often to run the cleanup sweep (milliseconds). Default: 1 hour */
  cleanupInterval: number

  /** Maximum number of videos to keep in cache. Default: 50 */
  maxCachedVideos: number
}

/**
 * Result of a cleanup operation.
 */
export interface CleanupResult {
  /** Number of videos removed */
  removed: number

  /** Number of videos checked */
  checked: number

  /** Error if cleanup failed */
  error?: Error
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default TTL configuration values.
 */
export const DEFAULT_CONFIG: CacheTTLConfig = {
  defaultTTL: 7 * 24 * 60 * 60 * 1000, // 7 days
  maxTTL: 30 * 24 * 60 * 60 * 1000, // 30 days
  minTTL: 60 * 60 * 1000, // 1 hour
  storageThreshold: 0.8, // 80%
  cleanupInterval: 60 * 60 * 1000, // 1 hour
  maxCachedVideos: 50,
}

// ============================================================================
// LRU Tracking
// ============================================================================

/**
 * In-memory map tracking last access times for cached videos.
 * Supplementary to X-Haven-Cached-At header in cache metadata.
 */
const lastAccessed = new Map<string, number>()

/**
 * Update the last-accessed time for a video.
 * Call this whenever a video is accessed from cache to maintain LRU order.
 *
 * @param videoId - The video ID to touch
 *
 * @example
 * ```typescript
 * // In useVideoCache hook — touch video on access
 * if (cached) {
 *   touchVideo(video.id) // Update LRU tracking
 *   setVideoUrl(`/haven/v/${video.id}`)
 * }
 * ```
 */
export function touchVideo(videoId: string): void {
  lastAccessed.set(videoId, Date.now())
}

/**
 * Get the last accessed time for a video.
 *
 * @param videoId - The video ID
 * @returns Timestamp of last access, or undefined if never tracked
 */
export function getLastAccessed(videoId: string): number | undefined {
  return lastAccessed.get(videoId)
}

/**
 * Remove a video from LRU tracking (e.g., after deletion).
 *
 * @param videoId - The video ID to remove from tracking
 */
export function removeFromLRU(videoId: string): void {
  lastAccessed.delete(videoId)
}

/**
 * Clear all LRU tracking data.
 * Useful for testing or when resetting cache state.
 */
export function clearLRUTracking(): void {
  lastAccessed.clear()
}

// ============================================================================
// Expiration Checking
// ============================================================================

/**
 * Check if a cached video has expired based on its TTL.
 *
 * @param metadata - The cache metadata from the video
 * @param config - Optional custom TTL config
 * @returns true if the video has expired, false otherwise
 *
 * @example
 * ```typescript
 * const result = await getVideo('0x123...')
 * if (result && isExpired(result.metadata)) {
 *   console.log('Video has expired, needs refresh')
 *   await deleteVideo('0x123...')
 * }
 * ```
 */
export function isExpired(
  metadata: CacheMetadata,
  config: Partial<CacheTTLConfig> = {}
): boolean {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  const ttl = metadata.ttl || mergedConfig.defaultTTL
  const expiresAt = metadata.cachedAt.getTime() + ttl
  return Date.now() >= expiresAt
}

/**
 * Get the expiration time for a cached video.
 *
 * @param metadata - The cache metadata from the video
 * @param config - Optional custom TTL config
 * @returns Date when the video will expire, or null if no TTL is set
 *
 * @example
 * ```typescript
 * const result = await getVideo('0x123...')
 * const expiration = getExpirationTime(result.metadata)
 * if (expiration) {
 *   console.log('Expires at:', expiration.toLocaleString())
 * }
 * ```
 */
export function getExpirationTime(
  metadata: CacheMetadata,
  config: Partial<CacheTTLConfig> = {}
): Date | null {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  const ttl = metadata.ttl || mergedConfig.defaultTTL

  if (!ttl) {
    return null
  }

  return new Date(metadata.cachedAt.getTime() + ttl)
}

/**
 * Get the remaining time until expiration in milliseconds.
 *
 * @param metadata - The cache metadata from the video
 * @param config - Optional custom TTL config
 * @returns Milliseconds until expiration (negative if expired)
 */
export function getTimeUntilExpiration(
  metadata: CacheMetadata,
  config: Partial<CacheTTLConfig> = {}
): number {
  const expirationTime = getExpirationTime(metadata, config)

  if (!expirationTime) {
    return Infinity
  }

  return expirationTime.getTime() - Date.now()
}

// ============================================================================
// Cleanup Sweeps
// ============================================================================

/**
 * Scan cache and remove all expired entries.
 * This is the primary cleanup strategy based on TTL.
 *
 * @param config - Optional custom TTL config
 * @returns Number of expired entries removed
 *
 * @example
 * ```typescript
 * // Run cleanup manually
 * const removed = await runCleanupSweep()
 * console.log(`Removed ${removed} expired videos`)
 * ```
 */
export async function runCleanupSweep(
  config: Partial<CacheTTLConfig> = {}
): Promise<number> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  try {
    const entries = await listCachedVideos()
    let removed = 0

    for (const entry of entries) {
      if (isExpired(entry, mergedConfig)) {
        await deleteVideo(entry.videoId)
        removeFromLRU(entry.videoId)
        removed++
      }
    }

    if (removed > 0) {
      console.info(`[CacheExpiration] Cleanup sweep removed ${removed} expired videos`)
    }

    return removed
  } catch (err) {
    console.warn('[CacheExpiration] Cleanup sweep failed:', err)
    return 0
  }
}

/**
 * Remove oldest entries when storage usage exceeds the threshold.
 * Uses LRU (Least Recently Used) strategy to determine which videos to remove.
 *
 * @param config - Optional custom TTL config
 * @returns Number of videos removed to relieve storage pressure
 *
 * @example
 * ```typescript
 * // Check and relieve storage pressure
 * const removed = await runStoragePressureCleanup()
 * if (removed > 0) {
 *   console.log(`Removed ${removed} videos to free up space`)
 * }
 * ```
 */
export async function runStoragePressureCleanup(
  config: Partial<CacheTTLConfig> = {}
): Promise<number> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  try {
    const estimate = await getCacheStorageEstimate()

    // Check if storage pressure is high (above threshold)
    if (estimate.percent < mergedConfig.storageThreshold * 100) {
      return 0 // Storage is fine
    }

    const entries = await listCachedVideos()

    if (entries.length === 0) {
      return 0
    }

    // Sort by last accessed (oldest first), then by cached time
    const sorted = entries.sort((a, b) => {
      const aAccessed = lastAccessed.get(a.videoId) || a.cachedAt.getTime()
      const bAccessed = lastAccessed.get(b.videoId) || b.cachedAt.getTime()
      return aAccessed - bAccessed
    })

    let removed = 0
    // Target: clean to 70% of threshold (leave headroom)
    const targetPercent = mergedConfig.storageThreshold * 100 * 0.7

    for (const entry of sorted) {
      if (estimate.percent <= targetPercent) {
        break
      }

      await deleteVideo(entry.videoId)
      removeFromLRU(entry.videoId)
      removed++

      // Re-check estimate after each deletion
      const newEstimate = await getCacheStorageEstimate()
      estimate.percent = newEstimate.percent
    }

    if (removed > 0) {
      console.info(
        `[CacheExpiration] Storage pressure cleanup removed ${removed} videos ` +
          `(storage was at ${estimate.percent.toFixed(1)}%)`
      )
    }

    return removed
  } catch (err) {
    console.warn('[CacheExpiration] Storage pressure cleanup failed:', err)
    return 0
  }
}

/**
 * Remove oldest/largest videos when storage is critically high.
 * This tertiary strategy removes the largest videos first to free space quickly.
 *
 * @param criticalThreshold - Storage percentage to trigger this cleanup (default: 0.9)
 * @returns Number of videos removed
 */
export async function runCriticalStorageCleanup(
  criticalThreshold: number = 0.9
): Promise<number> {
  try {
    const estimate = await getCacheStorageEstimate()

    // Only run if storage is critically high
    if (estimate.percent < criticalThreshold * 100) {
      return 0
    }

    const entries = await listCachedVideos()

    if (entries.length === 0) {
      return 0
    }

    // Sort by size (largest first) to free maximum space quickly
    const sorted = entries.sort((a, b) => b.size - a.size)

    let removed = 0
    const targetPercent = criticalThreshold * 100 * 0.8 // Clean to 80% of critical threshold

    for (const entry of sorted) {
      if (estimate.percent <= targetPercent) {
        break
      }

      await deleteVideo(entry.videoId)
      removeFromLRU(entry.videoId)
      removed++

      // Re-check estimate after each deletion
      const newEstimate = await getCacheStorageEstimate()
      estimate.percent = newEstimate.percent
    }

    if (removed > 0) {
      console.warn(
        `[CacheExpiration] Critical storage cleanup removed ${removed} large videos ` +
          `(storage was critically high at ${estimate.percent.toFixed(1)}%)`
      )
    }

    return removed
  } catch (err) {
    console.warn('[CacheExpiration] Critical storage cleanup failed:', err)
    return 0
  }
}

/**
 * Enforce the maximum number of cached videos.
 * Removes oldest entries (by LRU) when exceeding the limit.
 *
 * @param config - Optional custom TTL config
 * @returns Number of videos removed to enforce the limit
 *
 * @example
 * ```typescript
 * // Enforce maximum cache size
 * const removed = await enforceMaxVideos()
 * if (removed > 0) {
 *   console.log(`Removed ${removed} videos to enforce max limit`)
 * }
 * ```
 */
export async function enforceMaxVideos(
  config: Partial<CacheTTLConfig> = {}
): Promise<number> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  try {
    const entries = await listCachedVideos()

    if (entries.length <= mergedConfig.maxCachedVideos) {
      return 0
    }

    // Sort by last accessed (oldest first)
    const sorted = entries.sort((a, b) => {
      const aAccessed = lastAccessed.get(a.videoId) || a.cachedAt.getTime()
      const bAccessed = lastAccessed.get(b.videoId) || b.cachedAt.getTime()
      return aAccessed - bAccessed
    })

    const toRemove = sorted.slice(0, entries.length - mergedConfig.maxCachedVideos)

    for (const entry of toRemove) {
      await deleteVideo(entry.videoId)
      removeFromLRU(entry.videoId)
    }

    if (toRemove.length > 0) {
      console.info(
        `[CacheExpiration] Enforced max videos limit, removed ${toRemove.length} videos`
      )
    }

    return toRemove.length
  } catch (err) {
    console.warn('[CacheExpiration] Enforce max videos failed:', err)
    return 0
  }
}

// ============================================================================
// Periodic Cleanup
// ============================================================================

/** Active cleanup timer reference */
let cleanupTimer: ReturnType<typeof setInterval> | null = null

/** Whether a full cleanup is currently running */
let isCleanupRunning = false

/**
 * Run all cleanup strategies in sequence.
 * This is the internal function called by the periodic cleanup.
 *
 * @param config - TTL configuration
 */
async function runFullCleanup(config: CacheTTLConfig): Promise<void> {
  // Prevent concurrent cleanups
  if (isCleanupRunning) {
    return
  }

  isCleanupRunning = true

  try {
    // Strategy 1: TTL-based expiration (primary)
    const expired = await runCleanupSweep(config)

    // Strategy 2: Storage pressure cleanup (secondary - LRU)
    const pressured = await runStoragePressureCleanup(config)

    // Strategy 3: Critical storage cleanup (tertiary - size-based)
    const critical = await runCriticalStorageCleanup()

    // Strategy 4: Max videos enforcement
    const maxEnforced = await enforceMaxVideos(config)

    const total = expired + pressured + critical + maxEnforced

    if (total > 0) {
      console.info(
        `[CacheExpiration] Full cleanup completed: ${total} videos removed ` +
          `(${expired} expired, ${pressured} storage pressure, ${critical} critical, ${maxEnforced} max limit)`
      )
    }
  } catch (err) {
    console.warn('[CacheExpiration] Full cleanup failed:', err)
  } finally {
    isCleanupRunning = false
  }
}

/**
 * Start the periodic background cleanup timer.
 * Runs all cleanup strategies on the configured interval.
 *
 * @param config - Optional partial TTL config to customize behavior
 * @returns Cleanup function to stop the timer (call on component unmount)
 *
 * @example
 * ```typescript
 * // In ServiceWorkerProvider or app root
 * import { startPeriodicCleanup } from '@/lib/cache-expiration'
 *
 * useEffect(() => {
 *   const stopCleanup = startPeriodicCleanup({
 *     cleanupInterval: 30 * 60 * 1000, // 30 minutes
 *     storageThreshold: 0.75, // 75%
 *   })
 *   return stopCleanup
 * }, [])
 * ```
 */
export function startPeriodicCleanup(
  config: Partial<CacheTTLConfig> = {}
): () => void {
  // Stop any existing timer
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }

  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  // Run immediately on start (non-blocking)
  // Use setTimeout to avoid blocking the main thread
  setTimeout(() => {
    runFullCleanup(mergedConfig)
  }, 0)

  // Then run periodically
  cleanupTimer = setInterval(() => {
    runFullCleanup(mergedConfig)
  }, mergedConfig.cleanupInterval)

  console.info(
    `[CacheExpiration] Periodic cleanup started (interval: ${mergedConfig.cleanupInterval}ms)`
  )

  // Return cleanup function
  return () => {
    if (cleanupTimer) {
      clearInterval(cleanupTimer)
      cleanupTimer = null
      console.info('[CacheExpiration] Periodic cleanup stopped')
    }
  }
}

/**
 * Stop the periodic cleanup timer.
 * This is called automatically by the cleanup function returned from startPeriodicCleanup.
 */
export function stopPeriodicCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
    console.info('[CacheExpiration] Periodic cleanup stopped')
  }
}

/**
 * Check if periodic cleanup is currently running.
 *
 * @returns true if the cleanup timer is active
 */
export function isPeriodicCleanupRunning(): boolean {
  return cleanupTimer !== null
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate and clamp a TTL value to allowed range.
 *
 * @param ttl - The requested TTL in milliseconds
 * @param config - Optional custom TTL config
 * @returns Clamped TTL value
 */
export function validateTTL(
  ttl: number,
  config: Partial<CacheTTLConfig> = {}
): number {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  if (ttl < mergedConfig.minTTL) {
    return mergedConfig.minTTL
  }

  if (ttl > mergedConfig.maxTTL) {
    return mergedConfig.maxTTL
  }

  return ttl
}

/**
 * Get cache statistics including expiration info.
 *
 * @param config - Optional custom TTL config
 * @returns Statistics about cached videos and their expiration status
 */
export async function getCacheExpirationStats(config: Partial<CacheTTLConfig> = {}) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  try {
    const entries = await listCachedVideos()
    const estimate = await getCacheStorageEstimate()

    const now = Date.now()
    let expired = 0
    let expiringSoon = 0
    let fresh = 0
    let totalSize = 0

    const oneDay = 24 * 60 * 60 * 1000

    for (const entry of entries) {
      totalSize += entry.size

      const expirationTime = getExpirationTime(entry, mergedConfig)

      if (!expirationTime) {
        fresh++
        continue
      }

      const timeUntilExpiry = expirationTime.getTime() - now

      if (timeUntilExpiry <= 0) {
        expired++
      } else if (timeUntilExpiry <= oneDay) {
        expiringSoon++
      } else {
        fresh++
      }
    }

    return {
      totalVideos: entries.length,
      expired,
      expiringSoon,
      fresh,
      totalSize,
      storagePercent: estimate.percent,
      maxVideos: mergedConfig.maxCachedVideos,
      storageThreshold: mergedConfig.storageThreshold,
    }
  } catch (err) {
    console.warn('[CacheExpiration] Failed to get stats:', err)
    return {
      totalVideos: 0,
      expired: 0,
      expiringSoon: 0,
      fresh: 0,
      totalSize: 0,
      storagePercent: 0,
      maxVideos: mergedConfig.maxCachedVideos,
      storageThreshold: mergedConfig.storageThreshold,
    }
  }
}
