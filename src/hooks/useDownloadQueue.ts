/**
 * Download Queue Hook
 *
 * Manages serial download processing: batch key fetch → per-video download + decrypt.
 * Processes one video at a time (Synapse gateway + memory constraints).
 *
 * Every step is logged to the browser console via console.log for troubleshooting.
 * Look for the [DownloadQueue] prefix in the dev console.
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
  /** Human-readable phase label for the UI (e.g. "Fetching from Synapse…") */
  statusText?: string
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

/** Format bytes into a human-readable string (e.g. "12.4 MiB") */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
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
    if (isProcessingRef.current) {
      console.log('[DownloadQueue] Already processing — ignoring duplicate processQueue call')
      return
    }
    isProcessingRef.current = true
    setIsProcessing(true)

    const queueId = Math.random().toString(36).slice(2, 8)
    console.log(`[DownloadQueue/${queueId}] ━━━ Starting queue with ${items.length} item(s) ━━━`)
    items.forEach((item, idx) => {
      console.log(`[DownloadQueue/${queueId}]   [${idx + 1}/${items.length}] ${item.video.title} (${item.video.id})`)
    })

    const abortController = new AbortController()
    abortControllerRef.current = abortController
    const signal = abortController.signal

    try {
      const currentWallet = walletClientRef.current
      if (!currentWallet) {
        console.error(`[DownloadQueue/${queueId}] ✗ No wallet connected`)
        throw new Error('Please connect your wallet to download.')
      }

      const videos = items.map((item) => item.video)

      // ── Step 1: Batch key fetch ──────────────────────────────────────────
      console.log(`[DownloadQueue/${queueId}] ── Step 1: Batch key fetch for ${videos.length} video(s) ──`)

      const tBatchStart = performance.now()
      let batchKeyCount = 0
      await batchDecryptContentKeys(
        videos,
        currentWallet as unknown as WalletClientLike,
        {
          signal,
          onProgress: (message: string) => {
            batchKeyCount++
            const elapsed = (performance.now() - tBatchStart).toFixed(0)
            console.log(`[DownloadQueue/${queueId}]   [batch-key] ${message} (+${elapsed}ms)`)
            // Update all items with the batch key fetch progress text
            for (const item of items) {
              updateItem(item.video.id, {
                status: 'downloading',
                progress: 5,
                statusText: message,
              })
            }
          },
        }
      )

      if (signal.aborted) {
        console.log(`[DownloadQueue/${queueId}] ⚠ Batch key fetch aborted`)
        return
      }

      const batchElapsed = (performance.now() - tBatchStart).toFixed(0)
      console.log(`[DownloadQueue/${queueId}] ✓ Batch key fetch complete in ${batchElapsed}ms (${batchKeyCount} progress events)`)

      // ── Step 2: Serial download each video ───────────────────────────────
      console.log(`[DownloadQueue/${queueId}] ── Step 2: Serial download of ${items.length} video(s) ──`)

      let completed = 0
      let errors = 0

      for (const item of items) {
        if (signal.aborted) {
          console.log(`[DownloadQueue/${queueId}] ⚠ Aborted before processing "${item.video.title}"`)
          break
        }

        const { video } = item
        const tVideoStart = performance.now()

        console.log(`[DownloadQueue/${queueId}] ┌── Downloading "${video.title}" (${video.id})`)
        updateItem(video.id, {
          status: 'downloading',
          progress: 10,
          statusText: 'Fetching from Synapse…',
        })

        try {
          // Get cached key (should be there after batch decrypt)
          const cached = getCachedKey(video.id)
          if (!cached) {
            throw new Error('Decryption key not found in cache after batch fetch')
          }
          console.log(`[DownloadQueue/${queueId}]   ✓ Decryption key found in cache`)

          // Fetch encrypted content from Synapse
          requirePieceCid(video)
          console.log(`[DownloadQueue/${queueId}]   → Fetching piece CID from Synapse…`)

          const tFetchStart = performance.now()
          let fetchProgressReported = false
          const fetchResult = await fetchPinnedContent(video, {
            abortSignal: signal,
            onProgress: (downloaded: number, total: number) => {
              fetchProgressReported = true
              // Map fetch progress to 10–45% range
              const pct = total > 0
                ? 10 + Math.round((downloaded / total) * 35)
                : 10
              const dlStr = formatBytes(downloaded)
              const totalStr = total > 0 ? formatBytes(total) : 'unknown'
              console.log(`[DownloadQueue/${queueId}]   ↓ Fetch progress: ${dlStr} / ${totalStr} (${pct}%)`)
              updateItem(video.id, {
                status: 'downloading',
                progress: pct,
                statusText: `Downloading… ${dlStr} / ${totalStr}`,
              })
            },
          })

          const fetchElapsed = (performance.now() - tFetchStart).toFixed(0)
          const fetchSize = formatBytes(fetchResult.data.byteLength)
          console.log(`[DownloadQueue/${queueId}]   ✓ Fetched ${fetchSize} in ${fetchElapsed}ms via ${fetchResult.gateway}${fetchProgressReported ? '' : ' (no progress events — small file or chunked response)'}`)

          if (signal.aborted) {
            console.log(`[DownloadQueue/${queueId}] ⚠ Aborted after fetch, before decrypt`)
            break
          }

          // Decrypt
          updateItem(video.id, {
            status: 'decrypting',
            progress: 50,
            statusText: 'Decrypting…',
          })

          const tDecryptStart = performance.now()
          let chunkCount = 0
          const plaintext = await decryptChunkedFile(
            fetchResult.data,
            cached.key,
            {
              signal,
              onProgress: (chunkIdx, totalEst, bytesDecrypted, totalBytesEst) => {
                chunkCount++
                // Map decrypt progress to 50–95% range
                const pct = totalEst > 0
                  ? 50 + Math.round(((chunkIdx + 1) / totalEst) * 45)
                  : 50
                const pctClamped = Math.min(95, pct)
                const bytesStr = formatBytes(bytesDecrypted)
                const totalStr = totalBytesEst > 0 ? formatBytes(totalBytesEst) : 'unknown'
                console.log(
                  `[DownloadQueue/${queueId}]   🔓 Decrypt chunk ${chunkIdx + 1}/${totalEst} — ${bytesStr} / ${totalStr} (${pctClamped}%)`
                )
                updateItem(video.id, {
                  status: 'decrypting',
                  progress: pctClamped,
                  statusText: `Decrypting… chunk ${chunkIdx + 1}/${totalEst} (${bytesStr})`,
                })
              },
            }
          )

          const decryptElapsed = (performance.now() - tDecryptStart).toFixed(0)
          const plainSize = formatBytes(plaintext.byteLength)
          console.log(`[DownloadQueue/${queueId}]   ✓ Decrypted ${plainSize} in ${decryptElapsed}ms (${chunkCount} chunks)`)

          if (signal.aborted) {
            console.log(`[DownloadQueue/${queueId}] ⚠ Aborted after decrypt, before download trigger`)
            break
          }

          // Trigger browser download
          const filename = generateFilename(video)
          const mimeType = video.contentMimeType || 'video/mp4'
          const blob = new Blob([plaintext as BlobPart], { type: mimeType })
          triggerBrowserDownload(blob, filename)

          const totalElapsed = (performance.now() - tVideoStart).toFixed(0)
          console.log(`[DownloadQueue/${queueId}] └✓ "${video.title}" complete — triggered download "${filename}" (${totalElapsed}ms total)`)

          updateItem(video.id, {
            status: 'complete',
            progress: 100,
            statusText: 'Complete',
          })
          completed++
        } catch (err) {
          if (signal.aborted) {
            console.log(`[DownloadQueue/${queueId}] ⚠ "${video.title}" aborted (in catch)`)
            break
          }
          const error = err instanceof Error ? err : new Error(String(err))
          const elapsed = (performance.now() - tVideoStart).toFixed(0)
          console.error(`[DownloadQueue/${queueId}] └✗ "${video.title}" failed after ${elapsed}ms: ${error.message}`)
          if (error.stack) {
            console.debug(`[DownloadQueue}/${queueId}]   Stack: ${error.stack}`)
          }
          updateItem(video.id, {
            status: 'error',
            error,
            progress: 0,
            statusText: `Error: ${error.message}`,
          })
          errors++
        }
      }

      console.log(`[DownloadQueue/${queueId}] ━━━ Queue finished: ${completed} completed, ${errors} errors ━━━`)
    } catch (err) {
      // Batch key fetch failed — mark all as error
      if (!signal.aborted) {
        const error = err instanceof Error ? err : new Error(String(err))
        console.error(`[DownloadQueue/${queueId}] ✗✗✗ Batch key fetch failed — marking ALL items as error: ${error.message}`)
        if (error.stack) {
          console.debug(`[DownloadQueue}/${queueId}]   Stack: ${error.stack}`)
        }
        for (const item of items) {
          updateItem(item.video.id, {
            status: 'error',
            error,
            progress: 0,
            statusText: `Error: ${error.message}`,
          })
        }
      } else {
        console.log(`[DownloadQueue/${queueId}] ⚠ Aborted during batch key fetch`)
      }
    } finally {
      isProcessingRef.current = false
      if (isMountedRef.current) {
        setIsProcessing(false)
      }
      console.log(`[DownloadQueue/${queueId}] ── Processing state reset ──`)
    }
  }, [updateItem])

  const enqueue = useCallback(async (videos: Video[]) => {
    const now = Date.now()
    const newItems: DownloadQueueItem[] = videos.map((video) => ({
      video,
      status: 'pending' as const,
      progress: 0,
      statusText: 'Queued',
      addedAt: now,
    }))

    console.log(`[DownloadQueue] Enqueuing ${newItems.length} video(s):`)
    newItems.forEach((item, idx) => {
      console.log(`  [${idx + 1}/${newItems.length}] ${item.video.title} (${item.video.id})`)
    })

    setQueue((prev) => [...prev, ...newItems])
    await processQueue(newItems)
  }, [processQueue])

  const dequeue = useCallback((videoId: string) => {
    console.log(`[DownloadQueue] Dequeuing video ${videoId}`)
    setQueue((prev) => prev.filter((item) => item.video.id !== videoId || item.status !== 'pending'))
  }, [])

  const clear = useCallback(() => {
    console.log('[DownloadQueue] Clearing completed/pending items (keeping active)')
    setQueue((prev) => prev.filter((item) => item.status === 'downloading' || item.status === 'decrypting'))
  }, [])

  const cancel = useCallback(() => {
    console.log('[DownloadQueue] ⚠ Cancelling all downloads — aborting controller')
    abortControllerRef.current?.abort()
    isProcessingRef.current = false
    if (isMountedRef.current) {
      setIsProcessing(false)
      setQueue((prev) =>
        prev.map((item) =>
          item.status === 'pending' || item.status === 'downloading' || item.status === 'decrypting'
            ? { ...item, status: 'error' as const, error: new Error('Cancelled'), progress: 0, statusText: 'Cancelled' }
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
