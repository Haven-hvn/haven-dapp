/**
 * Client-side memoization for the Haven-AOL VetKD verification key.
 *
 * The verification key is canister-global and never changes (depends only on
 * canister_id + context + key_id, all constants). Safe to cache indefinitely
 * within a browser session.
 *
 * @module lib/haven-aol/haven-aol-verification-key-cache
 */

import { fetchVerificationKey } from 'haven-aol'
import type { HttpAgent } from '@icp-sdk/core/agent'

let cachedVerificationKey: Uint8Array | null = null
let inflightPromise: Promise<Uint8Array> | null = null

/**
 * Get or fetch the verification key with deduplication.
 * - If cached: returns immediately (0ms)
 * - If in-flight: deduplicates (waits for existing request)
 * - If cold: fetches from canister (~5s first time, ~200ms after canister caches it)
 */
export async function getOrFetchVerificationKey(
  agent: HttpAgent,
  canisterId: string
): Promise<Uint8Array> {
  if (cachedVerificationKey) {
    return cachedVerificationKey
  }

  if (!inflightPromise) {
    inflightPromise = fetchVerificationKey(agent, canisterId)
      .then((key: Uint8Array) => {
        cachedVerificationKey = new Uint8Array(key)
        inflightPromise = null
        return cachedVerificationKey
      })
      .catch((err: unknown) => {
        inflightPromise = null
        throw err
      })
  }

  return inflightPromise!
}

/** Clear cache (call on wallet disconnect or security cleanup). */
export function clearVerificationKeyCache(): void {
  cachedVerificationKey = null
  inflightPromise = null
}

/** Check if the verification key is already cached. */
export function hasVerificationKeyCache(): boolean {
  return cachedVerificationKey !== null
}
