/**
 * Download Queue Hook
 *
 * Manages serial batch pre-caching: batch key fetch → per-video fetch + decrypt + cache.
 * Processes one video at a time (Synapse gateway + memory constraints).
 *
 * ## Purpose
 *
 * When the user multi-selects videos, this hook pre-loads them into Cache API
 * so they're available for instant playback — the same result as if the user had
 * played each video individually. It does NOT save files to disk.
 *
 * ## Design: Batch Key Optimization
 *
 * The key benefit of this queue over individual plays:
 * - `batchDecryptContentKeys()` fetches up to 20 keys per wallet popup
 * - Each video's per-video loop then fetches content + decrypts WITHOUT another wallet popup
 *   because the key is already in the AES key cache.
 *
 * ## Cache Key Alignment
 *
 * The batch decrypt function caches keys by `video.id`.
 * The per-video `decryptContentKey()` looks up by `encryptedAesKey.slice(0,32)`.
 * This hook bridges the gap: after batch prefetch, it reads the key from the batch
 * result (keyed by video.id), and uses it directly for decryption — skipping the
 * single-video key retrieval path entirely.
 *
 * @module hooks/useDownloadQueue
 */

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useWalletClient } from 'wagmi'
import { batchDecryptContentKeys } from '@/lib/haven-aol/haven-aol-batch-decrypt'
import { DEFAULT_PIECE_DOWNLOAD_TIMEOUT_MS, fetchPinnedContent } from '@/services/ipfsService'
import { extractHavenEncryptedPayload } from '@/lib/encrypted-payload'
import { decryptChunkedToCache } from '@/lib/chunked-decrypt'
import { requirePieceCid } from '@/lib/download-cid'
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
  /** Add videos to queue and start processing (triggers batch key fetch + serial cache) */
  enqueue: (videos: Video[]) => Promise<void>
  /** Remove a pending item from queue */
  dequeue: (videoId: string) => void
  /** Clear all pending/completed items */
  clear: () => void
  /** Cancel current processing and stop */
  cancel: () => void
  /** Current queue items with status */
  queue: DownloadQueueItem[]
  /** Whether the queue is actively processing */
  isProcessing: boolean
  /** Currently processing item (or null) */
  currentItem: DownloadQueueItem | null
  /** Progress stats */
  completedCount: number
  totalCount: number
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
      // Returns a Map<video.id, { key, iv }> with all decrypted keys.
      // =====================================================================
      const batchResult = await batchDecryptContentKeys(
        videos,
        currentWallet as unknown as WalletClientLike,
        { signal }
      )

      if (signal.aborted) return

      // =====================================================================
      // Step 2: Serial per-video fetch + decrypt + cache
      //
      // For each video:
      //   1. Get AES key from batchResult (already fetched — no wallet popup)
      //   2. Fetch encrypted content from Synapse
      //   3. Extract payload from CAR container
      //   4. Decrypt chunked AES-GCM → write to Cache API
      //
      // The result is identical to what useVideoCache does on first play:
      // the video is in Cache API, ready for instant playback.
      // =====================================================================
      for (const item of items) {
        if (signal.aborted) break

        const { video } = item

        try {
          updateItem(video.id, { status: 'downloading', progress: 10 })

          // Get the key from the batch result directly (no wallet popup needed)
          const keyEntry = batchResult.keys.get(video.id)
          if (!keyEntry) {
            throw new Error('Decryption key not found after batch fetch')
          }

          // Fetch encrypted content from Synapse
          requirePieceCid(video)
          const fetchResult = await fetchPinnedContent(video, {
            abortSignal: signal,
            timeout: DEFAULT_PIECE_DOWNLOAD_TIMEOUT_MS,
            onProgress: (downloaded, total) => {
              if (!isMountedRef.current || total <= 0) return
              // Map fetch progress to 10-45% range
              const ratio = Math.min(1, downloaded / total)
              const pct = 10 + Math.round(ratio * 35)
              updateItem(video.id, { progress: pct })
            },
          })

          if (signal.aborted) break

          // Extract encrypted payload from CAR container
          const encryptedData = await extractHavenEncryptedPayload(fetchResult.data)

          if (signal.aborted) break

          updateItem(video.id, { status: 'decrypting', progress: 50 })

          // Decrypt chunked file and write directly to Cache API
          const mimeType = video.contentMimeType || 'video/mp4'
          await decryptChunkedToCache(encryptedData, keyEntry.key, video.id, mimeType, {
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
