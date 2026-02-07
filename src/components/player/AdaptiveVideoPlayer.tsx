'use client'

/**
 * Adaptive Video Player Component
 * 
 * Enhanced video player that automatically selects the optimal codec
 * based on browser capabilities. Falls back to alternative codecs
 * if playback fails.
 * 
 * Features:
 * - Automatic codec selection (AV1 > H.264 > VP9)
 * - Hardware acceleration detection
 * - Software decode warning
 * - Fallback chain on playback errors
 * - Debug information in development mode
 * 
 * @module components/player/AdaptiveVideoPlayer
 */

import { useRef, useEffect, useState, useCallback } from 'react'
import { useOptimalVideoSource } from '@/hooks/useOptimalVideoSource'
import type { Video } from '@/types'
import { AlertTriangle, Cpu, RefreshCw } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface AdaptiveVideoPlayerProps {
  /** Video entity to play */
  video: Video
  /** Whether to autoplay */
  autoPlay?: boolean
  /** Poster image URL */
  poster?: string
  /** Callback when playback errors occur */
  onError?: (error: Error) => void
  /** Callback when video is ready to play */
  onReady?: () => void
  /** Additional CSS classes */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * Adaptive video player with codec optimization.
 * 
 * This component:
 * 1. Detects browser codec support
 * 2. Selects the best available video variant
 * 3. Monitors playback and falls back on errors
 * 4. Shows warnings for software decoding
 * 
 * @param props - Component props
 * @returns React element
 */
export function AdaptiveVideoPlayer({
  video,
  autoPlay = false,
  poster,
  onError,
  onReady,
  className = '',
}: AdaptiveVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  
  const {
    source,
    codecSupport,
    isLoading,
    error: sourceError,
    fallbackChain,
    currentSourceIndex,
    tryNextSource,
    retry,
    isSoftwareDecode,
  } = useOptimalVideoSource({
    video,
    preferHardware: true,
  })
  
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const [hasFailed, setHasFailed] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  
  // Track if we've notified parent of ready state
  const hasNotifiedReadyRef = useRef(false)
  
  /**
   * Handle video element errors.
   */
  const handleError = useCallback(() => {
    const videoEl = videoRef.current
    if (!videoEl) return
    
    const error = videoEl.error
    if (!error) return
    
    console.warn(`[AdaptiveVideoPlayer] Codec ${source?.codec} failed:`, error)
    
    // Try next source in fallback chain
    const hasMoreSources = tryNextSource()
    
    if (hasMoreSources) {
      console.log('[AdaptiveVideoPlayer] Trying fallback source:', currentSourceIndex + 1)
      setHasFailed(true)
    } else {
      // No more fallbacks
      const errorMsg = `Unable to play video (code: ${error.code}). Your browser may not support this format.`
      setPlaybackError(errorMsg)
      onError?.(new Error(`All codec fallbacks failed. Last error: ${error.message}`))
    }
  }, [source, tryNextSource, currentSourceIndex, onError])
  
  /**
   * Handle successful load.
   */
  const handleCanPlay = useCallback(() => {
    if (!hasNotifiedReadyRef.current) {
      hasNotifiedReadyRef.current = true
      onReady?.()
    }
  }, [onReady])
  
  /**
   * Handle retry button click.
   */
  const handleRetry = useCallback(() => {
    setPlaybackError(null)
    setHasFailed(false)
    hasNotifiedReadyRef.current = false
    retry()
  }, [retry])
  
  /**
   * Toggle debug display.
   */
  const toggleDebug = useCallback(() => {
    setShowDebug(prev => !prev)
  }, [])
  
  // Handle keyboard shortcut for debug (Ctrl+Shift+D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        toggleDebug()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleDebug])
  
  // Loading state
  if (isLoading) {
    return (
      <div className={`relative flex items-center justify-center bg-black ${className}`}>
        <div className="flex flex-col items-center gap-3 text-white/60">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span className="text-sm">Detecting optimal format...</span>
        </div>
      </div>
    )
  }
  
  // Source detection error
  if (sourceError) {
    return (
      <div className={`relative flex items-center justify-center bg-black ${className}`}>
        <div className="text-center p-6 max-w-md">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <p className="text-white mb-2">Failed to detect video capabilities</p>
          <p className="text-white/60 text-sm mb-4">{sourceError.message}</p>
          <button 
            className="px-4 py-2 bg-primary rounded-lg hover:bg-primary/90 text-white flex items-center gap-2 mx-auto"
            onClick={handleRetry}
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    )
  }
  
  // No source available
  if (!source) {
    return (
      <div className={`relative flex items-center justify-center bg-black ${className}`}>
        <div className="text-center p-6">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <p className="text-white">No video source available</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className={`relative ${className}`}>
      {/* Software decode warning */}
      {isSoftwareDecode && (
        <div className="absolute top-4 right-4 z-20 bg-yellow-500/90 text-black px-3 py-2 rounded-lg flex items-center gap-2 text-sm shadow-lg">
          <Cpu className="w-4 h-4" />
          <span className="font-medium">Software decoding - may impact battery</span>
        </div>
      )}
      
      {/* Fallback notification */}
      {hasFailed && !playbackError && (
        <div className="absolute top-4 left-4 z-20 bg-blue-500/90 text-white px-3 py-2 rounded-lg text-sm shadow-lg">
          <span>Switching to fallback format...</span>
        </div>
      )}
      
      {/* Playback error overlay */}
      {playbackError && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-30">
          <div className="text-center p-6 max-w-md">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <p className="text-white mb-2 text-lg">Playback Error</p>
            <p className="text-white/60 mb-6">{playbackError}</p>
            <div className="flex gap-3 justify-center">
              <button 
                className="px-4 py-2 bg-primary rounded-lg hover:bg-primary/90 text-white flex items-center gap-2"
                onClick={handleRetry}
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Video element */}
      <video
        ref={videoRef}
        src={source.url}
        poster={poster}
        controls
        autoPlay={autoPlay}
        onError={handleError}
        onCanPlay={handleCanPlay}
        className="w-full h-full"
        playsInline
        preload="metadata"
      />
      
      {/* Debug overlay (development mode or with keyboard shortcut) */}
      {(process.env.NODE_ENV === 'development' || showDebug) && (
        <div 
          className="absolute bottom-16 left-4 bg-black/80 text-white text-xs px-3 py-2 rounded border border-white/20 font-mono"
          onClick={toggleDebug}
        >
          <div>Codec: {source.codec}</div>
          <div>HW Accel: {codecSupport?.av1Hardware ? 'Yes' : 'No'}</div>
          <div>Source: {currentSourceIndex + 1}/{fallbackChain.length}</div>
          <div>Quality: {source.quality}/100</div>
          {source.bitrate && <div>Bitrate: {Math.round(source.bitrate / 1000)} kbps</div>}
          <div className="text-white/50 mt-1">Ctrl+Shift+D to toggle</div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Re-export for convenience
// ============================================================================

export type { AdaptiveVideoPlayerProps }
