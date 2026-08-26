'use client'

/**
 * Video List Item Component
 *
 * One row of the collection register: thumbnail as a small plate, metadata in
 * the ledger voice, hairline separation. Displays encryption indicator,
 * cache status badge, and AI analysis indicator.
 *
 * @module components/library/VideoListItem
 */

import Link from 'next/link'
import { Lock, Sparkles, Cloud } from 'lucide-react'
import type { Video } from '@/types'
import { formatDuration, formatDate } from '@/lib/format'
import { HolderIdentity } from '@/components/profile/HolderIdentity'

interface VideoListItemProps {
  /** Video data to display */
  video: Video

  /** Whether the video content is cached (for encrypted videos) */
  isCached?: boolean
}

/**
 * Video list item component for list view.
 * Displays video thumbnail with duration badge, metadata,
 * and encryption/AI indicators in a horizontal layout.
 */
export function VideoListItem({ video, isCached = false }: VideoListItemProps) {
  const formattedDuration = formatDuration(video.duration)
  const formattedDate = formatDate(video.createdAt)

  return (
    <Link
      href={`/watch?v=${encodeURIComponent(video.id)}`}
      className="block group touch-manipulation"
    >
      <div className="flex gap-3 sm:gap-4 p-2 sm:p-3 border border-line bg-card hover:border-line-strong hover:bg-accent transition-colors">
        {/* Thumbnail */}
        <div className="relative flex-shrink-0 w-28 sm:w-40 h-16 sm:h-24 bg-surface-deep border border-line overflow-hidden">
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
          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 text-[0.625rem] font-[family-name:var(--font-ledger)] tabular-nums tracking-[0.04em] bg-fg/80 text-surface">
            {formattedDuration}
          </div>

          {/* Encryption indicator */}
          {video.isEncrypted && (
            <div
              className="absolute top-1 left-1 p-1 bg-fg/80 touch-manipulation"
              title="Encrypted"
            >
              <Lock className="w-3 h-3 text-surface" />
            </div>
          )}

          {/* Cached badge - cached encrypted videos */}
          {video.isEncrypted && isCached && (
            <div
              className="absolute top-1 right-1 p-1 bg-seal touch-manipulation"
              title="Cached — instant playback"
            >
              <Cloud className="w-3 h-3 text-seal-solid-text" />
            </div>
          )}

          {/* AI indicator (shown only if not cached, or on the left side if cached) */}
          {video.hasAiData && !(video.isEncrypted && isCached) && (
            <div
              className="absolute top-1 right-1 p-1 bg-fg/80 touch-manipulation"
              title="AI Analysis Available"
            >
              <Sparkles className="w-3 h-3 text-surface" />
            </div>
          )}

          {/* Hover overlay with play button */}
          <div className="absolute inset-0 bg-fg/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <div className="border border-line-strong bg-surface p-2 shadow-[var(--lift-2)]">
              <PlayIcon className="w-4 h-4 text-fg ml-0.5" />
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 py-0.5 sm:py-1">
          <div className="flex items-center gap-2">
            <h3
              className="font-medium text-small sm:text-base line-clamp-1 text-fg tracking-[-0.01em]"
              title={video.title}
            >
              {video.title}
            </h3>
            {/* Cached badge inline with title on mobile */}
            {video.isEncrypted && isCached && (
              <span className="sm:hidden inline-flex items-center gap-1 px-1.5 py-0.5 bg-seal-wash text-seal-text text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.08em] border border-seal-edge">
                <Cloud className="w-3 h-3" />
                Cached
              </span>
            )}
          </div>
          <p className="text-nano font-[family-name:var(--font-ledger)] tracking-[0.06em] uppercase text-fg-5 mt-1 sm:mt-1.5 tabular-nums">
            {formattedDate}
          </p>

          {/* Additional metadata row — holder identity */}
          <div className="flex items-center gap-2 sm:gap-3 mt-1.5 sm:mt-2">
            {video.creatorHandle ? (
              <span className="text-xs text-fg-3">
                @{video.creatorHandle}
              </span>
            ) : (
              <HolderIdentity
                address={video.owner}
                gateToken={(video.encryptionMetadata as unknown as { tokenAddress?: string })?.tokenAddress ?? null}
                gateChain={(video.encryptionMetadata as unknown as { chain?: string })?.chain ?? null}
                size="sm"
                compact
              />
            )}
            {video.isEncrypted && (
              <span className="hidden sm:inline-flex items-center gap-1 text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.08em] text-fg-4">
                <Lock className="w-3 h-3" />
                Encrypted
              </span>
            )}
            {/* Cached badge in metadata row for larger screens */}
            {video.isEncrypted && isCached && (
              <span className="hidden sm:inline-flex items-center gap-1 text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.08em] text-seal-text">
                <Cloud className="w-3 h-3" />
                Cached
              </span>
            )}
            {video.hasAiData && (
              <span className="hidden sm:inline-flex items-center gap-1 text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.08em] text-fg-3">
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
      className="w-8 h-8 text-fg-5"
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
