/**
 * Progressive Playback Hook
 *
 * Provides progressive video playback using the MediaSource Extensions (MSE) API.
 * Decrypted chunks are fed to a SourceBuffer as they become available, enabling
 * sub-second time-to-first-frame instead of waiting for full file decryption.
 *
 * ## How It Works
 *
 * 1. Creates a MediaSource object and generates a blob URL
 * 2. When chunks arrive via `appendChunk()`, appends them to the SourceBuffer
 * 3. Video element starts playback as soon as enough data is buffered (~1 chunk)
 * 4. When all chunks are received, signals end of stream
 *
 * ## Fallback
 *
 * If MediaSource is not supported (Safari iOS < 17.1, older browsers), the hook
 * falls back to collecting all chunks and creating a blob URL from the complete
 * data. The VideoPlayer doesn't need to know which path is used.
 *
 * ## Browser Support
 *
 * - Chrome/Edge: Full MSE support
 * - Firefox: Full MSE support
 * - Safari macOS: MSE support (macOS 11+)
 * - Safari iOS: MSE support from iOS 17.1+ (ManagedMediaSource)
 * - Fallback: Any browser without MSE gets full-file blob URL
 *
 * @module hooks/useProgressivePlayback
 * @see ../lib/chunked-decrypt.ts - Produces the chunks this hook consumes
 */

'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

// ============================================================================
// Types
// ============================================================================

/**
 * State of the progressive playback pipeline.
 */
export type ProgressivePlaybackState =
  | 'idle'           // Not started
  | 'initializing'   // Creating MediaSource / blob URL
  | 'buffering'      // Receiving and appending chunks
  | 'ready'          // Enough data to start playback
  | 'complete'       // All chunks received, stream ended
  | 'fallback'       // Using full-file fallback (no MSE)
  | 'error'          // Failed

/**
 * Return type for the useProgressivePlayback hook.
 */
export interface UseProgressivePlaybackReturn {
  /** URL for the <video> element src attribute */
  url: string | null

  /** Current state of progressive playback */
  state: ProgressivePlaybackState

  /** Whether MediaSource is being used (vs fallback) */
  isProgressive: boolean

  /** Number of chunks appended so far */
  chunksAppended: number

  /** Approximate bytes buffered */
  bytesBuffered: number

  /** Error if playback setup failed */
  error: Error | null

  /**
   * Initialize the progressive playback pipeline.
   * Call this before appending any chunks.
   *
   * @param mimeType - The MIME type + codec string (e.g., 'video/mp4; codecs="avc1.42E01E"')
   */
  initialize: (mimeType: string) => Promise<void>

  /**
   * Append a decrypted chunk to the playback buffer.
   * Must be called sequentially (chunks in order).
   *
   * @param chunk - Decrypted plaintext chunk
   * @param isLast - Whether this is the final chunk
   */
  appendChunk: (chunk: Uint8Array, isLast: boolean) => Promise<void>

  /**
   * Clean up all resources (MediaSource, blob URLs, buffers).
   */
  cleanup: () => void

  /**
   * Reset state for reuse with a new video.
   */
  reset: () => void
}

// ============================================================================
// MediaSource Support Detection
// ============================================================================

/**
 * Check if MediaSource Extensions are supported in the current browser.
 *
 * Checks for both standard MediaSource and ManagedMediaSource (Safari iOS 17.1+).
 */
function isMediaSourceSupported(): boolean {
  if (typeof window === 'undefined') return false
  return (
    'MediaSource' in window ||
    'ManagedMediaSource' in window
  )
}

/**
 * Get the appropriate MediaSource constructor.
 * Prefers ManagedMediaSource (Safari iOS) over standard MediaSource.
 */
function getMediaSourceConstructor(): typeof MediaSource | null {
  if (typeof window === 'undefined') return null

  // ManagedMediaSource for Safari iOS 17.1+
  if ('ManagedMediaSource' in window) {
    return (window as unknown as { ManagedMediaSource: typeof MediaSource }).ManagedMediaSource
  }

  if ('MediaSource' in window) {
    return MediaSource
  }

  return null
}

/**
 * Check if a MIME type is supported by MediaSource.
 *
 * @param mimeType - Full MIME type string (e.g., 'video/mp4; codecs="avc1.42E01E"')
 * @returns true if the type is supported
 */
function isTypeSupported(mimeType: string): boolean {
  const MSConstructor = getMediaSourceConstructor()
  if (!MSConstructor) return false

  return MSConstructor.isTypeSupported(mimeType)
}

/**
 * Normalize MIME type for MediaSource.
 *
 * MediaSource requires codec information. If none is provided,
 * we add a common codec string for the container type.
 *
 * @param mimeType - Input MIME type (may or may not have codecs)
 * @returns MIME type with codecs parameter
 */
function normalizeMimeType(mimeType: string): string {
  // If already has codecs parameter, use as-is
  if (mimeType.includes('codecs')) {
    return mimeType
  }

  // Add default codecs for common container types
  switch (mimeType.split(';')[0].trim().toLowerCase()) {
    case 'video/mp4':
      // H.264 Baseline profile + AAC-LC audio
      return 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
    case 'video/webm':
      // VP9 + Opus audio
      return 'video/webm; codecs="vp9, opus"'
    default:
      return mimeType
  }
}

// ============================================================================
// Hook
// ============================================================================

/**
 * React hook for progressive video playback via MediaSource API.
 *
 * Use with chunked decryption to achieve sub-second time-to-first-frame:
 *
 * @example
 * ```tsx
 * function Player({ encryptedData, aesKey, mimeType }) {
 *   const progressive = useProgressivePlayback()
 *
 *   useEffect(() => {
 *     async function run() {
 *       await progressive.initialize(mimeType)
 *
 *       for await (const chunk of decryptChunkedStream(encryptedData, aesKey)) {
 *         await progressive.appendChunk(chunk, false)
 *       }
 *       // Signal end
 *       await progressive.appendChunk(new Uint8Array(0), true)
 *     }
 *     run()
 *     return () => progressive.cleanup()
 *   }, [])
 *
 *   return <video src={progressive.url} autoPlay />
 * }
 * ```
 */
export function useProgressivePlayback(): UseProgressivePlaybackReturn {
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<ProgressivePlaybackState>('idle')
  const [isProgressive, setIsProgressive] = useState(false)
  const [chunksAppended, setChunksAppended] = useState(0)
  const [bytesBuffered, setBytesBuffered] = useState(0)
  const [error, setError] = useState<Error | null>(null)

  // Refs for MediaSource resources
  const mediaSourceRef = useRef<MediaSource | null>(null)
  const sourceBufferRef = useRef<SourceBuffer | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const isMountedRef = useRef(true)

  // Fallback: collect all chunks for full-file blob URL
  const fallbackChunksRef = useRef<Uint8Array[]>([])
  const fallbackMimeTypeRef = useRef<string>('video/mp4')

  // Queue for chunks waiting to be appended (SourceBuffer can only handle one at a time)
  const appendQueueRef = useRef<{ chunk: Uint8Array; isLast: boolean; resolve: () => void; reject: (err: Error) => void }[]>([])
  const isAppendingRef = useRef(false)

  // Track mount state
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  /**
   * Process the next item in the append queue.
   * SourceBuffer can only process one append at a time (throws if busy).
   */
  const processQueue = useCallback(() => {
    if (isAppendingRef.current) return
    if (appendQueueRef.current.length === 0) return

    const sourceBuffer = sourceBufferRef.current
    const mediaSource = mediaSourceRef.current
    if (!sourceBuffer || !mediaSource) return

    const { chunk, isLast, resolve, reject } = appendQueueRef.current.shift()!
    isAppendingRef.current = true

    const handleUpdateEnd = () => {
      sourceBuffer.removeEventListener('updateend', handleUpdateEnd)
      sourceBuffer.removeEventListener('error', handleError)
      isAppendingRef.current = false

      // If this was the last chunk, end the stream
      if (isLast && mediaSource.readyState === 'open') {
        try {
          mediaSource.endOfStream()
          if (isMountedRef.current) {
            setState('complete')
          }
        } catch (e) {
          console.warn('[ProgressivePlayback] endOfStream error (non-fatal):', e)
        }
      }

      resolve()

      // Process next item in queue
      processQueue()
    }

    const handleError = () => {
      sourceBuffer.removeEventListener('updateend', handleUpdateEnd)
      sourceBuffer.removeEventListener('error', handleError)
      isAppendingRef.current = false
      reject(new Error('SourceBuffer append error'))
      processQueue()
    }

    try {
      if (chunk.byteLength > 0) {
        sourceBuffer.addEventListener('updateend', handleUpdateEnd)
        sourceBuffer.addEventListener('error', handleError)
        sourceBuffer.appendBuffer(chunk as BufferSource)
      } else if (isLast) {
        // Empty last chunk — just end the stream
        if (mediaSource.readyState === 'open') {
          try {
            mediaSource.endOfStream()
            if (isMountedRef.current) {
              setState('complete')
            }
          } catch (e) {
            console.warn('[ProgressivePlayback] endOfStream error (non-fatal):', e)
          }
        }
        isAppendingRef.current = false
        resolve()
        processQueue()
      } else {
        // Empty non-last chunk — skip
        isAppendingRef.current = false
        resolve()
        processQueue()
      }
    } catch (err) {
      isAppendingRef.current = false
      reject(err instanceof Error ? err : new Error('Unknown append error'))
      processQueue()
    }
  }, [])

  /**
   * Initialize the progressive playback pipeline.
   */
  const initialize = useCallback(async (mimeType: string) => {
    if (!isMountedRef.current) return

    setState('initializing')
    setError(null)
    setChunksAppended(0)
    setBytesBuffered(0)

    const normalizedType = normalizeMimeType(mimeType)

    // Check if we can use MediaSource
    if (!isMediaSourceSupported() || !isTypeSupported(normalizedType)) {
      // Fallback: we'll collect chunks and create a blob URL at the end
      console.info(
        '[ProgressivePlayback] MediaSource not available or type not supported, using fallback.',
        { mimeType: normalizedType, supported: isMediaSourceSupported() }
      )
      setIsProgressive(false)
      setState('fallback')
      fallbackChunksRef.current = []
      fallbackMimeTypeRef.current = mimeType.split(';')[0].trim()
      return
    }

    // Create MediaSource
    const MSConstructor = getMediaSourceConstructor()!
    const mediaSource = new MSConstructor()
    mediaSourceRef.current = mediaSource

    // Create blob URL
    const objectUrl = URL.createObjectURL(mediaSource)
    blobUrlRef.current = objectUrl

    // Wait for MediaSource to open
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('MediaSource open timed out after 10s'))
      }, 10000)

      mediaSource.addEventListener('sourceopen', () => {
        clearTimeout(timeout)

        try {
          // Add source buffer with the codec type
          const sb = mediaSource.addSourceBuffer(normalizedType)
          sourceBufferRef.current = sb

          // Set mode to 'sequence' for streaming append
          // This tells the browser chunks are sequential and don't have
          // their own timestamps (they follow the previous chunk)
          if ('mode' in sb) {
            try {
              sb.mode = 'sequence'
            } catch {
              // Some browsers don't support setting mode; that's OK
            }
          }

          if (isMountedRef.current) {
            setUrl(objectUrl)
            setIsProgressive(true)
            setState('buffering')
          }

          resolve()
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Failed to add SourceBuffer'))
        }
      }, { once: true })

      mediaSource.addEventListener('error', () => {
        clearTimeout(timeout)
        reject(new Error('MediaSource error during initialization'))
      }, { once: true })
    })
  }, [])

  /**
   * Append a decrypted chunk to the playback buffer.
   */
  const appendChunk = useCallback(async (chunk: Uint8Array, isLast: boolean) => {
    if (!isMountedRef.current) return

    // Fallback path: collect chunks
    if (state === 'fallback' || !isProgressive) {
      if (chunk.byteLength > 0) {
        fallbackChunksRef.current.push(chunk)
        if (isMountedRef.current) {
          setChunksAppended(prev => prev + 1)
          setBytesBuffered(prev => prev + chunk.byteLength)
        }
      }

      if (isLast) {
        // Create blob URL from all collected chunks
        const blob = new Blob(fallbackChunksRef.current as BlobPart[], { type: fallbackMimeTypeRef.current })
        const blobUrl = URL.createObjectURL(blob)
        blobUrlRef.current = blobUrl
        fallbackChunksRef.current = [] // Free chunk refs

        if (isMountedRef.current) {
          setUrl(blobUrl)
          setState('complete')
        }
      }
      return
    }

    // MSE path: queue the append
    return new Promise<void>((resolve, reject) => {
      appendQueueRef.current.push({ chunk, isLast, resolve, reject })

      if (isMountedRef.current && chunk.byteLength > 0) {
        setChunksAppended(prev => prev + 1)
        setBytesBuffered(prev => prev + chunk.byteLength)

        // Transition to 'ready' after first successful append
        if (state === 'buffering') {
          setState('ready')
        }
      }

      processQueue()
    })
  }, [state, isProgressive, processQueue])

  /**
   * Clean up all resources.
   */
  const cleanup = useCallback(() => {
    // Revoke blob URL
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }

    // Close MediaSource if still open
    if (mediaSourceRef.current && mediaSourceRef.current.readyState === 'open') {
      try {
        mediaSourceRef.current.endOfStream()
      } catch {
        // Ignore — may already be closed
      }
    }

    // Clear refs
    mediaSourceRef.current = null
    sourceBufferRef.current = null
    appendQueueRef.current = []
    isAppendingRef.current = false
    fallbackChunksRef.current = []
  }, [])

  /**
   * Reset all state for reuse.
   */
  const reset = useCallback(() => {
    cleanup()

    if (isMountedRef.current) {
      setUrl(null)
      setState('idle')
      setIsProgressive(false)
      setChunksAppended(0)
      setBytesBuffered(0)
      setError(null)
    }
  }, [cleanup])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  return {
    url,
    state,
    isProgressive,
    chunksAppended,
    bytesBuffered,
    error,
    initialize,
    appendChunk,
    cleanup,
    reset,
  }
}

// ============================================================================
// Utility Exports
// ============================================================================

export { isMediaSourceSupported, isTypeSupported, normalizeMimeType }
