/**
 * Haven-AOL Protocol v3 — single-CID + batch decrypt entry points (dapp).
 *
 * This module is **new for Sprint 5** and lives alongside the v1
 * `haven-aol-decrypt.ts` / `haven-aol-batch-decrypt.ts` paths. v1 callers
 * are unchanged; v3 callers (or the version-dispatching wrappers in this
 * file) land here.
 *
 * Proposal references:
 *   • §1.7 scenario (D), Key Design Decision #7 — cache key sourced from
 *     `metadata.epoch`, never `currentEpoch()`. Decrypt code MUST NOT read
 *     `currentEpoch()` on the hot path.
 *   • §6.3, Key Design Decision #6 — gate-key cache is in-memory only.
 *   • Key Design Decision #5 — threshold-zero collapse: when
 *     `metadata.threshold === "0"`, the canister forces `epoch = 0`
 *     server-side and the SDK builder already refuses to produce
 *     `threshold=0, epoch!=0` records. We trust the parsed metadata here.
 *
 * @module lib/haven-aol/haven-aol-decrypt-v3
 */

import {
  recoverVetKey,
  ibeDecryptAesKey,
  computeDerivationInputV3,
  type GateMetadataV3Json,
} from 'haven-aol'
import { getHavenAolConfig, getOrCreateAgent, requestDecryptionKeyV3 } from './haven-aol-client'
import {
  createSignedGateRequestV3,
  retryWithFreshV3GateNonce,
  type WalletClientLike,
} from './haven-aol-auth'
import { HavenAolDecryptError, mapGateError } from './haven-aol-errors'
import { GateKeyCache, type GateKeyCacheKeyParts } from './haven-aol-gate-key-cache'
import { v3VetKeyGet, v3VetKeySet, v3VetKeyHas } from './haven-aol-v3-cache'
import { getCachedKey, setCachedKey, getVideoIdFromMetadata } from '../aes-key-cache'

// =============================================================================
// Types
// =============================================================================

export interface DecryptContentKeyV3Options {
  /** Haven-AOL v3 gate metadata from Arkiv. */
  encryptionMetadata: GateMetadataV3Json
  /** Connected wallet client (wagmi useWalletClient shape). */
  walletClient: WalletClientLike
  /** UI progress callback. */
  onProgress?: (message: string) => void
  /** Abort signal for cancellation. */
  signal?: AbortSignal
}

export interface DecryptContentKeyV3Result {
  /** Decrypted 256-bit AES key. */
  aesKey: Uint8Array
  /** Whether the AES key came from the per-video AES-key cache. */
  fromAesCache: boolean
  /** Whether the upstream VetKey came from the gate-key cache. */
  fromGateKeyCache: boolean
}

// =============================================================================
// In-flight deduplication
// =============================================================================
//
// React Strict Mode + concurrent `loadVideo` calls would otherwise cause two
// parallel canister round-trips. We dedupe per `(wallet, encryptedAesKey)`
// just like the v1 path does.

const inflightV3 = new Map<string, Promise<DecryptContentKeyV3Result>>()

function sessionKey(walletAddress: string, meta: GateMetadataV3Json): string {
  return `v3:${walletAddress.toLowerCase()}:${meta.encryptedAesKey}`
}

// =============================================================================
// Core: prefetch a gate-key (for `useHavenAolPrefetch`)
// =============================================================================

export interface PrefetchGateKeyV3Args {
  cacheKey: GateKeyCacheKeyParts
  walletClient: WalletClientLike
}

/**
 * Pre-warm the gate-key cache for a single `(community, epoch)` tuple. Used
 * by `useHavenAolPrefetch` on wallet connect for known active communities.
 *
 * **Best-effort — silent on failure.** The hook MUST NOT block UI on
 * prefetch, and the user has not yet picked which video to watch, so a
 * failed prefetch must downgrade to a normal cache miss when the user
 * actually opens content.
 *
 * @returns `true` if the cache was warmed, `false` otherwise.
 */
export async function prefetchGateKeyV3(
  args: PrefetchGateKeyV3Args
): Promise<boolean> {
  const { cacheKey, walletClient } = args
  const key = GateKeyCache.makeKey(cacheKey)
  if (v3VetKeyHas(key)) {
    return true
  }

  try {
    const epoch = BigInt(
      typeof cacheKey.epoch === 'bigint' ? cacheKey.epoch.toString() : cacheKey.epoch,
    )
    const signed = await createSignedGateRequestV3(walletClient, epoch)
    const config = getHavenAolConfig()
    const agent = await getOrCreateAgent()
    const result = await requestDecryptionKeyV3(agent, config.canisterId, {
      chain: cacheKey.chain,
      tokenAddress: cacheKey.tokenAddress,
      threshold: BigInt(
        typeof cacheKey.threshold === 'bigint'
          ? cacheKey.threshold.toString()
          : cacheKey.threshold,
      ),
      epoch,
      evmAddress: walletClient.account.address,
      transportPublicKey: signed.transportPublicKey,
      nonce: signed.nonce,
      signature: signed.signature,
      eip712ChainId: signed.eip712ChainId,
      eip712VerifyingContract: signed.eip712VerifyingContract,
    })
    if ('err' in result) return false

    const derivationInput = await computeDerivationInputV3(
      cacheKey.chain,
      cacheKey.tokenAddress,
      BigInt(
        typeof cacheKey.threshold === 'bigint'
          ? cacheKey.threshold.toString()
          : cacheKey.threshold,
      ),
      epoch,
    )
    const vetKey = recoverVetKey(
      result.ok.encryptedKey,
      signed.transportSecretKey,
      result.ok.verificationKey,
      derivationInput,
    )
    v3VetKeySet(key, vetKey)
    return true
  } catch {
    // Best-effort — swallow. The first user-initiated decrypt will retry.
    return false
  }
}

// =============================================================================
// Core: per-file decrypt
// =============================================================================

export async function decryptContentKeyV3(
  options: DecryptContentKeyV3Options,
): Promise<DecryptContentKeyV3Result> {
  const { encryptionMetadata, walletClient } = options
  const address = walletClient.account.address
  if (!address) {
    throw new HavenAolDecryptError(
      'Wallet not connected. Please connect your wallet.',
      'WALLET_NOT_CONNECTED',
    )
  }

  const skey = sessionKey(address, encryptionMetadata)
  const inflight = inflightV3.get(skey)
  if (inflight) return inflight

  const task = decryptContentKeyV3Impl(options).finally(() => {
    inflightV3.delete(skey)
  })
  inflightV3.set(skey, task)
  return task
}

async function decryptContentKeyV3Impl(
  options: DecryptContentKeyV3Options,
): Promise<DecryptContentKeyV3Result> {
  const { encryptionMetadata: meta, walletClient, onProgress, signal } = options
  const address = walletClient.account.address
  const abort = () => {
    if (signal?.aborted) {
      throw new HavenAolDecryptError('Decryption cancelled', 'CANCELLED')
    }
  }
  abort()

  // Step 0: AES-key cache short-circuit. Same per-CID layer the v1 path
  // uses — a hit here means even the IBE-decrypt step is skipped.
  const videoId = getVideoIdFromMetadata({
    keyHash: meta.encryptedAesKey.slice(0, 32),
  })
  if (videoId) {
    const cached = getCachedKey(videoId)
    if (cached) {
      onProgress?.('Using cached decryption key')
      return { aesKey: cached.key, fromAesCache: true, fromGateKeyCache: false }
    }
  }

  // Step 1: build the gate-key cache key from PARSED `metadata.epoch`.
  // Never read `currentEpoch()` here — this is Key Design Decision #7.
  const cacheKeyParts: GateKeyCacheKeyParts = {
    chain: meta.chain,
    tokenAddress: meta.tokenAddress,
    threshold: meta.threshold,
    epoch: meta.epoch,
  }
  const gateCacheKey = GateKeyCache.makeKey(cacheKeyParts)

  abort()

  // Step 2: v3 VetKey instance cache lookup. On hit we skip the entire
  // canister round-trip + signature + recoverVetKey pipeline and go
  // straight to IBE-decrypt.
  let vetKey = v3VetKeyGet(gateCacheKey)
  let fromGateKeyCache = vetKey !== null

  if (!vetKey) {
    onProgress?.('Sign with your wallet to decrypt...')
    const epochBig = BigInt(meta.epoch)
    let signed = await createSignedGateRequestV3(walletClient, epochBig)
    abort()

    onProgress?.('Requesting decryption key from network...')
    const config = getHavenAolConfig()
    const agent = await getOrCreateAgent()

    const baseRequest = {
      chain: meta.chain,
      tokenAddress: meta.tokenAddress,
      threshold: BigInt(meta.threshold),
      epoch: epochBig,
      evmAddress: address,
    }

    const MAX_NONCE_ATTEMPTS = 3
    let result: Awaited<ReturnType<typeof requestDecryptionKeyV3>> | null = null
    for (let attempt = 0; attempt < MAX_NONCE_ATTEMPTS; attempt++) {
      abort()
      result = await requestDecryptionKeyV3(agent, config.canisterId, {
        ...baseRequest,
        transportPublicKey: signed.transportPublicKey,
        nonce: signed.nonce,
        signature: signed.signature,
        eip712ChainId: signed.eip712ChainId,
        eip712VerifyingContract: signed.eip712VerifyingContract,
      })
      if (!('err' in result)) break
      const errObj = result.err as Record<string, unknown>
      if ('NonceAlreadyUsed' in errObj && attempt < MAX_NONCE_ATTEMPTS - 1) {
        onProgress?.('Nonce collision — please sign once more…')
        signed = await retryWithFreshV3GateNonce(walletClient, epochBig)
        continue
      }
      throw mapGateError(result.err)
    }
    if (result == null || 'err' in result) {
      throw new HavenAolDecryptError(
        'Could not obtain a decryption key after multiple attempts. Please try again.',
        'NONCE_ALREADY_USED',
      )
    }

    abort()
    onProgress?.('Recovering encryption key...')

    const derivationInput = await computeDerivationInputV3(
      meta.chain,
      meta.tokenAddress,
      BigInt(meta.threshold),
      epochBig,
    )
    vetKey = recoverVetKey(
      result.ok.encryptedKey,
      signed.transportSecretKey,
      result.ok.verificationKey,
      derivationInput,
    )

    // Cache the unwrapped VetKey for the rest of the session. Subsequent
    // CIDs in the same `(community, epoch)` skip every step above.
    v3VetKeySet(gateCacheKey, vetKey)
    fromGateKeyCache = false
  }

  abort()
  onProgress?.('Unwrapping content key...')
  // `vetKey` is guaranteed non-null here: either gate-cache hit returned a
  // value, or the cache-miss branch assigned via `recoverVetKey`. TS can't
  // narrow that through the cache `null` union, so we assert.
  if (!vetKey) {
    throw new HavenAolDecryptError(
      'Internal: VetKey was null after fetch — unreachable',
      'DECRYPTION_FAILED',
    )
  }
  const aesKey = ibeDecryptAesKey(meta.encryptedAesKey, vetKey)

  // Cache the AES key in the per-video cache so the next view of the same
  // file is even faster (skips IBE-decrypt as well).
  if (videoId) {
    setCachedKey(videoId, aesKey, new Uint8Array(12))
  }

  onProgress?.('Key decrypted successfully')
  return { aesKey, fromAesCache: false, fromGateKeyCache }
}
