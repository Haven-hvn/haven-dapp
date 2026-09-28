'use client'

/**
 * Audio Card Component
 *
 * Grid card for `haven.audio.full` releases (merged single-file albums).
 * Mirrors `VideoCard` props so the library grid can branch per item, but
 * presents a square record plate (cover art arrives after decrypt, so the
 * card shows a music plate until then), an audio badge, and duration when
 * known — catalog audio carries no `dur_s`, so unknown reads as "Album".
 *
 * @module components/library/AudioCard
 */

import { Cloud, ListMusic, Lock } from 'lucide-react'
import type { Video } from '@/types'

export interface AudioCardProps {
  /** Parsed audio release (a Video record with `mediaKind: 'audio'`). */
  video: Video
  /** True when the decrypted track sits in the Cache API. */
  isCached?: boolean
  /** Card click → the grid routes to `/watch?v=`. */
  onClick?: (video: Video) => void
}

export function AudioCard({ video, isCached = false, onClick }: AudioCardProps) {
  return (
    <button
      onClick={() => onClick?.(video)}
      className="block group text-left touch-manipulation w-full"
    >
      <div className="border border-line bg-card hover:border-line-strong hover:bg-accent transition-colors overflow-hidden">
        {/* Record plate */}
        <div className="relative aspect-square bg-surface-deep border-b border-line overflow-hidden">
          <div className="w-full h-full flex items-center justify-center">
            <ListMusic className="w-12 h-12 text-fg-4" />
          </div>

          {/* Duration / album badge */}
          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 text-[0.625rem] font-[family-name:var(--font-ledger)] tabular-nums tracking-[0.04em] bg-fg/80 text-surface">
            {video.duration > 0 ? formatDuration(video.duration) : 'Album'}
          </div>

          {/* Encryption indicator */}
          {video.isEncrypted && (
            <div className="absolute top-1 left-1 p-1 bg-fg/80" title="Encrypted">
              <Lock className="w-3 h-3 text-surface" />
            </div>
          )}

          {/* Cached badge */}
          {video.isEncrypted && isCached && (
            <div
              className="absolute top-1 right-1 p-1 bg-seal"
              title="Cached — instant playback"
            >
              <Cloud className="w-3 h-3 text-seal-solid-text" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-2 sm:p-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-1.5 py-0.5 bg-seal-wash text-seal-text text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.08em] border border-seal-edge">
              Audio
            </span>
          </div>
          <h3
            className="font-medium text-small sm:text-base line-clamp-2 text-fg tracking-[-0.01em] mt-1.5"
            title={video.title}
          >
            {video.title}
          </h3>
        </div>
      </div>
    </button>
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
