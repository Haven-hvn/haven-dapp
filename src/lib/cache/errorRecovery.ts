/**
 * Cache Error Recovery & Resilience
 *
 * Hardens the cache layer against real-world failure modes:
 * - Quota exceeded errors
 * - Storage eviction by browser
 * - Corrupted data
 * - Concurrent tab access
 * - Partial write failures
 *
 * Provides automatic recovery strategies so the cache self-heals
 * without user intervention.
 */

import type { CachedVideo, CacheErrorType, RecoveryResult } from '../../types/cache'
import {
  getCacheDB,
  closeCacheDB,
  deleteDatabase,
  getAllCachedVideos,
} from './db'

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Classify an error into a CacheErrorType for targeted recovery.
 */
export function classifyCacheError(error: unknown): CacheErrorType {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'QuotaExceededError':
        return 'QUOTA_EXCEEDED'
      case 'VersionError':
      case 'BlockedError':
        return 'DB_BLOCKED'
      case 'AbortError':
        return 'TRANSACTION_FAILED'
      case 'NotAllowedError':
      case 'SecurityError':
        return 'PERMISSION_DENIED'
      case 'DataError':
      case 'DataCloneError':
        return 'SERIALIZATION_ERROR'
      case 'InvalidStateError':
        return 'DB_CORRUPTED'
    }
  }

  if (error instanceof Error) {
    if (error.message.includes('quota')) return 'QUOTA_EXCEEDED'
    if (error.message.includes('blocked')) return 'DB_BLOCKED'
    if (error.message.includes('corrupt')) return 'DB_CORRUPTED'
  }

  return 'UNKNOWN'
}

// ============================================================================
// Main Recovery Router
// ============================================================================

/**
 * Attempt to recover from a cache error using the appropriate strategy.
 */
export async function recoverFromError(
  errorType: CacheErrorType,
  walletAddress: string
): Promise<RecoveryResult> {
  switch (errorType) {
    case 'QUOTA_EXCEEDED':
      return await handleQuotaExceeded(walletAddress)
    case 'DB_CORRUPTED':
      return await handleCorruption(walletAddress)
    case 'STORAGE_EVICTED':
      return await handleEviction(walletAddress)
    case 'DB_BLOCKED':
      return await handleBlocked(walletAddress)
    case 'PERMISSION_DENIED':
      return handlePermissionDenied()
    case 'TRANSACTION_FAILED':
      return {
        success: true,
        strategy: 'retry',
        message: 'Will retry on next operation',
      }
    default:
      return {
        success: false,
        strategy: 'none',
        message: 'No recovery strategy available',
      }
  }
}

// ============================================================================
// Quota Exceeded Recovery
// ============================================================================

/**
 * Handle quota exceeded by evicting least-recently-accessed entries.
 * Expired entries are evicted first.
 */
async function handleQuotaExceeded(walletAddress: string): Promise<RecoveryResult> {
  try {
    const db = await getCacheDB(walletAddress)
    const tx = db.transaction('videos', 'readwrite')
    const store = tx.objectStore('videos')

    // Get all videos
    const allVideos: CachedVideo[] = await new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result as CachedVideo[])
      request.onerror = () => reject(new Error('Failed to get videos for eviction'))
    })

    // Sort by lastAccessedAt (oldest first)
    allVideos.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)

    // Delete oldest 20% of entries
    const deleteCount = Math.max(1, Math.floor(allVideos.length * 0.2))

    // Prefer deleting expired entries first
    const expiredFirst = [
      ...allVideos.filter((v) => v.arkivEntityStatus === 'expired'),
      ...allVideos.filter((v) => v.arkivEntityStatus !== 'expired'),
    ].slice(0, deleteCount)

    // Delete selected videos
    for (const video of expiredFirst) {
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(video.id)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(new Error(`Failed to delete ${video.id}`))
      })
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(new Error('Eviction transaction failed'))
    })

    return {
      success: true,
      strategy: 'evict-lru',
      message: `Evicted ${deleteCount} least-recently-accessed entries to free space`,
    }
  } catch (error) {
    console.warn('[Cache] LRU eviction failed:', error)
    return {
      success: false,
      strategy: 'evict-lru',
      message: 'Failed to evict entries — storage may be critically full',
    }
  }
}

// ============================================================================
// Corruption Recovery
// ============================================================================

/**
 * Handle database corruption by removing invalid records.
 * Falls back to full reset if salvage fails.
 */
async function handleCorruption(walletAddress: string): Promise<RecoveryResult> {
  try {
    // Strategy 1: Try to salvage valid records
    const db = await getCacheDB(walletAddress)
    const tx = db.transaction('videos', 'readwrite')
    const store = tx.objectStore('videos')

    let removed = 0

    // Iterate through all records using cursor
    const cursorRequest = store.openCursor()

    await new Promise<void>((resolve, reject) => {
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (!cursor) {
          resolve()
          return
        }

        try {
          // Validate record structure
          const video = cursor.value as CachedVideo
          if (!isValidCachedVideo(video)) {
            cursor.delete()
            removed++
          }
        } catch {
          // Record is unreadable — delete it
          cursor.delete()
          removed++
        }

        cursor.continue()
      }

      cursorRequest.onerror = () => {
        reject(new Error('Cursor iteration failed during corruption check'))
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(new Error('Transaction failed during corruption recovery'))
    })

    if (removed > 0) {
      return {
        success: true,
        strategy: 'remove-corrupted',
        message: `Removed ${removed} corrupted record(s). Data will be re-fetched from Arkiv.`,
      }
    }

    // No corrupted records found - database is healthy
    return {
      success: true,
      strategy: 'remove-corrupted',
      message: 'No corrupted records found. Cache is healthy.',
    }
  } catch (error) {
    console.warn('[Cache] Corruption recovery failed:', error)
    // Strategy 2: If we can't even iterate, nuke and rebuild
    return await handleFullReset(walletAddress)
  }
}

/**
 * Nuclear option: Delete and recreate the entire database.
 */
async function handleFullReset(walletAddress: string): Promise<RecoveryResult> {
  try {
    closeCacheDB(walletAddress)
    await deleteDatabase(walletAddress)
    return {
      success: true,
      strategy: 'full-reset',
      message: 'Cache database reset. Data will be re-fetched from Arkiv.',
    }
  } catch (error) {
    console.error('[Cache] Full reset failed:', error)
    return {
      success: false,
      strategy: 'full-reset',
      message: 'Failed to reset cache database.',
    }
  }
}

// ============================================================================
// Storage Eviction Detection
// ============================================================================

/**
 * Detect and handle browser storage eviction.
 */
async function handleEviction(walletAddress: string): Promise<RecoveryResult> {
  try {
    // Check if our database still exists
    const databases = await indexedDB.databases()
    const dbName = `haven-cache-${walletAddress.toLowerCase()}`
    const exists = databases.some((db) => db.name === dbName)

    if (!exists) {
      // Database was evicted — re-create it
      closeCacheDB(walletAddress) // Clear stale connection
      await getCacheDB(walletAddress) // Re-create
      return {
        success: true,
        strategy: 'recreate',
        message: 'Cache was evicted by browser. Re-created empty cache.',
      }
    }

    // Database exists but may be empty
    const count = await getCacheCount(walletAddress)
    if (count === 0) {
      return {
        success: true,
        strategy: 'refill',
        message: 'Cache was emptied by browser. Will re-populate on next sync.',
      }
    }

    return { success: true, strategy: 'none', message: 'Cache appears intact.' }
  } catch (error) {
    console.warn('[Cache] Eviction detection failed:', error)
    return {
      success: false,
      strategy: 'eviction-check',
      message: 'Failed to check eviction status.',
    }
  }
}

// ============================================================================
// Database Blocked Recovery
// ============================================================================

/**
 * Handle database blocked errors (usually from version conflicts).
 */
async function handleBlocked(walletAddress: string): Promise<RecoveryResult> {
  try {
    // Close any existing connection and retry
    closeCacheDB(walletAddress)

    // Small delay to allow other tab to release
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Try to reconnect
    await getCacheDB(walletAddress)

    return {
      success: true,
      strategy: 'reconnect',
      message: 'Reconnected to cache database after block resolution.',
    }
  } catch (error) {
    console.warn('[Cache] Reconnect after block failed:', error)
    return {
      success: false,
      strategy: 'reconnect',
      message: 'Failed to reconnect after block. Please close other tabs.',
    }
  }
}

// ============================================================================
// Permission Denied Handler
// ============================================================================

/**
 * Handle permission denied errors (private browsing, etc.).
 */
function handlePermissionDenied(): RecoveryResult {
  return {
    success: false,
    strategy: 'fallback',
    message: 'Storage permission denied. Cache disabled — app will work with Arkiv directly.',
  }
}

// ============================================================================
// Data Validation
// ============================================================================

/**
 * Validate that an unknown object is a valid CachedVideo.
 * Checks all required fields and their types.
 */
export function isValidCachedVideo(data: unknown): data is CachedVideo {
  if (!data || typeof data !== 'object') return false

  const video = data as Record<string, unknown>

  // Check required fields
  if (typeof video.id !== 'string') return false
  if (typeof video.owner !== 'string') return false
  if (typeof video.title !== 'string') return false
  if (typeof video.duration !== 'number') return false
  if (typeof video.isEncrypted !== 'boolean') return false
  if (typeof video.cachedAt !== 'number') return false
  if (typeof video.lastSyncedAt !== 'number') return false
  if (typeof video.cacheVersion !== 'number') return false
  if (typeof video.lastAccessedAt !== 'number') return false

  // Check arkivEntityStatus
  if (!['active', 'expired', 'unknown'].includes(video.arkivEntityStatus as string))
    return false

  // Check isDirty
  if (typeof video.isDirty !== 'boolean') return false

  // Check videoCacheStatus
  if (!['not-cached', 'cached', 'stale'].includes(video.videoCacheStatus as string))
    return false

  // Check for NaN dates
  if (isNaN(video.cachedAt as number)) return false
  if (isNaN(video.lastSyncedAt as number)) return false
  if (isNaN(video.lastAccessedAt as number)) return false

  // Check required string fields are not empty
  if (!video.id || !video.owner) return false

  return true
}

// ============================================================================
// Storage Utilities
// ============================================================================

/**
 * Request persistent storage to prevent browser eviction.
 * Returns true if persistence was granted or already active.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false

  try {
    const isPersisted = await navigator.storage.persisted()
    if (isPersisted) return true

    // Request persistence (browser may show a prompt)
    const granted = await navigator.storage.persist()
    console.info(`[Cache] Persistent storage ${granted ? 'granted' : 'denied'}`)
    return granted
  } catch {
    return false
  }
}

/**
 * Get storage usage estimate from the browser.
 */
export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null

  try {
    const estimate = await navigator.storage.estimate()
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
    }
  } catch {
    return null
  }
}

/**
 * Get the number of cached videos for a wallet.
 */
async function getCacheCount(walletAddress: string): Promise<number> {
  try {
    const allVideos = await getAllCachedVideos(walletAddress)
    return allVideos.length
  } catch {
    return 0
  }
}

// ============================================================================
// Error Recovery Wrapper
// ============================================================================

/**
 * Execute a database operation with automatic error recovery.
 * If the operation fails, attempts recovery and retries once.
 *
 * @param operation - The database operation to execute
 * @param walletAddress - The wallet address for context
 * @param fallback - Value to return if operation fails after recovery
 * @returns Result of operation, or fallback if all recovery failed
 */
export async function withErrorRecovery<T>(
  operation: () => Promise<T>,
  walletAddress: string,
  fallback: T
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    const errorType = classifyCacheError(error)
    console.warn(`[Cache] Operation failed (${errorType}):`, error)

    // Attempt recovery
    const recovery = await recoverFromError(errorType, walletAddress)
    console.info(`[Cache] Recovery (${recovery.strategy}): ${recovery.message}`)

    if (recovery.success) {
      // Retry the operation once after recovery
      try {
        return await operation()
      } catch (retryError) {
        console.warn('[Cache] Retry after recovery failed:', retryError)
      }
    }

    // Return fallback value
    return fallback
  }
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize cache resilience features.
 * Call this once when the app starts.
 */
export async function initCacheResilience(): Promise<{
  persistentStorage: boolean
  storageEstimate: { usage: number; quota: number } | null
}> {
  // Request persistent storage
  const persistentStorage = await requestPersistentStorage()

  // Get storage estimate
  const storageEstimate = await getStorageEstimate()

  if (storageEstimate) {
    const percentUsed = storageEstimate.quota
      ? Math.round((storageEstimate.usage / storageEstimate.quota) * 100)
      : 0
    console.info(
      `[Cache] Storage: ${Math.round(storageEstimate.usage / 1024 / 1024)}MB / ${Math.round(storageEstimate.quota / 1024 / 1024)}MB (${percentUsed}%)`
    )
  }

  return { persistentStorage, storageEstimate }
}
