/**
 * Content Retrieval Service
 *
 * Fetches encrypted/plain bytes from Filecoin Onchain Cloud via Synapse using the
 * Filecoin Pin piece CID from Arkiv (`piece_cid`).
 *
 * @module services/ipfsService
 */

import {
  normalizeCid,
  IpfsError,
  getIpfsErrorMessage,
} from '@/lib/ipfs'
import { isFilecoinPieceCid, requirePieceCid } from '@/lib/download-cid'
import { downloadFromSynapse, SynapseError } from '@/lib/synapse'
import type { Video } from '@/types/video'

// ============================================================================
// Types
// ============================================================================

/**
 * Options for fetching content.
 */
export interface FetchOptions {
  /** Request timeout in milliseconds */
  timeout?: number
  /** Number of retry attempts */
  retries?: number
  /** Progress callback - receives downloaded bytes and total bytes */
  onProgress?: (downloaded: number, total: number) => void
  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal
  /** Initial delay between retries in milliseconds */
  retryDelayMs?: number
  /**
   * Arkiv entity owner for owner-aware Synapse resolution.
   * When omitted, `fetchPinnedContent` supplies `video.owner`.
   */
  catalogOwner?: string
}

/**
 * Result of a successful fetch operation.
 */
export interface FetchResult {
  /** Fetched data as Uint8Array */
  data: Uint8Array
  /** URL/identifier that served the content */
  url: string
  /** Source that served the content */
  gateway: string
  /** Size of fetched data in bytes */
  size: number
  /** Duration of fetch in milliseconds */
  duration: number
  /** HTTP response headers */
  headers?: Headers
}

/**
 * Result of a streaming fetch operation.
 */
export interface StreamResult {
  /** ReadableStream for the content */
  stream: ReadableStream<Uint8Array>
  /** URL/identifier that serves the content */
  url: string
  /** Source that serves the content */
  gateway: string
  /** Content-Type header if available */
  contentType?: string
  /** Content length if available */
  contentLength?: number
}

// ============================================================================
// Utility Functions
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (
    error.name === 'AbortError' ||
    error.message.includes('aborted') ||
    error.message.includes('The operation was aborted')
  )
}

// ============================================================================
// Main Fetch Function
// ============================================================================

/**
 * Fetch bytes for a video using its Arkiv `piece_cid` (Filecoin Pin + Synapse).
 */
export async function fetchPinnedContent(
  video: Video,
  options: FetchOptions = {}
): Promise<FetchResult> {
  const pieceCid = requirePieceCid(video)
  const catalogOwner =
    options.catalogOwner?.trim() ||
    (video.owner?.trim().length ? video.owner.trim() : undefined)

  return fetchPieceFromSynapse(pieceCid, {
    ...options,
    catalogOwner,
  })
}

/**
 * Download a Filecoin piece CID via Synapse (FOC warm storage / PDP).
 */
export async function fetchPieceFromSynapse(
  pieceCid: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  const normalizedCid = normalizeCid(pieceCid)
  if (!isFilecoinPieceCid(normalizedCid)) {
    throw new IpfsError(
      `Expected Filecoin piece CID (bafkzcib…), got: ${pieceCid}`,
      'INVALID_CID',
      normalizedCid
    )
  }

  const maxRetries = options.retries ?? 3
  const retryDelayMs = options.retryDelayMs ?? 1000
  const catalogOwner = options.catalogOwner?.trim() || undefined

  if (options.abortSignal?.aborted) {
    throw new IpfsError('Fetch aborted', 'ABORTED', normalizedCid)
  }

  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (options.abortSignal?.aborted) {
        throw new IpfsError('Fetch aborted', 'ABORTED', normalizedCid)
      }

      const startTime = performance.now()
      const data = await downloadFromSynapse(
        normalizedCid,
        {
          ...(catalogOwner != null ? { catalogOwner } : {}),
          ...(options.abortSignal != null ? { signal: options.abortSignal } : {}),
        }
      )
      const duration = performance.now() - startTime

      options.onProgress?.(data.byteLength, data.byteLength)

      return {
        data,
        url: `synapse://${normalizedCid}`,
        gateway: 'synapse',
        size: data.byteLength,
        duration,
      }
    } catch (error) {
      if (error instanceof IpfsError && error.code === 'ABORTED') {
        throw error
      }
      if (isAbortError(error)) {
        throw new IpfsError('Fetch aborted', 'ABORTED', normalizedCid)
      }

      lastError = error instanceof Error ? error : new Error(String(error))

      console.warn(
        `[ipfsService] Synapse attempt ${attempt + 1}/${maxRetries} failed:`,
        lastError.message,
        { pieceCid: normalizedCid, catalogOwner: catalogOwner ?? '(none)' }
      )

      if (options.abortSignal?.aborted) {
        throw new IpfsError('Fetch aborted', 'ABORTED', normalizedCid)
      }

      if (attempt < maxRetries - 1) {
        await sleep(retryDelayMs * Math.pow(2, attempt))
      }
    }
  }

  if (lastError instanceof SynapseError) {
    throw lastError
  }

  throw new IpfsError(
    `Failed to fetch via Synapse after ${maxRetries} attempts. Last error: ${lastError?.message ?? 'unknown'}`,
    'ALL_GATEWAYS_FAILED',
    normalizedCid
  )
}

// ============================================================================
// Streaming Functions
// ============================================================================

/**
 * Stream content from Synapse (wraps full download in a ReadableStream).
 */
export async function streamFromIpfs(
  pieceCid: string,
  options: FetchOptions = {}
): Promise<StreamResult> {
  const result = await fetchPieceFromSynapse(pieceCid, options)

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(result.data)
      controller.close()
    },
  })

  return {
    stream,
    url: result.url,
    gateway: 'synapse',
    contentType: 'application/octet-stream',
    contentLength: result.size,
  }
}

/**
 * Fetch encrypted CAR bytes for decryption (Synapse piece CID).
 */
export async function fetchEncryptedData(
  pieceCid: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  const encryptedOptions: FetchOptions = {
    timeout: 60000,
    retries: 3,
    ...options,
  }

  return fetchPieceFromSynapse(pieceCid, encryptedOptions)
}

/**
 * Fetch multiple piece CIDs in parallel with concurrency limit.
 */
export async function fetchMultiple(
  pieceCids: string[],
  options: FetchOptions = {},
  concurrency: number = 3
): Promise<(FetchResult | null)[]> {
  const results: (FetchResult | null)[] = new Array(pieceCids.length).fill(null)

  for (let i = 0; i < pieceCids.length; i += concurrency) {
    const batch = pieceCids.slice(i, i + concurrency)
    const batchPromises = batch.map(async (pieceCid) => {
      try {
        return await fetchPieceFromSynapse(pieceCid, options)
      } catch (error) {
        console.error(`[ipfsService] Failed to fetch ${pieceCid}:`, error)
        return null
      }
    })

    const batchResults = await Promise.all(batchPromises)
    batchResults.forEach((result, batchIndex) => {
      results[i + batchIndex] = result
    })
  }

  return results
}

// ============================================================================
// Error Handling Exports
// ============================================================================

export { IpfsError, getIpfsErrorMessage }
