 /**
 * React Hook for CID Decryption
 *
 * Provides a hook for decrypting encrypted Filecoin CIDs using
 * Haven-AOL with wallet-based authentication.
 *
 * @module hooks/useCidDecryption
 */

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import type { Video } from '@/types'
import {
  decryptContentKey,
  getHavenAolErrorMessage,
  isHybridV1Metadata,
  type WalletClientLike,
  type HybridV1EncryptionMetadata,
  type GateMetadataJson,
} from '@/lib/haven-aol'
import { base64ToUint8Array } from '@/lib/crypto'

// ============================================================================
// Types
// ============================================================================

/**
 * Status of the CID decryption process.
 */
export type CidDecryptionStatus =
  | 'idle'           // Not started
  | 'checking'       // Checking if CID is encrypted
  | 'authenticating' // EIP-712 signing with wallet
  | 'decrypting'     // Decrypting CID via Haven-AOL
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
  /** Callback when decryption completes successfully. */
  onSuccess?: (cid: string) => void
  /** Callback when decryption fails. */
  onError?: (error: Error) => void
  /** Callback for progress updates. */
  onProgress?: (status: CidDecryptionStatus, message: string) => void
}

// ============================================================================
// Hook
// ============================================================================

/**
 * React hook for decrypting encrypted Filecoin CIDs with Haven-AOL.
 *
 * For encrypted videos, the actual Filecoin CID is often encrypted
 * separately from the content for additional privacy. This hook
 * decrypts that CID using Haven-AOL with the connected wallet.
 *
 * @param options - Hook options
 * @returns Object containing state and control functions
 */
export function useCidDecryption(
  options: UseCidDecryptionOptions = {}
): UseCidDecryptionReturn {
  const { onSuccess, onError, onProgress } = options

  // Get wallet client from wagmi
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()

  // State
  const [status, setStatus] = useState<CidDecryptionStatus>('idle')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<Error | null>(null)
  const [cid, setCid] = useState<string | null>(null)

  // Refs for cleanup and cancellation
  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)

  // Refs for wallet values
  const addressRef = useRef(address)
  const walletClientRef = useRef(walletClient)
  const isConnectedRef = useRef(isConnected)

  // Keep refs in sync
  useEffect(() => {
    addressRef.current = address
    walletClientRef.current = walletClient
    isConnectedRef.current = isConnected
  }, [address, walletClient, isConnected])

  // Track mount state
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      abortControllerRef.current?.abort()
    }
  }, [])

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

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort()

    if (isMountedRef.current) {
      setStatus('cancelled')
      setProgress('Decryption cancelled')
    }
  }, [])

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
   */
  const decryptCidCallback = useCallback(async (
    video: Video
  ): Promise<string | null> => {
    console.log('[useCidDecryption] decryptCidCallback called for video:', video.id)

    reset()

    if (!isMountedRef.current) {
      return null
    }

    const currentAddress = addressRef.current
    const currentWalletClient = walletClientRef.current

    // Check if wallet is connected
    if (!currentAddress || !currentWalletClient) {
      const walletError = new Error('Please connect your wallet to decrypt this CID.')
      if (isMountedRef.current) {
        setError(walletError)
        setStatus('error')
        setProgress('Wallet not connected')
      }
      onError?.(walletError)
      return null
    }

    // Create abort controller
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

      // Decrypt the CID using Haven-AOL
      updateProgress('authenticating', 'Sign with your wallet to decrypt CID...')

      // Get the AES key for CID decryption
      // Type narrowing: cidEncryptionMetadata may be legacy CidEncryptionMetadata or EncryptionMetadata
      const cidMeta = video.cidEncryptionMetadata as HybridV1EncryptionMetadata | GateMetadataJson
      const { aesKey } = await decryptContentKey({
        encryptionMetadata: cidMeta,
        walletClient: currentWalletClient as unknown as WalletClientLike,
        onProgress: (msg) => {
          updateProgress('decrypting', msg)
        },
        signal,
      })

      if (signal.aborted) {
        throw new Error('Decryption cancelled')
      }

      // Decrypt the encrypted CID
      // The encryptedCid from Arkiv is the ciphertext (base64 encoded or raw)
      const encryptedCidBytes = base64ToUint8Array(video.encryptedCid)

      // Get IV from CID metadata
      let iv: Uint8Array
      if (isHybridV1Metadata(video.cidEncryptionMetadata)) {
        iv = base64ToUint8Array(video.cidEncryptionMetadata.iv)
      } else {
        // First 12 bytes are IV
        iv = encryptedCidBytes.slice(0, 12)
      }

      const ciphertext = isHybridV1Metadata(video.cidEncryptionMetadata)
        ? encryptedCidBytes
        : encryptedCidBytes.slice(12)

      // AES-GCM decrypt (copy to fresh ArrayBuffer to satisfy TypeScript BufferSource requirement)
      const toBuffer = (u: Uint8Array): ArrayBuffer => {
        const buf = new ArrayBuffer(u.length)
        new Uint8Array(buf).set(u)
        return buf
      }

      const key = await crypto.subtle.importKey(
        'raw',
        toBuffer(aesKey),
        { name: 'AES-GCM' },
        false,
        ['decrypt'],
      )

      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toBuffer(iv) },
        key,
        toBuffer(ciphertext),
      )

      const decoder = new TextDecoder()
      const decryptedCid = decoder.decode(plaintext).trim()

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
      if (err instanceof Error && err.message.includes('cancelled')) {
        if (isMountedRef.current) {
          setStatus('cancelled')
          setProgress('Decryption cancelled')
        }
        return null
      }

      const errorMessage = getHavenAolErrorMessage(err)
      console.error('[useCidDecryption] CID decryption failed:', err)

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
