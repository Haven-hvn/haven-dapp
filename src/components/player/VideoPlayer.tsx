'use client'

/**
 * Video Player Component
 * 
 * Main video player component that handles:
 * - Non-encrypted videos: Direct IPFS streaming
 * - Encrypted videos: Download, decrypt, and playback
 * - Loading states and progress indicators
 * - Error handling and recovery
 * 
 * @module components/player/VideoPlayer
 */

import { useEffect, useState } from 'react'
import { useVideo } from '@/hooks/useVideos'
import { useVideoDecryption } from '@/hooks/useVideoDecryption'
import { useIpfsFetch } from '@/hooks/useIpfsFetch'
import type { Video } from '@/types'
import { VideoPlayerControls } from './VideoPlayerControls'
import { DecryptionProgress } from './DecryptionProgress'
import { ErrorOverlay } from './ErrorOverlay'
import { ArrowLeft, Loader2, Lock } from 'lucide-react'
import Link from 'next/link'

interface VideoPlayerProps {
  videoId: string
}

export function VideoPlayer({ videoId }: VideoPlayerProps) {
  const { video, isLoading: isVideoLoading, isFound } = useVideo(videoId)
  const ipfsFetch = useIpfsFetch()
  const decryption = useVideoDecryption()
  
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Load video on mount
  useEffect(() => {
    if (!video) return
    
    loadVideo(video)
    
    return () => {
      // Cleanup
      ipfsFetch.cancel()
      decryption.reset()
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video])
  
  const loadVideo = async (video: Video) => {
    setError(null)
    
    try {
      if (!video.isEncrypted) {
        // Non-encrypted: direct IPFS streaming
        const cid = video.filecoinCid
        if (!cid) {
          setError('Video not available')
          return
        }
        
        const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://gateway.lighthouse.storage/ipfs/'
        setVideoUrl(`${gateway}${cid}`)
        
      } else {
        // Encrypted: fetch and decrypt
        const cid = video.encryptedCid || video.filecoinCid
        if (!cid) {
          setError('Encrypted video not available')
          return
        }
        
        // Fetch encrypted data
        const encryptedData = await ipfsFetch.fetch(cid)
        if (!encryptedData) {
          setError('Failed to download video')
          return
        }
        
        // Decrypt
        const decryptedUrl = await decryption.decrypt(video, encryptedData)
        if (decryptedUrl) {
          setVideoUrl(decryptedUrl)
        } else {
          setError(decryption.error?.message || 'Decryption failed')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load video')
    }
  }
  
  const handleRetry = () => {
    if (video) {
      loadVideo(video)
    }
  }
  
  // Loading state
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
            error={error} 
            onRetry={handleRetry}
            isEncrypted={video.isEncrypted}
          />
        )}
        
        {/* Decryption progress */}
        {video.isEncrypted && decryption.status !== 'idle' && decryption.status !== 'complete' && (
          <DecryptionProgress 
            status={decryption.status}
            progress={decryption.progress}
            downloadProgress={ipfsFetch.progress}
          />
        )}
        
        {/* Video element */}
        {videoUrl && !error && (
          <VideoPlayerControls 
            src={videoUrl}
            title={video.title}
            poster={video.thumbnailUrl}
          />
        )}
        
        {/* Initial loading */}
        {!videoUrl && !error && !video.isEncrypted && (
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
