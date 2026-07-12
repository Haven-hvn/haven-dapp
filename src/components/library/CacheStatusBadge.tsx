/**
 * CacheStatusBadge Component
 *
 * A small badge that indicates the source/status of a video.
 * Shared between arkiv-cache (metadata) and video-cache (content cache).
 *
 * Visual variants (arkiv status — primary indicator):
 * - 'active'        → Green dot + "On-chain"
 * - 'expired'       → Amber dot + "Cached locally"
 * - 'expiring-soon' → Orange pulse dot + "Expiring soon"
 * - 'cache-only'    → Gray dot + "Local only"
 *
 * Video content overlay (secondary indicator, shown alongside arkiv status):
 * - 'cached'        → Small download/check icon overlay → "Video saved offline"
 * - 'stale'         → Small warning icon overlay → "Video may be outdated"
 * - 'not-cached'    → No overlay (default)
 */

'use client'

import React from 'react'

// =============================================================================
// Types
// =============================================================================

export interface CacheStatusBadgeProps {
  /** Arkiv entity status (from arkiv-cache) */
  arkivStatus: 'active' | 'expired' | 'expiring-soon' | 'cache-only'

  /** Video content cache status (from video-cache, defaults to 'not-cached') */
  videoCacheStatus?: 'not-cached' | 'cached' | 'stale'

  /** Size variant */
  size?: 'sm' | 'md'

  /** Whether to show the text label */
  showLabel?: boolean

  /** Optional className for styling */
  className?: string
}

// =============================================================================
// Configuration
// =============================================================================

interface StatusConfig {
  label: string
  dotClass: string
  textClass: string
  bgClass: string
  pulse?: boolean
  ariaLabel: string
}

const ARKIV_STATUS_CONFIG: Record<CacheStatusBadgeProps['arkivStatus'], StatusConfig> = {
  'active': {
    label: 'On-chain',
    dotClass: 'bg-green-500',
    textClass: 'text-green-700 dark:text-green-400',
    bgClass: 'bg-green-50 dark:bg-green-950/30',
    pulse: false,
    ariaLabel: 'Video is active on Arkiv blockchain',
  },
  'expired': {
    label: 'Cached locally',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-700 dark:text-amber-400',
    bgClass: 'bg-amber-50 dark:bg-amber-950/30',
    pulse: false,
    ariaLabel: 'Video metadata is preserved in local cache',
  },
  'expiring-soon': {
    label: 'Expiring soon',
    dotClass: 'bg-orange-500',
    textClass: 'text-orange-700 dark:text-orange-400',
    bgClass: 'bg-orange-50 dark:bg-orange-950/30',
    pulse: true,
    ariaLabel: 'Video will expire from Arkiv soon',
  },
  'cache-only': {
    label: 'Local only',
    dotClass: 'bg-gray-500',
    textClass: 'text-gray-700 dark:text-gray-400',
    bgClass: 'bg-gray-50 dark:bg-gray-950/30',
    pulse: false,
    ariaLabel: 'Video is stored locally only',
  },
}

const VIDEO_CACHE_CONFIG: Record<NonNullable<CacheStatusBadgeProps['videoCacheStatus']>, StatusConfig> = {
  'not-cached': {
    label: 'Not cached',
    dotClass: '',
    textClass: '',
    bgClass: '',
    ariaLabel: 'Video content is not cached locally',
  },
  'cached': {
    label: 'Video saved offline',
    dotClass: '',
    textClass: 'text-blue-600 dark:text-blue-400',
    bgClass: '',
    ariaLabel: 'Video content is saved for offline playback',
  },
  'stale': {
    label: 'Video may be outdated',
    dotClass: '',
    textClass: 'text-yellow-600 dark:text-yellow-400',
    bgClass: '',
    ariaLabel: 'Video cache may be outdated',
  },
}

// =============================================================================
// Icons
// =============================================================================

/**
 * Checkmark icon for cached video content
 */
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

/**
 * Download icon for cached video content
 */
function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  )
}

/**
 * Warning icon for stale video content
 */
function WarningIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  )
}

// =============================================================================
// Component
// =============================================================================

/**
 * CacheStatusBadge - Displays the cache status of a video
 *
 * Shows the Arkiv entity status (active/expired/expiring-soon/cache-only)
 * and optionally an overlay for video content cache status.
 *
 * @example
 * ```tsx
 * // Basic usage - expired video
 * <CacheStatusBadge arkivStatus="expired" />
 *
 * // With video content cached
 * <CacheStatusBadge arkivStatus="expired" videoCacheStatus="cached" />
 *
 * // Expiring soon, small size, no label
 * <CacheStatusBadge arkivStatus="expiring-soon" size="sm" showLabel={false} />
 * ```
 */
export function CacheStatusBadge({
  arkivStatus,
  videoCacheStatus = 'not-cached',
  size = 'sm',
  showLabel = true,
  className = '',
}: CacheStatusBadgeProps) {
  const config = ARKIV_STATUS_CONFIG[arkivStatus]
  const videoConfig = VIDEO_CACHE_CONFIG[videoCacheStatus]

  // Size classes
  const sizeClasses = {
    sm: {
      container: 'gap-1 px-1.5 py-0.5 text-xs',
      dot: 'h-1.5 w-1.5',
      icon: 'h-3 w-3',
      overlay: 'h-3 w-3 -ml-1',
    },
    md: {
      container: 'gap-1.5 px-2 py-1 text-sm',
      dot: 'h-2 w-2',
      icon: 'h-4 w-4',
      overlay: 'h-4 w-4 -ml-1.5',
    },
  }

  const sizeClass = sizeClasses[size]

  // Build aria-label
  const ariaLabel = videoCacheStatus !== 'not-cached'
    ? `${config.ariaLabel}. ${videoConfig.ariaLabel}`
    : config.ariaLabel

  // Don't render for active videos with no cache overlay unless explicitly showing all
  // This keeps the UI clean for the default state
  const shouldRenderMinimal = arkivStatus === 'active' && videoCacheStatus === 'not-cached'

  // For minimal active state, just show a subtle dot without label
  if (shouldRenderMinimal && !showLabel) {
    return (
      <span
        className={`inline-flex items-center justify-center ${className}`}
        aria-label={ariaLabel}
        role="status"
      >
        <span
          className={`${sizeClass.dot} ${config.dotClass} rounded-full`}
          aria-hidden="true"
        />
      </span>
    )
  }

  return (
    <span
      className={`
        inline-flex items-center rounded-full
        ${sizeClass.container}
        ${config.bgClass}
        ${className}
      `}
      aria-label={ariaLabel}
      role="status"
    >
      {/* Status dot with optional pulse */}
      <span className="relative inline-flex">
        <span
          className={`
            ${sizeClass.dot}
            ${config.dotClass}
            rounded-full
          `}
          aria-hidden="true"
        />
        {config.pulse && (
          <span
            className={`
              absolute inline-flex h-full w-full rounded-full
              ${config.dotClass}
              opacity-75 animate-ping
            `}
            aria-hidden="true"
          />
        )}
      </span>

      {/* Video content cache overlay icon (shown alongside arkiv status) */}
      {videoCacheStatus === 'cached' && (
        <span className="relative inline-flex items-center" aria-hidden="true">
          <CheckIcon className={`${sizeClass.icon} ${videoConfig.textClass}`} />
        </span>
      )}
      {videoCacheStatus === 'stale' && (
        <span className="relative inline-flex items-center" aria-hidden="true">
          <WarningIcon className={`${sizeClass.icon} ${videoConfig.textClass}`} />
        </span>
      )}

      {/* Label */}
      {showLabel && (
        <span className={`font-medium ${config.textClass}`}>
          {config.label}
        </span>
      )}
    </span>
  )
}

// =============================================================================
// Utility Exports
// =============================================================================

/**
 * Get the appropriate status for a video based on expiration info
 * Helper to convert from various status formats to the badge's expected format
 */
export function getArkivStatusFromVideo(
  video: {
    arkivStatus?: 'active' | 'expired' | 'expiring-soon' | 'cache-only' | 'unknown'
    expiresAtBlock?: number
  },
  currentBlock?: number
): CacheStatusBadgeProps['arkivStatus'] {
  // If explicitly set, use it
  if (video.arkivStatus && video.arkivStatus !== 'unknown') {
    return video.arkivStatus
  }

  // Check expiration block
  if (video.expiresAtBlock && currentBlock) {
    const blocksRemaining = video.expiresAtBlock - currentBlock
    if (blocksRemaining <= 0) {
      return 'expired'
    }
    if (blocksRemaining < 7200) { // ~24 hours at 12s block time
      return 'expiring-soon'
    }
  }

  // Default to active
  return 'active'
}
