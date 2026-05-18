/**
 * React Hook for Video Download
 *
 * Provides download functionality for encrypted videos with full progress tracking.
 * Works in two modes:
 *
 * 1. **Fast path (cached):** If the video is already in Cache API, reads it and saves to disk instantly.
 * 2. **Full pipeline (uncached):** Fetches from IPFS → wallet signature → Haven-AOL key decrypt →
 *    chunked AES decrypt → browser download. Shows progress through each stage.
 *
 * Can be used from both the VideoPlayer AND the library grid — no playback required.
 *
 * @module hooks/useVideoDownload
 */

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useWalletClient } from 'wagmi'
import { getVideo, hasVideo, putVideo } from '@/lib/video-cache'
import { extractHavenEncryptedPayload } from '@/lib/encrypted-payload'
import {
  DEFAULT_PIECE_DOWNLOAD_TIMEOUT_MS,
  fetchPinnedContent,
} from '@/services/ipfsService'
import {
  decryptContentKey,
  isGateMetadata,
} from '@/lib/haven-aol'
import { toPlaybackLoadError } from '@/lib/playback-errors'
import type { WalletClientLike } from '@/lib/haven-aol'
import { requirePieceCid } from '@/lib/download-cid'
import { decryptChunkedFile, type ChunkedDecryptProgress } from '@/lib/chunked-decrypt'
import type { Video } from '@/types'

// ============================================================================
// Types
// ============================================================================

/**
 * Download stage — granular progress for each step of the pipeline.
 */
export type DownloadStage =
  | 'idle'             // Not started
  | 'checking-cache'   // Checking if already cached
  | 'fetching'         // Downloading encrypted data from IPFS
  | 'authenticating'   // Wallet signature (EIP-712)
  | 'decrypting-key'   // Recovering AES key from ICP canister
  | 'decrypting-file'  // Chunked AES-GCM decryption
  | 'preparing'        // Creating blob for download
  | 'complete'         // Download triggered
  | 'error'            // Failed

/**
 * Return type for the useVideoDownload hook.
 */
export interface UseVideoDownloadReturn {
  /** Current download stage */
  stage: DownloadStage

  /** Whether a download is in progress */
  isDownloading: boolean

  /** Progress percentage (0-100) */
  progress: number

  /** Human-readable progress message */
  progressMessage: string

  /** Error if download failed */
  error: Error | null

  /** Start the download for a video */
  download: (video: Video) => Promise<void>

  /** Cancel ongoing download */
  cancel: () => void

  /** Reset status */
  reset: () => void
}

// ============================================================================
// Progress Weights
// ============================================================================

const STAGE_PROGRESS: Record<DownloadStage, number> = {
  'idle': 0,
  'checking-cache': 5,
  'authenticating': 15,
  'decrypting-key': 28,
  'fetching': 35,   // 35-60 during piece download
  'decrypting-file': 60,   // 60-95 based on chunk progress
  'preparing': 95,
  'complete': 100,
  'error': 0,
}

const DOWNLOAD_FETCH_PROGRESS_START = STAGE_PROGRESS.fetching
const DOWNLOAD_FETCH_PROGRESS_END = 60

const STAGE_MESSAGES: Record<DownloadStage, string> = {
  'idle': '',
  'checking-cache': 'Checking cache...',
  'fetching': 'Downloading encrypted file...',
  'authenticating': 'Sign with your wallet...',
  'decrypting-key': 'Recovering decryption key...',
  'decrypting-file': 'Decrypting...',
  'preparing': 'Preparing download...',
  'complete': 'Download complete!',
  'error': 'Download failed',
}

// ============================================================================
// Utility
// ============================================================================

/**
 * Generate a safe filename from video metadata.
 */
function generateFilename(video: Video): string {
  const sanitized = (video.title || 'video')
    .replace(/[^a-zA-Z0-9\s\-_.]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 100)

  return `${sanitized}.mp4`
}

/**
 * Trigger a browser download for a blob.
 */
function triggerBrowserDownload(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = blobUrl
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()

  // Cleanup after a short delay
  setTimeout(() => {
    document.body.removeChild(anchor)
    URL.revokeObjectURL(blobUrl)
  }, 1000)
}

// ============================================================================
// Hook
// ============================================================================

/**
 * React hook for downloading encrypted videos with full progress tracking.
 *
 * Works from both the player (cached) and library (uncached) contexts.
 * If the video is already cached, downloads instantly from Cache API.
 * If not cached, runs the full pipeline: IPFS fetch → wallet auth → decrypt → save.
 *
 * @returns Download state and control functions
 *
 * @example
 * ```tsx
 * function DownloadButton({ video }) {
 *   const { download, isDownloading, stage, progress, progressMessage } = useVideoDownload()
 *
 *   return (
 *     <button onClick={() => download(video)} disabled={isDownloading}>
 *       {isDownloading ? `${progressMessage} (${progress}%)` : 'Download'}
 *     </button>
 *   )
 * }
 * ```
 */
export function useVideoDownload(): UseVideoDownloadReturn {
  const { data: walletClient } = useWalletClient()

  const [stage, setStage] = useState<DownloadStage>('idle')
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [error, setError] = useState<Error | null>(null)

  const isMountedRef = useRef(true)
  const abortControllerRef = useRef<AbortController | null>(null)
  const walletClientRef = useRef(walletClient)

  useEffect(() => {
    walletClientRef.current = walletClient
  }, [walletClient])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      abortControllerRef.current?.abort()
    }
  }, [])

  const updateStage = useCallback((newStage: DownloadStage, customProgress?: number, customMessage?: string) => {
    if (isMountedRef.current) {
      setStage(newStage)
      setProgress(customProgress ?? STAGE_PROGRESS[newStage])
      setProgressMessage(customMessage ?? STAGE_MESSAGES[newStage])
    }
  }, [])

  /**
   * Download a video — handles both cached and uncached scenarios.
   */
  const download = useCallback(async (video: Video) => {
    // Cancel any ongoing download
    abortControllerRef.current?.abort()
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    setError(null)
    updateStage('checking-cache')

    try {
      const filename = generateFilename(video)

      // =====================================================================
      // Fast path: Video already cached — download from Cache API
      // =====================================================================
      const cached = await hasVideo(video.id)

      if (cached) {
        updateStage('preparing')

        const result = await getVideo(video.id)
        if (!result) {
          throw new Error('Cache entry not found')
        }

        const blob = await result.response.blob()
        triggerBrowserDownload(blob, filename)

        updateStage('complete')
        return
      }

      // =====================================================================
      // Full pipeline: Fetch → Decrypt Key → Decrypt File → Download
      // =====================================================================

      // Non-encrypted videos: fetch piece from Synapse and download
      if (!video.isEncrypted) {
        requirePieceCid(video)
        updateStage('fetching')

        const fetchResult = await fetchPinnedContent(video)
        if (signal.aborted) throw new Error('Download cancelled')

        updateStage('preparing')
        const blob = new Blob([fetchResult.data as BlobPart], { type: 'video/mp4' })
        triggerBrowserDownload(blob, filename)

        // Also cache for future playback
        await putVideo(video.id, fetchResult.data, 'video/mp4')

        updateStage('complete')
        return
      }

      // Encrypted video: needs wallet + decryption
      if (!video.encryptionMetadata) {
        throw new Error('Missing encryption metadata')
      }

      requirePieceCid(video)

      // Step 1: Decrypt AES key via Haven-AOL (before large piece download)
      updateStage('authenticating')

      const currentWalletClient = walletClientRef.current
      if (!currentWalletClient) {
        throw new Error('Please connect your wallet to download this video.')
      }

      if (!isGateMetadata(video.encryptionMetadata)) {
        throw new Error('Invalid content encryption metadata — expected Haven-AOL gate v1')
      }

      const { aesKey } = await decryptContentKey({
        encryptionMetadata: video.encryptionMetadata,
        encryptedCid: video.encryptedCid,
        walletClient: currentWalletClient as unknown as WalletClientLike,
        onProgress: (msg) => {
          if (isMountedRef.current) {
            if (msg.includes('key') || msg.includes('Key') || msg.includes('network')) {
              updateStage('decrypting-key', undefined, 'Recovering decryption key...')
            }
          }
        },
        signal,
      })

      if (signal.aborted) throw new Error('Download cancelled')

      // Step 2: Fetch encrypted CAR from Synapse (piece_cid)
      updateStage('fetching')
      const fetchResult = await fetchPinnedContent(video, {
        abortSignal: signal,
        timeout: DEFAULT_PIECE_DOWNLOAD_TIMEOUT_MS,
        onProgress: (downloaded, total) => {
          if (!isMountedRef.current || total <= 0) return
          const ratio = Math.min(1, downloaded / total)
          const pct =
            DOWNLOAD_FETCH_PROGRESS_START +
            Math.round(ratio * (DOWNLOAD_FETCH_PROGRESS_END - DOWNLOAD_FETCH_PROGRESS_START))
          setProgress(pct)
          setProgressMessage(`Downloading encrypted file… ${Math.round(ratio * 100)}%`)
        },
      })
      if (signal.aborted) throw new Error('Download cancelled')

      const encryptedData = await extractHavenEncryptedPayload(fetchResult.data)

      // Step 3: Chunked AES decryption
      updateStage('decrypting-file')

      const onChunkProgress: ChunkedDecryptProgress = (chunkIdx, totalEst) => {
        if (isMountedRef.current && totalEst > 0) {
          const pct = Math.min(
            95,
            STAGE_PROGRESS['decrypting-file'] +
              Math.round(((chunkIdx + 1) / totalEst) * (95 - STAGE_PROGRESS['decrypting-file']))
          )
          setProgress(pct)
          setProgressMessage(`Decrypting chunk ${chunkIdx + 1}/${totalEst}...`)
        }
      }

      const plaintext = await decryptChunkedFile(encryptedData, aesKey, {
        signal,
        onProgress: onChunkProgress,
      })

      if (signal.aborted) throw new Error('Download cancelled')

      // Step 4: Trigger browser download
      updateStage('preparing')

      const mimeType = video.contentMimeType || 'video/mp4'

      const blob = new Blob([plaintext as BlobPart], { type: mimeType })
      triggerBrowserDownload(blob, filename)

      // Also cache for future instant playback
      await putVideo(video.id, plaintext, mimeType)

      updateStage('complete')
    } catch (err) {
      if (err instanceof Error && err.message === 'Download cancelled') {
        updateStage('idle')
        return
      }

      const loadError = toPlaybackLoadError(err)

      console.error('[useVideoDownload] Download failed:', err)

      if (isMountedRef.current) {
        setError(loadError)
        updateStage('error', 0, loadError.message)
      }
    }
  }, [updateStage])

  /**
   * Cancel ongoing download.
   */
  const cancel = useCallback(() => {
    abortControllerRef.current?.abort()
    if (isMountedRef.current) {
      updateStage('idle')
    }
  }, [updateStage])

  /**
   * Reset download status.
   */
  const reset = useCallback(() => {
    abortControllerRef.current?.abort()
    if (isMountedRef.current) {
      setStage('idle')
      setProgress(0)
      setProgressMessage('')
      setError(null)
    }
  }, [])

  return {
    stage,
    isDownloading: stage !== 'idle' && stage !== 'complete' && stage !== 'error',
    progress,
    progressMessage,
    error,
    download,
    cancel,
    reset,
  }
}
