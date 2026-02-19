/**
 * Security Cleanup Coordinator
 *
 * Centralized cleanup of all cached sensitive data when a user disconnects
 * their wallet, switches accounts, or when security-relevant events occur.
 * Ensures that cached sessions, keys, and optionally video content are
 * properly cleaned up.
 *
 * Security considerations:
 * - Lit session cache (SIWE auth context) is tied to a specific wallet address
 * - AES keys were decrypted using that wallet's access permissions
 * - Cached videos may need clearing if decrypted under different wallet's permissions
 *
 * @module lib/security-cleanup
 */

import { clearAuthContext } from './lit-session-cache'
import { clearAllKeys } from './aes-key-cache'
import { clearAllVideos } from './video-cache'
import { clearAllStaging } from './opfs'

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for cleanup behavior.
 */
export interface CleanupOptions {
  /** Whether to clear cached videos on wallet disconnect. Default: false */
  clearVideosOnDisconnect: boolean

  /** Whether to clear cached videos on account change. Default: false */
  clearVideosOnAccountChange: boolean
}

/**
 * Result of a full security clear operation.
 */
export interface SecurityClearResult {
  /** Whether Lit sessions were cleared */
  sessionsCleared: boolean
  /** Whether AES keys were cleared */
  keysCleared: boolean
  /** Whether video cache was cleared */
  videosCleared: boolean
  /** Whether OPFS staging was cleared */
  stagingCleared: boolean
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_OPTIONS: CleanupOptions = {
  clearVideosOnDisconnect: false,
  clearVideosOnAccountChange: false,
}

let options: CleanupOptions = { ...DEFAULT_OPTIONS }

// ============================================================================
// Configuration Functions
// ============================================================================

/**
 * Configure cleanup behavior options.
 *
 * Allows customization of whether video cache is cleared on disconnect
 * and account change events.
 *
 * @param newOptions - Partial options to override defaults
 *
 * @example
 * ```typescript
 * // Configure to clear videos on disconnect
 * configureCleanup({ clearVideosOnDisconnect: true })
 *
 * // Configure to keep everything except auth
 * configureCleanup({
 *   clearVideosOnDisconnect: false,
 *   clearVideosOnAccountChange: false
 * })
 * ```
 */
export function configureCleanup(newOptions: Partial<CleanupOptions>): void {
  options = { ...options, ...newOptions }
}

/**
 * Get current cleanup options.
 *
 * @returns Current cleanup configuration
 */
export function getCleanupOptions(): Readonly<CleanupOptions> {
  return { ...options }
}

/**
 * Reset cleanup options to defaults.
 */
export function resetCleanupOptions(): void {
  options = { ...DEFAULT_OPTIONS }
}

// ============================================================================
// Cleanup Handlers
// ============================================================================

/**
 * Handle wallet disconnect - full cleanup.
 *
 * Called when a user explicitly disconnects their wallet. Clears:
 * - Lit session cache for the address
 * - All AES keys (tied to wallet permissions)
 * - OPFS staging files
 * - Video cache (configurable, default: keep)
 *
 * @param address - The wallet address that disconnected
 *
 * @example
 * ```typescript
 * // In wallet disconnect handler
 * onWalletDisconnect('0x123...')
 * ```
 */
export function onWalletDisconnect(address: string): void {
  if (!address) return

  console.info(`[SecurityCleanup] Wallet disconnected: ${address.slice(0, 8)}...`)

  // Always clear auth-related caches
  clearAuthContext(address)
  clearAllKeys()

  // Optionally clear video cache
  if (options.clearVideosOnDisconnect) {
    clearAllVideos().catch(err =>
      console.warn('[SecurityCleanup] Failed to clear video cache:', err)
    )
  }

  // Always clean up staging files
  clearAllStaging().catch(err =>
    console.warn('[SecurityCleanup] Failed to clear staging:', err)
  )
}

/**
 * Handle account change - cleanup old account's auth state.
 *
 * Called when a user switches to a different wallet account. Clears:
 * - Old account's Lit session
 * - All AES keys (permissions may differ)
 * - OPFS staging files
 * - Video cache (configurable, default: keep)
 *
 * @param oldAddress - The previous wallet address
 * @param newAddress - The new wallet address
 *
 * @example
 * ```typescript
 * // In account change handler
 * onAccountChange('0x123...', '0x456...')
 * ```
 */
export function onAccountChange(oldAddress: string, newAddress: string): void {
  if (!oldAddress || !newAddress) return

  console.info(
    `[SecurityCleanup] Account changed: ${oldAddress.slice(0, 8)}... → ${newAddress.slice(0, 8)}...`
  )

  // Clear old account's auth
  clearAuthContext(oldAddress)
  clearAllKeys()

  // Optionally clear video cache
  if (options.clearVideosOnAccountChange) {
    clearAllVideos().catch(err =>
      console.warn('[SecurityCleanup] Failed to clear video cache:', err)
    )
  }

  // Always clean up staging files
  clearAllStaging().catch(err =>
    console.warn('[SecurityCleanup] Failed to clear staging:', err)
  )
}

/**
 * Handle chain change - cleanup chain-specific auth.
 *
 * Called when a user switches to a different blockchain network. Clears:
 * - Lit session (SIWE is chain-specific)
 *
 * Keeps:
 * - AES keys (chain-agnostic)
 * - Video cache (chain-agnostic)
 * - OPFS staging files
 *
 * @param oldChainId - The previous chain ID
 * @param newChainId - The new chain ID
 *
 * @example
 * ```typescript
 * // In chain change handler
 * onChainChange(1, 137)
 * ```
 */
export function onChainChange(oldChainId: number, newChainId: number): void {
  if (!oldChainId || !newChainId) return

  console.info(
    `[SecurityCleanup] Chain changed: ${oldChainId} → ${newChainId}`
  )

  // SIWE is chain-specific, clear session
  clearAuthContext()

  // AES keys are chain-agnostic, keep them
  // Video cache is chain-agnostic, keep it
  // OPFS staging is chain-agnostic, keep it
}

/**
 * Handle Lit session expiration.
 *
 * Called when a Lit session expires. Clears:
 * - Lit session cache
 *
 * Keeps:
 * - AES keys (may still be valid)
 * - Video cache
 * - OPFS staging files
 *
 * @example
 * ```typescript
 * // In session expiration handler
 * onSessionExpired()
 * ```
 */
export function onSessionExpired(): void {
  console.info('[SecurityCleanup] Lit session expired')
  clearAuthContext()
}

/**
 * Nuclear option: clear everything.
 *
 * Called from settings UI "Clear All Data". Clears:
 * - All Lit sessions
 * - All AES keys
 * - All cached videos
 * - All OPFS staging files
 *
 * @returns Object indicating which operations succeeded
 *
 * @example
 * ```typescript
 * // In "Clear All Data" button handler
 * const results = await onSecurityClear()
 * console.log(`Cleared: ${results.sessionsCleared ? 'sessions' : ''}`)
 * ```
 */
export async function onSecurityClear(): Promise<SecurityClearResult> {
  console.info('[SecurityCleanup] Full security clear requested')

  const results: SecurityClearResult = {
    sessionsCleared: false,
    keysCleared: false,
    videosCleared: false,
    stagingCleared: false,
  }

  try {
    clearAuthContext()
    results.sessionsCleared = true
  } catch (err) {
    console.error('[SecurityCleanup] Failed to clear sessions:', err)
  }

  try {
    clearAllKeys()
    results.keysCleared = true
  } catch (err) {
    console.error('[SecurityCleanup] Failed to clear keys:', err)
  }

  try {
    await clearAllVideos()
    results.videosCleared = true
  } catch (err) {
    console.error('[SecurityCleanup] Failed to clear videos:', err)
  }

  try {
    await clearAllStaging()
    results.stagingCleared = true
  } catch (err) {
    console.error('[SecurityCleanup] Failed to clear staging:', err)
  }

  return results
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Check if any auth-related cache has data.
 *
 * Useful for determining if cleanup is needed.
 *
 * @returns True if any session or key is cached
 */
export function hasCachedAuthData(): boolean {
  const { getCachedSessionAddresses, getCachedKeyCount } = require('./index')
  return (
    getCachedSessionAddresses().length > 0 || getCachedKeyCount() > 0
  )
}
