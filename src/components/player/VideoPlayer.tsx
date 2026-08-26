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
import { HolderIdentity } from '@/components/profile/HolderIdentity'
import { ErrorOverlay } from './ErrorOverlay'
import { DripLockNotice } from '@/components/video/DripLockNotice'
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

  // V4 market-cap gate: drip chunks stay locked until the live cap meets
  // the chunk's target. Early return AFTER all hooks — DripLockNotice owns
  // its own polling and fails closed when price data is unavailable.
  if (!showPlayer && video?.drip) {
    return (
      <div className="flex flex-col h-dvh min-h-0 overflow-hidden bg-black">
        <div className="flex shrink-0 items-center justify-between p-3 sm:p-4 border-b border-[oklch(0.98_0.01_90/0.13)] safe-area-x">
          <Link
            href="/library"
            className="flex items-center gap-2.5 text-[oklch(0.8_0.012_264)] hover:text-[oklch(0.715_0.19_44)] transition-colors touch-manipulation min-h-[44px] font-[family-name:var(--font-ledger)] text-micro uppercase tracking-[0.15em]"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline">Back to Library</span>
            <span className="sm:hidden">Back</span>
          </Link>
        </div>
        <DripLockNotice drip={video.drip} />
      </div>
    )
  }
  
  return (
    <div className="flex flex-col h-dvh min-h-0 overflow-hidden bg-black">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between p-3 sm:p-4 border-b border-[oklch(0.98_0.01_90/0.13)] safe-area-x">
        <Link 
          href="/library"
          className="flex items-center gap-2.5 text-[oklch(0.8_0.012_264)] hover:text-[oklch(0.715_0.19_44)] transition-colors touch-manipulation min-h-[44px] font-[family-name:var(--font-ledger)] text-micro uppercase tracking-[0.15em]"
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
              className="flex items-center gap-2 px-3 py-1 border border-[oklch(0.98_0.01_90/0.3)] hover:border-[var(--seal)] text-[oklch(0.8_0.012_264)] hover:text-[oklch(0.78_0.17_50)] text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.12em] transition-colors touch-manipulation min-h-[36px] disabled:opacity-50"
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
            <div className="flex items-center gap-2 px-3 py-1 bg-[color-mix(in_oklab,var(--seal)_14%,transparent)] text-[oklch(0.78_0.17_50)] text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.12em] animate-pulse">
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
            <div className="flex items-center gap-2 px-3 py-1 border border-[oklch(0.98_0.01_90/0.13)] text-[oklch(0.645_0.018_264)] text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.12em]">
              <Lock className="w-4 h-4" />
              <span className="hidden sm:inline">Encrypted</span>
              <span className="sm:hidden">&#x1f512;</span>
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
          <div className="flex items-center gap-3 text-[oklch(0.68_0.016_264)]">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="label">Loading video</span>
          </div>
        )}
      </div>
      
      {/* Video info — holder identity embedded */}
      <div className="shrink-0 p-3 sm:p-4 border-t border-[oklch(0.98_0.01_90/0.13)] safe-area-x safe-area-bottom overflow-y-auto max-h-[30vh]">
        <h1 className="statement-subtitle text-[oklch(0.968_0.005_90)]">{video.title}</h1>
        {video.description && (
          <p className="text-[oklch(0.8_0.012_264)] mt-1.5 text-small leading-relaxed max-w-prose">{video.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2.5 text-nano sm:text-fine font-[family-name:var(--font-ledger)] tracking-[0.06em] uppercase text-[oklch(0.645_0.018_264)] tabular-nums">
          <span>{formatDuration(video.duration)}</span>
            <span className="hidden sm:inline" aria-hidden>·</span>
          <span className="hidden sm:inline" aria-hidden>·</span>
          <span>{new Date(video.createdAt).toLocaleDateString()}</span>
          <span className="hidden sm:inline" aria-hidden>·</span>
          {video.creatorHandle ? (
            <span>@{video.creatorHandle}</span>
          ) : (
            <HolderIdentity
              address={video.owner}
              gateToken={(video.encryptionMetadata as unknown as { tokenAddress?: string })?.tokenAddress ?? null}
              gateChain={(video.encryptionMetadata as unknown as { chain?: string })?.chain ?? null}
              size="sm"
              showTokenId
            />
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
    <div className="flex items-center justify-center h-screen bg-black text-[oklch(0.968_0.005_90)]">
      <Loader2 className="w-6 h-6 animate-spin mr-4" aria-hidden />
      <span className="label">Consulting the archive</span>
    </div>
  )
}

function VideoNotFoundState() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-black text-[oklch(0.968_0.005_90)] crop-marks p-10">
      <p className="folio mb-4">404</p>
      <h2 className="statement-title mb-6">Video not found</h2>
      <Link 
        href="/library"
        className="action action-sealed"
      >
        Back to Library
      </Link>
    </div>
  )
}
