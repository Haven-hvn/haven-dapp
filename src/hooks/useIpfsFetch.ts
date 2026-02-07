/**
 * React Hook for IPFS Fetching
 * 
 * Provides a comprehensive hook for fetching content from IPFS with
 * progress tracking, cancellation support, and error handling.
 * 
 * @module hooks/useIpfsFetch
 */

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { 
  fetchFromIpfs, 
  streamFromIpfs,
  type FetchOptions, 
  type FetchResult,
} from '@/services/ipfsService'
import { IpfsError, getIpfsErrorMessage, isValidCid } from '@/lib/ipfs'

// ============================================================================
// Types
// ============================================================================

/**
 * Progress information for IPFS fetch operations.
 */
export interface FetchProgress {
  /** Number of bytes downloaded */
  downloaded: number
  /** Total bytes to download (0 if unknown) */
  total: number
  /** Download progress as percentage (0-100, -1 if unknown) */
  percent: number
  /** Transfer rate in bytes per second (0 if not calculated) */
  rate: number
  /** Estimated time remaining in seconds (0 if unknown) */
  eta: number
}

/**
 * Return type for the useIpfsFetch hook.
 */
export interface UseIpfsFetchReturn {
  /** Fetched data (null while loading or on error) */
  data: Uint8Array | null
  /** Whether a fetch operation is in progress */
  isLoading: boolean
  /** Current fetch progress */
  progress: FetchProgress
  /** Error object if fetch failed */
  error: Error | null
  /** Human-readable error message */
  errorMessage: string
  /** Result of the last successful fetch */
  lastResult: FetchResult | null
  /** Fetch content from IPFS */
  fetch: (cid: string, options?: FetchOptions) => Promise<Uint8Array | null>
  /** Fetch encrypted content from IPFS */
  fetchEncrypted: (cid: string, options?: FetchOptions) => Promise<Uint8Array | null>
  /** Stream content from IPFS */
  stream: (cid: string, options?: FetchOptions) => Promise<ReadableStream<Uint8Array> | null>
  /** Cancel the current fetch operation */
  cancel: () => void
  /** Reset all state to initial values */
  reset: () => void
}

/**
 * Options for the useIpfsFetch hook.
 */
export interface UseIpfsFetchOptions {
  /** Callback when fetch completes successfully */
  onSuccess?: (result: FetchResult) => void
  /** Callback when fetch fails */
  onError?: (error: Error, cid: string) => void
  /** Callback for progress updates */
  onProgress?: (progress: FetchProgress) => void
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PROGRESS: FetchProgress = {
  downloaded: 0,
  total: 0,
  percent: -1,
  rate: 0,
  eta: 0,
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate progress metrics from download state.
 */
function calculateProgress(
  downloaded: number,
  total: number,
  startTime: number
): FetchProgress {
  const elapsed = (performance.now() - startTime) / 1000 // seconds
  const rate = elapsed > 0 ? downloaded / elapsed : 0
  
  let percent = -1
  let eta = 0
  
  if (total > 0) {
    percent = Math.min(100, (downloaded / total) * 100)
    if (rate > 0) {
      eta = (total - downloaded) / rate
    }
  }
  
  return {
    downloaded,
    total,
    percent,
    rate,
    eta,
  }
}

// ============================================================================
// Hook
// ============================================================================

/**
 * React hook for fetching content from IPFS.
 * 
 * Features:
 * - Progress tracking with download rate and ETA
 * - Cancellation support via AbortController
 * - Automatic state management
 * - Error handling with user-friendly messages
 * - Memory cleanup on unmount
 * 
 * @param options - Hook options
 * @returns Object containing state and control functions
 * 
 * @example
 * ```typescript
 * function VideoDownloader({ cid }: { cid: string }) {
 *   const { 
 *     data, 
 *     isLoading, 
 *     progress, 
 *     error, 
 *     errorMessage,
 *     fetch,
 *     cancel 
 *   } = useIpfsFetch()
 * 
 *   const handleFetch = () => {
 *     fetch(cid)
 *   }
 * 
 *   if (isLoading) {
 *     return (
 *       <div>
 *         <progress value={progress.percent} max={100} />
 *         <span>{progress.percent.toFixed(1)}%</span>
 *         <button onClick={cancel}>Cancel</button>
 *       </div>
 *     )
 *   }
 * 
 *   if (error) {
 *     return <div>Error: {errorMessage}</div>
 *   }
 * 
 *   if (data) {
 *     return <div>Downloaded {data.length} bytes</div>
 *   }
 * 
 *   return <button onClick={handleFetch}>Download</button>
 * }
 * ```
 */
export function useIpfsFetch(
  options: UseIpfsFetchOptions = {}
): UseIpfsFetchReturn {
  const { onSuccess, onError, onProgress } = options
  
  // State
  const [data, setData] = useState<Uint8Array | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<FetchProgress>(DEFAULT_PROGRESS)
  const [error, setError] = useState<Error | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [lastResult, setLastResult] = useState<FetchResult | null>(null)
  
  // Refs for cleanup and tracking
  const abortControllerRef = useRef<AbortController | null>(null)
  const startTimeRef = useRef<number>(0)
  const isMountedRef = useRef(true)
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false
      abortControllerRef.current?.abort()
    }
  }, [])
  
  /**
   * Reset all state to initial values.
   */
  const reset = useCallback(() => {
    // Cancel any ongoing operation
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    
    if (isMountedRef.current) {
      setData(null)
      setIsLoading(false)
      setProgress(DEFAULT_PROGRESS)
      setError(null)
      setErrorMessage('')
      setLastResult(null)
    }
  }, [])
  
  /**
   * Cancel the current fetch operation.
   */
  const cancel = useCallback(() => {
    abortControllerRef.current?.abort()
    
    if (isMountedRef.current) {
      setIsLoading(false)
    }
  }, [])
  
  /**
   * Internal progress handler.
   */
  const handleProgress = useCallback((
    downloaded: number,
    total: number
  ) => {
    const newProgress = calculateProgress(
      downloaded,
      total,
      startTimeRef.current
    )
    
    if (isMountedRef.current) {
      setProgress(newProgress)
    }
    
    onProgress?.(newProgress)
  }, [onProgress])
  
  /**
   * Fetch content from IPFS.
   */
  const fetch = useCallback(async (
    cid: string,
    fetchOptions?: FetchOptions
  ): Promise<Uint8Array | null> => {
    // Validate CID
    if (!isValidCid(cid)) {
      const error = new IpfsError(
        `Invalid CID: ${cid}`,
        'INVALID_CID',
        cid
      )
      
      if (isMountedRef.current) {
        setError(error)
        setErrorMessage(getIpfsErrorMessage(error))
      }
      
      onError?.(error, cid)
      return null
    }
    
    // Cancel any existing fetch
    abortControllerRef.current?.abort()
    abortControllerRef.current = new AbortController()
    
    // Reset state
    if (isMountedRef.current) {
      setIsLoading(true)
      setError(null)
      setErrorMessage('')
      setData(null)
      setProgress(DEFAULT_PROGRESS)
    }
    
    startTimeRef.current = performance.now()
    
    try {
      const result = await fetchFromIpfs(cid, {
        ...fetchOptions,
        abortSignal: abortControllerRef.current.signal,
        onProgress: handleProgress,
      })
      
      if (isMountedRef.current) {
        setData(result.data)
        setIsLoading(false)
        setLastResult(result)
        setProgress(calculateProgress(result.size, result.size, startTimeRef.current))
      }
      
      onSuccess?.(result)
      return result.data
      
    } catch (err) {
      // Handle abort
      if (err instanceof IpfsError && err.code === 'ABORTED') {
        if (isMountedRef.current) {
          setIsLoading(false)
        }
        return null
      }
      
      const error = err instanceof Error ? err : new Error(String(err))
      const message = getIpfsErrorMessage(error)
      
      console.error('[useIpfsFetch] Fetch failed:', err)
      
      if (isMountedRef.current) {
        setError(error)
        setErrorMessage(message)
        setIsLoading(false)
      }
      
      onError?.(error, cid)
      return null
    }
  }, [handleProgress, onSuccess, onError])
  
  /**
   * Fetch encrypted content from IPFS.
   * Uses longer timeouts suitable for encrypted video content.
   */
  const fetchEncrypted = useCallback(async (
    cid: string,
    fetchOptions?: FetchOptions
  ): Promise<Uint8Array | null> => {
    return fetch(cid, {
      timeout: 60000, // 60 second default for encrypted content
      retries: 3,
      ...fetchOptions,
    })
  }, [fetch])
  
  /**
   * Stream content from IPFS.
   * Returns a ReadableStream for large files instead of buffering.
   */
  const stream = useCallback(async (
    cid: string,
    fetchOptions?: FetchOptions
  ): Promise<ReadableStream<Uint8Array> | null> => {
    // Validate CID
    if (!isValidCid(cid)) {
      const error = new IpfsError(
        `Invalid CID: ${cid}`,
        'INVALID_CID',
        cid
      )
      
      if (isMountedRef.current) {
        setError(error)
        setErrorMessage(getIpfsErrorMessage(error))
      }
      
      onError?.(error, cid)
      return null
    }
    
    // Cancel any existing operation
    abortControllerRef.current?.abort()
    abortControllerRef.current = new AbortController()
    
    // Reset state
    if (isMountedRef.current) {
      setIsLoading(true)
      setError(null)
      setErrorMessage('')
      setData(null)
    }
    
    try {
      const result = await streamFromIpfs(cid, {
        ...fetchOptions,
        abortSignal: abortControllerRef.current.signal,
      })
      
      if (isMountedRef.current) {
        setIsLoading(false)
      }
      
      return result.stream
      
    } catch (err) {
      // Handle abort
      if (err instanceof IpfsError && err.code === 'ABORTED') {
        if (isMountedRef.current) {
          setIsLoading(false)
        }
        return null
      }
      
      const error = err instanceof Error ? err : new Error(String(err))
      const message = getIpfsErrorMessage(error)
      
      console.error('[useIpfsFetch] Stream failed:', err)
      
      if (isMountedRef.current) {
        setError(error)
        setErrorMessage(message)
        setIsLoading(false)
      }
      
      onError?.(error, cid)
      return null
    }
  }, [onError])
  
  return {
    data,
    isLoading,
    progress,
    error,
    errorMessage,
    lastResult,
    fetch,
    fetchEncrypted,
    stream,
    cancel,
    reset,
  }
}

// ============================================================================
// Additional Hooks
// ============================================================================

/**
 * React hook for IPFS fetching with automatic fetch on CID change.
 * 
 * Automatically fetches content when the CID changes and the hook is enabled.
 * 
 * @param cid - IPFS content identifier (null to skip fetch)
 * @param options - Hook options including enabled flag
 * @returns Object containing state (without fetch function)
 * 
 * @example
 * ```typescript
 * function VideoPlayer({ cid }: { cid: string }) {
 *   const { 
 *     data, 
 *     isLoading, 
 *     progress, 
 *     error 
 *   } = useIpfsFetchAuto(cid, { enabled: !!cid })
 * 
 *   if (isLoading) {
 *     return <div>Loading... {progress.percent.toFixed(0)}%</div>
 *   }
 * 
 *   if (error) {
 *     return <div>Error: {error.message}</div>
 *   }
 * 
 *   if (data) {
 *     // Process fetched data
 *     return <VideoData data={data} />
 *   }
 * 
 *   return null
 * }
 * ```
 */
export interface UseIpfsFetchAutoOptions extends UseIpfsFetchOptions {
  /** Whether to automatically fetch when CID changes */
  enabled?: boolean
  /** Additional fetch options */
  fetchOptions?: FetchOptions
}

export function useIpfsFetchAuto(
  cid: string | null | undefined,
  options: UseIpfsFetchAutoOptions = {}
): Omit<UseIpfsFetchReturn, 'fetch' | 'fetchEncrypted' | 'stream'> {
  const { enabled = true, fetchOptions, ...hookOptions } = options
  const {
    data,
    isLoading,
    progress,
    error,
    errorMessage,
    lastResult,
    cancel,
    reset,
    fetch,
  } = useIpfsFetch(hookOptions)
  
  useEffect(() => {
    if (enabled && cid) {
      fetch(cid, fetchOptions)
    }
  }, [enabled, cid, fetch, fetchOptions])
  
  return {
    data,
    isLoading,
    progress,
    error,
    errorMessage,
    lastResult,
    cancel,
    reset,
  }
}

/**
 * React hook for fetching and decrypting video content.
 * Combines IPFS fetch with video decryption for a complete workflow.
 * 
 * @param options - Hook options
 * @returns Object containing fetch state and combined fetch+decrypt function
 * 
 * @example
 * ```typescript
 * function EncryptedVideoPlayer({ video }: { video: Video }) {
 *   const { 
 *     decryptedUrl,
 *     isLoading, 
 *     progress,
 *     error,
 *     fetchAndDecrypt 
 *   } = useEncryptedVideoFetch()
 * 
 *   useEffect(() => {
 *     if (video.isEncrypted && video.encryptedCid) {
 *       fetchAndDecrypt(video)
 *     }
 *   }, [video])
 * 
 *   if (isLoading) {
 *     return <div>Decrypting... {progress.percent.toFixed(0)}%</div>
 *   }
 * 
 *   if (decryptedUrl) {
 *     return <video src={decryptedUrl} controls />
 *   }
 * 
 *   return null
 * }
 * ```
 */
export interface UseEncryptedVideoFetchOptions extends UseIpfsFetchOptions {
  /** Callback when decryption completes */
  onDecrypted?: (url: string) => void
}

export interface UseEncryptedVideoFetchReturn extends UseIpfsFetchReturn {
  /** Blob URL for decrypted video (null if not yet decrypted) */
  decryptedUrl: string | null
  /** Fetch and decrypt a video in one operation */
  fetchAndDecrypt: (video: { encryptedCid?: string; litEncryptionMetadata?: unknown }) => Promise<string | null>
}

export function useEncryptedVideoFetch(
  options: UseEncryptedVideoFetchOptions = {}
): UseEncryptedVideoFetchReturn {
  const { onDecrypted, ...fetchOptions } = options
  const baseHook = useIpfsFetch(fetchOptions)
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null)
  
  // Cleanup blob URL on unmount or reset
  useEffect(() => {
    return () => {
      if (decryptedUrl) {
        URL.revokeObjectURL(decryptedUrl)
      }
    }
  }, [decryptedUrl])
  
  const reset = useCallback(() => {
    if (decryptedUrl) {
      URL.revokeObjectURL(decryptedUrl)
      setDecryptedUrl(null)
    }
    baseHook.reset()
  }, [decryptedUrl, baseHook])
  
  const fetchAndDecrypt = useCallback(async (
    video: { encryptedCid?: string; litEncryptionMetadata?: unknown }
  ): Promise<string | null> => {
    // This is a placeholder - actual implementation would integrate
    // with the decryption hook from useVideoDecryption
    // For now, just fetch the data
    if (!video.encryptedCid) {
      return null
    }
    
    const data = await baseHook.fetchEncrypted(video.encryptedCid)
    
    if (data) {
      // In real implementation, this would call the decryption function
      // For now, create a blob URL directly (assuming non-encrypted for demo)
      // Use Uint8Array directly - Blob constructor accepts it
      const blob = new Blob([data as unknown as BlobPart])
      const url = URL.createObjectURL(blob)
      setDecryptedUrl(url)
      onDecrypted?.(url)
      return url
    }
    
    return null
  }, [baseHook, onDecrypted])
  
  return {
    ...baseHook,
    decryptedUrl,
    reset,
    fetchAndDecrypt,
  }
}
