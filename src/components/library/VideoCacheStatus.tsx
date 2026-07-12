/**
 * VideoCacheStatus Components
 *
 * Detailed cache status indicators for the video detail/watch page.
 * Shows full banner messages for expired and expiring videos.
 *
 * Components:
 * - ExpiredVideoBanner: Full-width banner for expired videos
 * - ExpiringSoonBanner: Full-width banner for videos expiring soon
 * - VideoCacheStatus: Combined component that selects appropriate banner
 */

'use client'

import React from 'react'
import type { Video } from '../../types/video'

// =============================================================================
// Types
// =============================================================================

export interface VideoCacheStatusProps {
  /** Video data */
  video: Video

  /** Current block number for calculating time remaining */
  currentBlock?: number

  /** Block time in seconds (default: 12) */
  blockTimeSeconds?: number

  /** Optional className */
  className?: string
}

export interface ExpiredVideoBannerProps {
  /** Whether video content is cached for offline playback */
  videoCacheStatus?: Video['videoCacheStatus']

  /** Optional className */
  className?: string
}

export interface ExpiringSoonBannerProps {
  /** Blocks remaining until expiration */
  blocksRemaining: number

  /** Block time in seconds (default: 12) */
  blockTimeSeconds?: number

  /** Optional className */
  className?: string
}

// =============================================================================
// Icons
// =============================================================================

/**
 * Alert triangle icon for warnings
 */
function AlertTriangleIcon({ className }: { className?: string }) {
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
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  )
}

/**
 * Clock icon for time remaining
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
 * Check circle icon for cached content
 */
function CheckCircleIcon({ className }: { className?: string }) {
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
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

/**
 * Database icon for cache indicator
 */
function DatabaseIcon({ className }: { className?: string }) {
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
        d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
      />
    </svg>
  )
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Format blocks remaining into human-readable time
 */
function formatTimeRemaining(blocksRemaining: number, blockTimeSeconds: number = 12): string {
  if (blocksRemaining <= 0) {
    return 'expired'
  }

  const totalSeconds = blocksRemaining * blockTimeSeconds
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    if (remainingHours === 0) {
      return `${days} day${days !== 1 ? 's' : ''}`
    }
    return `${days} day${days !== 1 ? 's' : ''} ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`
  }

  if (hours > 0) {
    if (minutes === 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`
    }
    return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`
  }

  return `${minutes} minute${minutes !== 1 ? 's' : ''}`
}

// =============================================================================
// Components
// =============================================================================

/**
 * ExpiredVideoBanner - Banner for videos no longer on Arkiv
 *
 * Shows reassuring message that video metadata is preserved locally
 * and content is still accessible on Filecoin.
 *
 * @example
 * ```tsx
 * <ExpiredVideoBanner videoCacheStatus="cached" />
 * ```
 */
export function ExpiredVideoBanner({
  videoCacheStatus = 'not-cached',
  className = '',
}: ExpiredVideoBannerProps) {
  const isContentCached = videoCacheStatus === 'cached'

  return (
    <div
      role="alert"
      className={`
        bg-amber-50 dark:bg-amber-950/30
        border border-amber-200 dark:border-amber-800
        rounded-lg p-4
        ${className}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0">
          <AlertTriangleIcon className="h-5 w-5 text-amber-500" aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-amber-800 dark:text-amber-200">
            This video&apos;s metadata is preserved locally
          </h3>
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
            The Arkiv entity has expired. Your video metadata is safely stored in your
            browser&apos;s local cache. The video content on Filecoin (via Synapse SDK) is still accessible.
          </p>

          {/* Video cache status info */}
          <div className="mt-3 flex items-center gap-3">
            {isContentCached ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
                <CheckCircleIcon className="h-4 w-4" />
                Video content cached for instant playback
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm text-amber-700/70 dark:text-amber-400/70">
                <DatabaseIcon className="h-4 w-4" />
                Video content available via Synapse SDK
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * ExpiringSoonBanner - Banner for videos about to expire from Arkiv
 *
 * Shows countdown and reassuring message about automatic caching.
 *
 * @example
 * ```tsx
 * <ExpiringSoonBanner blocksRemaining={5000} />
 * ```
 */
export function ExpiringSoonBanner({
  blocksRemaining,
  blockTimeSeconds = 12,
  className = '',
}: ExpiringSoonBannerProps) {
  const timeRemaining = formatTimeRemaining(blocksRemaining, blockTimeSeconds)

  return (
    <div
      role="alert"
      className={`
        bg-orange-50 dark:bg-orange-950/30
        border border-orange-200 dark:border-orange-800
        rounded-lg p-4
        ${className}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0">
          <ClockIcon className="h-5 w-5 text-orange-500" aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-orange-800 dark:text-orange-200">
            ⏳ This video&apos;s Arkiv entity expires in approximately {timeRemaining}
          </h3>
          <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
            Don&apos;t worry — your data will be automatically preserved in your local cache
            when it expires. You won&apos;t lose access to this video.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * ActiveVideoStatus - Subtle indicator for active videos
 *
 * Shows minimal info that video is on-chain (optional, for detail views).
 *
 * @example
 * ```tsx
 * <ActiveVideoStatus videoCacheStatus="cached" />
 * ```
 */
export function ActiveVideoStatus({
  videoCacheStatus = 'not-cached',
  className = '',
}: {
  videoCacheStatus?: Video['videoCacheStatus']
  className?: string
}) {
  const isContentCached = videoCacheStatus === 'cached'

  if (!isContentCached) {
    return null
  }

  return (
    <div
      className={`
        bg-green-50 dark:bg-green-950/30
        border border-green-200 dark:border-green-800
        rounded-lg p-3
        ${className}
      `}
    >
      <div className="flex items-center gap-2">
        <CheckCircleIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
        <span className="text-sm text-green-700 dark:text-green-300">
          Video content cached for instant playback
        </span>
      </div>
    </div>
  )
}

/**
 * VideoCacheStatus - Combined component for video detail page
 *
 * Displays the appropriate banner based on video arkiv status:
 * - expired: Shows ExpiredVideoBanner
 * - expiring-soon: Shows ExpiringSoonBanner
 * - active: Optionally shows ActiveVideoStatus if content is cached
 *
 * @example
 * ```tsx
 * // Basic usage
 * <VideoCacheStatus video={video} />
 *
 * // With current block for accurate time calculation
 * <VideoCacheStatus video={video} currentBlock={currentBlock} />
 *
 * // With custom block time
 * <VideoCacheStatus video={video} currentBlock={currentBlock} blockTimeSeconds={12} />
 * ```
 */
export function VideoCacheStatus({
  video,
  currentBlock,
  blockTimeSeconds = 12,
  className = '',
}: VideoCacheStatusProps) {
  // Calculate blocks remaining if we have expiration block and current block
  const blocksRemaining =
    video.expiresAtBlock && currentBlock
      ? video.expiresAtBlock - currentBlock
      : undefined

  // Determine status
  const arkivStatus = video.arkivStatus

  // Render appropriate banner
  if (arkivStatus === 'expired') {
    return (
      <ExpiredVideoBanner
        videoCacheStatus={video.videoCacheStatus}
        className={className}
      />
    )
  }

  if (arkivStatus === 'expiring-soon' && blocksRemaining !== undefined) {
    return (
      <ExpiringSoonBanner
        blocksRemaining={blocksRemaining}
        blockTimeSeconds={blockTimeSeconds}
        className={className}
      />
    )
  }

  // For active videos, optionally show content cache status
  if (arkivStatus === 'active') {
    return (
      <ActiveVideoStatus
        videoCacheStatus={video.videoCacheStatus}
        className={className}
      />
    )
  }

  // Unknown or cache-only status - don't show anything
  return null
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

export { formatTimeRemaining }
