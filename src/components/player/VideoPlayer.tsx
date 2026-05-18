'use client'

/**
 * Video Player Component
 * 
 * Main video player component that handles:
 * - Non-encrypted videos: Direct IPFS streaming via cache
 * - Encrypted videos: Progressive playback (plays while decrypting)
 * - Cache-first loading: instant playback when cached
 * - Loading states and progress indicators with streaming awareness
 * - Error handling and recovery
 * - Download button (available after full decryption + caching)
 * 
 * The player shows the video immediately once progressive decryption starts,
 * with a streaming indicator while remaining chunks are being decrypted.
 * 
 * @module components/player/VideoPlayer
 */

import { useVideoQuery } from '@/hooks/useVideos'
import { useVideoCache } from '@/hooks/useVideoCache'
import { useVideoDownload } from '@/hooks/useVideoDownload'
import { VideoPlayerControls } from './VideoPlayerControls'
import { CacheAwareProgress } from './CacheAwareProgress'
import { CacheIndicator } from './CacheIndicator'
import { ErrorOverlay } from './ErrorOverlay'
import {
  getPlaybackErrorPresentation,
  PlaybackLoadError,
} from '@/lib/playback-errors'
import { ArrowLeft, Loader2, Lock, Download, Radio } from 'lucide-react'
import Link from 'next/link'
import type { Video } from '@/types'

interface VideoPlayerProps {
  videoId: string
}

export function VideoPlayer({ videoId }: VideoPlayerProps) {
  const { video, isLoading: isVideoLoading, isFound } = useVideoQuery(videoId)
  
  // Progressive playback + cache hook
  const {
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
  } = useVideoCache(video ?? null)

  // Download hook (works from player: cached = instant, uncached = full pipeline)
  const {
    download,
    isDownloading,
    stage: downloadStage,
    progress: downloadProgress,
    progressMessage: downloadMessage,
  } = useVideoDownload()
  
  // Loading state (fetching video metadata)
  if (isVideoLoading) {
    return <PlayerLoadingState />
  }
  
  // Not found
  if (!isFound || !video) {
    return <VideoNotFoundState />
  }

  // Determine if we should show the video player
  // Show it during streaming (progressive) OR when fully ready
  const showPlayer = videoUrl && !error
  // Show progress overlay only when loading AND not yet streaming
  const showProgress = isLoading && !isStreaming && !error
  
  return (
    <div className="flex flex-col h-dvh min-h-0 overflow-hidden bg-black">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between p-3 sm:p-4 border-b border-white/10 safe-area-x">
        <Link 
          href="/library"
          className="flex items-center gap-2 text-white/80 hover:text-white transition-colors touch-manipulation min-h-[44px]"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="hidden sm:inline">Back to Library</span>
          <span className="sm:hidden">Back</span>
        </Link>
        
        <div className="flex items-center gap-2">
          {/* Download button */}
          {video && (
            <button
              onClick={(e) => { e.stopPropagation(); download(video) }}
              disabled={isDownloading}
              className="flex items-center gap-1 px-3 py-1 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-full text-sm transition-colors touch-manipulation min-h-[36px] disabled:opacity-50"
              title={isDownloading ? downloadMessage : 'Download video'}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">
                {isDownloading
                  ? `${downloadMessage} ${downloadProgress}%`
                  : downloadStage === 'complete'
                    ? 'Saved!'
                    : 'Download'}
              </span>
            </button>
          )}

          {/* Streaming indicator */}
          {isStreaming && (
            <div className="flex items-center gap-1 px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm animate-pulse">
              <Radio className="w-4 h-4" />
              <span className="hidden sm:inline">
                Streaming {chunksDecrypted}/{totalChunks}
              </span>
            </div>
          )}

          {/* Cache status indicator */}
          {video.isEncrypted && !isStreaming && (
            <CacheIndicator 
              isCached={isCached} 
              videoId={video.id} 
              onEvict={evict}
            />
          )}
          
          {/* Encrypted badge */}
          {video.isEncrypted && (
            <div className="flex items-center gap-1 px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm">
              <Lock className="w-4 h-4" />
              <span>Encrypted</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Video container — min-h-0 so flex child shrinks with viewport */}
      <div className="flex-1 min-h-0 min-w-0 relative flex items-center justify-center overflow-hidden">
        {error && (
          <ErrorOverlay
            presentation={
              error instanceof PlaybackLoadError
                ? error.presentation
                : getPlaybackErrorPresentation(error)
            }
            onRetry={retry}
            isEncrypted={video.isEncrypted}
          />
        )}
        
        {/* Loading/decryption progress (before streaming starts) */}
        {showProgress && (
          <CacheAwareProgress 
            stage={loadingStage}
            progress={progress}
            isCached={isCached}
          />
        )}
        
        {/* Video element — shown during streaming AND when fully ready */}
        {showPlayer && (
          <VideoPlayerControls 
            src={videoUrl}
            title={video.title}
            poster={video.thumbnailUrl}
          />
        )}
        
        {/* Initial loading for non-encrypted videos */}
        {!videoUrl && !error && !isLoading && !video.isEncrypted && (
          <div className="flex items-center gap-3 text-white/60">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Loading video...</span>
          </div>
        )}
      </div>
      
      {/* Video info */}
      <div className="shrink-0 p-3 sm:p-4 border-t border-white/10 safe-area-x safe-area-bottom overflow-y-auto max-h-[30vh]">
        <h1 className="text-base sm:text-lg font-semibold text-white">{video.title}</h1>
        {video.description && (
          <p className="text-white/60 mt-1 text-sm">{video.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 text-xs sm:text-sm text-white/40">
          <span>{formatDuration(video.duration)}</span>
          <span className="hidden sm:inline">•</span>
          <span>{new Date(video.createdAt).toLocaleDateString()}</span>
          {video.creatorHandle && (
            <>
              <span className="hidden sm:inline">•</span>
              <span>@{video.creatorHandle}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function formatDuration(seconds: number): string {
  if (!seconds) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const hours = Math.floor(mins / 60)
  
  if (hours > 0) {
    return `${hours}:${(mins % 60).toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function PlayerLoadingState() {
  return (
    <div className="flex items-center justify-center h-screen bg-black text-white">
      <Loader2 className="w-8 h-8 animate-spin mr-3" />
      <span>Loading...</span>
    </div>
  )
}

function VideoNotFoundState() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-black text-white">
      <p className="text-xl mb-4">Video not found</p>
      <Link 
        href="/library"
        className="px-4 py-2 bg-primary rounded-lg hover:bg-primary/90"
      >
        Back to Library
      </Link>
    </div>
  )
}
