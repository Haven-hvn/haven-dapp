'use client'

/**
 * Audio Player Component
 *
 * Playback surface for `haven.audio.full` releases (merged single-file
 * albums with ID3 chapters + cover art):
 * - Encrypted tracks: piece fetch + gate key unwrap in parallel, full
 *   decrypt (single-blob or chunked seals), cache, then play
 * - Chapter list with seek-to-track and current-track highlight
 * - Embedded cover art when the tag carries APIC
 * - Download button (mirrors the video pipeline, mp3 filename)
 *
 * Chapters/cover parse from the decrypted plaintext, never from the
 * catalog — the tag bytes are authoritative.
 *
 * @module components/player/AudioPlayer
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAudioTrack } from '@/hooks/useAudioTrack'
import { useVideoDownload } from '@/hooks/useVideoDownload'
import { HolderIdentity } from '@/components/profile/HolderIdentity'
import { ErrorOverlay } from './ErrorOverlay'
import {
  getPlaybackErrorPresentation,
  PlaybackLoadError,
} from '@/lib/playback-errors'
import { chapterIndexAt } from '@/lib/id3-chapters'
import { ArrowLeft, Loader2, Lock, Download, ListMusic } from 'lucide-react'
import Link from 'next/link'
import type { Video } from '@/types'

interface AudioPlayerProps {
  /** Already-resolved audio release (the watch route branches on `mediaKind`). */
  track: Video
}

export function AudioPlayer({ track }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [positionMs, setPositionMs] = useState(0)
  const [durationSec, setDurationSec] = useState(0)

  const { audioUrl, chapters, cover, stage, isLoading, error, reload } =
    useAudioTrack(track)

  const {
    download,
    isDownloading,
    progressMessage: downloadMessage,
  } = useVideoDownload()

  const coverUrl = useMemo(() => {
    if (!cover) return null
    const url = URL.createObjectURL(
      new Blob([cover.bytes as BlobPart], { type: cover.mime })
    )
    return url
  }, [cover])

  useEffect(() => {
    return () => {
      if (coverUrl) URL.revokeObjectURL(coverUrl)
    }
  }, [coverUrl])

  const currentChapter = chapterIndexAt(chapters, positionMs)

  const seekToChapter = (startMs: number) => {
    const el = audioRef.current
    if (el) {
      el.currentTime = startMs / 1000
      el.play().catch(() => {})
    }
  }

  const showPlayer = audioUrl && !error

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
          <button
            onClick={(e) => { e.stopPropagation(); download(track) }}
            disabled={isDownloading || !audioUrl}
            className="flex items-center gap-2 px-3 py-1 border border-[oklch(0.98_0.01_90/0.3)] hover:border-[var(--seal)] text-[oklch(0.8_0.012_264)] hover:text-[oklch(0.78_0.17_50)] text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.12em] transition-colors touch-manipulation min-h-[36px] disabled:opacity-50"
            title={isDownloading ? downloadMessage : 'Download track'}
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">
              {isDownloading ? downloadMessage : 'Download'}
            </span>
          </button>

          {track.isEncrypted && (
            <div className="flex items-center gap-2 px-3 py-1 border border-[oklch(0.98_0.01_90/0.13)] text-[oklch(0.645_0.018_264)] text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.12em]">
              <Lock className="w-4 h-4" />
              <span className="hidden sm:inline">Encrypted</span>
            </div>
          )}
        </div>
      </div>

      {/* Player body */}
      <div className="flex-1 min-h-0 min-w-0 relative flex flex-col items-center justify-start overflow-y-auto p-4 sm:p-6 gap-4">
        {error && (
          <ErrorOverlay
            presentation={
              error instanceof PlaybackLoadError
                ? error.presentation
                : getPlaybackErrorPresentation(error)
            }
            onRetry={reload}
            isEncrypted={track.isEncrypted}
          />
        )}

        {isLoading && !error && (
          <div className="flex items-center gap-3 text-[oklch(0.68_0.016_264)] py-10">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="label">{stageLabel(stage)}</span>
          </div>
        )}

        {showPlayer && (
          <>
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverUrl}
                alt={`${track.title} cover art`}
                className="w-48 h-48 sm:w-64 sm:h-64 object-cover border border-[oklch(0.98_0.01_90/0.13)]"
              />
            ) : (
              <div className="w-48 h-48 sm:w-64 sm:h-64 flex items-center justify-center border border-[oklch(0.98_0.01_90/0.13)] bg-[oklch(0.16_0.008_264)]">
                <ListMusic className="w-12 h-12 text-[oklch(0.45_0.014_264)]" />
              </div>
            )}

            <audio
              ref={audioRef}
              src={audioUrl}
              controls
              className="w-full max-w-xl"
              onTimeUpdate={(e) => setPositionMs(e.currentTarget.currentTime * 1000)}
              onLoadedMetadata={(e) => setDurationSec(e.currentTarget.duration || 0)}
            />

            {chapters.length > 0 && (
              <ol className="w-full max-w-xl border border-[oklch(0.98_0.01_90/0.13)] divide-y divide-[oklch(0.98_0.01_90/0.08)]">
                {chapters.map((chapter, index) => {
                  const active = index === currentChapter
                  return (
                    <li key={`${chapter.startMs}-${index}`}>
                      <button
                        onClick={() => seekToChapter(chapter.startMs)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors touch-manipulation min-h-[44px] ${
                          active
                            ? 'bg-[color-mix(in_oklab,var(--seal)_14%,transparent)] text-[oklch(0.78_0.17_50)]'
                            : 'text-[oklch(0.8_0.012_264)] hover:bg-[oklch(0.98_0.01_90/0.05)]'
                        }`}
                      >
                        <span className="text-nano font-[family-name:var(--font-ledger)] tabular-nums text-[oklch(0.645_0.018_264)] w-12 shrink-0">
                          {formatMs(chapter.startMs)}
                        </span>
                        <span className="text-small truncate">
                          {index + 1}. {chapter.title}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
          </>
        )}
      </div>

      {/* Track info */}
      <div className="shrink-0 p-3 sm:p-4 border-t border-[oklch(0.98_0.01_90/0.13)] safe-area-x safe-area-bottom overflow-y-auto max-h-[30vh]">
        <h1 className="statement-subtitle text-[oklch(0.968_0.005_90)]">{track.title}</h1>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2.5 text-nano sm:text-fine font-[family-name:var(--font-ledger)] tracking-[0.06em] uppercase text-[oklch(0.645_0.018_264)] tabular-nums">
          <span>{formatDuration(durationSec || track.duration)}</span>
          <span className="hidden sm:inline" aria-hidden>·</span>
          {chapters.length > 0 && (
            <>
              <span>{chapters.length} tracks</span>
              <span className="hidden sm:inline" aria-hidden>·</span>
            </>
          )}
          <span>{new Date(track.createdAt).toLocaleDateString()}</span>
          <span className="hidden sm:inline" aria-hidden>·</span>
          <HolderIdentity
            address={track.owner}
            gateToken={(track.encryptionMetadata as unknown as { tokenAddress?: string })?.tokenAddress ?? null}
            gateChain={(track.encryptionMetadata as unknown as { chain?: string })?.chain ?? null}
            size="sm"
            showTokenId
          />
        </div>
      </div>
    </div>
  )
}

function stageLabel(stage: string): string {
  switch (stage) {
    case 'checking-cache':
      return 'Checking cache'
    case 'authenticating':
      return 'Waiting for wallet signature'
    case 'fetching':
      return 'Fetching encrypted track'
    case 'decrypting-key':
      return 'Recovering decryption key'
    case 'decrypting':
      return 'Decrypting track'
    case 'caching':
      return 'Caching for offline'
    default:
      return 'Loading track'
  }
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatDuration(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const hours = Math.floor(mins / 60)
  if (hours > 0) {
    return `${hours}:${(mins % 60).toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
