/**
 * Haven-AOL Protocol v3 — batch decrypt entry point (dapp).
 *
 * The v3 batch path differs structurally from v1's:
 *
 *   • A v3 batch is a SINGLE `(community, epoch)` request. Every CID in the
 *     batch decrypts off the SAME recovered VetKey — the canister's per-CID
 *     `encrypted_key` entries are byte-identical at the protocol level.
 *     This means once the gate-key cache has an entry, batch decrypt becomes
 *     zero-canister-call (just IBE-decrypt each `encryptedAesKey`).
 *
 *   • v3 batch input requires every video to share the same gate parameters
 *     `(chain, tokenAddress, threshold, epoch)`. The caller (typically the
 *     community feed page) groups by gate before calling. Mixing v1 and v3
 *     videos is the dispatcher's responsibility — see
 *     `haven-aol-batch-decrypt-dispatch.ts`.
 *
 *   • The canister's `batchRequestDecryptionKeyV3` endpoint still exists
 *     even though we could implement v3 batch decrypt entirely off a single
 *     `requestDecryptionKeyV3` call. We use the batch endpoint when uncached
 *     so the canister can validate the CID list as a unit and so the dapp
 *     surfaces a single wallet popup for the whole batch.
 *
 * Proposal §1.7 scenario (D) / Key Design Decision #7 apply equally to
 * batch: cache lookup keys come from `metadata.epoch`, never local time.
 *
 * @module lib/haven-aol/haven-aol-batch-decrypt-v3
 */

import {
  recoverVetKey,
  ibeDecryptAesKey,
  computeDerivationInputV3,
  type GateMetadataV3Json,
  type Chain,
} from 'haven-aol'
import {
  getHavenAolConfig,
  getOrCreateAgent,
  requestDecryptionKeyV3,
} from './haven-aol-client'
import {
  createSignedGateRequestV3,
  type WalletClientLike,
} from './haven-aol-auth'
import { HavenAolDecryptError, mapGateError } from './haven-aol-errors'
import {
  GateKeyCache,
  gateKeyCache,
} from './haven-aol-gate-key-cache'
import {
  getCachedKey,
  setCachedKey,
  hasCachedKey,
  getVideoIdFromMetadata,
} from '../aes-key-cache'
import type { Video } from '@/types'

// =============================================================================
// Types
// =============================================================================

export interface BatchDecryptV3Result {
  /** Map of `videoId` → `{key, iv}` for every requested video (cached + fresh). */
  keys: Map<string, { key: Uint8Array; iv: Uint8Array }>
  /** Number of AES keys served from the per-video AES cache. */
  cachedCount: number
  /** Number of AES keys derived in this call. */
  derivedCount: number
  /** Whether the gate-key cache supplied the VetKey (zero canister round-trips). */
  fromGateKeyCache: boolean
}

interface V3GateInfo {
  video: Video
  meta: GateMetadataV3Json
}

// =============================================================================
// Helpers
// =============================================================================

function extractV3GateInfo(video: Video): V3GateInfo | null {
  const meta = video.encryptionMetadata as unknown
  if (!meta || typeof meta !== 'object') return null
  if ((meta as { version?: unknown }).version !== 3) return null
  // Trust the upstream dispatcher to validate — we narrow only.
  return { video, meta: meta as GateMetadataV3Json }
}

function assertHomogeneousGate(group: V3GateInfo[]): {
  chain: Chain
  tokenAddress: string
  threshold: string
  epoch: number
} {
  const first = group[0].meta
  for (const item of group) {
    if (
      item.meta.chain !== first.chain ||
      item.meta.tokenAddress !== first.tokenAddress ||
      item.meta.threshold !== first.threshold ||
      item.meta.epoch !== first.epoch
    ) {
      throw new HavenAolDecryptError(
        'v3 batch decrypt requires all videos to share (chain, tokenAddress, threshold, epoch). ' +
          'Group your videos before calling batchDecryptContentKeysV3.',
        'METADATA_INVALID',
      )
    }
  }
  return {
    chain: first.chain,
    tokenAddress: first.tokenAddress,
    threshold: first.threshold,
    epoch: first.epoch,
  }
}

// =============================================================================
// Core: batch decrypt
// =============================================================================

/**
 * Batch-decrypt AES content keys for an array of v3 videos.
 *
 * All input videos MUST share `(chain, tokenAddress, threshold, epoch)`.
 * The caller (e.g., community feed page) is expected to group v3 videos
 * by gate before calling.
 */
export async function batchDecryptContentKeysV3(
  videos: Video[],
  walletClient: WalletClientLike,
  options?: {
    onProgress?: (message: string) => void
    signal?: AbortSignal
  },
): Promise<BatchDecryptV3Result> {
  const { onProgress, signal } = options ?? {}
  const keys = new Map<string, { key: Uint8Array; iv: Uint8Array }>()
  let cachedCount = 0
  let derivedCount = 0

  const abort = () => {
    if (signal?.aborted) {
      throw new HavenAolDecryptError('Batch decryption cancelled', 'CANCELLED')
    }
  }
  abort()

  // Step 1: separate videos by AES-cache status, ignore non-v3 entries.
  const toDerive: V3GateInfo[] = []
  for (const video of videos) {
    abort()
    const info = extractV3GateInfo(video)
    if (!info) {
      throw new HavenAolDecryptError(
        `Video "${video.title}" is not v3-encrypted or has invalid metadata.`,
        'METADATA_INVALID',
      )
    }

    // Cache check — same dual-lookup the v1 batch path uses.
    if (hasCachedKey(video.id)) {
      const cached = getCachedKey(video.id)
      if (cached) {
        keys.set(video.id, { key: cached.key, iv: cached.iv })
        cachedCount++
        continue
      }
    }
    const singleCacheKey = getVideoIdFromMetadata({
      keyHash: info.meta.encryptedAesKey.slice(0, 32),
    })
    if (singleCacheKey && hasCachedKey(singleCacheKey)) {
      const cached = getCachedKey(singleCacheKey)
      if (cached) {
        keys.set(video.id, { key: cached.key, iv: cached.iv })
        cachedCount++
        continue
      }
    }
    toDerive.push(info)
  }

  if (toDerive.length === 0) {
    onProgress?.('All keys served from cache')
    return { keys, cachedCount, derivedCount, fromGateKeyCache: false }
  }

  const gateParams = assertHomogeneousGate(toDerive)
  const gateCacheKey = GateKeyCache.makeKey(gateParams)

  // Step 2: gate-key cache lookup — single point of fan-out for the batch.
  let vetKey: Uint8Array | null = gateKeyCache.get(gateCacheKey)
  let fromGateKeyCache = vetKey !== null

  if (!vetKey) {
    onProgress?.('Sign with your wallet to decrypt...')
    const epochBig = BigInt(gateParams.epoch)
    const signed = await createSignedGateRequestV3(walletClient, epochBig)
    abort()

    onProgress?.('Requesting decryption keys from network...')
    const config = getHavenAolConfig()
    const agent = await getOrCreateAgent()

    // v3 batches share one VetKey, so a single `requestDecryptionKeyV3` call
    // is functionally equivalent to `batchRequestDecryptionKeyV3` for the
    // purpose of populating the gate-key cache. We use the single endpoint
    // because it doesn't require the canister to validate a CID list.
    const result = await requestDecryptionKeyV3(agent, config.canisterId, {
      chain: gateParams.chain,
      tokenAddress: gateParams.tokenAddress,
      threshold: BigInt(gateParams.threshold),
      epoch: epochBig,
      evmAddress: walletClient.account.address,
      transportPublicKey: signed.transportPublicKey,
      nonce: signed.nonce,
      signature: signed.signature,
      eip712ChainId: signed.eip712ChainId,
      eip712VerifyingContract: signed.eip712VerifyingContract,
    })
    if ('err' in result) throw mapGateError(result.err)
    abort()

    onProgress?.('Recovering encryption key...')
    const derivationInput = await computeDerivationInputV3(
      gateParams.chain,
      gateParams.tokenAddress,
      BigInt(gateParams.threshold),
      epochBig,
    )
    vetKey = recoverVetKey(
      result.ok.encryptedKey,
      signed.transportSecretKey,
      result.ok.verificationKey,
      derivationInput,
    )
    gateKeyCache.put(gateCacheKey, vetKey)
    fromGateKeyCache = false
  }

  if (!vetKey) {
    // Defensive — unreachable in normal flow.
    throw new HavenAolDecryptError('Internal: VetKey null after fetch', 'DECRYPTION_FAILED')
  }

  // Step 3: IBE-decrypt each video's AES key off the shared VetKey.
  onProgress?.('Unwrapping content keys...')
  for (const info of toDerive) {
    abort()
    const aesKey = ibeDecryptAesKey(info.meta.encryptedAesKey, vetKey)
    const iv = new Uint8Array(12)
    setCachedKey(info.video.id, aesKey, iv)
    const singleCacheKey = getVideoIdFromMetadata({
      keyHash: info.meta.encryptedAesKey.slice(0, 32),
    })
    if (singleCacheKey && singleCacheKey !== info.video.id) {
      setCachedKey(singleCacheKey, aesKey, iv)
    }
    keys.set(info.video.id, { key: aesKey, iv })
    derivedCount++
  }

  onProgress?.(`Keys ready: ${cachedCount} cached, ${derivedCount} derived`)
  return { keys, cachedCount, derivedCount, fromGateKeyCache }
}
