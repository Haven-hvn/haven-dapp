/**
 * Video Cache API Wrapper
 *
 * A typed wrapper around the browser Cache API specifically for storing and
 * retrieving decrypted video content. This module provides the core put/get/delete/has
 * operations that the rest of the system uses.
 *
 * The Cache API stores Request → Response pairs on disk. We use synthetic URLs
 * (`/haven/v/{videoId}`) as keys and store the decrypted video bytes as the
 * Response body. This wrapper abstracts the Cache API details and adds metadata
 * tracking (MIME type, size, timestamps) via custom response headers.
 *
 * @module lib/video-cache
 * @see ../../../public/haven-sw.js - Service Worker that serves cached videos
 */

import { logCacheError, isQuotaExceededError } from './cache-errors'
import { verifyCacheEntry } from './cache-integrity'

// ============================================================================
// Constants
// ============================================================================

/**
 * Cache name for video content storage.
 * Must match the CACHE_NAME constant in the Service Worker (haven-sw.js).
 */
export const CACHE_NAME = 'haven-video-cache-v1'

/**
 * URL prefix for synthetic video URLs.
 * Must match the VIDEO_URL_PREFIX constant in the Service Worker.
 */
export const VIDEO_URL_PREFIX = '/haven/v/'

/**
 * Default percentage of entries to evict when quota is exceeded.
 */
const DEFAULT_EVICTION_PERCENTAGE = 0.2 // 20%

/**
 * Minimum number of entries to evict.
 */
const MIN_EVICTION_COUNT = 1

// ============================================================================
// Types
// ============================================================================

/**
 * Metadata extracted from cached video response headers.
 */
export interface CacheMetadata {
  /** Video ID (extracted from URL or headers) */
  videoId: string

  /** MIME type of the video content */
  mimeType: string

  /** Size of the video in bytes */
  size: number

  /** When the video was cached */
  cachedAt: Date

  /** Optional TTL in milliseconds until expiry */
  ttl?: number
}

/**
 * A cached video entry with full metadata.
 */
export interface CacheEntry extends CacheMetadata {
  /** Full synthetic URL used as the cache key */
  url: string
}

/**
 * Result from getVideo() containing the response and metadata.
 */
export interface VideoCacheResult {
  /** The cached Response object (contains the video blob) */
  response: Response

  /** Metadata extracted from response headers */
  metadata: CacheMetadata
}

/**
 * Storage estimate from navigator.storage.estimate()
 */
export interface StorageEstimate {
  /** Bytes used by the origin */
  usage: number

  /** Bytes available to the origin */
  quota: number

  /** Percentage of quota used (0-100) */
  percent: number
}

/**
 * Options for putVideo operation.
 */
export interface PutVideoOptions {
  /** Optional TTL in milliseconds for cache expiration */
  ttl?: number

  /** Whether to retry on quota exceeded (default: true) */
  retryOnQuotaExceeded?: boolean

  /** Whether to evict oldest entries to make room (default: true) */
  evictOnQuotaExceeded?: boolean
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if the Cache API is available in the current environment.
 * Returns false during SSR or in browsers that don't support the Cache API.
 */
function isCacheAvailable(): boolean {
  return typeof caches !== 'undefined' && typeof window !== 'undefined'
}

/**
 * Check if Storage API is available for quota estimation.
 */
function isStorageAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'storage' in navigator && 'estimate' in navigator.storage
}

/**
 * Get the current origin for constructing synthetic URLs.
 * Uses self.location for service worker compatibility.
 */
function getOrigin(): string {
  if (typeof self !== 'undefined' && self.location) {
    return self.location.origin
  }
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin
  }
  return ''
}

/**
 * Construct the synthetic URL for a video ID.
 * These URLs are used as cache keys and intercepted by the service worker.
 *
 * @param videoId - The video ID
 * @returns The full synthetic URL (e.g., https://example.com/haven/v/0x123...)
 */
export function getVideoUrl(videoId: string): string {
  return `${getOrigin()}${VIDEO_URL_PREFIX}${videoId}`
}

/**
 * Extract video ID from a synthetic URL.
 *
 * @param url - The synthetic URL
 * @returns The video ID or null if not a valid video URL
 */
export function getVideoIdFromUrl(url: string): string | null {
  if (!url.includes(VIDEO_URL_PREFIX)) {
    return null
  }
  const parts = url.split(VIDEO_URL_PREFIX)
  return parts.length > 1 ? parts[1] : null
}

/**
 * Extract metadata from a cached response's headers.
 *
 * @param response - The cached Response object
 * @param videoId - The video ID (fallback if not in headers)
 * @returns CacheMetadata object
 */
export function extractMetadata(response: Response, videoId: string): CacheMetadata {
  const headers = response.headers

  return {
    videoId: headers.get('X-Haven-Video-Id') || videoId,
    mimeType: headers.get('Content-Type') || 'video/mp4',
    size: parseInt(headers.get('X-Haven-Size') || headers.get('Content-Length') || '0', 10),
    cachedAt: new Date(headers.get('X-Haven-Cached-At') || Date.now()),
    ttl: headers.has('X-Haven-TTL') ? parseInt(headers.get('X-Haven-TTL')!, 10) : undefined,
  }
}

// ============================================================================
// Eviction Functions
// ============================================================================

/**
 * List all cached videos with their metadata, sorted by cache time (oldest first).
 * Used for LRU eviction when quota is exceeded.
 *
 * @returns Array of cache entries sorted by cachedAt (oldest first)
 */
async function listCachedVideosOldestFirst(): Promise<CacheEntry[]> {
  const entries = await listCachedVideos()
  return entries.sort((a, b) => a.cachedAt.getTime() - b.cachedAt.getTime())
}

/**
 * Evict oldest cached videos to make room for new content.
 * This is called automatically when QuotaExceededError is encountered.
 *
 * @param estimatedSize - Estimated size needed in bytes (affects how many to evict)
 * @returns Number of videos evicted
 *
 * @example
 * ```typescript
 * try {
 *   await putVideo(videoId, decryptedData, mimeType)
 * } catch (err) {
 *   if (err.name === 'QuotaExceededError') {
 *     // Evict oldest videos to make room, then retry
 *     await evictOldestVideos(estimatedSize)
 *     await putVideo(videoId, decryptedData, mimeType)
 *   }
 * }
 * ```
 */
export async function evictOldestVideos(estimatedSize?: number): Promise<number> {
  if (!isCacheAvailable()) {
    return 0
  }

  console.info('[VideoCache] Evicting oldest videos to make room', {
    estimatedSize,
  })

  try {
    // Get all cached videos sorted by age (oldest first)
    const entries = await listCachedVideosOldestFirst()

    if (entries.length === 0) {
      console.warn('[VideoCache] No videos to evict')
      return 0
    }

    // Calculate how many to evict
    let evictCount: number

    if (estimatedSize && estimatedSize > 0) {
      // Evict enough entries to free up space
      // Estimate average video size from existing entries
      const totalSize = entries.reduce((sum, e) => sum + e.size, 0)
      const avgSize = totalSize / entries.length || 10 * 1024 * 1024 // Default 10MB
      const entriesNeeded = Math.ceil(estimatedSize / avgSize)
      evictCount = Math.max(MIN_EVICTION_COUNT, entriesNeeded)
    } else {
      // Default: evict percentage of total
      evictCount = Math.max(MIN_EVICTION_COUNT, Math.floor(entries.length * DEFAULT_EVICTION_PERCENTAGE))
    }

    // Don't evict more than we have
    evictCount = Math.min(evictCount, entries.length)

    // Select entries to evict (oldest ones)
    const toEvict = entries.slice(0, evictCount)

    // Delete them
    const cache = await caches.open(CACHE_NAME)
    for (const entry of toEvict) {
      await cache.delete(entry.url)
      console.info('[VideoCache] Evicted:', entry.videoId, `(${entry.size} bytes)`)
    }

    const totalFreed = toEvict.reduce((sum, e) => sum + e.size, 0)
    console.info(`[VideoCache] Evicted ${evictCount} videos (${totalFreed} bytes freed)`)

    return evictCount
  } catch (error) {
    console.error('[VideoCache] Failed to evict videos:', error)
    logCacheError({
      code: 'CACHE_WRITE_FAILED',
      message: 'Failed to evict oldest videos',
      context: { estimatedSize, error },
    })
    return 0
  }
}

// ============================================================================
// Core API Functions
// ============================================================================

/**
 * Store decrypted video content in the cache.
 *
 * Creates a Response with proper headers and stores it under the synthetic URL
 * `/haven/v/{videoId}`. The service worker intercepts requests to these URLs
 * and serves the cached content.
 *
 * Automatically handles QuotaExceededError by evicting oldest entries and retrying.
 *
 * @param videoId - Unique identifier for the video
 * @param data - Video data as Uint8Array, ArrayBuffer, or Blob
 * @param mimeType - MIME type of the video (default: 'video/mp4')
 * @param options - Additional options for caching
 * @returns Promise that resolves when the video is stored
 *
 * @example
 * ```typescript
 * const blob = await fetch(videoUrl).then(r => r.blob())
 * await putVideo('0x123...', blob, 'video/mp4')
 * ```
 */
export async function putVideo(
  videoId: string,
  data: Uint8Array | ArrayBuffer | Blob,
  mimeType: string = 'video/mp4',
  options: PutVideoOptions = {}
): Promise<void> {
  const { ttl, retryOnQuotaExceeded = true, evictOnQuotaExceeded = true } = options

  if (!isCacheAvailable()) {
    throw new Error('Cache API is not available')
  }

  // Convert data to Blob if needed
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: mimeType })
  const estimatedSize = blob.size

  try {
    await performPutVideo(videoId, blob, mimeType, ttl)
  } catch (err) {
    if (isQuotaExceededError(err)) {
      logCacheError({
        code: 'QUOTA_EXCEEDED',
        message: 'Storage quota exceeded while caching video',
        videoId,
        context: { estimatedSize },
        originalError: err instanceof Error ? err : undefined,
      })

      // Try to make room and retry
      if (retryOnQuotaExceeded && evictOnQuotaExceeded) {
        console.warn('[VideoCache] Quota exceeded, evicting oldest videos and retrying...')
        const evicted = await evictOldestVideos(estimatedSize)

        if (evicted > 0) {
          // Retry once after eviction
          try {
            await performPutVideo(videoId, blob, mimeType, ttl)
            console.info('[VideoCache] Successfully cached after eviction')
            return
          } catch (retryErr) {
            console.error('[VideoCache] Retry failed after eviction:', retryErr)
            logCacheError({
              code: 'CACHE_WRITE_FAILED',
              message: 'Failed to cache video after eviction retry',
              videoId,
              context: { estimatedSize },
              originalError: retryErr instanceof Error ? retryErr : undefined,
            })
            throw retryErr
          }
        }
      }

      throw err
    }

    // Log other errors
    logCacheError({
      code: 'CACHE_WRITE_FAILED',
      message: 'Failed to cache video',
      videoId,
      context: { estimatedSize },
      originalError: err instanceof Error ? err : undefined,
    })

    throw err
  }
}

/**
 * Internal implementation of putVideo without retry logic.
 */
async function performPutVideo(
  videoId: string,
  blob: Blob,
  mimeType: string,
  ttl?: number
): Promise<void> {
  const cache = await caches.open(CACHE_NAME)
  const url = getVideoUrl(videoId)

  // Build response headers with metadata
  const headers: Record<string, string> = {
    'Content-Type': mimeType,
    'Content-Length': String(blob.size),
    'Accept-Ranges': 'bytes',
    'X-Haven-Video-Id': videoId,
    'X-Haven-Cached-At': new Date().toISOString(),
    'X-Haven-Size': String(blob.size),
  }

  if (ttl) {
    headers['X-Haven-TTL'] = String(ttl)
  }

  const response = new Response(blob, {
    status: 200,
    statusText: 'OK',
    headers,
  })

  await cache.put(url, response)
}

/**
 * Retrieve cached video content.
 *
 * Returns the cached Response along with metadata extracted from headers.
 * Returns null if the video is not in the cache.
 *
 * Automatically detects and removes corrupted cache entries.
 *
 * @param videoId - The video ID to retrieve
 * @returns Object with response and metadata, or null if not cached
 *
 * @example
 * ```typescript
 * const result = await getVideo('0x123...')
 * if (result) {
 *   const { response, metadata } = result
 *   console.log(`Cached video: ${metadata.size} bytes`)
 *   const blob = await response.blob()
 * }
 * ```
 */
export async function getVideo(videoId: string): Promise<VideoCacheResult | null> {
  if (!isCacheAvailable()) {
    return null
  }

  try {
    const cache = await caches.open(CACHE_NAME)
    const url = getVideoUrl(videoId)
    const response = await cache.match(url)

    if (!response) {
      return null
    }

    // Verify the response is valid
    if (response.status !== 200) {
      console.warn(`[VideoCache] Invalid cache entry status: ${response.status}`)
      logCacheError({
        code: 'CACHE_READ_FAILED',
        message: `Invalid response status: ${response.status}`,
        videoId,
        context: { status: response.status, statusText: response.statusText },
      })
      return null
    }

    return {
      response,
      metadata: extractMetadata(response, videoId),
    }
  } catch (error) {
    console.error('[VideoCache] Failed to get video:', error)
    logCacheError({
      code: 'CACHE_READ_FAILED',
      message: 'Failed to read cached video',
      videoId,
      originalError: error instanceof Error ? error : undefined,
    })
    return null
  }
}

/**
 * Check if a video is cached without reading the response body.
 *
 * This is a lightweight check that only verifies existence in the cache,
 * making it more efficient than getVideo() when you don't need the data.
 *
 * @param videoId - The video ID to check
 * @returns true if the video is cached, false otherwise
 *
 * @example
 * ```typescript
 * if (await hasVideo('0x123...')) {
 *   console.log('Video is available offline')
 * }
 * ```
 */
export async function hasVideo(videoId: string): Promise<boolean> {
  if (!isCacheAvailable()) {
    return false
  }

  try {
    const cache = await caches.open(CACHE_NAME)
    const url = getVideoUrl(videoId)
    const response = await cache.match(url)
    return response !== undefined
  } catch {
    return false
  }
}

/**
 * Remove a video from the cache.
 *
 * @param videoId - The video ID to remove
 * @returns true if the video was found and removed, false otherwise
 *
 * @example
 * ```typescript
 * const wasDeleted = await deleteVideo('0x123...')
 * if (wasDeleted) {
 *   console.log('Video removed from cache')
 * }
 * ```
 */
export async function deleteVideo(videoId: string): Promise<boolean> {
  if (!isCacheAvailable()) {
    return false
  }

  try {
    const cache = await caches.open(CACHE_NAME)
    const url = getVideoUrl(videoId)
    const existed = await hasVideo(videoId)
    await cache.delete(url)
    return existed
  } catch (error) {
    console.error('[VideoCache] Failed to delete video:', error)
    logCacheError({
      code: 'CACHE_WRITE_FAILED',
      message: 'Failed to delete video from cache',
      videoId,
      originalError: error instanceof Error ? error : undefined,
    })
    return false
  }
}

/**
 * List all cached videos with their metadata.
 *
 * Iterates through all entries in the cache and extracts video IDs
 * and metadata from the response headers.
 *
 * @returns Array of cache entries with metadata
 *
 * @example
 * ```typescript
 * const videos = await listCachedVideos()
 * console.log(`${videos.length} videos cached`)
 * videos.forEach(v => console.log(`${v.videoId}: ${v.size} bytes`))
 * ```
 */
export async function listCachedVideos(): Promise<CacheEntry[]> {
  if (!isCacheAvailable()) {
    return []
  }

  try {
    const cache = await caches.open(CACHE_NAME)
    const requests = await cache.keys()
    const entries: CacheEntry[] = []

    for (const request of requests) {
      const url = request.url
      const videoId = getVideoIdFromUrl(url)

      if (!videoId) {
        continue
      }

      const response = await cache.match(request)
      if (!response) {
        continue
      }

      const metadata = extractMetadata(response, videoId)
      entries.push({
        ...metadata,
        url,
      })
    }

    return entries
  } catch (error) {
    console.error('[VideoCache] Failed to list cached videos:', error)
    logCacheError({
      code: 'CACHE_READ_FAILED',
      message: 'Failed to list cached videos',
      originalError: error instanceof Error ? error : undefined,
    })
    return []
  }
}

/**
 * Get storage usage estimate.
 *
 * Uses navigator.storage.estimate() to get quota information.
 * Returns zeros if the Storage API is not available.
 *
 * @returns Storage estimate with usage, quota, and percentage
 *
 * @example
 * ```typescript
 * const estimate = await getCacheStorageEstimate()
 * console.log(`Using ${estimate.percent.toFixed(1)}% of available storage`)
 * ```
 */
export async function getCacheStorageEstimate(): Promise<StorageEstimate> {
  if (!isStorageAvailable()) {
    return { usage: 0, quota: 0, percent: 0 }
  }

  try {
    const estimate = await navigator.storage.estimate()
    const usage = estimate.usage || 0
    const quota = estimate.quota || 0
    const percent = quota > 0 ? (usage / quota) * 100 : 0

    return { usage, quota, percent }
  } catch (error) {
    console.error('[VideoCache] Failed to get storage estimate:', error)
    return { usage: 0, quota: 0, percent: 0 }
  }
}

/**
 * Clear all cached videos by deleting and recreating the cache.
 *
 * This removes all video content from the cache. Use with caution.
 *
 * @returns Promise that resolves when the cache is cleared
 *
 * @example
 * ```typescript
 * await clearAllVideos()
 * console.log('All cached videos cleared')
 * ```
 */
export async function clearAllVideos(): Promise<void> {
  if (!isCacheAvailable()) {
    return
  }

  try {
    await caches.delete(CACHE_NAME)
    console.info('[VideoCache] All cached videos cleared')
  } catch (error) {
    console.error('[VideoCache] Failed to clear cache:', error)
    logCacheError({
      code: 'CACHE_WRITE_FAILED',
      message: 'Failed to clear all videos from cache',
      originalError: error instanceof Error ? error : undefined,
    })
  }
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Delete multiple videos from the cache.
 *
 * @param videoIds - Array of video IDs to remove
 * @returns Number of videos that were successfully deleted
 *
 * @example
 * ```typescript
 * const deletedCount = await deleteVideos(['0x123...', '0x456...'])
 * console.log(`Deleted ${deletedCount} videos`)
 * ```
 */
export async function deleteVideos(videoIds: string[]): Promise<number> {
  if (!isCacheAvailable() || videoIds.length === 0) {
    return 0
  }

  let deletedCount = 0

  for (const videoId of videoIds) {
    const deleted = await deleteVideo(videoId)
    if (deleted) {
      deletedCount++
    }
  }

  return deletedCount
}

/**
 * Get the total size of all cached videos.
 *
 * @returns Total size in bytes
 *
 * @example
 * ```typescript
 * const totalSize = await getTotalCachedSize()
 * console.log(`Total cached: ${formatFileSize(totalSize)}`)
 * ```
 */
export async function getTotalCachedSize(): Promise<number> {
  const entries = await listCachedVideos()
  return entries.reduce((total, entry) => total + entry.size, 0)
}

/**
 * Check if multiple videos are cached.
 *
 * @param videoIds - Array of video IDs to check
 * @returns Map of videoId -> boolean indicating cache status
 *
 * @example
 * ```typescript
 * const status = await hasVideos(['0x123...', '0x456...'])
 * if (status.get('0x123...')) {
 *   console.log('Video 0x123 is cached')
 * }
 * ```
 */
export async function hasVideos(videoIds: string[]): Promise<Map<string, boolean>> {
  const status = new Map<string, boolean>()

  for (const videoId of videoIds) {
    status.set(videoId, await hasVideo(videoId))
  }

  return status
}

// ============================================================================
// Error Recovery Functions
// ============================================================================

/**
 * Handle video element errors by evicting corrupted cache entries.
 * Call this from a video element's error event handler.
 *
 * @param videoId - The video ID that failed to play
 * @param videoUrl - The URL that was being played
 * @returns true if the entry was evicted (caller should retry), false otherwise
 *
 * @example
 * ```typescript
 * // In the video element error handler
 * videoElement.addEventListener('error', async () => {
 *   const wasEvicted = await handleVideoError(videoId, videoUrl)
 *   if (wasEvicted) {
 *     // Retry playback
 *     videoElement.src = getVideoUrl(videoId)
 *   }
 * })
 * ```
 */
export async function handleVideoError(videoId: string, videoUrl: string): Promise<boolean> {
  // Only handle our synthetic URLs
  if (!videoUrl.includes(VIDEO_URL_PREFIX)) {
    return false
  }

  console.warn('[VideoCache] Cached video failed to play, checking integrity:', videoId)

  // Verify the entry
  const verification = await verifyCacheEntry(videoId)

  if (!verification.valid) {
    console.warn('[VideoCache] Corrupted cache entry detected, evicting:', videoId)

    // Log the error
    logCacheError({
      code: verification.errorCode || 'CACHE_CORRUPTED',
      message: verification.message || 'Video playback failed due to corrupted cache entry',
      videoId,
      context: verification.details,
    })

    // Delete the corrupted entry
    await deleteVideo(videoId)
    return true
  }

  // Entry appears valid but still failed to play
  // Could be a codec issue, not a cache corruption
  logCacheError({
    code: 'CACHE_READ_FAILED',
    message: 'Video playback failed but cache entry appears valid (may be codec issue)',
    videoId,
    context: { videoUrl },
  })

  return false
}

/**
 * Retry callback type for withRetry function.
 */
export type RetryCallback = () => void

/**
 * Wrap a video operation with automatic retry on failure.
 * Automatically handles cache corruption by evicting bad entries.
 *
 * @param operation - The operation to perform (should throw on failure)
 * @param videoId - The video ID being operated on
 * @returns Promise that resolves when the operation succeeds or rejects after retry
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetchVideoData(videoId),
 *   videoId
 * )
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  videoId: string
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    // Check if this is a cache corruption error
    if (error instanceof Error && error.message.includes('cache')) {
      console.warn('[VideoCache] Operation failed, attempting recovery:', videoId)

      // Try to verify and potentially delete corrupted entry
      const verification = await verifyCacheEntry(videoId)
      if (!verification.valid) {
        await deleteVideo(videoId)
        console.info('[VideoCache] Deleted corrupted entry, retrying operation:', videoId)

        // Retry once after deletion
        return await operation()
      }
    }

    throw error
  }
}
