'use client'

/**
 * Video Player Component
 * 
 * Main video player component that handles:
 * - Non-encrypted videos: Direct IPFS streaming via cache
 * - Encrypted videos: Cache-first loading with Lit Protocol decryption
 * - Loading states and progress indicators with cache awareness
 * - Error handling and recovery
 * 
 * Refactored to use useVideoCache hook for all video loading,
 * eliminating direct Synapse fetch and useVideoDecryption usage.
 * 
 * @module components/player/VideoPlayer
 */

import { useVideo } from '@/hooks/useVideos'
import { useVideoCache } from '@/hooks/useVideoCache'
import { VideoPlayerControls } from './VideoPlayerControls'
import { CacheAwareProgress } from './CacheAwareProgress'
import { CacheIndicator } from './CacheIndicator'
import { ErrorOverlay } from './ErrorOverlay'
import { ArrowLeft, Loader2, Lock } from 'lucide-react'
import Link from 'next/link'
import type { Video } from '@/types'

interface VideoPlayerProps {
  videoId: string
}

export function VideoPlayer({ videoId }: VideoPlayerProps) {
  const { video, isLoading: isVideoLoading, isFound } = useVideo(videoId)
  
  // Single hook replaces Synapse fetch + useVideoDecryption + manual URL management
  const {
    videoUrl,
    isCached,
    isLoading,
    loadingStage,
    progress,
    error,
    retry,
    evict,
  } = useVideoCache(video ?? null)
  
  // Loading state (fetching video metadata)
  if (isVideoLoading) {
    return <PlayerLoadingState />
  }
  
  // Not found
  if (!isFound || !video) {
    return <VideoNotFoundState />
  }
  
  return (
    <div className="flex flex-col h-screen bg-black">
      {/* Header */}
      <div className="flex items-center justify-between p-3 sm:p-4 border-b border-white/10 safe-area-x">
        <Link 
          href="/library"
          className="flex items-center gap-2 text-white/80 hover:text-white transition-colors touch-manipulation min-h-[44px]"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="hidden sm:inline">Back to Library</span>
          <span className="sm:hidden">Back</span>
        </Link>
        
        <div className="flex items-center gap-2">
          {/* Cache status indicator */}
          {video.isEncrypted && (
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
      
      {/* Video container */}
      <div className="flex-1 relative flex items-center justify-center">
        {/* Error overlay */}
        {error && (
          <ErrorOverlay 
            error={error.message} 
            onRetry={retry}
            isEncrypted={video.isEncrypted}
          />
        )}
        
        {/* Loading/decryption progress */}
        {isLoading && !error && (
          <CacheAwareProgress 
            stage={loadingStage}
            progress={progress}
            isCached={isCached}
          />
        )}
        
        {/* Video element */}
        {videoUrl && !error && !isLoading && (
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
      <div className="p-3 sm:p-4 border-t border-white/10 safe-area-x safe-area-bottom overflow-y-auto">
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
