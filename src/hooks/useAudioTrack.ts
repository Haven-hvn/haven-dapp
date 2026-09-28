/**
 * useAudioTrack Hook
 *
 * Loads one `haven.audio.full` release end to end: Cache API hit → instant
 * playback URL; otherwise fetch the Filecoin piece + unwrap the gate AES key
 * in parallel (same joint as video), decrypt to full plaintext (single-blob
 * or chunked seals), persist to cache, and parse ID3 chapters + cover art
 * from the plaintext for the audio player.
 *
 * Video stays on the progressive MSE pipeline; albums are small enough
 * (~84MB) that full-decrypt-then-play is simpler and supports seeking
 * into any chapter immediately.
 */

import { useState, useEffect, useRef } from 'react'
import { useWalletClient } from 'wagmi'
import { hasVideo, putVideo, getVideoUrl } from '@/lib/video-cache'
import { requirePieceCid } from '@/lib/download-cid'
import { requestPersistentStorageSilent, isPersisted } from '@/lib/storage-persistence'
import { touchVideo } from '@/lib/cache-expiration'
import { getVideoCacheService } from '@/services/cacheService'
import { DEFAULT_PIECE_DOWNLOAD_TIMEOUT_MS, fetchPinnedContent } from '@/services/ipfsService'
import { prepareEncryptedContentInputs } from '@/lib/encrypted-playback-prepare'
import { isPlaybackCancellation, toPlaybackLoadError } from '@/lib/playback-errors'
import type { WalletClientLike } from '@/lib/haven-aol'
import { decryptToPlaintext } from '@/lib/blob-decrypt'
import { createBufferLifecycle } from '@/lib/buffer-lifecycle'
import {
  parseId3Chapters,
  parseId3Cover,
  type AudioChapter,
  type Id3Cover,
} from '@/lib/id3-chapters'
import type { Video } from '@/types'

export type AudioLoadStage =
  | 'idle'
  | 'checking-cache'
  | 'authenticating'
  | 'fetching'
  | 'decrypting-key'
  | 'decrypting'
  | 'caching'
  | 'ready'
  | 'error'

export interface UseAudioTrackReturn {
  /** Object/cache URL for the `<audio>` element (null until ready) */
  audioUrl: string | null
  /** Parsed ID3 chapters (empty until plaintext is available) */
  chapters: AudioChapter[]
  /** Embedded cover art (null when the tag has none) */
  cover: Id3Cover | null
  /** Current pipeline stage (for progress UI) */
  stage: AudioLoadStage
  /** True while any load step runs */
  isLoading: boolean
  /** True once the track is playable */
  isReady: boolean
  /** Load/decrypt failure (null when healthy) */
  error: Error | null
  /** Re-run the load (e.g. after the wallet connects) */
  reload: () => void
}

export function useAudioTrack(track: Video | null): UseAudioTrackReturn {
  const { data: walletClient } = useWalletClient()
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [chapters, setChapters] = useState<AudioChapter[]>([])
  const [cover, setCover] = useState<Id3Cover | null>(null)
  const [stage, setStage] = useState<AudioLoadStage>('idle')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)
  const isMountedRef = useRef(true)
  const walletClientRef = useRef(walletClient)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    walletClientRef.current = walletClient
  }, [walletClient])

  useEffect(() => {
    if (!track) return
    const abortController = new AbortController()
    const signal = abortController.signal
    const trackToLoad = track

    async function load() {
      if (!isMountedRef.current) return
      setIsLoading(true)
      setError(null)
      setStage('checking-cache')

      try {
        const cached = await hasVideo(trackToLoad.id)
        if (signal.aborted) return

        if (cached) {
          touchVideo(trackToLoad.id)
          const url = getVideoUrl(trackToLoad.id)
          const plaintext = new Uint8Array(await (await fetch(url)).arrayBuffer())
          if (signal.aborted) return
          if (isMountedRef.current) {
            setChapters(parseId3Chapters(plaintext))
            setCover(parseId3Cover(plaintext))
            setAudioUrl(url)
            setStage('ready')
            setIsLoading(false)
          }
          return
        }

        // Non-encrypted tracks: fetch the piece, cache it, serve via SW.
        if (!trackToLoad.isEncrypted) {
          requirePieceCid(trackToLoad)
          setStage('fetching')
          const result = await fetchPinnedContent(trackToLoad, { abortSignal: signal })
          if (signal.aborted) return
          const mimeType = trackToLoad.contentMimeType || 'audio/mpeg'
          await putVideo(trackToLoad.id, result.data, mimeType)
          try {
            const cacheService = getVideoCacheService(trackToLoad.owner)
            await cacheService.updateVideoCacheStatus(trackToLoad.id, 'cached', Date.now())
          } catch {
            /* non-critical */
          }
          if (signal.aborted) return
          if (isMountedRef.current) {
            setChapters(parseId3Chapters(result.data))
            setCover(parseId3Cover(result.data))
            setAudioUrl(getVideoUrl(trackToLoad.id))
            setStage('ready')
            setIsLoading(false)
          }
          return
        }

        requirePieceCid(trackToLoad)
        const lifecycle = createBufferLifecycle()
        const currentWalletClient = walletClientRef.current
        if (!currentWalletClient) {
          throw new Error('Please connect your wallet to decrypt this track.')
        }

        setStage('authenticating')
        const { aesKey, encryptedData } = await prepareEncryptedContentInputs({
          video: trackToLoad,
          walletClient: currentWalletClient as unknown as WalletClientLike,
          signal,
          abortParallel: () => abortController.abort(),
          timeoutMs: DEFAULT_PIECE_DOWNLOAD_TIMEOUT_MS,
          onKeyProgress: (msg) => {
            if (!isMountedRef.current) return
            if (msg.includes('Sign')) setStage('authenticating')
            else if (msg.includes('key') || msg.includes('Key') || msg.includes('network')) {
              setStage('decrypting-key')
            }
          },
          onFetchProgress: (downloaded, total) => {
            if (!isMountedRef.current || total <= 0) return
            if (downloaded < total) setStage('fetching')
          },
        })
        if (signal.aborted) return

        lifecycle.track('aesKey', aesKey)
        lifecycle.track('encrypted', encryptedData)

        setStage('decrypting')
        const plaintext = await decryptToPlaintext(encryptedData, aesKey, signal)
        if (signal.aborted) return

        setStage('caching')
        const mimeType = trackToLoad.contentMimeType || 'audio/mpeg'
        await putVideo(trackToLoad.id, plaintext, mimeType)
        lifecycle.release('encrypted')
        lifecycle.release('aesKey')

        try {
          const cacheService = getVideoCacheService(trackToLoad.owner)
          await cacheService.updateVideoCacheStatus(trackToLoad.id, 'cached', Date.now())
        } catch {
          /* non-critical */
        }

        const persisted = await isPersisted()
        if (!persisted) requestPersistentStorageSilent().catch(() => {})

        if (signal.aborted) return
        if (isMountedRef.current) {
          setChapters(parseId3Chapters(plaintext))
          setCover(parseId3Cover(plaintext))
          setAudioUrl(getVideoUrl(trackToLoad.id))
          setStage('ready')
          setIsLoading(false)
        }
      } catch (err) {
        if (signal.aborted || isPlaybackCancellation(err)) return
        if (isMountedRef.current) {
          setError(toPlaybackLoadError(err))
          setStage('error')
          setIsLoading(false)
        }
      }
    }

    load()
    return () => abortController.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, nonce])

  return {
    audioUrl,
    chapters,
    cover,
    stage,
    isLoading,
    isReady: stage === 'ready' && audioUrl !== null,
    error,
    reload: () => setNonce((n) => n + 1),
  }
}
