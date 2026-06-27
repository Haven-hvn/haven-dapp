/**
 * Haven-AOL Protocol v3 — in-memory gate-key cache (browser side).
 *
 * The dapp twin of `haven-cli-main/haven_cli/crypto/gate_key_cache.py`. Holds
 * one *unwrapped* VetKD derivation key per `(chain, tokenAddress, threshold,
 * epoch)` tuple for the lifetime of the browser tab. Matches the discipline
 * pinned by `src/lib/aes-key-cache.ts` and
 * `src/lib/haven-aol/haven-aol-verification-key-cache.ts`:
 *
 *   • Module-level singleton — one cache per tab.
 *   • In-memory only — NEVER reaches `localStorage`, `sessionStorage`,
 *     IndexedDB (`cache/db.ts`), OPFS, the Cache API, or any persistent
 *     store. Restarts re-fetch via `requestDecryptionKeyV3`.
 *   • Cleared on wallet disconnect via the existing security-cleanup hook
 *     wiring (`src/lib/security-cleanup.ts`).
 *   • Cache key is the canonical string `${chain}:${tokenAddress}:${threshold}:${epoch}`
 *     — pinned in `tasking/README.md` §Interface Contracts and identical to
 *     the four-tuple Python uses.
 *
 * Why a separate cache from the existing AES-key cache:
 *   • AES-key cache keys are per-CID `videoId`s. v3 collapses every CID in
 *     a community for a given epoch onto ONE VetKey, so the per-CID layer
 *     would force one canister round-trip per file. We cache the upstream
 *     IBE/VetKD key — every CID in `(community, epoch)` IBE-decrypts off the
 *     same cached blob.
 *   • The AES-key cache stores fully-decrypted content keys; this cache
 *     stores the unwrapped VetKD derivation private key. Keeping them
 *     distinct avoids semantic confusion in `security-cleanup.ts`.
 *
 * Proposal references:
 *   • §1.7 scenario (D) and §6.3 — in-memory only, cache by `metadata.epoch`.
 *   • Key Design Decision #6 (`tasking/README.md`) — in-memory only.
 *   • Key Design Decision #7 — cache key sourced from `metadata.epoch`.
 *
 * @module lib/haven-aol/haven-aol-gate-key-cache
 */

import type { Chain } from 'haven-aol'

// =============================================================================
// Cache-key shape
// =============================================================================

/**
 * Components that make up a cache key. Accepted thresholds and epochs widen
 * to `bigint | number | string` so callers don't have to coerce by hand —
 * Sprint 3's TypeScript SDK exposes thresholds as `bigint` (`GateMetadata`)
 * and the v3 metadata JSON shape carries `epoch` as a `number`.
 */
export interface GateKeyCacheKeyParts {
  chain: Chain
  tokenAddress: string
  threshold: bigint | number | string
  epoch: bigint | number | string
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

function coerceBigInt(label: string, value: bigint | number | string): bigint {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new RangeError(`${label} must be non-negative, got ${value.toString()}`)
    }
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`${label} must be a non-negative integer, got ${value}`)
    }
    return BigInt(value)
  }
  if (typeof value === 'string') {
    if (!/^(0|[1-9][0-9]*)$/.test(value)) {
      throw new RangeError(`${label} must be a non-negative decimal string, got "${value}"`)
    }
    return BigInt(value)
  }
  throw new TypeError(`${label} must be bigint | number | string`)
}

function validateChain(chain: Chain): asserts chain is Chain {
  if (typeof chain !== 'string' || chain.length === 0) {
    throw new TypeError(`chain must be a non-empty string, got ${typeof chain}`)
  }
}

function validateTokenAddress(tokenAddress: string): void {
  if (typeof tokenAddress !== 'string' || !ADDRESS_RE.test(tokenAddress)) {
    throw new Error(`Invalid tokenAddress for gate-key cache: ${String(tokenAddress)}`)
  }
}

// =============================================================================
// Cache class
// =============================================================================

/**
 * In-memory cache mapping `(chain, tokenAddress, threshold, epoch)` to an
 * unwrapped VetKD derivation key (the result of `recoverVetKey`). Thread
 * safety is unnecessary in a browser — JavaScript is single-threaded per
 * realm — but the API deliberately mirrors the Python `GateKeyCache` so
 * cross-stack reasoning is one-to-one.
 *
 * **The cached bytes are the unwrapped IBE/VetKD key**, not the
 * canister-returned `encryptedKey`. Callers should run `recoverVetKey`
 * once on cache miss and store the result here so that subsequent decrypts
 * in the same `(community, epoch)` skip both the canister round-trip AND
 * the recover step.
 */
export class GateKeyCache {
  private readonly entries = new Map<string, Uint8Array>()

  /**
   * Build the canonical cache-key string. Format is pinned by
   * `tasking/README.md` §Interface Contracts and must remain
   * byte-identical so future tooling that diff-checks Python vs TS
   * cache state continues to match.
   */
  static makeKey(parts: GateKeyCacheKeyParts): string {
    validateChain(parts.chain)
    validateTokenAddress(parts.tokenAddress)
    const threshold = coerceBigInt('threshold', parts.threshold)
    const epoch = coerceBigInt('epoch', parts.epoch)
    return `${parts.chain}:${parts.tokenAddress}:${threshold.toString()}:${epoch.toString()}`
  }

  /**
   * Look up a cached VetKey. Returns a defensive copy so callers cannot
   * mutate cache state by writing into the returned array.
   */
  get(key: string): Uint8Array | null {
    if (typeof key !== 'string' || key.length === 0) return null
    const stored = this.entries.get(key)
    if (!stored) return null
    // Defensive copy — same discipline as `aes-key-cache.ts:secureCopy`.
    return new Uint8Array(stored)
  }

  /**
   * Insert (or overwrite) a cache entry. Stores a defensive copy of the
   * input so the caller can zero out / reuse their buffer without
   * affecting cache state.
   */
  put(key: string, vetKey: Uint8Array): void {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError('GateKeyCache.put: key must be a non-empty string')
    }
    if (!(vetKey instanceof Uint8Array) || vetKey.length === 0) {
      throw new TypeError('GateKeyCache.put: vetKey must be a non-empty Uint8Array')
    }
    this.entries.set(key, new Uint8Array(vetKey))
  }

  /** Remove every entry. Called on wallet disconnect / security cleanup. */
  clear(): void {
    this.entries.clear()
  }

  /** Debug / test introspection — number of cached entries. */
  size(): number {
    return this.entries.size
  }

  /** Debug / test introspection — does the cache currently hold `key`? */
  has(key: string): boolean {
    return this.entries.has(key)
  }
}

// =============================================================================
// Module-level singleton (one cache per browser tab)
// =============================================================================

/**
 * The process-wide gate-key cache. Use this — do NOT instantiate your own
 * `GateKeyCache`. A single cache per tab is what lets prefetch on wallet
 * connect benefit the per-file decrypt path later.
 */
export const gateKeyCache: GateKeyCache = new GateKeyCache()

/**
 * Clear the singleton's entries. Wired into `security-cleanup.ts` so wallet
 * disconnect / account change / chain change drop cached VetKeys alongside
 * AES keys and Haven-AOL nonces.
 */
export function clearGateKeyCache(): void {
  gateKeyCache.clear()
}
