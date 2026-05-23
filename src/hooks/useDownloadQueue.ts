/**
 * Download Queue Hook
 *
 * Manages serial download processing: batch key fetch → per-video download + decrypt.
 * Processes one video at a time (Synapse gateway + memory constraints).
 *
 * @module hooks/useDownloadQueue
 */

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useWalletClient } from 'wagmi'
import { batchDecryptContentKeys } from '@/lib/haven-aol/haven-aol-batch-decrypt'
import { fetchPinnedContent } from '@/services/ipfsService'
import { decryptChunkedFile } from '@/lib/chunked-decrypt'
import { getCachedKey } from '@/lib/aes-key-cache'
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

      // Step 1: Batch key fetch
      await batchDecryptContentKeys(
        videos,
        currentWallet as unknown as WalletClientLike,
        { signal }
      )

      if (signal.aborted) return

      // Step 2: Serial download each video
      for (const item of items) {
        if (signal.aborted) break

        const { video } = item

        try {
          updateItem(video.id, { status: 'downloading', progress: 10 })

          // Get cached key (should be there after batch decrypt)
          const cached = getCachedKey(video.id)
          if (!cached) {
            throw new Error('Decryption key not found in cache after batch fetch')
          }

          // Fetch encrypted content from Synapse
          requirePieceCid(video)
          const fetchResult = await fetchPinnedContent(video, {
            abortSignal: signal,
          })

          if (signal.aborted) break

          updateItem(video.id, { status: 'decrypting', progress: 50 })

          // Decrypt
          const plaintext = await decryptChunkedFile(
            fetchResult.data,
            cached.key,
            {
              signal,
              onProgress: (chunkIdx, totalEst) => {
                if (totalEst > 0 && isMountedRef.current) {
                  const pct = 50 + Math.round(((chunkIdx + 1) / totalEst) * 45)
                  updateItem(video.id, { progress: Math.min(95, pct) })
                }
              },
            }
          )

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
