/**
 * Haven-AOL Batch Decryption
 *
 * Orchestrates batch key retrieval: filters cached keys, chunks uncached
 * CIDs into groups of ≤20, calls ICP once per chunk (1 wallet popup each),
 * unwraps all keys, and caches them.
 *
 * @module lib/haven-aol/haven-aol-batch-decrypt
 */

import {
  recoverVetKey,
  ibeDecryptAesKey,
  computeDerivationInput,
  batchRequestDecryptionKey,
  type Chain,
} from 'haven-aol'
import { getHavenAolConfig, getOrCreateAgent } from './haven-aol-client'
import {
  createSignedBatchGateRequest,
  type WalletClientLike,
} from './haven-aol-auth'
import {
  isGateMetadata,
  normalizeGateMetadataForDerivation,
} from './haven-aol-metadata'
import { HavenAolDecryptError, mapGateError } from './haven-aol-errors'
import { getCachedKey, setCachedKey, hasCachedKey } from '../aes-key-cache'
import type { Video } from '@/types'

// ============================================================================
// Types
// ============================================================================

export interface BatchDecryptResult {
  /** Map of videoId → { key, iv } for all requested videos (cached + freshly derived) */
  keys: Map<string, { key: Uint8Array; iv: Uint8Array }>
  /** Number of keys served from cache (no ICP call needed) */
  cachedCount: number
  /** Number of keys freshly derived from ICP */
  derivedCount: number
}

// ============================================================================
// Constants
// ============================================================================

const MAX_CIDS_PER_BATCH = 20

// ============================================================================
// Helpers
// ============================================================================

interface VideoGateInfo {
  video: Video
  chain: Chain
  tokenAddress: string
  threshold: bigint
  cid: string
}

function extractGateInfo(video: Video): VideoGateInfo | null {
  const meta = video.encryptionMetadata
  if (!meta || !isGateMetadata(meta)) return null

  const normalized = normalizeGateMetadataForDerivation(meta)
  return {
    video,
    chain: normalized.chain,
    tokenAddress: normalized.tokenAddress,
    threshold: BigInt(normalized.threshold),
    cid: normalized.cid,
  }
}

// ============================================================================
// Core
// ============================================================================

/**
 * Batch-decrypt content keys for multiple videos.
 * - Filters out already-cached keys
 * - Chunks uncached into groups of ≤20
 * - For each chunk: 1 wallet popup → 1 ICP call → unwrap all → cache all
 * - Returns all keys (cached + fresh)
 */
export async function batchDecryptContentKeys(
  videos: Video[],
  walletClient: WalletClientLike,
  options?: {
    onProgress?: (message: string) => void
    signal?: AbortSignal
  }
): Promise<BatchDecryptResult> {
  const { onProgress, signal } = options ?? {}
  const keys = new Map<string, { key: Uint8Array; iv: Uint8Array }>()
  let cachedCount = 0
  let derivedCount = 0

  // Step 1: Extract gate info and separate cached from uncached
  const uncached: VideoGateInfo[] = []

  for (const video of videos) {
    if (signal?.aborted) {
      throw new HavenAolDecryptError('Batch decryption cancelled', 'CANCELLED')
    }

    // Check cache first
    if (hasCachedKey(video.id)) {
      const cached = getCachedKey(video.id)
      if (cached) {
        keys.set(video.id, { key: cached.key, iv: cached.iv })
        cachedCount++
        continue
      }
    }

    const info = extractGateInfo(video)
    if (!info) {
      throw new HavenAolDecryptError(
        `Video "${video.title}" has invalid or missing encryption metadata.`,
        'METADATA_INVALID'
      )
    }
    uncached.push(info)
  }

  if (uncached.length === 0) {
    onProgress?.('All keys served from cache')
    return { keys, cachedCount, derivedCount }
  }

  // Step 2: Chunk uncached into groups of ≤20
  const chunks: VideoGateInfo[][] = []
  for (let i = 0; i < uncached.length; i += MAX_CIDS_PER_BATCH) {
    chunks.push(uncached.slice(i, i + MAX_CIDS_PER_BATCH))
  }

  const config = getHavenAolConfig()
  const agent = await getOrCreateAgent()

  // Step 3: Process each chunk
  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const chunk = chunks[chunkIdx]

    if (signal?.aborted) {
      throw new HavenAolDecryptError('Batch decryption cancelled', 'CANCELLED')
    }

    onProgress?.(
      chunks.length > 1
        ? `Signing batch ${chunkIdx + 1}/${chunks.length}...`
        : 'Sign with your wallet to decrypt...'
    )

    // All videos in a batch must share the same gate params (chain/token/threshold)
    const { chain, tokenAddress, threshold } = chunk[0]
    const cids = chunk.map((info) => info.cid)

    // Sign batch request (1 wallet popup per chunk)
    const signedRequest = await createSignedBatchGateRequest(
      walletClient,
      cids,
      { chain, tokenAddress, threshold },
    )

    if (signal?.aborted) {
      throw new HavenAolDecryptError('Batch decryption cancelled', 'CANCELLED')
    }

    onProgress?.('Requesting decryption keys from network...')

    // Call canister
    const result = await batchRequestDecryptionKey(agent, config.canisterId, {
      chain,
      tokenAddress,
      threshold,
      cids,
      evmAddress: walletClient.account.address,
      transportPublicKey: signedRequest.transportPublicKey,
      nonce: signedRequest.nonce,
      signature: signedRequest.signature,
      eip712ChainId: signedRequest.eip712ChainId,
      eip712VerifyingContract: signedRequest.eip712VerifyingContract,
    })

    if ('err' in result) {
      throw mapGateError(result.err)
    }

    if (signal?.aborted) {
      throw new HavenAolDecryptError('Batch decryption cancelled', 'CANCELLED')
    }

    // Step 4: Unwrap each key and cache
    onProgress?.('Recovering encryption keys...')
    const { keys: batchKeys, verificationKey } = result.ok

    for (const entry of batchKeys) {
      const info = chunk.find((i) => i.cid === entry.cid)
      if (!info) continue

      // Compute derivation input for this CID
      const derivationInput = await computeDerivationInput(
        info.chain,
        info.tokenAddress,
        info.threshold,
        info.cid,
      )

      // Recover VetKD key
      const vetKey = recoverVetKey(
        entry.encryptedKey,
        signedRequest.transportSecretKey,
        verificationKey,
        derivationInput,
      )

      // IBE-decrypt the AES key
      const aesKey = ibeDecryptAesKey(
        info.video.encryptionMetadata!.encryptedAesKey,
        vetKey,
      )

      // Cache the key
      const iv = new Uint8Array(12)
      setCachedKey(info.video.id, aesKey, iv)
      keys.set(info.video.id, { key: aesKey, iv })
      derivedCount++
    }
  }

  onProgress?.(`Keys ready: ${cachedCount} cached, ${derivedCount} derived`)
  return { keys, cachedCount, derivedCount }
}
