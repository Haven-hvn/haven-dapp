/**
 * React Hook for Video Cache
 *
 * The primary React hook that implements the cache-first video loading strategy.
 * This hook wraps the entire video loading flow with a cache check at the beginning
 * and a cache write at the end, providing a single unified API for the VideoPlayer.
 *
 * Features:
 * - Cache-first loading: checks Cache API before any network/crypto operations
 * - Cache HIT = instant playback with zero network/crypto operations
 * - Cache MISS = full fetch → decrypt → cache pipeline
 * - Arkiv cache integration: updates metadata after cache operations
 * - Progress tracking with granular loading stages
 * - Retry and evict functionality
 * - Support for expired Arkiv entities (metadata from arkiv-cache)
 *
 * @module hooks/useVideoCache
 * @see ../../../task-1.2-video-cache-ts.md - Task requirements
 * @see ../../../arkiv-cache/ - Arkiv cache integration
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useServiceWorker } from './useServiceWorker'
import { useVideoDecryption } from './useVideoDecryption'
import { useCidDecryption } from './useCidDecryption'
import { hasVideo, putVideo, deleteVideo, getVideoUrl } from '@/lib/video-cache'
import { requestPersistentStorageSilent, isPersisted } from '@/lib/storage-persistence'
import { touchVideo } from '@/lib/cache-expiration'
import { getVideoCacheService } from '@/services/cacheService'
import { fetchFromIpfs } from '@/services/ipfsService'
import type { Video } from '@/types'

// ============================================================================
// Types
// ============================================================================

/**
 * Loading stages for cache-first video loading.
 * Provides granular progress display for UI.
 */
export type LoadingStage =
  | 'checking-cache' // Checking if video is in Cache API
  | 'decrypting-cid' // Decrypting encrypted CID via Lit Protocol
  | 'fetching' // Downloading encrypted data via IPFS
  | 'authenticating' // Authenticating with Lit Protocol (SIWE)
  | 'decrypting' // Decrypting AES key and video content
  | 'caching' // Storing decrypted content in Cache API
  | 'ready' // Video ready for playback
  | 'error' // Loading failed

/**
 * Return type for the useVideoCache hook.
 */
export interface UseVideoCacheReturn {
  /** URL to set as <video src> — /haven/v/{id} served by Service Worker */
  videoUrl: string | null

  /** Whether the video was served from cache */
  isCached: boolean

  /** Whether the video is currently being loaded (fetch + decrypt + cache) */
  isLoading: boolean

  /** Current loading stage for progress display */
  loadingStage: LoadingStage

  /** Progress percentage (0-100) */
  progress: number

  /** Error if loading failed */
  error: Error | null

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
  decrypting: 70,
  caching: 90,
  ready: 100,
  error: 0,
}

// ============================================================================
// Hook
// ============================================================================

/**
 * React hook for cache-first video loading with automatic caching.
 *
 * This is the main integration point between the VideoPlayer component and
 * the caching layer. It implements the cache-first strategy:
 *
 * 1. Check if video is in Cache API
 * 2. Cache HIT: serve instantly via Service Worker
 * 3. Cache MISS: fetch → decrypt → cache → serve
 *
 * The hook also integrates with the Arkiv cache system to keep metadata
 * in sync after cache operations.
 *
 * @param video - The video to load (null if no video selected)
 * @returns UseVideoCacheReturn object with state and control functions
 *
 * @example
 * ```tsx
 * function VideoPlayer({ video }: { video: Video }) {
 *   const {
 *     videoUrl,
 *     isCached,
 *     isLoading,
 *     loadingStage,
 *     progress,
 *     error,
 *     retry,
 *     evict
 *   } = useVideoCache(video)
 *
 *   if (isLoading) {
 *     return <LoadingProgress stage={loadingStage} progress={progress} />
 *   }
 *
 *   if (error) {
 *     return <ErrorDisplay error={error} onRetry={retry} />
 *   }
 *
 *   return (
 *     <div>
 *       {isCached && <CacheBadge />}
 *       <video src={videoUrl} controls />
 *       <button onClick={evict}>Remove from cache</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useVideoCache(video: Video | null): UseVideoCacheReturn {
  const sw = useServiceWorker()
  const { decrypt: decryptVideo } = useVideoDecryption()
  const { decryptCid: decryptVideoCid } = useCidDecryption()

  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [isCached, setIsCached] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('checking-cache')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<Error | null>(null)

  // Refs for cleanup
  const isMountedRef = useRef(true)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Refs for callbacks — breaks the dependency chain that causes infinite loops.
  // Without refs, useWalletClient() returns a new object on every render, which
  // destabilizes decryptVideo/decryptVideoCid → loadVideo → useEffect → abort → restart.
  // By reading from refs, loadVideo's identity never changes due to callback changes.
  const decryptVideoRef = useRef(decryptVideo)
  const decryptVideoCidRef = useRef(decryptVideoCid)

  useEffect(() => {
    decryptVideoRef.current = decryptVideo
  }, [decryptVideo])

  useEffect(() => {
    decryptVideoCidRef.current = decryptVideoCid
  }, [decryptVideoCid])

  // Guard against re-entry (prevents concurrent loadVideo calls)
  const isLoadingRef = useRef(false)

  // Track mount state (must set true on mount to handle React Strict Mode remounts)
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
  const updateStage = useCallback((stage: LoadingStage) => {
    if (isMountedRef.current) {
      setLoadingStage(stage)
      setProgress(PROGRESS_WEIGHTS[stage])
    }
  }, [])

  /**
   * Main video loading function implementing cache-first strategy.
   * Uses refs for decryption callbacks to keep this function's identity stable.
   */
  const loadVideo = useCallback(
    async (videoToLoad: Video) => {
      // Prevent re-entry — if already loading, don't restart
      if (isLoadingRef.current) {
        return
      }
      isLoadingRef.current = true

      // Cancel any ongoing operation
      abortControllerRef.current?.abort()
      abortControllerRef.current = new AbortController()
      const signal = abortControllerRef.current.signal

      setIsLoading(true)
      setError(null)
      setIsCached(false)
      setVideoUrl(null)

      try {
        // Non-encrypted videos: fetch via Synapse, store in cache, serve via SW
        if (!videoToLoad.isEncrypted) {
          updateStage('fetching')

          const result = await fetchFromIpfs(videoToLoad.filecoinCid || '')

          if (signal.aborted) {
            throw new Error('Loading cancelled')
          }

          const mimeType = 'video/mp4'
          await putVideo(videoToLoad.id, result.data, mimeType)

          // Notify arkiv-cache that content is now cached
          try {
            const cacheService = getVideoCacheService(videoToLoad.owner)
            await cacheService.updateVideoCacheStatus(videoToLoad.id, 'cached', Date.now())
          } catch {
            // Ignore arkiv-cache update errors - they're non-critical
          }

          // Request persistent storage after first successful cache write
          // This prevents the browser from evicting our cache under storage pressure
          const persisted = await isPersisted()
          if (!persisted) {
            requestPersistentStorageSilent().catch(() => {})
          }

          if (isMountedRef.current) {
            setVideoUrl(getVideoUrl(videoToLoad.id))
            setIsCached(true)
            updateStage('ready')
            setIsLoading(false)
          }
          return
        }

        // Step 1: Check cache
        updateStage('checking-cache')

        const cached = await hasVideo(videoToLoad.id)

        if (signal.aborted) {
          throw new Error('Loading cancelled')
        }

        if (cached) {
          // Cache HIT — instant playback, no Synapse fetch, no Lit auth, no decryption
          // Update LRU tracking to keep frequently-watched videos in cache longer
          touchVideo(videoToLoad.id)

          if (isMountedRef.current) {
            setVideoUrl(getVideoUrl(videoToLoad.id))
            setIsCached(true)
            updateStage('ready')
            setIsLoading(false)
          }
          return
        }

        // Step 2: Resolve CID
        // For encrypted videos, the CID stored in Arkiv (encrypted_cid attribute) is a
        // Lit-encrypted ciphertext — NOT a usable IPFS CID. It must be decrypted using
        // cid_encryption_metadata via Lit Protocol to get the actual IPFS CID.
        // This matches the haven-player restore flow.
        let cid: string | undefined

        if (videoToLoad.decryptedCid) {
          // Use previously cached decrypted CID (avoids re-decryption)
          cid = videoToLoad.decryptedCid
        } else if (videoToLoad.cidEncryptionMetadata && videoToLoad.encryptedCid) {
          // Decrypt the encrypted CID via Lit Protocol (wallet signature required)
          updateStage('decrypting-cid')

          console.log('[useVideoCache] Attempting CID decryption for video:', videoToLoad.id)

          const decryptedCid = await decryptVideoCidRef.current(videoToLoad)

          if (signal.aborted) {
            throw new Error('Loading cancelled')
          }

          if (!decryptedCid) {
            throw new Error(
              'Failed to decrypt CID — wallet may not be connected or signature was rejected'
            )
          }

          cid = decryptedCid

          // Cache the decrypted CID for future use (skip Lit on next access)
          try {
            const cacheService = getVideoCacheService(videoToLoad.owner)
            await cacheService.updateDecryptedCid(videoToLoad.id, decryptedCid)
          } catch {
            // Non-critical — CID will be re-decrypted next time
          }
        } else {
          // Fallback: use filecoinCid for non-encrypted videos or if no encryption metadata
          cid = videoToLoad.filecoinCid
        }

        if (!cid) {
          console.error('[useVideoCache] No CID available for video:', {
            id: videoToLoad.id,
            title: videoToLoad.title,
            isEncrypted: videoToLoad.isEncrypted,
            hasEncryptedCid: Boolean(videoToLoad.encryptedCid),
            hasCidEncryptionMetadata: Boolean(videoToLoad.cidEncryptionMetadata),
            hasDecryptedCid: Boolean(videoToLoad.decryptedCid),
            filecoinCid: videoToLoad.filecoinCid,
          })
          throw new Error(
            'No CID available for video — encrypted_cid and cid_encryption_metadata ' +
            'may be missing from Arkiv entity, or filecoin_root_cid is not set'
          )
        }

        // Step 3: Cache MISS — fetch encrypted data via IPFS
        updateStage('fetching')

        const fetchResult = await fetchFromIpfs(cid)

        if (signal.aborted) {
          throw new Error('Loading cancelled')
        }

        // Step 4: Decrypt (includes authenticating with Lit Protocol)
        updateStage('authenticating')

        // The decrypt function handles authenticating → decrypting key → decrypting file
        // It updates its own progress, so we map its status to our stages
        const decryptedUrl = await decryptVideoRef.current(videoToLoad, fetchResult.data)

        if (signal.aborted) {
          throw new Error('Loading cancelled')
        }

        if (!decryptedUrl) {
          throw new Error('Video decryption failed — wallet may not be connected or signature was rejected')
        }

        // Step 5: Update stage to decrypting (decrypt function handles the actual work)
        updateStage('decrypting')

        // Small delay to show progress if decryption was fast
        await new Promise((resolve) => setTimeout(resolve, 50))

        if (signal.aborted) {
          URL.revokeObjectURL(decryptedUrl)
          throw new Error('Loading cancelled')
        }

        // Step 6: Store decrypted content in Cache API
        updateStage('caching')

        const response = await fetch(decryptedUrl)
        const blob = await response.blob()
        const mimeType = videoToLoad.litEncryptionMetadata?.originalMimeType || 'video/mp4'

        await putVideo(videoToLoad.id, blob, mimeType)

        // Revoke the blob URL to free memory (content is now in Cache API)
        URL.revokeObjectURL(decryptedUrl)

        // Notify arkiv-cache that content is now cached
        try {
          const cacheService = getVideoCacheService(videoToLoad.owner)
          await cacheService.updateVideoCacheStatus(videoToLoad.id, 'cached', Date.now())
        } catch {
          // Ignore arkiv-cache update errors - they're non-critical
        }

        // Request persistent storage after first successful cache write
        // This prevents the browser from evicting our cache under storage pressure
        const persisted = await isPersisted()
        if (!persisted) {
          requestPersistentStorageSilent().catch(() => {})
        }

        if (signal.aborted) {
          throw new Error('Loading cancelled')
        }

        // Serve via Service Worker
        if (isMountedRef.current) {
          setVideoUrl(getVideoUrl(videoToLoad.id))
          setIsCached(true)
          updateStage('ready')
        }
      } catch (err) {
        // Handle cancellation gracefully
        if (err instanceof Error && err.message === 'Loading cancelled') {
          return
        }

        const errorMessage = err instanceof Error ? err.message : 'Failed to load video'
        console.error('[useVideoCache] Loading failed:', err)

        if (isMountedRef.current) {
          setError(err instanceof Error ? err : new Error(errorMessage))
          updateStage('error')
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
      loadVideo(video)
    }
  }, [video, loadVideo])

  /**
   * Evict this video from cache.
   */
  const evict = useCallback(async () => {
    if (!video) return

    try {
      await deleteVideo(video.id)

      // Notify arkiv-cache that content is no longer cached
      try {
        const cacheService = getVideoCacheService(video.owner)
        await cacheService.updateVideoCacheStatus(video.id, 'not-cached')
      } catch {
        // Ignore arkiv-cache update errors - they're non-critical
      }

      if (isMountedRef.current) {
        setIsCached(false)
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
      setVideoUrl(null)
      setIsCached(false)
      setError(null)
      setLoadingStage('checking-cache')
      setProgress(0)
      setIsLoading(false)
    }

    return () => {
      abortControllerRef.current?.abort()
    }
  }, [video?.id, loadVideo])

  return {
    videoUrl,
    isCached,
    isLoading,
    loadingStage,
    progress,
    error,
    retry,
    evict,
  }
}

// ============================================================================
// Additional Exports
// ============================================================================

// UseVideoCacheReturn is already exported as an interface above
