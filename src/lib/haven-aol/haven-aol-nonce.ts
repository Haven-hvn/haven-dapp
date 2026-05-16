/**
 * Haven-AOL Nonce Management
 *
 * Provides a monotonic per-wallet nonce for EIP-712 gate requests.
 * Persists to localStorage for durability across page refreshes.
 * Handles NonceAlreadyUsed errors by incrementing.
 *
 * @module lib/haven-aol/haven-aol-nonce
 */

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY_PREFIX = 'haven-aol-nonce'

// ============================================================================
// In-Memory State
// ============================================================================

/** In-memory nonce tracker (keyed by lowercase address) */
const nonceMap = new Map<string, bigint>()

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get the next nonce for a wallet address.
 *
 * Returns a monotonically increasing nonce. Reads from localStorage
 * on first access for durability, then increments in memory.
 *
 * @param address - The wallet address
 * @returns The next nonce to use
 */
export function getNextNonce(address: string): bigint {
  const key = address.toLowerCase()

  // Check in-memory first
  let current = nonceMap.get(key)

  if (current === undefined) {
    const stored = loadNonceFromStorage(key)
    if (stored !== null) {
      current = stored
    }
  }

  // Increment
  const next = (current ?? 0n) + 1n

  // Store
  nonceMap.set(key, next)
  saveNonceToStorage(key, next)

  return next
}

/**
 * Bump the nonce after a NonceAlreadyUsed error.
 *
 * This increments the nonce by a larger amount to avoid
 * repeated collisions.
 *
 * @param address - The wallet address
 * @returns The new nonce to retry with
 */
export function bumpNonce(address: string): bigint {
  const key = address.toLowerCase()
  const current = nonceMap.get(key) ?? loadNonceFromStorage(key) ?? 0n

  // Bump by 10 to skip past any potential conflicts
  const next = current + 10n

  nonceMap.set(key, next)
  saveNonceToStorage(key, next)

  return next
}

/**
 * Clear nonce state for a wallet address.
 *
 * Called on wallet disconnect.
 *
 * @param address - The wallet address to clear (if undefined, clears all)
 */
export function clearNonce(address?: string): void {
  if (address) {
    const key = address.toLowerCase()
    nonceMap.delete(key)
    removeNonceFromStorage(key)
  } else {
    nonceMap.clear()
    clearAllNoncesFromStorage()
  }
}

/**
 * Get the current nonce value without incrementing.
 *
 * @param address - The wallet address
 * @returns The current nonce or null if none stored
 */
export function getCurrentNonce(address: string): bigint | null {
  const key = address.toLowerCase()
  return nonceMap.get(key) ?? loadNonceFromStorage(key)
}

// ============================================================================
// Storage Helpers
// ============================================================================

function getStorageKey(address: string): string {
  return `${STORAGE_KEY_PREFIX}-${address}`
}

function loadNonceFromStorage(address: string): bigint | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = localStorage.getItem(getStorageKey(address))
    if (stored) {
      return BigInt(stored)
    }
  } catch {
    // localStorage not available or invalid value
  }
  return null
}

function saveNonceToStorage(address: string, nonce: bigint): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(getStorageKey(address), nonce.toString())
  } catch {
    // localStorage not available or full
  }
}

function removeNonceFromStorage(address: string): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.removeItem(getStorageKey(address))
  } catch {
    // localStorage not available
  }
}

function clearAllNoncesFromStorage(): void {
  if (typeof window === 'undefined') return

  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith(STORAGE_KEY_PREFIX)) {
        localStorage.removeItem(key)
      }
    }
  } catch {
    // localStorage not available
  }
}
