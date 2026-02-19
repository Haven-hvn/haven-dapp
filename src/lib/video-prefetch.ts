/**
 * Video Prefetch Service
 *
 * Intelligent prefetching that proactively caches videos the user is likely to
 * watch next, reducing perceived latency. Prefetches are triggered by:
 * - Hovering over a video card for >1 second
 * - Videos scrolling into view
 * - Watching a video (prefetch next in list)
 * - Manual "Cache for later" request
 *
 * Features:
 * - Queue-based processing with low priority
 * - Connection-aware (disabled on metered/slow connections)
 * - Storage quota awareness
 * - Cancellable prefetches
 * - Requires cached Lit session (no wallet popups)
 *
 * @module lib/video-prefetch
 * @see ./video-cache - Core cache operations
 * @see ./lit-session-cache - Session availability check
 * @see ./aes-key-cache - Key availability check
 */

import { hasVideo, putVideo, getCacheStorageEstimate } from './video-cache'
import { getCachedAuthContext, hasCachedSession } from './lit-session-cache'
import { hasCachedKey } from './aes-key-cache'
import { fetchFromIpfs } from '@/services/ipfsService'
import type { Video } from '@/types'

// ============================================================================
// Types
// ============================================================================

/**
 * Status of a prefetch item in the queue.
 */
export type PrefetchStatus =
  | 'queued'
  | 'fetching'
  | 'decrypting'
  | 'complete'
  | 'failed'
  | 'cancelled'

/**
 * A single item in the prefetch queue.
 */
export interface PrefetchItem {
  /** The video to prefetch */
  video: Video
  /** Priority - lower = higher priority */
  priority: number
  /** Current status */
  status: PrefetchStatus
  /** AbortController for cancellation */
  abortController: AbortController
  /** When the item was added to queue */
  addedAt: number
  /** Error message if failed */
  error?: string
  /** When the prefetch completed/failed */
  completedAt?: number
}

/**
 * Prefetch queue status summary.
 */
export interface PrefetchQueueStatus {
  /** Items waiting to be processed */
  queued: PrefetchItem[]
  /** Items currently being prefetched */
  inProgress: PrefetchItem[]
  /** Items that completed successfully */
  completed: PrefetchItem[]
  /** Items that failed */
  failed: PrefetchItem[]
  /** Total items in queue (all statuses) */
  total: number
  /** Whether prefetching is globally enabled */
  isEnabled: boolean
  /** Whether a prefetch is currently running */
  isProcessing: boolean
}

/**
 * Connection information from Network Information API.
 */
interface ConnectionInfo {
  /** Connection type (wifi, cellular, etc) */
  type?: string
  /** Effective connection type (4g, 3g, 2g, slow-2g) */
  effectiveType?: string
  /** Estimated downlink speed in Mbps */
  downlink?: number
  /** Whether data saver mode is enabled */
  saveData?: boolean
}

// ============================================================================
// Configuration
// ============================================================================

/** Maximum number of concurrent prefetches */
const MAX_CONCURRENT = 1

/** Maximum queue size to prevent memory issues */
const MAX_QUEUE_SIZE = 5

/** Storage threshold - don't prefetch if storage > 70% full */
const STORAGE_THRESHOLD = 0.7

/** Default priority increment (FIFO ordering) */
const DEFAULT_PRIORITY = 1

// ============================================================================
// State
// ============================================================================

/** The prefetch queue - keyed by video ID */
const prefetchQueue: Map<string, PrefetchItem> = new Map()

/** Whether prefetching is globally enabled */
let isEnabled = true

/** Whether the queue processor is currently running */
let isProcessing = false

/** Current wallet address for session checks (set by the app) */
let currentWalletAddress: string | null = null

// ============================================================================
// Configuration Functions
// ============================================================================

/**
 * Set the current wallet address for session validation.
 * This should be called when the wallet connects/disconnects.
 *
 * @param address - The wallet address or null if disconnected
 *
 * @example
 * ```typescript
 * // On wallet connect
 * setPrefetchWalletAddress('0x123...')
 *
 * // On wallet disconnect
 * setPrefetchWalletAddress(null)
 * ```
 */
export function setPrefetchWalletAddress(address: string | null): void {
  currentWalletAddress = address ? address.toLowerCase() : null
}

/**
 * Get the current wallet address for prefetch session checks.
 *
 * @returns The current wallet address or null
 */
export function getPrefetchWalletAddress(): string | null {
  return currentWalletAddress
}

/**
 * Enable or disable prefetching globally.
 * When disabled, all pending prefetches are cancelled.
 *
 * @param enabled - Whether to enable prefetching
 *
 * @example
 * ```typescript
 * // Disable prefetching (e.g., user preference)
 * setPrefetchEnabled(false)
 *
 * // Re-enable
 * setPrefetchEnabled(true)
 * ```
 */
export function setPrefetchEnabled(enabled: boolean): void {
  isEnabled = enabled

  if (!enabled) {
    // Cancel all pending prefetches
    for (const [id, item] of prefetchQueue) {
      if (item.status === 'queued' || item.status === 'fetching' || item.status === 'decrypting') {
        item.abortController.abort()
        item.status = 'cancelled'
        item.completedAt = Date.now()
      }
    }
  }
}

/**
 * Check if prefetching is globally enabled.
 *
 * @returns True if prefetching is enabled
 */
export function isPrefetchEnabled(): boolean {
  return isEnabled
}

// ============================================================================
// Connection Awareness
// ============================================================================

/**
 * Get connection information from the Network Information API.
 *
 * @returns ConnectionInfo object or null if API not available
 */
function getConnectionInfo(): ConnectionInfo | null {
  if (typeof navigator === 'undefined') return null

  const connection = (navigator as any).connection
  if (!connection) return null

  return {
    type: connection.type,
    effectiveType: connection.effectiveType,
    downlink: connection.downlink,
    saveData: connection.saveData,
  }
}

/**
 * Check if the current connection conditions allow prefetching.
 * Returns false on metered, slow, or data-saver connections.
 *
 * @returns True if prefetching should be allowed
 */
export function shouldPrefetchBasedOnConnection(): boolean {
  if (!isEnabled) return false

  const connection = getConnectionInfo()
  if (!connection) {
    // Network Information API not available - assume OK
    return true
  }

  // Don't prefetch if data saver is enabled
  if (connection.saveData) {
    return false
  }

  // Don't prefetch on slow connections
  if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
    return false
  }

  // Be cautious on 3g connections
  if (connection.effectiveType === '3g') {
    // Allow only if downlink is decent (>1 Mbps)
    if (!connection.downlink || connection.downlink < 1) {
      return false
    }
  }

  // Don't prefetch on cellular if downlink is poor
  if (connection.type === 'cellular' && connection.downlink && connection.downlink < 5) {
    return false
  }

  return true
}

/**
 * Check if the battery status allows prefetching.
 * Returns false if battery is low.
 *
 * @returns Promise resolving to true if prefetching should be allowed
 */
export async function shouldPrefetchBasedOnBattery(): Promise<boolean> {
  if (typeof navigator === 'undefined') return true

  // Battery API is deprecated but still useful where available
  const battery = (navigator as any).getBattery
  if (typeof battery !== 'function') {
    // Battery API not available - assume OK
    return true
  }

  try {
    const batteryManager = await battery()
    // Don't prefetch if battery is below 20% and not charging
    if (batteryManager.level < 0.2 && !batteryManager.charging) {
      return false
    }
    return true
  } catch {
    // If battery check fails, allow prefetching
    return true
  }
}

/**
 * Comprehensive check if prefetching should proceed.
 * Checks connection, battery, storage, and enabled status.
 *
 * @returns Promise resolving to true if all conditions allow prefetching
 */
export async function shouldPrefetch(): Promise<boolean> {
  if (!isEnabled) return false
  if (!shouldPrefetchBasedOnConnection()) return false
  if (!(await shouldPrefetchBasedOnBattery())) return false

  // Check storage quota
  const estimate = await getCacheStorageEstimate()
  if (estimate.percent > STORAGE_THRESHOLD * 100) {
    return false
  }

  return true
}

// ============================================================================
// Queue Management
// ============================================================================

/**
 * Queue a video for background prefetching.
 *
 * Checks:
 * - Prefetch is enabled
 * - Not already cached
 * - Not already queued
 * - Queue not full
 * - Storage quota available
 * - Video is encrypted (non-encrypted videos don't need prefetch)
 *
 * The actual session check happens at process time, not queue time.
 *
 * @param video - The video to prefetch
 * @param priority - Optional priority (lower = higher priority, default: FIFO)
 * @returns True if video was queued, false otherwise
 *
 * @example
 * ```typescript
 * // Queue a video for prefetching
 * const queued = await prefetchVideo(video)
 * if (queued) {
 *   console.log('Video queued for prefetch')
 * }
 * ```
 */
export async function prefetchVideo(video: Video, priority?: number): Promise<boolean> {
  // Check if prefetching is enabled
  if (!isEnabled) return false

  // Non-encrypted videos don't need prefetch (they can stream directly)
  if (!video.isEncrypted) return false

  // Check if already queued
  if (prefetchQueue.has(video.id)) {
    return false
  }

  // Check queue size
  if (prefetchQueue.size >= MAX_QUEUE_SIZE) {
    return false
  }

  // Check if already cached
  try {
    const cached = await hasVideo(video.id)
    if (cached) return false
  } catch {
    // If cache check fails, proceed with caution
  }

  // Check storage quota
  try {
    const estimate = await getCacheStorageEstimate()
    if (estimate.percent > STORAGE_THRESHOLD * 100) {
      return false
    }
  } catch {
    // If storage check fails, proceed with caution
  }

  // Add to queue
  prefetchQueue.set(video.id, {
    video,
    priority: priority ?? Date.now(),
    status: 'queued',
    abortController: new AbortController(),
    addedAt: Date.now(),
  })

  // Start processing
  processQueue()

  return true
}

/**
 * Cancel a pending or in-progress prefetch.
 *
 * @param videoId - The ID of the video to cancel prefetching for
 * @returns True if an item was cancelled, false if not found
 *
 * @example
 * ```typescript
 * // Cancel prefetch when user leaves the page
 * cancelPrefetch(video.id)
 * ```
 */
export function cancelPrefetch(videoId: string): boolean {
  const item = prefetchQueue.get(videoId)
  if (!item) return false

  // Abort the operation
  item.abortController.abort()

  // Update status
  if (item.status === 'queued' || item.status === 'fetching' || item.status === 'decrypting') {
    item.status = 'cancelled'
    item.completedAt = Date.now()
    return true
  }

  return false
}

/**
 * Cancel all pending prefetches (queued but not started).
 * In-progress prefetches are not cancelled.
 *
 * @returns Number of prefetches cancelled
 */
export function cancelAllPendingPrefetches(): number {
  let cancelled = 0

  for (const [id, item] of prefetchQueue) {
    if (item.status === 'queued') {
      item.abortController.abort()
      item.status = 'cancelled'
      item.completedAt = Date.now()
      cancelled++
    }
  }

  return cancelled
}

/**
 * Check if a video is currently queued for prefetch.
 *
 * @param videoId - The video ID to check
 * @returns True if the video is in the queue (any status)
 */
export function isPrefetchQueued(videoId: string): boolean {
  return prefetchQueue.has(videoId)
}

/**
 * Get the current status of a prefetch item.
 *
 * @param videoId - The video ID to check
 * @returns The PrefetchItem or undefined if not in queue
 */
export function getPrefetchStatus(videoId: string): PrefetchItem | undefined {
  return prefetchQueue.get(videoId)
}

/**
 * Get the current prefetch queue status.
 *
 * @returns PrefetchQueueStatus with all queue items organized by status
 *
 * @example
 * ```typescript
 * const status = getPrefetchQueue()
 * console.log(`${status.queued.length} videos queued`)
 * console.log(`${status.inProgress.length} videos being prefetched`)
 * ```
 */
export function getPrefetchQueue(): PrefetchQueueStatus {
  const all = Array.from(prefetchQueue.values())

  return {
    queued: all.filter(item => item.status === 'queued'),
    inProgress: all.filter(item => item.status === 'fetching' || item.status === 'decrypting'),
    completed: all.filter(item => item.status === 'complete'),
    failed: all.filter(item => item.status === 'failed'),
    total: all.length,
    isEnabled,
    isProcessing,
  }
}

/**
 * Clear completed and cancelled items from the queue.
 * Call this periodically to prevent memory leaks.
 *
 * @returns Number of items cleared
 */
export function clearCompletedPrefetches(): number {
  let cleared = 0

  for (const [id, item] of prefetchQueue) {
    if (item.status === 'complete' || item.status === 'cancelled') {
      prefetchQueue.delete(id)
      cleared++
    }
  }

  return cleared
}

/**
 * Clear all items from the queue.
 * Cancels any in-progress prefetches.
 *
 * @returns Number of items cleared
 */
export function clearAllPrefetches(): number {
  // Cancel all in-progress items
  for (const [id, item] of prefetchQueue) {
    if (item.status === 'fetching' || item.status === 'decrypting') {
      item.abortController.abort()
    }
  }

  const count = prefetchQueue.size
  prefetchQueue.clear()
  return count
}

// ============================================================================
// Queue Processing
// ============================================================================

/**
 * Process the prefetch queue.
 * Runs prefetches one at a time (low priority) to avoid interfering
 * with active video playback.
 */
async function processQueue(): Promise<void> {
  if (isProcessing) return
  if (!isEnabled) return

  isProcessing = true

  try {
    while (prefetchQueue.size > 0) {
      // Check if we should continue
      if (!(await shouldPrefetch())) {
        break
      }

      // Find next queued item (sorted by priority)
      const next = Array.from(prefetchQueue.values())
        .filter(item => item.status === 'queued')
        .sort((a, b) => a.priority - b.priority)[0]

      if (!next) break

      // Check if we have a Lit session (don't trigger wallet popup)
      if (currentWalletAddress) {
        const hasSession = hasCachedSession(currentWalletAddress)
        if (!hasSession) {
          // Skip this item but keep it in queue for later
          // Mark it as low priority so other items can be processed
          next.priority += 1000000 // Move to end of queue
          continue
        }
      } else {
        // No wallet connected - skip all encrypted videos
        // They'll be processed when wallet connects
        break
      }

      // Check if already cached (might have been cached by another operation)
      const cached = await hasVideo(next.video.id)
      if (cached) {
        next.status = 'complete'
        next.completedAt = Date.now()
        continue
      }

      // Process the prefetch
      try {
        await executePrefetch(next)
        next.status = 'complete'
        next.completedAt = Date.now()
      } catch (err) {
        if (next.abortController.signal.aborted) {
          next.status = 'cancelled'
        } else {
          next.status = 'failed'
          next.error = err instanceof Error ? err.message : 'Prefetch failed'
        }
        next.completedAt = Date.now()
      }

      // Clean up completed/failed/cancelled items occasionally
      if (prefetchQueue.size > MAX_QUEUE_SIZE) {
        clearCompletedPrefetches()
      }
    }
  } finally {
    isProcessing = false
  }
}

/**
 * Execute a prefetch operation.
 * Fetches the encrypted video, decrypts it, and caches the result.
 *
 * This function uses a simplified version of the useVideoCache pipeline
 * but with lower priority and abort signal support.
 *
 * @param item - The prefetch item to process
 */
async function executePrefetch(item: PrefetchItem): Promise<void> {
  const { video, abortController } = item
  const signal = abortController.signal

  // Check for abort before starting
  if (signal.aborted) {
    throw new Error('Prefetch cancelled')
  }

  // Update status
  item.status = 'fetching'

  // Get the CID to fetch
  const cid = video.encryptedCid || video.filecoinCid
  if (!cid) {
    throw new Error('No CID available for video')
  }

  // Fetch the encrypted data
  const fetchResult = await fetchFromIpfs(cid, {
    abortSignal: signal,
  })

  if (signal.aborted) {
    throw new Error('Prefetch cancelled')
  }

  // For non-encrypted videos, just cache directly
  if (!video.isEncrypted) {
    const mimeType = 'video/mp4'
    await putVideo(video.id, fetchResult.data, mimeType)
    return
  }

  // For encrypted videos, we need to decrypt
  // Check if we have the key cached first
  const hasKey = video.litEncryptionMetadata?.keyHash
    ? hasCachedKey(video.litEncryptionMetadata.keyHash)
    : false

  if (!hasKey) {
    // We don't have the key cached - this would require Lit authentication
    // which we don't want to trigger during prefetch
    // Mark this as failed but don't throw - it's expected behavior
    throw new Error('AES key not cached - skipping prefetch to avoid wallet popup')
  }

  // We have the key cached, proceed with decryption
  item.status = 'decrypting'

  // Import crypto functions dynamically to avoid circular dependencies
  const { aesDecryptToCache, base64ToUint8Array } = await import('./crypto')

  if (signal.aborted) {
    throw new Error('Prefetch cancelled')
  }

  // Get the cached key
  const keyHash = video.litEncryptionMetadata?.keyHash
  if (!keyHash) {
    throw new Error('No key hash in encryption metadata')
  }

  const cachedKeyResult = await import('./aes-key-cache').then(m => m.getCachedKey(keyHash))
  if (!cachedKeyResult) {
    throw new Error('Cached key not found')
  }

  if (signal.aborted) {
    throw new Error('Prefetch cancelled')
  }

  // Decrypt and cache
  const iv = base64ToUint8Array(video.litEncryptionMetadata!.iv)
  const mimeType = video.litEncryptionMetadata!.originalMimeType || 'video/mp4'

  await aesDecryptToCache(
    fetchResult.data,
    cachedKeyResult.key,
    iv,
    video.id,
    mimeType
  )
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get prefetch statistics.
 *
 * @returns Object with prefetch statistics
 */
export function getPrefetchStats(): {
  totalQueued: number
  inProgress: number
  completed: number
  failed: number
  isEnabled: boolean
  isProcessing: boolean
} {
  const queue = getPrefetchQueue()
  return {
    totalQueued: queue.queued.length,
    inProgress: queue.inProgress.length,
    completed: queue.completed.length,
    failed: queue.failed.length,
    isEnabled,
    isProcessing,
  }
}

/**
 * Prefetch multiple videos in batch.
 * Videos are added to the queue with priorities based on their order.
 *
 * @param videos - Array of videos to prefetch
 * @param startPriority - Starting priority (default: 1)
 * @returns Number of videos queued
 */
export async function prefetchVideos(
  videos: Video[],
  startPriority: number = 1
): Promise<number> {
  let queued = 0

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i]
    const priority = startPriority + i * DEFAULT_PRIORITY
    const wasQueued = await prefetchVideo(video, priority)
    if (wasQueued) queued++
  }

  return queued
}

/**
 * Prefetch the next videos in a list after the currently playing one.
 * Useful for sequential playback scenarios.
 *
 * @param currentVideoId - The ID of the currently playing video
 * @param allVideos - Array of all videos in the playlist
 * @param count - Number of videos to prefetch (default: 1)
 * @returns Number of videos queued
 */
export async function prefetchNextVideos(
  currentVideoId: string,
  allVideos: Video[],
  count: number = 1
): Promise<number> {
  // Find the current video index
  const currentIndex = allVideos.findIndex(v => v.id === currentVideoId)
  if (currentIndex === -1) return 0

  // Get the next videos
  const nextVideos = allVideos.slice(currentIndex + 1, currentIndex + 1 + count)

  // Queue them with priority based on position
  return prefetchVideos(nextVideos, 1)
}
