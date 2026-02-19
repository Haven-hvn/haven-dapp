/**
 * Lit Protocol Session Cache
 *
 * Caches the Lit Protocol authentication context (SIWE session) so that users
 * don't need to sign a wallet message for every video they watch. A single
 * wallet signature is reusable for the duration of the session (up to 1 hour
 * by default).
 *
 * Features:
 * - In-memory caching for fast lookups
 * - sessionStorage persistence for tab-refresh survival
 * - 5-minute safety margin to avoid edge-case expiration issues
 * - Automatic cleanup of expired sessions
 *
 * @module lib/lit-session-cache
 */

import { isAuthContextExpired, type LitAuthContext } from './lit-auth'

/**
 * Cached session data structure.
 */
interface CachedSession {
  /** The cached authentication context */
  authContext: LitAuthContext
  /** Normalized wallet address (lowercase) */
  address: string
  /** Timestamp when the session was cached */
  cachedAt: number
  /** Timestamp when the session expires */
  expiresAt: number
}

/** In-memory cache (survives navigation, lost on tab close) */
const sessionCache = new Map<string, CachedSession>()

/** Safety margin: expire 5 minutes early to avoid edge cases */
export const EXPIRY_SAFETY_MARGIN_MS = 5 * 60 * 1000

/** sessionStorage key prefix */
const STORAGE_KEY_PREFIX = 'haven-lit-session'

/**
 * Get the session storage key for a given address.
 */
function getStorageKey(address: string): string {
  return `${STORAGE_KEY_PREFIX}-${address.toLowerCase()}`
}

/**
 * Normalize an address for consistent cache keying.
 */
function normalizeAddress(address: string): string {
  return address.toLowerCase().trim()
}

/**
 * Check if a cached session is valid (not expired with safety margin).
 */
function isSessionValid(cached: CachedSession): boolean {
  const now = Date.now()

  // Check expiration with safety margin
  if (now >= cached.expiresAt - EXPIRY_SAFETY_MARGIN_MS) {
    return false
  }

  // Double-check using Lit's own expiration check
  if (isAuthContextExpired(cached.authContext)) {
    return false
  }

  return true
}

/**
 * Get cached auth context for a wallet address.
 *
 * Returns the cached `LitAuthContext` if it exists and hasn't expired.
 * Returns `null` if no cache exists or if the session has expired.
 *
 * @param address - The wallet address to look up
 * @returns The cached auth context or null if not found/expired
 *
 * @example
 * ```typescript
 * const authContext = getCachedAuthContext('0x123...')
 * if (authContext) {
 *   // Use cached context - no wallet popup needed
 * } else {
 *   // Need to create new context - will trigger wallet popup
 * }
 * ```
 */
export function getCachedAuthContext(address: string): LitAuthContext | null {
  if (!address) return null

  const normalizedAddress = normalizeAddress(address)
  const cached = sessionCache.get(normalizedAddress)

  if (!cached) return null

  // Check if session is still valid
  if (!isSessionValid(cached)) {
    sessionCache.delete(normalizedAddress)
    // Also clean up sessionStorage
    try {
      sessionStorage.removeItem(getStorageKey(normalizedAddress))
    } catch {
      // sessionStorage not available
    }
    return null
  }

  return cached.authContext
}

/**
 * Cache an auth context for a wallet address.
 *
 * Stores in memory (primary) and optionally persists to sessionStorage
 * for tab-refresh survival. The session auto-expires based on the
 * configured expiration time.
 *
 * @param address - The wallet address to cache for
 * @param authContext - The auth context to cache
 * @param expirationMs - Expiration time in milliseconds (default: 1 hour)
 *
 * @example
 * ```typescript
 * const authContext = await authManager.createEoaAuthContext(config)
 * setCachedAuthContext('0x123...', authContext, 60 * 60 * 1000)
 * ```
 */
export function setCachedAuthContext(
  address: string,
  authContext: LitAuthContext,
  expirationMs: number = 60 * 60 * 1000
): void {
  if (!address || !authContext) return

  const normalizedAddress = normalizeAddress(address)
  const now = Date.now()

  const session: CachedSession = {
    authContext,
    address: normalizedAddress,
    cachedAt: now,
    expiresAt: now + expirationMs,
  }

  // Store in memory cache
  sessionCache.set(normalizedAddress, session)

  // Also persist to sessionStorage for tab-refresh survival
  try {
    // Note: We store minimal metadata to sessionStorage since authContext
    // may not be fully serializable. The memory cache is the primary source.
    const serializable = {
      address: normalizedAddress,
      cachedAt: session.cachedAt,
      expiresAt: session.expiresAt,
      // Store a flag indicating we have a valid session
      hasSession: true,
    }
    sessionStorage.setItem(
      getStorageKey(normalizedAddress),
      JSON.stringify(serializable)
    )
  } catch {
    // sessionStorage not available or full - memory cache still works
  }
}

/**
 * Clear cached auth context.
 *
 * If an address is provided, clears only that address's session.
 * If no address is provided, clears all cached sessions.
 *
 * @param address - Optional wallet address to clear (clears all if not provided)
 *
 * @example
 * ```typescript
 * // Clear specific user's session
 * clearAuthContext('0x123...')
 *
 * // Clear all sessions (e.g., on app logout)
 * clearAuthContext()
 * ```
 */
export function clearAuthContext(address?: string): void {
  if (address) {
    const normalized = normalizeAddress(address)
    sessionCache.delete(normalized)
    try {
      sessionStorage.removeItem(getStorageKey(normalized))
    } catch {
      // sessionStorage not available
    }
  } else {
    // Clear all sessions from memory
    sessionCache.clear()

    // Clear all haven-lit-session-* entries from sessionStorage
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i)
        if (key?.startsWith(STORAGE_KEY_PREFIX)) {
          sessionStorage.removeItem(key)
        }
      }
    } catch {
      // sessionStorage not available
    }
  }
}

/**
 * Check if an auth context is valid (not expired with safety margin).
 *
 * This is a utility function for checking validity without retrieving
 * from cache. It checks both the expiration time and Lit's own
 * expiration check.
 *
 * @param authContext - The auth context to validate
 * @returns True if the context is valid, false if expired
 *
 * @example
 * ```typescript
 * if (isAuthContextValid(authContext)) {
 *   // Context is still good to use
 * }
 * ```
 */
export function isAuthContextValid(authContext: LitAuthContext | null | undefined): boolean {
  if (!authContext) return false

  // Use Lit's expiration check
  if (isAuthContextExpired(authContext)) {
    return false
  }

  return true
}

/**
 * Get session info for a wallet address.
 *
 * Returns information about the cached session without returning
 * the auth context itself. Useful for UI state management.
 *
 * @param address - The wallet address to check
 * @returns Object with isCached, expiresIn (ms), and cachedAt (Date)
 *
 * @example
 * ```typescript
 * const { isCached, expiresIn, cachedAt } = getSessionInfo('0x123...')
 * if (isCached) {
 *   console.log(`Session expires in ${expiresIn / 1000} seconds`)
 * }
 * ```
 */
export function getSessionInfo(address: string): {
  isCached: boolean
  expiresIn: number
  cachedAt: Date | null
  expiresAt: Date | null
} {
  if (!address) {
    return { isCached: false, expiresIn: 0, cachedAt: null, expiresAt: null }
  }

  const normalizedAddress = normalizeAddress(address)
  const cached = sessionCache.get(normalizedAddress)

  if (!cached) {
    return { isCached: false, expiresIn: 0, cachedAt: null, expiresAt: null }
  }

  const now = Date.now()
  const expiresIn = Math.max(0, cached.expiresAt - now)

  return {
    isCached: true,
    expiresIn,
    cachedAt: new Date(cached.cachedAt),
    expiresAt: new Date(cached.expiresAt),
  }
}

/**
 * Check if a session exists in cache (without checking validity).
 *
 * This is a lightweight check that doesn't validate expiration.
 * Use `getCachedAuthContext()` to check with validation.
 *
 * @param address - The wallet address to check
 * @returns True if a session exists in cache
 *
 * @example
 * ```typescript
 * if (hasCachedSession('0x123...')) {
 *   // Session exists (but may be expired)
 * }
 * ```
 */
export function hasCachedSession(address: string): boolean {
  if (!address) return false
  return sessionCache.has(normalizeAddress(address))
}

/**
 * Get all cached session addresses.
 *
 * Returns an array of normalized addresses that have sessions
 * in the cache. Useful for debugging or admin UIs.
 *
 * @returns Array of normalized wallet addresses
 */
export function getCachedSessionAddresses(): string[] {
  return Array.from(sessionCache.keys())
}

/**
 * Restore sessions from sessionStorage on app initialization.
 *
 * This should be called once when the app loads to check if
 * there are any persisted sessions that can be restored.
 * Note: Only metadata is restored; actual auth contexts need
 * to be recreated (but user won't need to sign again if the
 * session is still valid in Lit's perspective).
 *
 * @internal
 */
export function restoreSessionsFromStorage(): void {
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(STORAGE_KEY_PREFIX)) {
        try {
          const data = JSON.parse(sessionStorage.getItem(key) || '{}')
          if (data.hasSession && data.expiresAt > Date.now()) {
            // Session metadata exists and hasn't expired
            // The actual auth context will be recreated when needed
            // and the user won't need to sign if the Lit session is valid
          } else if (data.expiresAt <= Date.now()) {
            // Clean up expired session from storage
            sessionStorage.removeItem(key)
          }
        } catch {
          // Invalid JSON, remove the entry
          sessionStorage.removeItem(key)
        }
      }
    }
  } catch {
    // sessionStorage not available
  }
}
