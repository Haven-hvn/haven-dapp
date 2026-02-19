/**
 * Storage Persistence Service
 *
 * Manages persistent storage requests to prevent the browser from automatically
 * evicting cached video content under storage pressure. Uses the Storage API
 * to request and check persistence status.
 *
 * Browser Behavior:
 * - Chrome: Auto-grants if site is bookmarked, installed as PWA, or has push notifications
 * - Firefox: Shows a permission dialog to the user
 * - Safari: No API available, uses its own heuristics
 * - Edge: Same as Chrome
 *
 * @module lib/storage-persistence
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Storage_API
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Comprehensive storage information returned by getStorageDetails()
 */
export interface StorageDetails {
  /** Whether storage is persisted (won't be evicted under pressure) */
  isPersisted: boolean

  /** Whether the Storage API is supported in this browser */
  isSupported: boolean

  /** Bytes used by the origin */
  usage: number

  /** Bytes available to the origin (quota) */
  quota: number

  /** Percentage of quota used (0-100) */
  percentUsed: number

  /** Estimated available space in bytes (quota - usage) */
  estimatedAvailable: number
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if the Storage API persistence methods are available.
 * Returns false during SSR or in browsers that don't support the API (e.g., Safari).
 */
function isPersistenceSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    'persist' in navigator.storage &&
    'persisted' in navigator.storage
  )
}

// ============================================================================
// Core API Functions
// ============================================================================

/**
 * Request persistent storage from the browser.
 *
 * Once granted, the browser will not evict this origin's storage under
 * storage pressure. The storage survives browser restarts and can only
 * be cleared by the user explicitly (via browser settings or our UI).
 *
 * Chrome auto-grants if the site is engaged (bookmarked, PWA, etc.).
 * Firefox shows a permission dialog to the user.
 * Safari doesn't support this API and will always return false.
 *
 * @returns Promise<boolean> - true if persistence was granted or already active
 *
 * @example
 * ```typescript
 * const granted = await requestPersistentStorage()
 * if (granted) {
 *   console.log('Storage is now persistent')
 * } else {
 *   console.log('Storage may be evicted under pressure')
 * }
 * ```
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!isPersistenceSupported()) {
    console.info('[Storage] Persistent storage API not available')
    return false
  }

  try {
    // Check if already persisted
    const alreadyPersisted = await navigator.storage.persisted()
    if (alreadyPersisted) {
      console.info('[Storage] Storage is already persistent')
      return true
    }

    // Request persistence
    const granted = await navigator.storage.persist()

    if (granted) {
      console.info('[Storage] Persistent storage granted')
    } else {
      console.info('[Storage] Persistent storage denied — cache may be evicted by browser')
    }

    return granted
  } catch (error) {
    console.warn('[Storage] Error requesting persistent storage:', error)
    return false
  }
}

/**
 * Check if storage is already persisted.
 *
 * @returns Promise<boolean> - true if storage is persistent
 *
 * @example
 * ```typescript
 * const persisted = await isPersisted()
 * if (persisted) {
 *   console.log('Your cache is safe from browser cleanup')
 * }
 * ```
 */
export async function isPersisted(): Promise<boolean> {
  if (!isPersistenceSupported()) {
    return false
  }

  try {
    return await navigator.storage.persisted()
  } catch (error) {
    console.warn('[Storage] Error checking persistence status:', error)
    return false
  }
}

/**
 * Get comprehensive storage details including persistence status and usage.
 *
 * Returns detailed information about storage usage, quota, and persistence status.
 * Safe to call in any environment (SSR, unsupported browsers).
 *
 * @returns Promise<StorageDetails> - Comprehensive storage information
 *
 * @example
 * ```typescript
 * const details = await getStorageDetails()
 * console.log(`Using ${details.percentUsed.toFixed(1)}% of quota`)
 * console.log(`Persisted: ${details.isPersisted}`)
 * console.log(`Available: ${formatBytes(details.estimatedAvailable)}`)
 * ```
 */
export async function getStorageDetails(): Promise<StorageDetails> {
  const isSupported = isPersistenceSupported()

  let persisted = false
  let usage = 0
  let quota = 0

  if (typeof navigator !== 'undefined' && 'storage' in navigator) {
    // Check persistence status
    if ('persisted' in navigator.storage) {
      try {
        persisted = await navigator.storage.persisted()
      } catch {
        // Ignore errors - persistence check is optional
      }
    }

    // Get storage estimate
    if ('estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate()
        usage = estimate.usage || 0
        quota = estimate.quota || 0
      } catch {
        // Ignore errors - storage estimate is optional
      }
    }
  }

  const percentUsed = quota > 0 ? (usage / quota) * 100 : 0
  const estimatedAvailable = Math.max(0, quota - usage)

  return {
    isPersisted: persisted,
    isSupported,
    usage,
    quota,
    percentUsed,
    estimatedAvailable,
  }
}

/**
 * Request persistent storage silently (non-blocking).
 *
 * This is useful for auto-requesting persistence after first cache write
 * without blocking playback or showing errors to the user.
 *
 * @returns Promise<boolean> - true if persistence was granted or already active
 *
 * @example
 * ```typescript
 * // After successful video cache write
 * await requestPersistentStorageSilent()
 * ```
 */
export async function requestPersistentStorageSilent(): Promise<boolean> {
  try {
    return await requestPersistentStorage()
  } catch {
    // Silently fail - persistence is best-effort
    return false
  }
}
