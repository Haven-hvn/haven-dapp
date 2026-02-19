/**
 * Content Retrieval Service
 * 
 * Provides functions for fetching content using Synapse SDK for direct
 * client-side Filecoin Onchain Cloud retrieval. Includes progress tracking,
 * timeout handling, and error management.
 * 
 * @module services/ipfsService
 */

import { 
  normalizeCid,
  isValidCid,
  IpfsError,
  getIpfsErrorMessage,
} from '@/lib/ipfs'
import { downloadFromSynapse, SynapseError } from '@/lib/synapse'

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

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Check if an error is an abort error.
 */
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
 * Fetch content from Filecoin via Synapse SDK.
 * 
 * Downloads content directly in the browser using the Synapse SDK
 * (Filecoin Onchain Cloud). No IPFS gateways or server-side proxy needed.
 * 
 * @param cid - Content identifier (piece CID)
 * @param options - Fetch options
 * @returns Promise resolving to FetchResult
 * @throws IpfsError if retrieval fails
 * 
 * @example
 * ```typescript
 * const result = await fetchFromIpfs('baga6ea4seaq...')
 * console.log(`Fetched ${result.size} bytes via Synapse`)
 * 
 * // With progress tracking
 * const result = await fetchFromIpfs('baga6ea4seaq...', {
 *   onProgress: (downloaded, total) => {
 *     console.log(`Progress: ${downloaded}/${total}`)
 *   }
 * })
 * ```
 */
export async function fetchFromIpfs(
  cid: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  // Validate CID
  if (!isValidCid(cid)) {
    throw new IpfsError(`Invalid CID: ${cid}`, 'INVALID_CID', cid)
  }
  
  const normalizedCid = normalizeCid(cid)
  const maxRetries = options.retries || 3
  const retryDelayMs = options.retryDelayMs || 1000
  
  // Check for abort before starting
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
      
      // Download directly via Synapse SDK (runs in browser)
      const data = await downloadFromSynapse(normalizedCid)
      
      const duration = performance.now() - startTime
      
      // Report final progress
      options.onProgress?.(data.byteLength, data.byteLength)
      
      return {
        data,
        url: `synapse://${normalizedCid}`,
        gateway: 'synapse',
        size: data.byteLength,
        duration,
      }
    } catch (error) {
      // Handle abort — don't retry
      if (error instanceof IpfsError && error.code === 'ABORTED') {
        throw error
      }
      if (isAbortError(error)) {
        throw new IpfsError('Fetch aborted', 'ABORTED', normalizedCid)
      }
      
      lastError = error instanceof Error ? error : new Error(String(error))
      
      console.warn(
        `[ipfsService] Synapse attempt ${attempt + 1}/${maxRetries} failed:`,
        lastError.message
      )
      
      if (options.abortSignal?.aborted) {
        throw new IpfsError('Fetch aborted', 'ABORTED', normalizedCid)
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries - 1) {
        const delay = retryDelayMs * Math.pow(2, attempt)
        await sleep(delay)
      }
    }
  }
  
  throw new IpfsError(
    `Failed to fetch via Synapse after ${maxRetries} attempts. Last error: ${lastError?.message}`,
    'ALL_GATEWAYS_FAILED',
    normalizedCid
  )
}

// ============================================================================
// Streaming Functions
// ============================================================================

/**
 * Stream content from Synapse (for large files).
 * 
 * Downloads the full content via Synapse SDK and wraps it in a ReadableStream.
 * 
 * @param cid - Content identifier
 * @param options - Fetch options
 * @returns Promise resolving to StreamResult
 * @throws IpfsError if retrieval fails
 */
export async function streamFromIpfs(
  cid: string,
  options: FetchOptions = {}
): Promise<StreamResult> {
  const result = await fetchFromIpfs(cid, options)
  
  // Wrap the downloaded bytes in a ReadableStream
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(result.data)
      controller.close()
    }
  })
  
  return {
    stream,
    url: result.url,
    gateway: 'synapse',
    contentType: 'application/octet-stream',
    contentLength: result.size,
  }
}

// ============================================================================
// Encrypted Data Fetching
// ============================================================================

/**
 * Fetch encrypted data for decryption.
 * Convenience wrapper with appropriate defaults for encrypted video content.
 */
export async function fetchEncryptedData(
  cid: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  const encryptedOptions: FetchOptions = {
    timeout: 60000,
    retries: 3,
    ...options,
  }
  
  return fetchFromIpfs(cid, encryptedOptions)
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Fetch multiple CIDs in parallel with concurrency limit.
 */
export async function fetchMultiple(
  cids: string[],
  options: FetchOptions = {},
  concurrency: number = 3
): Promise<(FetchResult | null)[]> {
  const results: (FetchResult | null)[] = new Array(cids.length).fill(null)
  
  for (let i = 0; i < cids.length; i += concurrency) {
    const batch = cids.slice(i, i + concurrency)
    const batchPromises = batch.map(async (cid) => {
      try {
        return await fetchFromIpfs(cid, options)
      } catch (error) {
        console.error(`[ipfsService] Failed to fetch ${cid}:`, error)
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

export { IpfsError, getIpfsErrorMessage, isValidCid }