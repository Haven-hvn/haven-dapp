/**
 * Per-Video AES Key Cache
 *
 * Caches decrypted AES keys in memory so that if a video needs to be re-decrypted
 * (e.g., cache eviction, corruption), the expensive Lit Protocol BLS-IBE key
 * decryption can be skipped entirely.
 *
 * Security considerations:
 * - Keys are stored in-memory only (never persisted to disk)
 * - Keys are cleared on wallet disconnect and page unload
 * - Keys are zero-filled before removal from cache
 * - Copies are stored (not references) to prevent external mutation
 *
 * @module lib/aes-key-cache
 */

import { secureCopy, secureClear } from './crypto'

// ============================================================================
// Types
// ============================================================================

/**
 * Cached key entry with metadata.
 */
interface CachedKey {
  /** The video ID this key belongs to */
  videoId: string

  /** The AES key (32 bytes for AES-256) */
  key: Uint8Array

  /** The IV (12 bytes for AES-GCM) */
  iv: Uint8Array

  /** Timestamp when the key was cached */
  cachedAt: number

  /** Timestamp when the key expires */
  expiresAt: number
}

/**
 * Result of getting a cached key.
 */
export interface CachedKeyResult {
  /** The AES key copy */
  key: Uint8Array

  /** The IV copy */
  iv: Uint8Array
}

/**
 * Cache statistics.
 */
export interface KeyCacheStats {
  /** Number of cached keys */
  count: number

  /** Total memory used in bytes (approximate) */
  totalKeyBytes: number

  /** List of cached video IDs */
  videoIds: string[]
}

// ============================================================================
// Configuration
// ============================================================================

/** Default TTL: 1 hour (same as Lit session) */
export const DEFAULT_KEY_TTL = 60 * 60 * 1000

/** Extended tab hidden threshold: 30 minutes */
const TAB_HIDDEN_THRESHOLD = 30 * 60 * 1000

// ============================================================================
// In-Memory Cache
// ============================================================================

/** In-memory only — never persisted to disk */
const keyCache = new Map<string, CachedKey>()

/** Track when tab was hidden for defense-in-depth cleanup */
let hiddenSince: number | null = null

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get cached AES key for a video.
 *
 * Returns a copy of the cached key and IV. Returns null if:
 * - No key is cached for the video
 * - The cached key has expired
 *
 * @param videoId - The unique video identifier
 * @returns Cached key result or null if not found/expired
 *
 * @example
 * ```typescript
 * const cached = getCachedKey('video-123')
 * if (cached) {
 *   // Use cached.key and cached.iv for decryption
 *   // No need to contact Lit nodes!
 * }
 * ```
 */
export function getCachedKey(videoId: string): CachedKeyResult | null {
  if (!videoId) return null

  const cached = keyCache.get(videoId)

  if (!cached) return null

  // Check expiration
  if (Date.now() >= cached.expiresAt) {
    clearKey(videoId)
    return null
  }

  // Return copies (caller may zero-fill their copy after use)
  return {
    key: secureCopy(cached.key),
    iv: secureCopy(cached.iv),
  }
}

/**
 * Cache an AES key for a video.
 *
 * Stores a secure copy of the key and IV. If a key already exists
 * for this video, it is securely cleared before storing the new one.
 *
 * @param videoId - The unique video identifier
 * @param key - The AES key to cache
 * @param iv - The IV to cache
 * @param ttl - Time to live in milliseconds (default: 1 hour)
 *
 * @example
 * ```typescript
 * const aesKey = await decryptKeyViaLit(...) // expensive!
 * const iv = base64ToUint8Array(metadata.iv)
 * setCachedKey('video-123', aesKey, iv)
 * // Next time, getCachedKey('video-123') will return without Lit contact
 * ```
 */
export function setCachedKey(
  videoId: string,
  key: Uint8Array,
  iv: Uint8Array,
  ttl: number = DEFAULT_KEY_TTL
): void {
  if (!videoId || !key || !iv) return

  // Clear existing entry if present (securely)
  if (keyCache.has(videoId)) {
    clearKey(videoId)
  }

  const now = Date.now()

  // Store copies (not references)
  keyCache.set(videoId, {
    videoId,
    key: secureCopy(key),
    iv: secureCopy(iv),
    cachedAt: now,
    expiresAt: now + ttl,
  })
}

/**
 * Remove a specific key from cache.
 *
 * The key and IV are zero-filled before removal for security.
 *
 * @param videoId - The video ID to clear
 *
 * @example
 * ```typescript
 * clearKey('video-123') // Securely removes and zero-fills the key
 * ```
 */
export function clearKey(videoId: string): void {
  if (!videoId) return

  const cached = keyCache.get(videoId)
  if (cached) {
    // Zero-fill before removing (security)
    secureClear(cached.key)
    secureClear(cached.iv)
    keyCache.delete(videoId)
  }
}

/**
 * Remove all cached keys.
 *
 * All keys and IVs are zero-filled before removal for security.
 * This should be called on wallet disconnect and page unload.
 *
 * @example
 * ```typescript
 * // On wallet disconnect
 * clearAllKeys()
 *
 * // On page unload
 * window.addEventListener('beforeunload', () => {
 *   clearAllKeys()
 * })
 * ```
 */
export function clearAllKeys(): void {
  for (const [videoId] of keyCache) {
    clearKey(videoId)
  }
}

/**
 * Get cache statistics.
 *
 * Returns information about the current state of the key cache
 * without exposing the actual keys.
 *
 * @returns Cache statistics including count and memory usage
 *
 * @example
 * ```typescript
 * const stats = getKeyStats()
 * console.log(`Cached keys: ${stats.count}`)
 * console.log(`Memory used: ${stats.totalKeyBytes} bytes`)
 * ```
 */
export function getKeyStats(): KeyCacheStats {
  const videoIds: string[] = []
  let totalKeyBytes = 0

  for (const [id, cached] of keyCache) {
    videoIds.push(id)
    totalKeyBytes += cached.key.byteLength + cached.iv.byteLength
  }

  return {
    count: keyCache.size,
    totalKeyBytes,
    videoIds,
  }
}

/**
 * Check if a key is cached (without retrieving it).
 *
 * This is a lightweight check that doesn't copy the key.
 *
 * @param videoId - The video ID to check
 * @returns True if a valid (non-expired) key exists in cache
 *
 * @example
 * ```typescript
 * if (hasCachedKey('video-123')) {
 *   // Key exists and hasn't expired
 * }
 * ```
 */
export function hasCachedKey(videoId: string): boolean {
  if (!videoId) return false

  const cached = keyCache.get(videoId)
  if (!cached) return false

  // Check if expired
  if (Date.now() >= cached.expiresAt) {
    clearKey(videoId)
    return false
  }

  return true
}

/**
 * Get the number of cached keys.
 *
 * @returns Count of cached keys
 */
export function getCachedKeyCount(): number {
  return keyCache.size
}

// ============================================================================
// Browser Event Handlers
// ============================================================================

/**
 * Register cleanup handlers for browser events.
 *
 * This function sets up:
 * - beforeunload: Clear all keys when page is unloaded
 * - visibilitychange: Clear keys if tab hidden for extended period
 *
 * This is called automatically when the module loads in a browser environment.
 */
function registerCleanupHandlers(): void {
  if (typeof window === 'undefined') return

  // Clear all keys on page unload
  window.addEventListener('beforeunload', () => {
    clearAllKeys()
  })

  // Defense-in-depth: Clear keys if tab hidden for extended period
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenSince = Date.now()
    } else if (hiddenSince) {
      // If tab was hidden for more than threshold, clear keys
      if (Date.now() - hiddenSince > TAB_HIDDEN_THRESHOLD) {
        clearAllKeys()
      }
      hiddenSince = null
    }
  })
}

// Register handlers immediately if in browser
if (typeof window !== 'undefined') {
  registerCleanupHandlers()
}

// ============================================================================
// Integration Helpers
// ============================================================================

/**
 * Extract video ID from Lit encryption metadata.
 *
 * The video ID can come from:
 * - metadata.keyHash (unique identifier for the encrypted key)
 * - Or derived from the encrypted key itself
 *
 * @param metadata - Lit encryption metadata
 * @returns A unique identifier for the video/key combination
 */
export function getVideoIdFromMetadata(metadata: {
  keyHash?: string
  encryptedKey?: string
}): string | null {
  // Use keyHash as the primary identifier (it's already a hash of the key)
  if (metadata.keyHash) {
    return metadata.keyHash
  }

  // Fallback: use first 32 chars of encrypted key
  if (metadata.encryptedKey) {
    return metadata.encryptedKey.slice(0, 32)
  }

  return null
}
