/**
 * Haven-AOL Nonce Management
 *
 * Monotonic per-wallet nonces for EIP-712 gate requests (scoped on the
 * canister by EIP-712 domain + GateRequest type — see haven-aol `main.mo`).
 *
 * The canister records a nonce as used before signature/balance checks, so
 * the client must never reuse a nonce and should advance by +1 on collision.
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

/** Highest nonce issued or accepted for this wallet (lowercase address key). */
const nonceMap = new Map<string, bigint>()

// ============================================================================
// Core Functions
// ============================================================================

function storageKey(address: string): string {
  return address.toLowerCase()
}

function readStoredNonce(address: string): bigint {
  const key = storageKey(address)
  const inMemory = nonceMap.get(key)
  if (inMemory !== undefined) {
    return inMemory
  }
  return loadNonceFromStorage(key) ?? 0n
}

function writeStoredNonce(address: string, value: bigint): void {
  const key = storageKey(address)
  nonceMap.set(key, value)
  saveNonceToStorage(key, value)
}

/**
 * Record that `usedNonce` was consumed on the canister (success or error after
 * the canister accepted the nonce).
 */
export function commitNonceUsed(address: string, usedNonce: bigint): void {
  const key = storageKey(address)
  const stored = readStoredNonce(address)
  if (usedNonce > stored) {
    writeStoredNonce(key, usedNonce)
  }
}

/**
 * Get the next nonce for a wallet address.
 *
 * Returns a monotonically increasing value persisted in localStorage.
 */
export function getNextNonce(address: string): bigint {
  const key = storageKey(address)
  const current = readStoredNonce(address)
  const next = current + 1n
  writeStoredNonce(key, next)
  return next
}

/**
 * Pick the next nonce after `NonceAlreadyUsed` for `collidedNonce`.
 *
 * Uses +1 from the collided value and never moves backward vs local state.
 */
export function nonceAfterCollision(address: string, collidedNonce: bigint): bigint {
  const stored = readStoredNonce(address)
  const next = collidedNonce >= stored ? collidedNonce + 1n : stored + 1n
  writeStoredNonce(storageKey(address), next - 1n)
  return next
}

/**
 * @deprecated Prefer {@link nonceAfterCollision}. Kept for compatibility; bumps by +1 only.
 */
export function bumpNonce(address: string): bigint {
  const stored = readStoredNonce(address)
  return nonceAfterCollision(address, stored)
}

/**
 * Clear nonce state for a wallet address.
 */
export function clearNonce(address?: string): void {
  if (address) {
    const key = storageKey(address)
    nonceMap.delete(key)
    removeNonceFromStorage(key)
  } else {
    nonceMap.clear()
    clearAllNoncesFromStorage()
  }
}

/**
 * Get the highest tracked nonce without incrementing.
 */
export function getCurrentNonce(address: string): bigint | null {
  const stored = readStoredNonce(address)
  return stored > 0n ? stored : null
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
