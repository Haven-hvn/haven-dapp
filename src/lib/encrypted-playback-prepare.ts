/**
 * Parallel Haven-AOL key retrieval + Filecoin piece download for encrypted videos.
 *
 * Wallet sign / ICP and Synapse fetch are independent until chunked file decrypt.
 *
 * Supports both Haven-AOL gate v1 and v3 records via the shared
 * `decryptAnyContentKey` dispatcher — for v1 records this preserves the
 * existing byte-frozen behavior; for v3 records the per-file work reduces to
 * one IBE decrypt off a cached per-`(chain, tokenAddress, threshold, epoch)`
 * VetKey (see `haven-aol-decrypt-v3.ts`).
 *
 * @module lib/encrypted-playback-prepare
 */

import type { Video, EncryptionMetadata } from '@/types/video'
import type { FetchResult } from '@/services/ipfsService'
import {
  DEFAULT_PIECE_DOWNLOAD_TIMEOUT_MS,
  fetchPinnedContent,
} from '@/services/ipfsService'
import { extractHavenEncryptedPayload } from '@/lib/encrypted-payload'
import {
  decryptAnyContentKey,
  parseAnyGateMetadata,
  type WalletClientLike,
} from '@/lib/haven-aol'

export interface PrepareEncryptedContentOptions {
  video: Video
  walletClient: WalletClientLike
  signal?: AbortSignal
  /** Abort in-flight work when the parallel batch fails (e.g. sibling rejection). */
  abortParallel?: () => void
  timeoutMs?: number
  onKeyProgress?: (message: string) => void
  onFetchProgress?: (downloaded: number, total: number) => void
}

export interface PreparedEncryptedContent {
  aesKey: Uint8Array
  encryptedData: Uint8Array
  fetchResult: FetchResult
  keyFromCache: boolean
  /** Which Haven-AOL protocol version was used (1 or 3). */
  version: 1 | 3
}

/**
 * Narrow `video.encryptionMetadata` (which is now a v1|v3 union) to a
 * concrete gate record. We accept either version, delegating shape validation
 * to `parseAnyGateMetadata` so callers can't smuggle an untrusted object past
 * the dispatcher just because TypeScript widened the field.
 */
function assertEncryptedVideoReady(video: Video): EncryptionMetadata {
  if (!video.encryptionMetadata) {
    throw new Error('Missing encryption metadata')
  }
  const parsed = parseAnyGateMetadata(video.encryptionMetadata)
  if (!parsed) {
    throw new Error(
      'Invalid content encryption metadata — expected Haven-AOL gate v1 (version: 1) or v3 (version: 3)'
    )
  }
  return parsed
}

/**
 * Run wallet/ICP key decryption and Synapse piece download concurrently.
 *
 * Version-agnostic: the returned `aesKey` is the AES-256 content key
 * regardless of whether the source gate record is v1 or v3.
 */
export async function prepareEncryptedContentInputs(
  options: PrepareEncryptedContentOptions
): Promise<PreparedEncryptedContent> {
  const {
    video,
    walletClient,
    signal,
    abortParallel,
    timeoutMs = DEFAULT_PIECE_DOWNLOAD_TIMEOUT_MS,
    onKeyProgress,
    onFetchProgress,
  } = options

  const encryptionMetadata = assertEncryptedVideoReady(video)

  const keyPromise = decryptAnyContentKey({
    encryptionMetadata,
    encryptedCid: video.encryptedCid,
    walletClient,
    onProgress: onKeyProgress,
    signal,
  })

  const fetchPromise = fetchPinnedContent(video, {
    abortSignal: signal,
    timeout: timeoutMs,
    onProgress: onFetchProgress,
  })

  let keyResult: Awaited<typeof keyPromise>
  let fetchResult: FetchResult

  try {
    ;[keyResult, fetchResult] = await Promise.all([keyPromise, fetchPromise])
  } catch (error) {
    abortParallel?.()
    throw error
  }

  if (signal?.aborted) {
    abortParallel?.()
    throw new Error('Loading cancelled')
  }

  const encryptedData = await extractHavenEncryptedPayload(fetchResult.data)

  return {
    aesKey: keyResult.aesKey,
    encryptedData,
    fetchResult,
    keyFromCache: keyResult.fromCache,
    version: keyResult.version,
  }
}
