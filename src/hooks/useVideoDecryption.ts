/**
 * React Hook for Video Decryption
 *
 * Provides a comprehensive hook for decrypting encrypted videos using
 * Haven-AOL (EIP-712 + VetKD + AES-256-GCM) with wallet-based authentication.
 * Includes progress tracking, error handling, memory management, and cancellation support.
 *
 * @module hooks/useVideoDecryption
 */

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import type { Video } from '@/types'
import { decryptContentKey, getHavenAolErrorMessage, isGateMetadata } from '@/lib/haven-aol'
import { checkLargeFileSupport } from '@/lib/crypto'
import { decryptChunkedToCache, type ChunkedDecryptProgress } from '@/lib/chunked-decrypt'
import { createBufferLifecycle } from '@/lib/buffer-lifecycle'

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
  | 'authenticating' // EIP-712 signing with wallet
  | 'decrypting-key' // Requesting key from ICP canister + VetKD unwrap
  | 'decrypting-file' // Decrypting video file with AES
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
 * This hook manages the full Haven-AOL decryption process:
 * 1. Sign EIP-712 gate request with connected wallet
 * 2. Request decryption key from ICP canister (VetKD)
 * 3. IBE-decrypt the AES key
 * 4. Decrypt the video content using AES-256-GCM
 * 5. Write to Cache API for playback
 *
 * Features:
 * - Progress tracking with user-friendly messages
 * - Error handling with specific error types
 * - Memory management (revokes blob URLs automatically)
 * - Large file warnings (>500MB by default)
 * - Cancellation support via AbortController
 * - Automatic cleanup on unmount
 * - AES key caching (skip ICP call on replay)
 *
 * @param options - Hook options
 * @returns Object containing state and control functions
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

  // Get wallet client from wagmi for authentication
  const { address, chainId } = useAccount()
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
  const addressRef = useRef(address)
  const walletClientRef = useRef(walletClient)
  const chainIdRef = useRef(chainId)

  // Keep refs in sync
  useEffect(() => {
    addressRef.current = address
    walletClientRef.current = walletClient
    chainIdRef.current = chainId
  }, [address, walletClient, chainId])

  // Track mount state
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
    abortControllerRef.current?.abort()
    abortControllerRef.current = null

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
   */
  const decrypt = useCallback(async (
    video: Video,
    encryptedData: Uint8Array
  ): Promise<string | null> => {
    reset()

    if (!isMountedRef.current) {
      return null
    }

    // Read wallet values from refs
    const currentAddress = addressRef.current
    const currentWalletClient = walletClientRef.current

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

    // Create new abort controller
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    // Create buffer lifecycle manager
    const lifecycle = createBufferLifecycle()

    try {
      // Step 0: Validate video is encrypted
      updateProgress('checking', 'Checking video encryption...')

      if (!video.isEncrypted) {
        throw new Error('Video is not encrypted')
      }

      if (!video.encryptionMetadata) {
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

        const largeFileSupport = checkLargeFileSupport()
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

      // Step 2: Decrypt AES key using Haven-AOL
      updateProgress('authenticating', 'Sign with your wallet to decrypt...')

      if (!isGateMetadata(video.encryptionMetadata)) {
        throw new Error('Invalid encryption metadata — expected Haven-AOL gate v1 (version: 1)')
      }

      const { aesKey } = await decryptContentKey({
        encryptionMetadata: video.encryptionMetadata,
        encryptedCid: video.encryptedCid,
        walletClient: currentWalletClient as unknown as import('@/lib/haven-aol').WalletClientLike,
        onProgress: (msg) => {
          if (msg.includes('key') || msg.includes('Key') || msg.includes('network')) {
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

      const mimeType = video.contentMimeType || 'video/mp4'

      // Chunked decryption — handles per-chunk IV derivation and sequential
      // AES-GCM decryption of the haven-cli streaming format:
      // [12B base_iv][4B idx LE][4B len LE][encrypted_chunk]...
      const onChunkedProgress: ChunkedDecryptProgress = (chunkIdx, totalEst) => {
        if (isMountedRef.current && totalEst > 0) {
          // Map chunk progress to 70-95% range (decrypting-file stage)
          const chunkPercent = Math.min(95, 70 + Math.round((chunkIdx / totalEst) * 25))
          setPercentComplete(chunkPercent)
          setProgress(`Decrypting chunk ${chunkIdx + 1}/${totalEst}...`)
        }
      }

      const url = await decryptChunkedToCache(
        encryptedData,
        aesKey,
        video.id,
        mimeType,
        { signal, onProgress: onChunkedProgress }
      )

      // Release buffers eagerly
      lifecycle.release('encrypted')
      lifecycle.release('aesKey')

      if (signal.aborted) {
        throw new Error('Decryption cancelled')
      }

      // Success
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
      const errorMessage = getHavenAolErrorMessage(err)

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
