/**
 * React Hook for CID Decryption
 * 
 * Provides a hook for decrypting encrypted Filecoin CIDs using
 * Lit Protocol with wallet-based authentication.
 * 
 * @module hooks/useCidDecryption
 */

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useAppKitProvider } from '@reown/appkit/react'
import { useAccount } from 'wagmi'
import type { Video } from '@/types'
import { decryptCid, getDecryptionErrorMessage } from '@/lib/lit-decrypt'
import { sepolia, mainnet } from '@reown/appkit/networks'

// ============================================================================
// Types
// ============================================================================

/**
 * Status of the CID decryption process.
 */
export type CidDecryptionStatus =
  | 'idle'           // Not started
  | 'checking'       // Checking if CID is encrypted
  | 'authenticating' // Authenticating with wallet
  | 'decrypting'     // Decrypting CID
  | 'complete'       // Decryption complete
  | 'error'          // Error occurred
  | 'cancelled'      // User cancelled

/**
 * Return type for the useCidDecryption hook.
 */
export interface UseCidDecryptionReturn {
  /** Current decryption status */
  status: CidDecryptionStatus
  
  /** Whether decryption is in progress */
  isDecrypting: boolean
  
  /** Human-readable progress message */
  progress: string
  
  /** Error object if decryption failed */
  error: Error | null
  
  /** The decrypted CID (null until complete) */
  cid: string | null
  
  /** Start CID decryption */
  decryptCid: (video: Video) => Promise<string | null>
  
  /** Cancel ongoing decryption */
  cancel: () => void
  
  /** Reset all state */
  reset: () => void
}

/**
 * Options for the useCidDecryption hook.
 */
export interface UseCidDecryptionOptions {
  /**
   * Callback when decryption completes successfully.
   */
  onSuccess?: (cid: string) => void
  
  /**
   * Callback when decryption fails.
   */
  onError?: (error: Error) => void
  
  /**
   * Callback for progress updates.
   */
  onProgress?: (status: CidDecryptionStatus, message: string) => void
}

// ============================================================================
// Hook
// ============================================================================

/**
 * React hook for decrypting encrypted Filecoin CIDs with wallet-based authentication.
 * 
 * For encrypted videos, the actual Filecoin CID is often encrypted
 * separately from the content for additional privacy. This hook
 * decrypts that CID using the connected wallet for authentication.
 * 
 * Features:
 * - Automatic detection of unencrypted CIDs (returns directly)
 * - Progress tracking with user-friendly messages
 * - Error handling with user-friendly messages
 * - Cancellation support
 * - Automatic cleanup on unmount
 * - Wallet-based authentication (no private key needed)
 * 
 * @param options - Hook options
 * @returns Object containing state and control functions
 * 
 * @example
 * ```typescript
 * function VideoFetcher({ video }) {
 *   const { cid, isDecrypting, error, decryptCid } = useCidDecryption()
 * 
 *   useEffect(() => {
 *     decryptCid(video)
 *   }, [video])
 * 
 *   if (isDecrypting) {
 *     return <Loading message="Decrypting CID..." />
 *   }
 * 
 *   if (error) {
 *     return <Error message={error.message} />
 *   }
 * 
 *   if (cid) {
 *     return <VideoStream cid={cid} />
 *   }
 * 
 *   return null
 * }
 * ```
 */
export function useCidDecryption(
  options: UseCidDecryptionOptions = {}
): UseCidDecryptionReturn {
  const { onSuccess, onError, onProgress } = options

  // Get wallet client from AppKit for authentication
  const { address, isConnected, chainId } = useAccount()
  const { walletProvider } = useAppKitProvider('eip155')

  // State
  const [status, setStatus] = useState<CidDecryptionStatus>('idle')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<Error | null>(null)
  const [cid, setCid] = useState<string | null>(null)

  // Refs for cleanup and cancellation
  const abortControllerRef = useRef<AbortController | null>(null)
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
    abortControllerRef.current?.abort()
    abortControllerRef.current = null

    if (isMountedRef.current) {
      setStatus('idle')
      setProgress('')
      setError(null)
      setCid(null)
    }
  }, [])

  /**
   * Cancel ongoing decryption.
   */
  const cancel = useCallback(() => {
    abortControllerRef.current?.abort()

    if (isMountedRef.current) {
      setStatus('cancelled')
      setProgress('Decryption cancelled')
    }
  }, [])

  /**
   * Update progress state with callback.
   */
  const updateProgress = useCallback((
    newStatus: CidDecryptionStatus,
    message: string
  ) => {
    if (isMountedRef.current) {
      setStatus(newStatus)
      setProgress(message)
    }
    onProgress?.(newStatus, message)
  }, [onProgress])

  /**
   * Decrypt the CID for a video using the connected wallet.
   * 
   * If the video's CID is not encrypted, returns the filecoinCid directly.
   * 
   * @param video - The video whose CID to decrypt
   * @returns Promise resolving to the CID string or null if failed
   */
  const decryptCidCallback = useCallback(async (
    video: Video
  ): Promise<string | null> => {
    reset()

    if (!isMountedRef.current) {
      return null
    }

    // Check if wallet is connected
    if (!address || !walletProvider) {
      const walletError = new Error('Please connect your wallet to decrypt this CID.')
      if (isMountedRef.current) {
        setError(walletError)
        setStatus('error')
        setProgress('Wallet not connected')
      }
      onError?.(walletError)
      return null
    }

    // Create abort controller for this operation
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    try {
      // Check if CID is encrypted
      updateProgress('checking', 'Checking CID encryption...')

      // If no encrypted CID metadata, return the plain CID directly
      if (!video.encryptedCid || !video.cidEncryptionMetadata) {
        const plainCid = video.filecoinCid || null
        
        if (plainCid) {
          updateProgress('complete', 'Using unencrypted CID')
          setCid(plainCid)
          onSuccess?.(plainCid)
        }
        
        return plainCid
      }

      if (signal.aborted) {
        throw new Error('Decryption cancelled')
      }

      // Decrypt the CID using wallet-based authentication
      updateProgress('authenticating', 'Authenticating with Lit Protocol...')

      // Get chain from chainId
      const chain = chainId === sepolia.id ? sepolia : mainnet

      const decryptedCid = await decryptCid({
        metadata: video.cidEncryptionMetadata,
        walletProvider: walletProvider,
        chain: chain,
        onProgress: (msg) => updateProgress('decrypting', msg),
        signal,
      })

      if (signal.aborted) {
        throw new Error('Decryption cancelled')
      }

      if (!decryptedCid) {
        throw new Error('CID decryption returned empty result')
      }

      // Success
      if (isMountedRef.current) {
        setCid(decryptedCid)
        setStatus('complete')
        setProgress('CID decrypted')
      }

      onSuccess?.(decryptedCid)
      return decryptedCid

    } catch (err) {
      // Handle cancellation
      if (err instanceof Error && err.message === 'Decryption cancelled') {
        if (isMountedRef.current) {
          setStatus('cancelled')
          setProgress('Decryption cancelled')
        }
        return null
      }

      // Get user-friendly error message
      const errorMessage = getDecryptionErrorMessage(err)

      console.error('[useCidDecryption] CID decryption failed:', err)

      if (isMountedRef.current) {
        const errorObj = new Error(errorMessage)
        setError(errorObj)
        setStatus('error')
      }

      onError?.(err instanceof Error ? err : new Error(errorMessage))
      return null
    }
  }, [reset, updateProgress, onSuccess, onError, address, walletProvider, chainId])

  return {
    status,
    isDecrypting: status === 'decrypting' || status === 'checking' || status === 'authenticating',
    progress,
    error,
    cid,
    decryptCid: decryptCidCallback,
    cancel,
    reset,
  }
}

/**
 * React hook for CID decryption with automatic initialization.
 * 
 * Similar to useCidDecryption but automatically starts decryption
 * when the video changes.
 * 
 * @param video - The video to decrypt CID for
 * @param options - Hook options
 * @returns Object containing state (without decryptCid function)
 * 
 * @example
 * ```typescript
 * function VideoFetcher({ video }) {
 *   const { cid, isDecrypting, error } = useCidDecryptionAuto(
 *     video,
 *     { onSuccess: (cid) => console.log('CID:', cid) }
 *   )
 * 
 *   if (isDecrypting) return <Loading />
 *   if (error) return <Error message={error.message} />
 *   if (cid) return <VideoStream cid={cid} />
 *   return null
 * }
 * ```
 */
export function useCidDecryptionAuto(
  video: Video | null | undefined,
  options: UseCidDecryptionOptions & { enabled?: boolean } = {}
): Omit<UseCidDecryptionReturn, 'decryptCid'> {
  const { enabled = true, ...decryptionOptions } = options
  const {
    status,
    isDecrypting,
    progress,
    error,
    cid,
    decryptCid,
    cancel,
    reset,
  } = useCidDecryption(decryptionOptions)

  useEffect(() => {
    if (enabled && video && status === 'idle') {
      decryptCid(video)
    }
  }, [enabled, video, status, decryptCid])

  return {
    status,
    isDecrypting,
    progress,
    error,
    cid,
    cancel,
    reset,
  }
}

// ============================================================================
// Additional Utility Hook
// ============================================================================

/**
 * Hook that combines CID decryption with video decryption.
 * 
 * This is useful for videos where both the CID and the content
 * are encrypted. It first decrypts the CID, then fetches the
 * encrypted data, then decrypts the video.
 * 
 * @returns Object containing state for both operations
 * 
 * @example
 * ```typescript
 * function FullVideoPlayer({ video }) {
 *   const {
 *     cid,
 *     isDecryptingCid,
 *     cidError,
 *     encryptedData,
 *     isFetching,
 *     fetchError,
 *     decryptedUrl,
 *     isDecryptingVideo,
 *     videoError,
 *     progress,
 *     start
 *   } = useFullVideoDecryption()
 * 
 *   useEffect(() => {
 *     start(video)
 *   }, [video])
 * 
 *   // Handle different states...
 * }
 * ```
 */
export interface UseFullVideoDecryptionReturn {
  // CID decryption state
  cid: string | null
  isDecryptingCid: boolean
  cidError: Error | null
  
  // Fetch state
  encryptedData: Uint8Array | null
  isFetching: boolean
  fetchError: Error | null
  
  // Video decryption state
  decryptedUrl: string | null
  isDecryptingVideo: boolean
  videoError: Error | null
  progress: string
  
  // Actions
  start: (video: Video) => Promise<string | null>
  cancel: () => void
  reset: () => void
}

/**
 * @deprecated This hook is a placeholder and not fully implemented.
 * Use useCidDecryption and useVideoDecryption separately for now.
 */
export function useFullVideoDecryption(): UseFullVideoDecryptionReturn {
  const [cid, setCid] = useState<string | null>(null)
  const [isDecryptingCid, setIsDecryptingCid] = useState(false)
  const [cidError, setCidError] = useState<Error | null>(null)
  
  const [encryptedData, setEncryptedData] = useState<Uint8Array | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [fetchError, setFetchError] = useState<Error | null>(null)
  
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null)
  const [isDecryptingVideo, setIsDecryptingVideo] = useState(false)
  const [videoError, setVideoError] = useState<Error | null>(null)
  const [progress, setProgress] = useState('')

  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      abortControllerRef.current?.abort()
    }
  }, [])

  const reset = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null

    if (isMountedRef.current) {
      setCid(null)
      setIsDecryptingCid(false)
      setCidError(null)
      setEncryptedData(null)
      setIsFetching(false)
      setFetchError(null)
      setDecryptedUrl(null)
      setIsDecryptingVideo(false)
      setVideoError(null)
      setProgress('')
    }
  }, [])

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort()
    
    if (isMountedRef.current) {
      setProgress('Cancelled')
    }
  }, [])

  const start = useCallback(async (video: Video): Promise<string | null> => {
    reset()
    
    if (!isMountedRef.current) return null
    
    setProgress('This hook is not fully implemented. Please use useCidDecryption and useVideoDecryption separately.')
    setVideoError(new Error('useFullVideoDecryption is not fully implemented'))
    
    return null
  }, [reset])

  return {
    cid,
    isDecryptingCid,
    cidError,
    encryptedData,
    isFetching,
    fetchError,
    decryptedUrl,
    isDecryptingVideo,
    videoError,
    progress,
    start,
    cancel,
    reset,
  }
}
