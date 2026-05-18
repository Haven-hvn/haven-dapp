/**
 * Haven-AOL gate request nonces (EIP-712 `uint256`).
 *
 * The ICP canister only requires that each nonce is unused within the
 * EIP-712 domain + GateRequest scope (replay protection). A random 256-bit
 * value avoids localStorage sync and multi-signature retry ladders.
 *
 * @module lib/haven-aol/haven-aol-nonce
 */

const LEGACY_STORAGE_KEY_PREFIX = 'haven-aol-nonce'

const UINT256_MAX =
  0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn

/**
 * Cryptographically random nonce in [1, 2^256-1] for EIP-712 GateRequest.
 */
export function createRandomGateNonce(): bigint {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)

  let value = 0n
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte)
  }

  if (value === 0n) {
    return createRandomGateNonce()
  }

  return value
}

/**
 * Clear legacy monotonic nonce entries from localStorage (pre-random migration).
 */
export function clearNonce(address?: string): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (address) {
      localStorage.removeItem(`${LEGACY_STORAGE_KEY_PREFIX}-${address.toLowerCase()}`)
      return
    }

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith(LEGACY_STORAGE_KEY_PREFIX)) {
        localStorage.removeItem(key)
      }
    }
  } catch {
    // localStorage unavailable
  }
}

/** @deprecated Use {@link createRandomGateNonce}. */
export function getNextNonce(_address: string): bigint {
  return createRandomGateNonce()
}

/** @deprecated Use {@link createRandomGateNonce}. */
export function bumpNonce(_address: string): bigint {
  return createRandomGateNonce()
}

/** @deprecated Use {@link createRandomGateNonce}. */
export function nonceAfterCollision(_address: string, _collidedNonce: bigint): bigint {
  return createRandomGateNonce()
}

/** @deprecated No longer tracked with random nonces. */
export function commitNonceUsed(_address: string, _usedNonce: bigint): void {
  // no-op
}

/** @deprecated No longer tracked with random nonces. */
export function getCurrentNonce(_address: string): bigint | null {
  return null
}

export { UINT256_MAX }
