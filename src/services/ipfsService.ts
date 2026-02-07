/**
 * IPFS Fetch Service
 * 
 * Provides functions for fetching content from IPFS with gateway fallback,
 * progress tracking, timeout handling, and retry logic.
 * 
 * @module services/ipfsService
 */

import { 
  getIpfsConfig, 
  buildIpfsUrl, 
  normalizeCid,
  isValidCid,
  IpfsError,
  getIpfsErrorMessage,
} from '@/lib/ipfs'

// ============================================================================
// Types
// ============================================================================

/**
 * Options for fetching content from IPFS.
 */
export interface FetchOptions {
  /** Request timeout in milliseconds */
  timeout?: number
  /** Number of retry attempts per gateway */
  retries?: number
  /** Progress callback - receives downloaded bytes and total bytes */
  onProgress?: (downloaded: number, total: number) => void
  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal
  /** Initial delay between retries in milliseconds */
  retryDelayMs?: number
}

/**
 * Result of a successful IPFS fetch operation.
 */
export interface FetchResult {
  /** Fetched data as Uint8Array */
  data: Uint8Array
  /** URL that successfully served the content */
  url: string
  /** Gateway that successfully served the content */
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
  /** URL that successfully serves the content */
  url: string
  /** Gateway that successfully serves the content */
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
// Fetch with Timeout
// ============================================================================

/**
 * Fetch with timeout support.
 * 
 * @param url - URL to fetch
 * @param options - Fetch options including timeout and signal
 * @returns Promise resolving to Response
 * @throws IpfsError on timeout or fetch failure
 */
async function fetchWithTimeout(
  url: string,
  options: { timeout: number; signal?: AbortSignal }
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), options.timeout)
  
  try {
    // Use provided signal or our timeout controller
    const signal = options.signal || controller.signal
    
    const response = await fetch(url, { signal })
    return response
  } catch (error) {
    if (isAbortError(error)) {
      throw new IpfsError(
        'Request timed out',
        'TIMEOUT'
      )
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

// ============================================================================
// Progress Tracking
// ============================================================================

/**
 * Read response body with progress tracking.
 * 
 * @param response - Fetch Response object
 * @param onProgress - Optional progress callback
 * @param totalSize - Expected total size (from Content-Length header)
 * @returns Promise resolving to Uint8Array of all data
 */
async function readWithProgress(
  response: Response,
  onProgress?: (downloaded: number, total: number) => void,
  totalSize: number = 0
): Promise<Uint8Array> {
  if (!response.body) {
    throw new IpfsError('Response has no body', 'FETCH_FAILED')
  }
  
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let downloaded = 0
  
  try {
    while (true) {
      const { done, value } = await reader.read()
      
      if (done) {
        break
      }
      
      chunks.push(value)
      downloaded += value.length
      
      // Report progress
      onProgress?.(downloaded, totalSize)
    }
  } finally {
    reader.releaseLock()
  }
  
  // Combine chunks into single Uint8Array
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  
  return result
}

// ============================================================================
// Main Fetch Function
// ============================================================================

/**
 * Fetch content from IPFS with gateway fallback and retry logic.
 * 
 * Attempts to fetch content from multiple gateways in sequence, with retries
 * for each gateway. Provides progress tracking and cancellation support.
 * 
 * @param cid - IPFS content identifier
 * @param options - Fetch options
 * @returns Promise resolving to FetchResult
 * @throws IpfsError if all gateways fail
 * 
 * @example
 * ```typescript
 * // Basic fetch
 * const result = await fetchFromIpfs('Qmabc123')
 * console.log(`Fetched ${result.size} bytes from ${result.gateway}`)
 * 
 * // With progress tracking
 * const result = await fetchFromIpfs('Qmabc123', {
 *   onProgress: (downloaded, total) => {
 *     const percent = total > 0 ? (downloaded / total) * 100 : 0
 *     console.log(`Progress: ${percent.toFixed(1)}%`)
 *   }
 * })
 * 
 * // With timeout and custom retries
 * const result = await fetchFromIpfs('Qmabc123', {
 *   timeout: 60000,  // 60 second timeout
 *   retries: 5,      // 5 retries per gateway
 * })
 * ```
 */
export async function fetchFromIpfs(
  cid: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  // Validate CID
  if (!isValidCid(cid)) {
    throw new IpfsError(
      `Invalid CID: ${cid}`,
      'INVALID_CID',
      cid
    )
  }
  
  const normalizedCid = normalizeCid(cid)
  const config = getIpfsConfig()
  
  // Build gateway list (primary first, then fallbacks)
  const gateways = [config.primaryGateway, ...config.fallbackGateways]
  
  // Apply options with defaults
  const timeout = options.timeout || config.timeout
  const maxRetries = options.retries || config.retries
  const retryDelayMs = options.retryDelayMs || 1000
  
  let lastError: Error | null = null
  
  // Try each gateway
  for (const gateway of gateways) {
    const url = buildIpfsUrl(normalizedCid, gateway)
    
    // Retry loop for this gateway
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Check for abort before attempting
        if (options.abortSignal?.aborted) {
          throw new IpfsError('Fetch aborted', 'ABORTED', normalizedCid)
        }
        
        const startTime = performance.now()
        
        // Fetch with timeout
        const response = await fetchWithTimeout(url, {
          timeout,
          signal: options.abortSignal,
        })
        
        if (!response.ok) {
          throw new IpfsError(
            `HTTP ${response.status}: ${response.statusText}`,
            'FETCH_FAILED',
            normalizedCid,
            gateway
          )
        }
        
        // Get content length if available
        const contentLength = response.headers.get('content-length')
        const totalSize = contentLength ? parseInt(contentLength, 10) : 0
        
        // Read with progress tracking
        const data = await readWithProgress(response, options.onProgress, totalSize)
        
        const duration = performance.now() - startTime
        
        return {
          data,
          url,
          gateway,
          size: data.byteLength,
          duration,
          headers: response.headers,
        }
        
      } catch (error) {
        // Handle abort
        if (error instanceof IpfsError && error.code === 'ABORTED') {
          throw error
        }
        if (isAbortError(error)) {
          throw new IpfsError('Fetch aborted', 'ABORTED', normalizedCid)
        }
        
        lastError = error instanceof Error ? error : new Error(String(error))
        
        console.warn(
          `[ipfsService] Gateway ${gateway} attempt ${attempt + 1}/${maxRetries} failed:`,
          lastError.message
        )
        
        // Don't retry if aborted
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
  }
  
  // All gateways failed
  throw new IpfsError(
    `Failed to fetch from all gateways. Last error: ${lastError?.message}`,
    'ALL_GATEWAYS_FAILED',
    normalizedCid
  )
}

// ============================================================================
// Streaming Functions
// ============================================================================

/**
 * Stream content from IPFS (for large files).
 * Returns a ReadableStream instead of buffering the entire file.
 * 
 * @param cid - IPFS content identifier
 * @param options - Fetch options
 * @returns Promise resolving to StreamResult
 * @throws IpfsError if all gateways fail
 * 
 * @example
 * ```typescript
 * // Stream a large video file
 * const { stream, contentType } = await streamFromIpfs('QmLargeVideo123')
 * 
 * // Pipe to video element
 * const mediaSource = new MediaSource()
 * const sourceBuffer = mediaSource.addSourceBuffer(contentType || 'video/mp4')
 * 
 * const reader = stream.getReader()
 * while (true) {
 *   const { done, value } = await reader.read()
 *   if (done) break
 *   sourceBuffer.appendBuffer(value)
 * }
 * ```
 */
export async function streamFromIpfs(
  cid: string,
  options: FetchOptions = {}
): Promise<StreamResult> {
  // Validate CID
  if (!isValidCid(cid)) {
    throw new IpfsError(
      `Invalid CID: ${cid}`,
      'INVALID_CID',
      cid
    )
  }
  
  const normalizedCid = normalizeCid(cid)
  const config = getIpfsConfig()
  const gateways = [config.primaryGateway, ...config.fallbackGateways]
  const timeout = options.timeout || config.timeout
  
  for (const gateway of gateways) {
    try {
      const url = buildIpfsUrl(normalizedCid, gateway)
      
      // Check for abort
      if (options.abortSignal?.aborted) {
        throw new IpfsError('Fetch aborted', 'ABORTED', normalizedCid)
      }
      
      const response = await fetchWithTimeout(url, {
        timeout,
        signal: options.abortSignal,
      })
      
      if (!response.ok) {
        throw new IpfsError(
          `HTTP ${response.status}`,
          'FETCH_FAILED',
          normalizedCid,
          gateway
        )
      }
      
      if (!response.body) {
        throw new IpfsError(
          'No response body',
          'FETCH_FAILED',
          normalizedCid,
          gateway
        )
      }
      
      const contentLength = response.headers.get('content-length')
      const contentType = response.headers.get('content-type') || undefined
      
      return {
        stream: response.body,
        url,
        gateway,
        contentType,
        contentLength: contentLength ? parseInt(contentLength, 10) : undefined,
      }
      
    } catch (error) {
      // Don't try other gateways on abort
      if (error instanceof IpfsError && error.code === 'ABORTED') {
        throw error
      }
      if (isAbortError(error)) {
        throw new IpfsError('Fetch aborted', 'ABORTED', normalizedCid)
      }
      
      console.warn(`[ipfsService] Streaming from ${gateway} failed:`, error)
      continue
    }
  }
  
  throw new IpfsError(
    'Failed to stream from all gateways',
    'ALL_GATEWAYS_FAILED',
    normalizedCid
  )
}

// ============================================================================
// Encrypted Data Fetching
// ============================================================================

/**
 * Fetch encrypted data from IPFS for decryption.
 * This is a convenience wrapper around fetchFromIpfs with appropriate defaults
 * for fetching encrypted video content.
 * 
 * @param cid - Encrypted content CID
 * @param options - Fetch options
 * @returns Promise resolving to FetchResult
 * 
 * @example
 * ```typescript
 * // Fetch encrypted video data
 * const { data } = await fetchEncryptedData(video.encryptedCid!, {
 *   onProgress: (downloaded, total) => {
 *     console.log(`Downloading: ${downloaded}/${total}`)
 *   }
 * })
 * 
 * // Decrypt the data
 * const decrypted = await decryptVideo(data, encryptionMetadata)
 * ```
 */
export async function fetchEncryptedData(
  cid: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  // Use longer timeout for encrypted data (typically larger files)
  const encryptedOptions: FetchOptions = {
    timeout: 60000, // 60 second default for encrypted content
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
 * 
 * @param cids - Array of CIDs to fetch
 * @param options - Fetch options applied to each fetch
 * @param concurrency - Maximum concurrent fetches (default: 3)
 * @returns Promise resolving to array of FetchResults (or null for failed)
 * 
 * @example
 * ```typescript
 * const cids = ['QmA', 'QmB', 'QmC']
 * const results = await fetchMultiple(cids, {}, 2) // Max 2 concurrent
 * 
 * results.forEach((result, i) => {
 *   if (result) {
 *     console.log(`Fetched ${cids[i]}: ${result.size} bytes`)
 *   } else {
 *     console.log(`Failed to fetch ${cids[i]}`)
 *   }
 * })
 * ```
 */
export async function fetchMultiple(
  cids: string[],
  options: FetchOptions = {},
  concurrency: number = 3
): Promise<(FetchResult | null)[]> {
  const results: (FetchResult | null)[] = new Array(cids.length).fill(null)
  
  // Process in batches
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
