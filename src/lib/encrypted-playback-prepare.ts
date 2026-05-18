/**
 * Parallel Haven-AOL key retrieval + Filecoin piece download for encrypted videos.
 *
 * Wallet sign / ICP and Synapse fetch are independent until chunked file decrypt.
 *
 * @module lib/encrypted-playback-prepare
 */

import type { Video } from '@/types/video'
import type { FetchResult } from '@/services/ipfsService'
import {
  DEFAULT_PIECE_DOWNLOAD_TIMEOUT_MS,
  fetchPinnedContent,
} from '@/services/ipfsService'
import { extractHavenEncryptedPayload } from '@/lib/encrypted-payload'
import {
  decryptContentKey,
  isGateMetadata,
  type WalletClientLike,
} from '@/lib/haven-aol'
import type { GateMetadataJson } from '@/lib/haven-aol/haven-aol-metadata'
import type { DecryptContentKeyResult } from '@/lib/haven-aol/haven-aol-decrypt'

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
}

function assertEncryptedVideoReady(video: Video): GateMetadataJson {
  if (!video.encryptionMetadata) {
    throw new Error('Missing encryption metadata')
  }
  if (!isGateMetadata(video.encryptionMetadata)) {
    throw new Error(
      'Invalid content encryption metadata — expected Haven-AOL gate v1 (version: 1)'
    )
  }
  return video.encryptionMetadata
}

/**
 * Run wallet/ICP key decryption and Synapse piece download concurrently.
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

  const keyPromise = decryptContentKey({
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

  let keyResult: DecryptContentKeyResult
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
  }
}
