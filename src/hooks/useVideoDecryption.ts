/**
 * React Hook for Video Decryption
 * 
 * Provides a comprehensive hook for decrypting encrypted videos using
 * hybrid decryption (AES-256-GCM + Lit BLS-IBE) with wallet-based authentication.
 * Includes progress tracking, error handling, memory management, and cancellation support.
 * 
 * @module hooks/useVideoDecryption
 */

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import type { Video } from '@/types'
import { decryptAesKey, getDecryptionErrorMessage } from '@/lib/lit-decrypt'
import { aesDecryptToCache, base64ToUint8Array, checkLargeFileSupport } from '@/lib/crypto'
import { createBufferLifecycle } from '@/lib/buffer-lifecycle'
import { sepolia, mainnet } from '@reown/appkit/networks'

// ============================================================================
// Types
// ============================================================================

/**
 * Status of the decryption process.
 */
export type DecryptionStatus =
  | 'idle'           // Not started
  | 'checking'       // Checking video metadata
  | 'fetching'       // Downloading encrypted data
  | 'authenticating' // Getting auth from Lit (requires wallet signature)
  | 'decrypting-key' // Decrypting AES key
  | 'decrypting-file' // Decrypting video file
  | 'complete'       // Decryption complete
  | 'error'          // Error occurred
  | 'cancelled'      // User cancelled

/**
 * Return type for the useVideoDecryption hook.
 */
export interface UseVideoDecryptionReturn {
  /** Current decryption status */
  status: DecryptionStatus
  
  /** Human-readable progress message */
  progress: string
  
  /** Error object if decryption failed */
  error: Error | null
  
  /** Blob URL for the decrypted video (null until complete) */
  decryptedUrl: string | null
  
  /** Percentage complete (0-100, approximate) */
  percentComplete: number
  
  /** Whether a large file warning should be shown */
  showLargeFileWarning: boolean
  
  /** Start decryption of a video */
  decrypt: (video: Video, encryptedData: Uint8Array) => Promise<string | null>
  
  /** Cancel ongoing decryption */
  cancel: () => void
  
  /** Reset all state */
  reset: () => void
}

/**
 * Options for the useVideoDecryption hook.
 */
export interface UseVideoDecryptionOptions {
  /**
   * Threshold for large file warning (in bytes).
   * Default: 500MB
   */
  largeFileThreshold?: number
  
  /**
   * Maximum file size to attempt decrypting (in bytes).
   * Decryption will fail if exceeded.
   * Default: 2GB
   */
  maxFileSize?: number
  
  /**
   * Callback when decryption completes successfully.
   */
  onSuccess?: (url: string) => void
  
  /**
   * Callback when decryption fails.
   */
  onError?: (error: Error) => void
  
  /**
   * Callback for progress updates.
   */
  onProgress?: (status: DecryptionStatus, message: string, percent: number) => void
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_LARGE_FILE_THRESHOLD = 500 * 1024 * 1024 // 500MB
const DEFAULT_MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024 // 2GB

// Progress percentages for each stage
const PROGRESS_WEIGHTS: Record<DecryptionStatus, number> = {
  'idle': 0,
  'checking': 5,
  'fetching': 10,
  'authenticating': 30,
  'decrypting-key': 50,
  'decrypting-file': 70,
  'complete': 100,
  'error': 0,
  'cancelled': 0,
}

// ============================================================================
// Hook
// ============================================================================

/**
 * React hook for decrypting encrypted videos with wallet-based authentication.
 * 
 * This hook manages the full hybrid decryption process:
 * 1. Authenticate with Lit Protocol using the connected wallet (SIWE signature)
 * 2. Decrypt the AES key using Lit Protocol (BLS-IBE)
 * 3. Decrypt the video content using AES-256-GCM
 * 4. Create a blob URL for playback
 * 
 * Features:
 * - Progress tracking with user-friendly messages
 * - Error handling with specific error types
 * - Memory management (revokes blob URLs automatically)
 * - Large file warnings (>500MB by default)
 * - Cancellation support via AbortController
 * - Automatic cleanup on unmount
 * - Wallet-based authentication (no private key needed)
 * 
 * @param options - Hook options
 * @returns Object containing state and control functions
 * 
 * @example
 * ```typescript
 * function VideoPlayer({ video, encryptedData }) {
 *   const { 
 *     status, 
 *     progress, 
 *     error, 
 *     decryptedUrl, 
 *     decrypt,
 *     cancel 
 *   } = useVideoDecryption()
 * 
 *   useEffect(() => {
 *     if (video.isEncrypted && encryptedData) {
 *       decrypt(video, encryptedData)
 *     }
 *   }, [video, encryptedData])
 * 
 *   if (status === 'decrypting-key' || status === 'decrypting-file') {
 *     return <Loading message={progress} />
 *   }
 * 
 *   if (error) {
 *     return <Error message={error.message} />
 *   }
 * 
 *   if (decryptedUrl) {
 *     return <video src={decryptedUrl} controls />
 *   }
 * 
 *   return <div>Ready to decrypt</div>
 * }
 * ```
 */
export function useVideoDecryption(
  options: UseVideoDecryptionOptions = {}
): UseVideoDecryptionReturn {
  const {
    largeFileThreshold = DEFAULT_LARGE_FILE_THRESHOLD,
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    onSuccess,
    onError,
    onProgress,
  } = options

  // Get wallet client from wagmi for authentication (Lit SDK v8 requires WalletClient)
  const { address, isConnected, chainId } = useAccount()
  const { data: walletClient } = useWalletClient()

  // State
  const [status, setStatus] = useState<DecryptionStatus>('idle')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<Error | null>(null)
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null)
  const [percentComplete, setPercentComplete] = useState(0)
  const [showLargeFileWarning, setShowLargeFileWarning] = useState(false)

  // Refs for cleanup and cancellation
  const abortControllerRef = useRef<AbortController | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const isMountedRef = useRef(true)

  // Refs for wallet values — keeps decrypt callback stable across re-renders
  // (useWalletClient() can return a new object reference on every render,
  // which would otherwise cause the callback → loadVideo → useEffect chain to loop)
  const addressRef = useRef(address)
  const walletClientRef = useRef(walletClient)
  const chainIdRef = useRef(chainId)

  // Keep refs in sync
  useEffect(() => {
    addressRef.current = address
    walletClientRef.current = walletClient
    chainIdRef.current = chainId
  }, [address, walletClient, chainId])

  // Track mount state (must set true on mount to handle React Strict Mode remounts)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
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

    // Revoke existing blob URL
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }

    if (isMountedRef.current) {
      setStatus('idle')
      setProgress('')
      setError(null)
      setDecryptedUrl(null)
      setPercentComplete(0)
      setShowLargeFileWarning(false)
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
    newStatus: DecryptionStatus, 
    message: string
  ) => {
    const percent = PROGRESS_WEIGHTS[newStatus]
    
    if (isMountedRef.current) {
      setStatus(newStatus)
      setProgress(message)
      setPercentComplete(percent)
    }
    
    onProgress?.(newStatus, message, percent)
  }, [onProgress])

  /**
   * Decrypt a video using the connected wallet for authentication.
   * 
   * Uses BufferLifecycleManager for aggressive memory cleanup to ensure
   * intermediate buffers are released as soon as they're no longer needed,
   * rather than waiting for JavaScript's garbage collector.
   * 
   * @param video - The video to decrypt
   * @param encryptedData - The encrypted video data
   * @returns Promise resolving to the blob URL or null if failed
   */
  const decrypt = useCallback(async (
    video: Video,
    encryptedData: Uint8Array
  ): Promise<string | null> => {
    // Reset state first
    reset()

    // Check if component is still mounted
    if (!isMountedRef.current) {
      return null
    }

    // Read wallet values from refs (stable references, no re-render loop)
    const currentAddress = addressRef.current
    const currentWalletClient = walletClientRef.current
    const currentChainId = chainIdRef.current

    // Check if wallet is connected
    if (!currentAddress || !currentWalletClient) {
      const walletError = new Error('Please connect your wallet to decrypt this video.')
      if (isMountedRef.current) {
        setError(walletError)
        setStatus('error')
        setProgress('Wallet not connected')
      }
      onError?.(walletError)
      return null
    }

    // Create new abort controller for this operation
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    // Create buffer lifecycle manager for this decryption operation
    const lifecycle = createBufferLifecycle()

    try {
      // Step 0: Validate video is encrypted
      updateProgress('checking', 'Checking video encryption...')

      if (!video.isEncrypted) {
        throw new Error('Video is not encrypted')
      }

      if (!video.litEncryptionMetadata) {
        throw new Error('Missing encryption metadata')
      }

      // Step 1: Check file size
      const fileSize = encryptedData.byteLength

      if (fileSize > maxFileSize) {
        throw new Error(
          `File size (${(fileSize / 1024 / 1024).toFixed(0)}MB) exceeds maximum ` +
          `supported size (${(maxFileSize / 1024 / 1024).toFixed(0)}MB)`
        )
      }

      if (fileSize > largeFileThreshold) {
        if (isMountedRef.current) {
          setShowLargeFileWarning(true)
        }
        
        // Check browser support for large files (computed inside callback to avoid
        // creating a new object on every render which would destabilize this callback)
        const largeFileSupport = checkLargeFileSupport()

        // Log warnings for very large files
        if (fileSize > largeFileSupport.maxRecommended) {
          console.warn(
            `[useVideoDecryption] Large file detected (${(fileSize / 1024 / 1024).toFixed(0)}MB). ` +
            'Browser may struggle with decryption.',
            largeFileSupport.warnings
          )
        }
      }

      if (signal.aborted) {
        throw new Error('Decryption cancelled')
      }

      // Track encrypted data for lifecycle management
      lifecycle.track('encrypted', encryptedData)

      // Step 2: Decrypt AES key using Lit with wallet authentication
      updateProgress('authenticating', 'Authenticating with Lit Protocol...')

      // Get chain from chainId
      const chain = currentChainId === sepolia.id ? sepolia : mainnet

      const { aesKey } = await decryptAesKey({
        metadata: video.litEncryptionMetadata,
        walletClient: currentWalletClient,
        chain: chain,
        onProgress: (msg) => {
          if (msg.includes('key') || msg.includes('Key')) {
            updateProgress('decrypting-key', msg)
          }
        },
        signal,
      })

      // Track the AES key for secure cleanup
      lifecycle.track('aesKey', aesKey)

      if (signal.aborted) {
        throw new Error('Decryption cancelled')
      }

      // Step 3: Decrypt file using AES and write directly to Cache API
      updateProgress('decrypting-file', 'Decrypting and caching video...')

      const iv = base64ToUint8Array(video.litEncryptionMetadata.iv)
      const mimeType = video.litEncryptionMetadata.originalMimeType || 'video/mp4'

      // Decrypt and write directly to Cache API (no blob URL)
      const url = await aesDecryptToCache(
        encryptedData,
        aesKey,
        iv,
        video.id,
        mimeType
      )

      // Encrypted data and AES key are no longer needed after decryption
      // Release them eagerly for immediate memory reclamation
      lifecycle.release('encrypted')
      lifecycle.release('aesKey')

      if (signal.aborted) {
        throw new Error('Decryption cancelled')
      }

      // Success: Update state
      if (isMountedRef.current) {
        setDecryptedUrl(url)
        setStatus('complete')
        setProgress('Decryption complete')
        setPercentComplete(100)
        setShowLargeFileWarning(false)
      }

      onSuccess?.(url)
      return url

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

      // Log error for debugging
      console.error('[useVideoDecryption] Decryption failed:', err)

      if (isMountedRef.current) {
        const errorObj = new Error(errorMessage)
        setError(errorObj)
        setStatus('error')
        setProgress('Decryption failed')
      }

      onError?.(err instanceof Error ? err : new Error(errorMessage))
      return null
    } finally {
      // Release all remaining tracked buffers
      // This ensures no memory leaks on success, error, or cancellation
      lifecycle.releaseAll()
    }
  }, [
    reset,
    updateProgress,
    largeFileThreshold,
    maxFileSize,
    onSuccess,
    onError,
  ])

  return {
    status,
    progress,
    error,
    decryptedUrl,
    percentComplete,
    showLargeFileWarning,
    decrypt,
    cancel,
    reset,
  }
}

/**
 * React hook for video decryption with automatic initialization.
 * 
 * Similar to useVideoDecryption but automatically starts decryption
 * when the dependencies change.
 * 
 * @param video - The video to decrypt
 * @param encryptedData - The encrypted video data
 * @param options - Hook options
 * @returns Object containing state (without decrypt function)
 * 
 * @example
 * ```typescript
 * function VideoPlayer({ video, encryptedData }) {
 *   const { decryptedUrl, status, error, progress } = useVideoDecryptionAuto(
 *     video,
 *     encryptedData,
 *     { onSuccess: (url) => console.log('Ready:', url) }
 *   )
 * 
 *   if (status === 'decrypting-file') {
 *     return <Loading message={progress} />
 *   }
 * 
 *   return decryptedUrl ? <video src={decryptedUrl} controls /> : null
 * }
 * ```
 */
export function useVideoDecryptionAuto(
  video: Video | null | undefined,
  encryptedData: Uint8Array | null | undefined,
  options: UseVideoDecryptionOptions & { enabled?: boolean } = {}
): Omit<UseVideoDecryptionReturn, 'decrypt'> {
  const { enabled = true, ...decryptionOptions } = options
  const {
    status,
    progress,
    error,
    decryptedUrl,
    percentComplete,
    showLargeFileWarning,
    decrypt,
    cancel,
    reset,
  } = useVideoDecryption(decryptionOptions)

  useEffect(() => {
    if (enabled && video && encryptedData && status === 'idle') {
      decrypt(video, encryptedData)
    }
  }, [enabled, video, encryptedData, status, decrypt])

  return {
    status,
    progress,
    error,
    decryptedUrl,
    percentComplete,
    showLargeFileWarning,
    cancel,
    reset,
  }
}
