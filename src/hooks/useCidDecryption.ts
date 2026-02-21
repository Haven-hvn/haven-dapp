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
import { useAccount, useWalletClient } from 'wagmi'
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

  // Get wallet client from wagmi for authentication (Lit SDK v8 requires WalletClient)
  const { address, isConnected, chainId } = useAccount()
  const { data: walletClient } = useWalletClient()

  // State
  const [status, setStatus] = useState<CidDecryptionStatus>('idle')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<Error | null>(null)
  const [cid, setCid] = useState<string | null>(null)

  // Refs for cleanup and cancellation
  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)

  // Refs for wallet values — keeps decryptCidCallback stable across re-renders
  // (useWalletClient() can return a new object reference on every render,
  // which would otherwise cause the callback → loadVideo → useEffect chain to loop)
  const addressRef = useRef(address)
  const walletClientRef = useRef(walletClient)
  const chainIdRef = useRef(chainId)
  const isConnectedRef = useRef(isConnected)

  // Keep refs in sync
  useEffect(() => {
    addressRef.current = address
    walletClientRef.current = walletClient
    chainIdRef.current = chainId
    isConnectedRef.current = isConnected
  }, [address, walletClient, chainId, isConnected])

  // Track mount state (must set true on mount to handle React Strict Mode remounts)
  useEffect(() => {
    isMountedRef.current = true
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
    console.log('[useCidDecryption] decryptCidCallback called for video:', video.id)
    
    reset()

    if (!isMountedRef.current) {
      console.warn('[useCidDecryption] Component not mounted, returning null')
      return null
    }

    // Read wallet values from refs (stable references, no re-render loop)
    const currentAddress = addressRef.current
    const currentWalletClient = walletClientRef.current
    const currentChainId = chainIdRef.current
    const currentIsConnected = isConnectedRef.current

    // Check if wallet is connected
    if (!currentAddress || !currentWalletClient) {
      console.error('[useCidDecryption] Wallet not ready:', {
        address: currentAddress,
        hasWalletClient: Boolean(currentWalletClient),
        isConnected: currentIsConnected,
        videoId: video.id,
      })
      const walletError = new Error('Please connect your wallet to decrypt this CID.')
      if (isMountedRef.current) {
        setError(walletError)
        setStatus('error')
        setProgress('Wallet not connected')
      }
      onError?.(walletError)
      return null
    }

    console.log('[useCidDecryption] Wallet ready, proceeding with decryption:', {
      address: currentAddress,
      chainId: currentChainId,
      hasWalletClient: Boolean(currentWalletClient),
      hasEncryptedCid: Boolean(video.encryptedCid),
      hasCidEncryptionMetadata: Boolean(video.cidEncryptionMetadata),
    })

    // Create abort controller for this operation
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    try {
      // Check if CID is encrypted
      updateProgress('checking', 'Checking CID encryption...')

      // If no encrypted CID metadata, return the plain CID directly
      if (!video.encryptedCid || !video.cidEncryptionMetadata) {
        const plainCid = video.filecoinCid || null
        console.log('[useCidDecryption] No encrypted CID metadata, using plain CID:', plainCid)
        
        if (plainCid) {
          updateProgress('complete', 'Using unencrypted CID')
          setCid(plainCid)
          onSuccess?.(plainCid)
        }
        
        return plainCid
      }

      if (signal.aborted) {
        console.warn('[useCidDecryption] Signal aborted before Lit call')
        throw new Error('Decryption cancelled')
      }

      // Decrypt the CID using wallet-based authentication
      updateProgress('authenticating', 'Authenticating with Lit Protocol...')

      // Get chain from chainId
      const chain = currentChainId === sepolia.id ? sepolia : mainnet

      console.log('[useCidDecryption] Calling decryptCid with:', {
        hasCiphertext: Boolean(video.cidEncryptionMetadata.ciphertext),
        ciphertextLength: video.cidEncryptionMetadata.ciphertext?.length,
        hasDataToEncryptHash: Boolean(video.cidEncryptionMetadata.dataToEncryptHash),
        accessControlConditionsCount: video.cidEncryptionMetadata.accessControlConditions?.length,
        chain: video.cidEncryptionMetadata.chain,
        walletChain: chain.name,
      })

      const decryptedCid = await decryptCid({
        metadata: video.cidEncryptionMetadata,
        walletClient: currentWalletClient,
        chain: chain,
        onProgress: (msg) => {
          console.log('[useCidDecryption] Lit progress:', msg)
          updateProgress('decrypting', msg)
        },
        signal,
      })

      if (signal.aborted) {
        console.warn('[useCidDecryption] Signal aborted after Lit call')
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
      if (err instanceof Error && (
        err.message === 'Decryption cancelled' || 
        err.message.includes('cancelled')
      )) {
        console.warn('[useCidDecryption] Decryption was cancelled:', err.message)
        if (isMountedRef.current) {
          setStatus('cancelled')
          setProgress('Decryption cancelled')
        }
        return null
      }

      // Get user-friendly error message
      const errorMessage = getDecryptionErrorMessage(err)

      console.error('[useCidDecryption] CID decryption failed:', err)
      console.error('[useCidDecryption] Error details:', {
        message: err instanceof Error ? err.message : String(err),
        name: err instanceof Error ? err.name : 'unknown',
        code: (err as { code?: string })?.code,
        errorMessage,
      })

      if (isMountedRef.current) {
        const errorObj = new Error(errorMessage)
        setError(errorObj)
        setStatus('error')
      }

      onError?.(err instanceof Error ? err : new Error(errorMessage))
      return null
    }
  }, [reset, updateProgress, onSuccess, onError])

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