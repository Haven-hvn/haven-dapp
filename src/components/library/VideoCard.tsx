/**
 * VideoCard Component
 *
 * Displays a video thumbnail with cache status indicators.
 * Shows badges for expired/expiring videos and includes
 * reassuring messaging about local cache preservation.
 *
 * Features:
 * - Cache status badge overlay (top-right corner)
 * - Green cloud badge for cached encrypted videos
 * - Expiration indicator in footer
 * - Click handling for navigation
 * - Dark mode support
 */

'use client'

import React from 'react'
import { Cloud } from 'lucide-react'
import type { Video } from '../../types/video'
import { CacheStatusBadge, getArkivStatusFromVideo } from './CacheStatusBadge'

// =============================================================================
// Types
// =============================================================================

export interface VideoCardProps {
  /** Video data to display */
  video: Video

  /** Click handler for the card */
  onClick?: (video: Video) => void

  /** Optional additional className */
  className?: string

  /** Current block number for expiration calculation */
  currentBlock?: number

  /** Whether the video content is cached (for encrypted videos) */
  isCached?: boolean
}

// =============================================================================
// Icons
// =============================================================================

/**
 * Play icon for video thumbnail overlay
 */
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

/**
 * Clock icon for duration display
 */
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

/**
 * Lock icon for encrypted videos
 */
function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  )
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '--:--'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

/**
 * Format date to readable string
 */
function formatDate(date: Date | undefined): string {
  if (!date) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

// =============================================================================
// Component
// =============================================================================

/**
 * VideoCard - Displays a video with cache status indicators
 *
 * Shows thumbnail with play overlay, video metadata, and cache status badges.
 * Non-active videos display a badge in the top-right corner and an
 * expiration message in the footer.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <VideoCard video={video} onClick={(v) => router.push(`/watch/${v.id}`)} />
 *
 * // With current block for expiration calculation
 * <VideoCard video={video} currentBlock={currentBlock} onClick={handleClick} />
 * ```
 */
export function VideoCard({
  video,
  onClick,
  className = '',
  currentBlock,
  isCached = false,
}: VideoCardProps) {
  // Determine arkiv status
  const arkivStatus = getArkivStatusFromVideo(video, currentBlock)

  // Determine if we should show the cache badge
  const showCacheBadge = arkivStatus !== 'active'

  // Determine footer message
  const showExpiredFooter = arkivStatus === 'expired'
  const showExpiringFooter = arkivStatus === 'expiring-soon'

  const handleClick = () => {
    onClick?.(video)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick?.(video)
    }
  }

  return (
    <article
      className={`
        group relative rounded-lg overflow-hidden
        bg-white dark:bg-gray-900
        border border-gray-200 dark:border-gray-800
        shadow-sm hover:shadow-md
        transition-shadow duration-200
        cursor-pointer
        ${className}
      `}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Video: ${video.title}${showExpiredFooter ? ' (cached locally)' : ''}${showExpiringFooter ? ' (expiring soon)' : ''}`}
    >
      {/* Thumbnail container */}
      <div className="relative aspect-video bg-gray-100 dark:bg-gray-800 overflow-hidden">
        {/* Placeholder gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-800 dark:to-gray-700" />

        {/* Encrypted indicator */}
        {video.isEncrypted && (
          <div className="absolute top-2 left-2">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-black/60 text-white">
              <LockIcon className="h-3 w-3" />
              <span className="sr-only">Encrypted</span>
            </span>
          </div>
        )}

        {/* Green cloud badge - cached encrypted videos */}
        {video.isEncrypted && isCached && (
          <div
            className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 bg-green-500/80 text-white rounded text-xs"
            title="Cached — instant playback"
          >
            <Cloud className="w-3 h-3" />
            <span className="sr-only">Cached</span>
          </div>
        )}

        {/* Cache status badge - top-right corner (for non-cached videos) */}
        {showCacheBadge && !(video.isEncrypted && isCached) && (
          <div className="absolute top-2 right-2">
            <CacheStatusBadge
              arkivStatus={arkivStatus}
              videoCacheStatus={video.videoCacheStatus || 'not-cached'}
              size="sm"
              showLabel={false}
            />
          </div>
        )}

        {/* Play button overlay (shown on hover) */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/20">
          <div className="w-12 h-12 rounded-full bg-white/90 dark:bg-black/80 flex items-center justify-center shadow-lg">
            <PlayIcon className="w-6 h-6 text-gray-900 dark:text-white ml-0.5" />
          </div>
        </div>

        {/* Duration badge (bottom-right) */}
        <div className="absolute bottom-2 right-2">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-black/70 text-white">
            <ClockIcon className="h-3 w-3 mr-1" />
            {formatDuration(video.duration)}
          </span>
        </div>
      </div>

      {/* Card content */}
      <div className="p-3">
        {/* Title */}
        <h3 className="font-medium text-gray-900 dark:text-gray-100 line-clamp-2 text-sm leading-tight">
          {video.title}
        </h3>

        {/* Description (optional, truncated) */}
        {video.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
            {video.description}
          </p>
        )}

        {/* Metadata row */}
        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{formatDate(video.createdAt)}</span>
          {video.creatorHandle && (
            <>
              <span>·</span>
              <span>@{video.creatorHandle}</span>
            </>
          )}
        </div>

        {/* Expired video message */}
        {showExpiredFooter && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
            Preserved in local cache
          </p>
        )}

        {/* Expiring soon message */}
        {showExpiringFooter && (
          <p className="text-xs text-orange-600 dark:text-orange-400 mt-2 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" aria-hidden="true" />
            Expiring soon — will be cached locally
          </p>
        )}
      </div>
    </article>
  )
}

// =============================================================================
// Skeleton Loader
// =============================================================================

/**
 * VideoCardSkeleton - Loading placeholder for VideoCard
 */
export function VideoCardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`
      rounded-lg overflow-hidden
      bg-white dark:bg-gray-900
      border border-gray-200 dark:border-gray-800
      ${className}
    `}>
      {/* Thumbnail skeleton */}
      <div className="aspect-video bg-gray-200 dark:bg-gray-800 animate-pulse" />

      {/* Content skeleton */}
      <div className="p-3 space-y-2">
        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse w-3/4" />
        <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded animate-pulse w-1/2" />
        <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded animate-pulse w-1/4" />
      </div>
    </div>
  )
}
