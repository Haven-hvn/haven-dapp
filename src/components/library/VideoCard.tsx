/**
 * VideoCard Component
 *
 * A plate in the collection register: hairline frame, thumbnail as the figure,
 * ledger-set metadata beneath. Shows badges for expired/expiring videos and
 * includes reassuring messaging about local cache preservation.
 *
 * Features:
 * - Cache status badge overlay (top-right corner)
 * - Sealed cloud badge for cached encrypted videos
 * - Expiration indicator in footer
 * - Click handling for navigation
 */

'use client'

import React from 'react'
import { Cloud, Download, Loader2 } from 'lucide-react'
import type { Video } from '../../types/video'
import { CacheStatusBadge, getArkivStatusFromVideo } from './CacheStatusBadge'
import { useVideoDownload } from '@/hooks/useVideoDownload'
import { HolderIdentity } from '@/components/profile/HolderIdentity'
import { DripLockedChip } from '@/components/video/DripLockNotice'

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
 * VideoCard - a figure plate with cache status indicators.
 *
 * Shows thumbnail with play overlay, video metadata set in the ledger
 * register, and cache status badges.
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
  // Download hook for this card
  const { download, isDownloading, progress, progressMessage, stage } = useVideoDownload()

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
        group relative overflow-hidden cursor-pointer
        border border-line bg-surface-raised
        transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
        hover:border-line-strong hover:shadow-[var(--lift-2)]
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring
        ${className}
      `}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`Video: ${video.title}${showExpiredFooter ? ' (cached locally)' : ''}${showExpiringFooter ? ' (expiring soon)' : ''}`}
    >
      {/* Thumbnail — the figure */}
      <div className="relative aspect-video bg-surface-deep overflow-hidden">
        {/* Placeholder tone */}
        <div className="absolute inset-0 bg-gradient-to-br from-surface-sunk to-surface-deep" />

        {/* Encrypted indicator */}
        {video.isEncrypted && (
          <div className="absolute top-2 left-2 flex items-center gap-1">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 font-[family-name:var(--font-ledger)] text-[0.625rem] tracking-[0.06em] uppercase bg-fg/70 text-surface">
              <LockIcon className="h-3 w-3" />
              <span className="sr-only">Encrypted</span>
            </span>
            {video.drip && <DripLockedChip drip={video.drip} />}
          </div>
        )}

        {/* Cached badge - cached encrypted videos */}
        {video.isEncrypted && isCached && (
          <div
            className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 bg-seal text-seal-solid-text text-[0.625rem] font-[family-name:var(--font-ledger)] tracking-[0.06em] uppercase"
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
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-fg/10">
          <div className="border border-line-strong bg-surface p-3 shadow-[var(--lift-2)]">
            <PlayIcon className="w-6 h-6 text-fg ml-0.5" />
          </div>
        </div>

        {/* Download button (bottom-left, shown on hover) */}
        <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <button
            onClick={(e) => { e.stopPropagation(); download(video) }}
            disabled={isDownloading}
            className="inline-flex items-center gap-1 px-1.5 py-1 font-[family-name:var(--font-ledger)] text-[0.625rem] tracking-[0.08em] uppercase bg-fg/80 hover:bg-fg text-surface transition-colors disabled:opacity-70"
            title={isDownloading ? progressMessage : 'Download video'}
            aria-label={`Download ${video.title}`}
          >
            {isDownloading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>{progress}%</span>
              </>
            ) : stage === 'complete' ? (
              <>
                <Download className="h-3 w-3" />
                <span>Saved!</span>
              </>
            ) : (
              <Download className="h-3 w-3" />
            )}
          </button>
        </div>

        {/* Download progress bar (visible during download) */}
        {isDownloading && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-fg/20">
            <div
              className="h-full bg-seal transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Duration badge (bottom-right) — evidence, so it's mono */}
        <div className="absolute bottom-2 right-2">
          <span className="inline-flex items-center px-1.5 py-0.5 font-[family-name:var(--font-ledger)] text-[0.625rem] tracking-[0.04em] tabular-nums bg-fg/80 text-surface">
            <ClockIcon className="h-3 w-3 mr-1" />
            {formatDuration(video.duration)}
          </span>
        </div>
      </div>

      {/* Caption — ledger metadata beneath the figure */}
      <div className="p-3 border-t border-line">
        {/* Title */}
        <h3 className="text-small font-medium leading-snug text-fg line-clamp-2 tracking-[-0.01em]">
          {video.title}
        </h3>

        {/* Description (optional, truncated) */}
        {video.description && (
          <p className="text-xs text-fg-4 mt-1 line-clamp-1">
            {video.description}
          </p>
        )}

        {/* Metadata row — holder identity (NFT avatar when gated) */}
        <div className="flex items-center gap-2 mt-2 text-nano font-[family-name:var(--font-ledger)] tracking-[0.04em] uppercase text-fg-5">
          <time dateTime={video.createdAt?.toISOString()}>
            {formatDate(video.createdAt)}
          </time>
          <span aria-hidden="true">·</span>
          {video.creatorHandle ? (
            <span className="normal-case">@{video.creatorHandle}</span>
          ) : (
            <HolderIdentity
              address={video.owner}
              gateToken={(video.encryptionMetadata as unknown as { tokenAddress?: string })?.tokenAddress ?? null}
              gateChain={(video.encryptionMetadata as unknown as { chain?: string })?.chain ?? null}
              size="sm"
              compact
              className="[&>span]:text-fg-5"
            />
          )}
        </div>

        {/* Expired video message */}
        {showExpiredFooter && (
          <p className="text-xs text-ember-deep dark:text-[var(--seal-text)] mt-2 flex items-center gap-1.5 font-[family-name:var(--font-ledger)] tracking-[0.04em] uppercase">
            <span className="net-dot net-haven" aria-hidden="true" />
            Preserved in local cache
          </p>
        )}

        {/* Expiring soon message */}
        {showExpiringFooter && (
          <p className="text-xs text-ember-deep dark:text-[var(--seal-text)] mt-2 flex items-center gap-1.5 font-[family-name:var(--font-ledger)] tracking-[0.04em] uppercase">
            <span className="net-dot net-haven animate-pulse" aria-hidden="true" />
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
      overflow-hidden
      border border-line bg-surface-raised
      ${className}
    `}>
      {/* Thumbnail skeleton */}
      <div className="aspect-video bg-line animate-pulse" />

      {/* Content skeleton */}
      <div className="p-3 space-y-2 border-t border-line">
        <div className="h-4 bg-line animate-pulse w-3/4" />
        <div className="h-3 bg-line animate-pulse w-1/2" />
        <div className="h-3 bg-line animate-pulse w-1/4" />
      </div>
    </div>
  )
}
