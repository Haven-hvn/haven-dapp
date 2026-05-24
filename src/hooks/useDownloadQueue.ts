/**
 * Download Queue Hook
 *
 * Manages serial download processing: batch key fetch → per-video download + decrypt.
 * Processes one video at a time (Synapse gateway + memory constraints).
 *
 * ## Design: Composition over Duplication
 *
 * Rather than reimplementing the fetch → CAR-extract → decrypt logic inline,
 * this hook composes existing proven primitives:
 *
 * 1. `batchDecryptContentKeys()` — prefetch all AES keys (1 wallet popup per 20 videos)
 * 2. `prepareEncryptedContentInputs()` — the SAME function used by single-video download.
 *    Since keys are already cached by step 1, it won't prompt the wallet again. It handles
 *    Synapse fetch + CAR extraction correctly.
 * 3. `decryptChunkedFile()` — AES-GCM chunked decryption → browser download trigger.
 *
 * This guarantees batch downloads use the exact same code path as single downloads,
 * eliminating the class of bugs where batch-specific fetch/extract code diverges.
 *
 * @module hooks/useDownloadQueue
 */

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useWalletClient } from 'wagmi'
import { batchDecryptContentKeys } from '@/lib/haven-aol/haven-aol-batch-decrypt'
import { prepareEncryptedContentInputs } from '@/lib/encrypted-playback-prepare'
import { decryptChunkedFile } from '@/lib/chunked-decrypt'
import type { WalletClientLike } from '@/lib/haven-aol'
import type { Video } from '@/types'

// ============================================================================
// Types
// ============================================================================

export type QueueItemStatus = 'pending' | 'downloading' | 'decrypting' | 'complete' | 'error'

export interface DownloadQueueItem {
  video: Video
  status: QueueItemStatus
  progress: number
  error?: Error
  addedAt: number
}

export interface UseDownloadQueueReturn {
  /** Add videos to queue and start processing (triggers batch key fetch + serial downloads) */
  enqueue: (videos: Video[]) => Promise<void>
  /** Remove a pending item from queue */
  dequeue: (videoId: string) => void
  /** Clear all pending/completed items */
  clear: () => void
  /** Cancel current download and stop processing */
  cancel: () => void
  /** Current queue items with status */
  queue: DownloadQueueItem[]
  /** Whether the queue is actively processing */
  isProcessing: boolean
  /** Currently downloading item (or null) */
  currentItem: DownloadQueueItem | null
  /** Progress stats */
  completedCount: number
  totalCount: number
}

// ============================================================================
// Utility
// ============================================================================

function generateFilename(video: Video): string {
  const sanitized = (video.title || 'video')
    .replace(/[^a-zA-Z0-9\s\-_.]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 100)
  return `${sanitized}.mp4`
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = blobUrl
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  setTimeout(() => {
    document.body.removeChild(anchor)
    URL.revokeObjectURL(blobUrl)
  }, 1000)
}

// ============================================================================
// Hook
// ============================================================================

export function useDownloadQueue(): UseDownloadQueueReturn {
  const { data: walletClient } = useWalletClient()
  const [queue, setQueue] = useState<DownloadQueueItem[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  const isMountedRef = useRef(true)
  const abortControllerRef = useRef<AbortController | null>(null)
  const walletClientRef = useRef(walletClient)
  const isProcessingRef = useRef(false)

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

  const updateItem = useCallback((videoId: string, update: Partial<DownloadQueueItem>) => {
    if (!isMountedRef.current) return
    setQueue((prev) =>
      prev.map((item) => (item.video.id === videoId ? { ...item, ...update } : item))
    )
  }, [])

  const processQueue = useCallback(async (items: DownloadQueueItem[]) => {
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    setIsProcessing(true)

    const abortController = new AbortController()
    abortControllerRef.current = abortController
    const signal = abortController.signal

    try {
      const currentWallet = walletClientRef.current
      if (!currentWallet) {
        throw new Error('Please connect your wallet to download.')
      }

      const videos = items.map((item) => item.video)

      // =====================================================================
      // Step 1: Batch key prefetch
      //
      // Fetches all AES keys in batches of ≤20 (1 wallet popup per batch).
      // Keys are cached in the in-memory AES key cache, so subsequent calls
      // to prepareEncryptedContentInputs will find them without prompting.
      // =====================================================================
      await batchDecryptContentKeys(
        videos,
        currentWallet as unknown as WalletClientLike,
        { signal }
      )

      if (signal.aborted) return

      // =====================================================================
      // Step 2: Serial per-video download + decrypt
      //
      // Uses prepareEncryptedContentInputs — the SAME proven function that
      // single-video download uses. This handles:
      //   - AES key retrieval (from cache — no wallet popup)
      //   - Synapse piece fetch (with timeout + retries)
      //   - CAR container extraction (extractHavenEncryptedPayload)
      //
      // Then decryptChunkedFile handles the AES-GCM chunked decryption.
      // =====================================================================
      for (const item of items) {
        if (signal.aborted) break

        const { video } = item

        try {
          updateItem(video.id, { status: 'downloading', progress: 10 })

          // Prepare encrypted content (fetch + extract from CAR + get cached key)
          const { aesKey, encryptedData } = await prepareEncryptedContentInputs({
            video,
            walletClient: currentWallet as unknown as WalletClientLike,
            signal,
            onFetchProgress: (downloaded, total) => {
              if (!isMountedRef.current || total <= 0) return
              // Map fetch progress to 10-45% range
              const ratio = Math.min(1, downloaded / total)
              const pct = 10 + Math.round(ratio * 35)
              updateItem(video.id, { progress: pct })
            },
          })

          if (signal.aborted) break

          updateItem(video.id, { status: 'decrypting', progress: 50 })

          // Chunked AES-GCM decryption
          const plaintext = await decryptChunkedFile(encryptedData, aesKey, {
            signal,
            onProgress: (chunkIdx, totalEst) => {
              if (totalEst > 0 && isMountedRef.current) {
                // Map decrypt progress to 50-95% range
                const pct = 50 + Math.round(((chunkIdx + 1) / totalEst) * 45)
                updateItem(video.id, { progress: Math.min(95, pct) })
              }
            },
          })

          if (signal.aborted) break

          // Trigger browser download
          const mimeType = video.contentMimeType || 'video/mp4'
          const blob = new Blob([plaintext as BlobPart], { type: mimeType })
          triggerBrowserDownload(blob, generateFilename(video))

          updateItem(video.id, { status: 'complete', progress: 100 })
        } catch (err) {
          if (signal.aborted) break
          const error = err instanceof Error ? err : new Error(String(err))
          updateItem(video.id, { status: 'error', error, progress: 0 })
        }
      }
    } catch (err) {
      // Batch key fetch failed — mark all as error
      if (!signal.aborted) {
        const error = err instanceof Error ? err : new Error(String(err))
        for (const item of items) {
          updateItem(item.video.id, { status: 'error', error, progress: 0 })
        }
      }
    } finally {
      isProcessingRef.current = false
      if (isMountedRef.current) {
        setIsProcessing(false)
      }
    }
  }, [updateItem])

  const enqueue = useCallback(async (videos: Video[]) => {
    const now = Date.now()
    const newItems: DownloadQueueItem[] = videos.map((video) => ({
      video,
      status: 'pending' as const,
      progress: 0,
      addedAt: now,
    }))

    setQueue((prev) => [...prev, ...newItems])
    await processQueue(newItems)
  }, [processQueue])

  const dequeue = useCallback((videoId: string) => {
    setQueue((prev) => prev.filter((item) => item.video.id !== videoId || item.status !== 'pending'))
  }, [])

  const clear = useCallback(() => {
    setQueue((prev) => prev.filter((item) => item.status === 'downloading' || item.status === 'decrypting'))
  }, [])

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort()
    isProcessingRef.current = false
    if (isMountedRef.current) {
      setIsProcessing(false)
      setQueue((prev) =>
        prev.map((item) =>
          item.status === 'pending' || item.status === 'downloading' || item.status === 'decrypting'
            ? { ...item, status: 'error' as const, error: new Error('Cancelled'), progress: 0 }
            : item
        )
      )
    }
  }, [])

  const currentItem = queue.find(
    (item) => item.status === 'downloading' || item.status === 'decrypting'
  ) ?? null

  const completedCount = queue.filter((item) => item.status === 'complete').length
  const totalCount = queue.length

  return {
    enqueue,
    dequeue,
    clear,
    cancel,
    queue,
    isProcessing,
    currentItem,
    completedCount,
    totalCount,
  }
}
