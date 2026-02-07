'use client'

/**
 * Video List Item Component
 * 
 * Displays a video in list format with thumbnail, metadata,
 * encryption indicator, and AI analysis indicator.
 * 
 * @module components/library/VideoListItem
 */

import Link from 'next/link'
import { Lock, Sparkles } from 'lucide-react'
import type { Video } from '@/types'
import { formatDuration, formatDate } from '@/lib/format'

interface VideoListItemProps {
  /** Video data to display */
  video: Video
}

/**
 * Video list item component for list view.
 * Displays video thumbnail with duration badge, metadata,
 * and encryption/AI indicators in a horizontal layout.
 */
export function VideoListItem({ video }: VideoListItemProps) {
  const formattedDuration = formatDuration(video.duration)
  const formattedDate = formatDate(video.createdAt)
  
  return (
    <Link 
      href={`/watch/${encodeURIComponent(video.id)}`} 
      className="block group touch-manipulation"
    >
      <div className="flex gap-3 sm:gap-4 p-2 sm:p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
        {/* Thumbnail */}
        <div className="relative flex-shrink-0 w-28 sm:w-40 h-16 sm:h-24 bg-muted rounded-md overflow-hidden">
          {video.thumbnailUrl ? (
            <img 
              src={video.thumbnailUrl}
              alt={video.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <VideoPlaceholder />
            </div>
          )}
          
          {/* Duration badge */}
          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 text-xs font-medium bg-black/70 text-white rounded">
            {formattedDuration}
          </div>
          
          {/* Encryption indicator */}
          {video.isEncrypted && (
            <div 
              className="absolute top-1 left-1 p-1 bg-black/70 rounded-full touch-manipulation" 
              title="Encrypted"
            >
              <Lock className="w-3 h-3 text-white" />
            </div>
          )}
          
          {/* AI indicator */}
          {video.hasAiData && (
            <div 
              className="absolute top-1 right-1 p-1 bg-purple-500/80 rounded-full touch-manipulation" 
              title="AI Analysis Available"
            >
              <Sparkles className="w-3 h-3 text-white" />
            </div>
          )}
          
          {/* Hover overlay with play button */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <PlayIcon className="w-4 h-4 text-white ml-0.5" />
            </div>
          </div>
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0 py-0.5 sm:py-1">
          <h3 
            className="font-medium text-sm sm:text-base line-clamp-1" 
            title={video.title}
          >
            {video.title}
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
            {formattedDate}
          </p>
          
          {/* Additional metadata row */}
          <div className="flex items-center gap-2 sm:gap-3 mt-1.5 sm:mt-2">
            {video.creatorHandle && (
              <span className="text-xs text-muted-foreground">
                @{video.creatorHandle}
              </span>
            )}
            {video.isEncrypted && (
              <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="w-3 h-3" />
                Encrypted
              </span>
            )}
            {video.hasAiData && (
              <span className="hidden sm:inline-flex items-center gap-1 text-xs text-purple-500">
                <Sparkles className="w-3 h-3" />
                AI Analysis
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

/**
 * Placeholder icon for videos without thumbnails.
 */
function VideoPlaceholder() {
  return (
    <svg 
      className="w-8 h-8 text-muted-foreground/50"
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="1.5"
    >
      <rect width="18" height="12" x="3" y="6" rx="2" />
      <path d="m9 12 4-2v4l-4-2Z" />
    </svg>
  )
}

/**
 * Play button icon for hover state.
 */
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg 
      className={className}
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="currentColor"
    >
      <path d="m8 5 14 7-14 7V5Z" />
    </svg>
  )
}
