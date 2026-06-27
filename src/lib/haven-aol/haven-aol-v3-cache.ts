/**
 * Haven-AOL v3 — in-memory VetKey instance cache.
 *
 * Separate from `GateKeyCache` (which stores `Uint8Array` bytes) because
 * the `VetKey` type from `@icp-sdk/vetkeys` is a class, not a `Uint8Array`,
 * and cannot be round-tripped through the byte cache without the class
 * being directly importable by the dapp.
 *
 * Cleared alongside `GateKeyCache` on wallet disconnect / account change
 * (see `src/lib/security-cleanup.ts`).
 *
 * @module lib/haven-aol/haven-aol-v3-cache
 */

import { recoverVetKey } from 'haven-aol'

type VetKey = ReturnType<typeof recoverVetKey>

const cache = new Map<string, VetKey>()

/** Look up a cached VetKey instance. */
export function v3VetKeyGet(key: string): VetKey | null {
  return cache.get(key) ?? null
}

/** Store a VetKey instance for future lookups. */
export function v3VetKeySet(key: string, vk: VetKey): void {
  cache.set(key, vk)
}

/** True if the cache holds `key`. */
export function v3VetKeyHas(key: string): boolean {
  return cache.has(key)
}

/** Remove every entry. Called on wallet disconnect / account change. */
export function clearV3VetKeyCache(): void {
  cache.clear()
}
