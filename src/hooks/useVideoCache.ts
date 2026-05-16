/**
 * React Hook for Video Cache (Progressive Playback Default)
 *
 * The primary React hook that implements progressive video playback with
 * background caching. For encrypted videos, playback starts immediately
 * after the first chunk is decrypted (~1MB = sub-second to first frame),
 * with remaining chunks decrypted and fed to MediaSource in real time.
 * After all chunks finish, the full content is written to Cache API for
 * instant replay on subsequent visits.
 *
 * Features:
 * - Cache-first loading: checks Cache API before any network/crypto operations
 * - Cache HIT = instant playback with zero network/crypto operations
 * - Cache MISS = progressive playback: plays as it decrypts, caches after completion
 * - Sub-second time-to-first-frame via MediaSource Extensions API
 * - Fallback to full-file decrypt for browsers without MSE support
 * - AES key cache: skips ICP canister on replay within session
 * - Arkiv cache integration: updates metadata after cache operations
 * - Progress tracking with granular loading stages
 *
 * @module hooks/useVideoCache
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useWalletClient } from 'wagmi'
import { useServiceWorker } from './useServiceWorker'
import { useProgressivePlayback } from './useProgressivePlayback'
import { useCidDecryption } from './useCidDecryption'
import { hasVideo, putVideo, deleteVideo, getVideoUrl } from '@/lib/video-cache'
import { requestPersistentStorageSilent, isPersisted } from '@/lib/storage-persistence'
import { touchVideo } from '@/lib/cache-expiration'
import { getVideoCacheService } from '@/services/cacheService'
import { fetchFromIpfs } from '@/services/ipfsService'
import { decryptContentKey, isHybridV1Metadata, getHavenAolErrorMessage } from '@/lib/haven-aol'
import type { WalletClientLike } from '@/lib/haven-aol'
import { decryptChunkedStream, parseChunkedFileHeader, concatenateChunks } from '@/lib/chunked-decrypt'
import type { ChunkedDecryptProgress } from '@/lib/chunked-decrypt'
import { createBufferLifecycle } from '@/lib/buffer-lifecycle'
import type { Video } from '@/types'

// ============================================================================
// Types
// ============================================================================

/**
 * Loading stages for cache-first video loading with progressive playback.
 * Provides granular progress display for UI.
 */
export type LoadingStage =
  | 'checking-cache'    // Checking if video is in Cache API
  | 'decrypting-cid'   // Decrypting encrypted CID via Haven-AOL
  | 'fetching'         // Downloading encrypted data via IPFS
  | 'authenticating'   // Authenticating with Haven-AOL (EIP-712)
  | 'decrypting-key'   // Recovering AES key from ICP canister
  | 'streaming'        // Progressive decryption + playback in progress
  | 'caching'          // Writing full content to Cache API (background)
  | 'ready'            // Video fully cached and ready
  | 'error'            // Loading failed

/**
 * Return type for the useVideoCache hook.
 */
export interface UseVideoCacheReturn {
  /** URL to set as <video src> — either progressive (MediaSource) or cache URL */
  videoUrl: string | null

  /** Whether the video was served from cache (instant playback) */
  isCached: boolean

  /** Whether the video is currently being loaded (any stage before ready) */
  isLoading: boolean

  /** Whether the video is playing progressively (still decrypting) */
  isStreaming: boolean

  /** Current loading stage for progress display */
  loadingStage: LoadingStage

  /** Progress percentage (0-100) */
  progress: number

  /** Number of chunks decrypted so far (during streaming) */
  chunksDecrypted: number

  /** Total estimated chunks */
  totalChunks: number

  /** Error if loading failed */
  error: Error | null

  /** Whether the video can be downloaded (fully cached) */
  canDownload: boolean

  /** Retry loading */
  retry: () => void

  /** Evict this video from cache */
  evict: () => Promise<void>
}

// ============================================================================
// Progress Weights for Each Stage
// ============================================================================

const PROGRESS_WEIGHTS: Record<LoadingStage, number> = {
  'checking-cache': 5,
  'decrypting-cid': 15,
  fetching: 25,
  authenticating: 40,
  'decrypting-key': 55,
  streaming: 70,   // 70-95 mapped from chunk progress
  caching: 95,
  ready: 100,
  error: 0,
}

// ============================================================================
// Hook
// ============================================================================

/**
 * React hook for progressive video playback with background caching.
 *
 * This is the main integration point between the VideoPlayer component and
 * the decryption + caching layer. It implements the progressive-first strategy:
 *
 * 1. Check if video is in Cache API
 * 2. Cache HIT: serve instantly via Service Worker
 * 3. Cache MISS: fetch → decrypt key → progressive playback (immediate) → cache (background)
 *
 * Progressive playback means:
 * - Video starts playing after the FIRST chunk decrypts (~1MB, sub-second)
 * - Remaining chunks decrypt and feed to MediaSource SourceBuffer in real time
 * - After all chunks finish, full content is written to Cache API
 * - On next visit, cache serves instantly
 *
 * @param video - The video to load (null if no video selected)
 * @returns UseVideoCacheReturn object with state and control functions
 */
export function useVideoCache(video: Video | null): UseVideoCacheReturn {
  useServiceWorker()
  const { data: walletClient } = useWalletClient()
  const { decryptCid: decryptVideoCid } = useCidDecryption()
  const progressive = useProgressivePlayback()

  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [isCached, setIsCached] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('checking-cache')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  const [canDownload, setCanDownload] = useState(false)
  const [chunksDecrypted, setChunksDecrypted] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)

  // Refs for cleanup
  const isMountedRef = useRef(true)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Refs for callbacks — breaks the dependency chain that causes infinite loops
  const decryptVideoCidRef = useRef(decryptVideoCid)
  const walletClientRef = useRef(walletClient)
  const progressiveRef = useRef(progressive)

  useEffect(() => {
    decryptVideoCidRef.current = decryptVideoCid
  }, [decryptVideoCid])

  useEffect(() => {
    walletClientRef.current = walletClient
  }, [walletClient])

  useEffect(() => {
    progressiveRef.current = progressive
  }, [progressive])

  // Guard against re-entry
  const isLoadingRef = useRef(false)

  // Track mount state
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      abortControllerRef.current?.abort()
    }
  }, [])

  /**
   * Update loading stage and progress.
   */
  const updateStage = useCallback((stage: LoadingStage, customProgress?: number) => {
    if (isMountedRef.current) {
      setLoadingStage(stage)
      setProgress(customProgress ?? PROGRESS_WEIGHTS[stage])
    }
  }, [])

  /**
   * Main video loading function implementing progressive-first strategy.
   */
  const loadVideo = useCallback(
    async (videoToLoad: Video) => {
      // Prevent re-entry
      if (isLoadingRef.current) return
      isLoadingRef.current = true

      // Cancel any ongoing operation
      abortControllerRef.current?.abort()
      abortControllerRef.current = new AbortController()
      const signal = abortControllerRef.current.signal

      // Reset progressive playback for new video
      progressiveRef.current.reset()

      setIsLoading(true)
      setIsStreaming(false)
      setError(null)
      setIsCached(false)
      setCanDownload(false)
      setVideoUrl(null)
      setChunksDecrypted(0)
      setTotalChunks(0)

      try {
        // Non-encrypted videos: fetch via IPFS, store in cache, serve via SW
        if (!videoToLoad.isEncrypted) {
          updateStage('fetching')

          const result = await fetchFromIpfs(videoToLoad.filecoinCid || '')

          if (signal.aborted) throw new Error('Loading cancelled')

          const mimeType = 'video/mp4'
          await putVideo(videoToLoad.id, result.data, mimeType)

          // Notify arkiv-cache
          try {
            const cacheService = getVideoCacheService(videoToLoad.owner)
            await cacheService.updateVideoCacheStatus(videoToLoad.id, 'cached', Date.now())
          } catch { /* non-critical */ }

          const persisted = await isPersisted()
          if (!persisted) requestPersistentStorageSilent().catch(() => {})

          if (isMountedRef.current) {
            setVideoUrl(getVideoUrl(videoToLoad.id))
            setIsCached(true)
            setCanDownload(true)
            updateStage('ready')
            setIsLoading(false)
          }
          return
        }

        // =====================================================================
        // ENCRYPTED VIDEO FLOW — Progressive Playback
        // =====================================================================

        // Step 1: Check cache
        updateStage('checking-cache')

        const cached = await hasVideo(videoToLoad.id)

        if (signal.aborted) throw new Error('Loading cancelled')

        if (cached) {
          // Cache HIT — instant playback
          touchVideo(videoToLoad.id)

          if (isMountedRef.current) {
            setVideoUrl(getVideoUrl(videoToLoad.id))
            setIsCached(true)
            setCanDownload(true)
            updateStage('ready')
            setIsLoading(false)
          }
          return
        }

        // Step 2: Resolve CID (decrypt if needed)
        let cid: string | undefined

        if (videoToLoad.decryptedCid) {
          cid = videoToLoad.decryptedCid
        } else if (videoToLoad.cidEncryptionMetadata && videoToLoad.encryptedCid) {
          updateStage('decrypting-cid')

          const decryptedCid = await decryptVideoCidRef.current(videoToLoad)

          if (signal.aborted) throw new Error('Loading cancelled')

          if (!decryptedCid) {
            throw new Error(
              'Failed to decrypt CID — wallet may not be connected or signature was rejected'
            )
          }

          cid = decryptedCid

          // Cache decrypted CID for future use
          try {
            const cacheService = getVideoCacheService(videoToLoad.owner)
            await cacheService.updateDecryptedCid(videoToLoad.id, decryptedCid)
          } catch { /* non-critical */ }
        } else {
          cid = videoToLoad.filecoinCid
        }

        if (!cid) {
          throw new Error(
            'No CID available for video — encrypted_cid and cid_encryption_metadata ' +
            'may be missing from Arkiv entity, or filecoin_root_cid is not set'
          )
        }

        // Step 3: Fetch encrypted data from IPFS
        updateStage('fetching')

        const fetchResult = await fetchFromIpfs(cid)

        if (signal.aborted) throw new Error('Loading cancelled')

        const encryptedData = fetchResult.data
        const lifecycle = createBufferLifecycle()
        lifecycle.track('encrypted', encryptedData)

        // Step 4: Decrypt AES key via Haven-AOL
        updateStage('authenticating')

        const currentWalletClient = walletClientRef.current
        if (!currentWalletClient) {
          throw new Error('Please connect your wallet to decrypt this video.')
        }

        const { aesKey } = await decryptContentKey({
          encryptionMetadata: videoToLoad.encryptionMetadata!,
          encryptedCid: videoToLoad.encryptedCid,
          walletClient: currentWalletClient as unknown as WalletClientLike,
          onProgress: (msg) => {
            if (isMountedRef.current) {
              if (msg.includes('key') || msg.includes('Key') || msg.includes('network')) {
                updateStage('decrypting-key')
              }
            }
          },
          signal,
        })

        lifecycle.track('aesKey', aesKey)

        if (signal.aborted) throw new Error('Loading cancelled')

        // Step 5: Initialize progressive playback
        const mimeType = isHybridV1Metadata(videoToLoad.encryptionMetadata!)
          ? (videoToLoad.encryptionMetadata!.originalMimeType || 'video/mp4')
          : 'video/mp4'

        await progressiveRef.current.initialize(mimeType)

        if (signal.aborted) throw new Error('Loading cancelled')

        // Step 6: Start progressive decryption → MediaSource feeding
        updateStage('streaming')

        if (isMountedRef.current) {
          setIsStreaming(true)
          // Set the video URL immediately — playback starts after first chunk
          setVideoUrl(progressiveRef.current.url)
        }

        // Parse header to get estimated chunk count
        const header = parseChunkedFileHeader(encryptedData)
        if (isMountedRef.current) {
          setTotalChunks(header.estimatedChunks)
        }

        // Decrypt and feed chunks progressively
        const allChunks: Uint8Array[] = []
        let totalPlaintextSize = 0
        let chunkCount = 0

        const onProgress: ChunkedDecryptProgress = (chunkIdx, totalEst) => {
          if (isMountedRef.current) {
            setChunksDecrypted(chunkIdx + 1)
            setTotalChunks(totalEst)
            // Map chunk progress to 70-95% range
            const pct = Math.min(95, 70 + Math.round(((chunkIdx + 1) / totalEst) * 25))
            setProgress(pct)
          }
        }

        for await (const chunk of decryptChunkedStream(encryptedData, aesKey, { signal, onProgress })) {
          if (signal.aborted) throw new Error('Loading cancelled')

          // Feed to progressive playback (MediaSource SourceBuffer)
          const isLast = chunkCount + 1 >= header.estimatedChunks ||
            // More accurate: check if we've consumed all data
            false // Will be corrected by the stream ending

          allChunks.push(chunk)
          totalPlaintextSize += chunk.byteLength
          chunkCount++

          await progressiveRef.current.appendChunk(chunk, false)
        }

        // Signal end of stream to MediaSource
        await progressiveRef.current.appendChunk(new Uint8Array(0), true)

        if (signal.aborted) throw new Error('Loading cancelled')

        // Step 7: Background cache write
        updateStage('caching')

        if (isMountedRef.current) {
          setIsStreaming(false)
        }

        // Concatenate all chunks and write to Cache API
        const fullPlaintext = concatenateChunks(allChunks, totalPlaintextSize)
        await putVideo(videoToLoad.id, fullPlaintext, mimeType)

        // Release buffers
        lifecycle.release('encrypted')
        lifecycle.release('aesKey')

        // Notify arkiv-cache
        try {
          const cacheService = getVideoCacheService(videoToLoad.owner)
          await cacheService.updateVideoCacheStatus(videoToLoad.id, 'cached', Date.now())
        } catch { /* non-critical */ }

        // Request persistent storage
        const persisted = await isPersisted()
        if (!persisted) requestPersistentStorageSilent().catch(() => {})

        // Step 8: Done — switch to cache URL for future stability
        if (isMountedRef.current) {
          // Switch to cache URL (service worker serves from Cache API)
          setVideoUrl(getVideoUrl(videoToLoad.id))
          setIsCached(true)
          setCanDownload(true)
          updateStage('ready')
        }
      } catch (err) {
        // Handle cancellation gracefully
        if (err instanceof Error && err.message === 'Loading cancelled') {
          return
        }

        const errorMessage = err instanceof Error ? err.message : 'Failed to load video'
        console.error('[useVideoCache] Loading failed:', err)

        // Get user-friendly error message for Haven-AOL errors
        const friendlyMessage = getHavenAolErrorMessage(err)

        if (isMountedRef.current) {
          setError(new Error(friendlyMessage || errorMessage))
          updateStage('error')
          setIsStreaming(false)
        }
      } finally {
        isLoadingRef.current = false
        if (isMountedRef.current) {
          setIsLoading(false)
        }
      }
    },
    [updateStage]
  )

  /**
   * Retry loading the video.
   */
  const retry = useCallback(() => {
    if (video) {
      progressive.reset()
      loadVideo(video)
    }
  }, [video, loadVideo, progressive])

  /**
   * Evict this video from cache.
   */
  const evict = useCallback(async () => {
    if (!video) return

    try {
      await deleteVideo(video.id)

      // Notify arkiv-cache
      try {
        const cacheService = getVideoCacheService(video.owner)
        await cacheService.updateVideoCacheStatus(video.id, 'not-cached')
      } catch { /* non-critical */ }

      if (isMountedRef.current) {
        setIsCached(false)
        setCanDownload(false)
        setVideoUrl(null)
      }
    } catch (err) {
      console.error('[useVideoCache] Failed to evict video:', err)
    }
  }, [video])

  /**
   * Load video when it changes.
   */
  useEffect(() => {
    if (video?.id) {
      loadVideo(video)
    } else {
      // Reset state when video is null
      progressive.reset()
      setVideoUrl(null)
      setIsCached(false)
      setCanDownload(false)
      setError(null)
      setLoadingStage('checking-cache')
      setProgress(0)
      setIsLoading(false)
      setIsStreaming(false)
      setChunksDecrypted(0)
      setTotalChunks(0)
    }

    return () => {
      abortControllerRef.current?.abort()
    }
  }, [video?.id, loadVideo]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    videoUrl,
    isCached,
    isLoading,
    isStreaming,
    loadingStage,
    progress,
    chunksDecrypted,
    totalChunks,
    error,
    canDownload,
    retry,
    evict,
  }
}
