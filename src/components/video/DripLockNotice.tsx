'use client'

/**
 * DripLockNotice — V4 market-cap lock screen for drip chunks.
 *
 * Rendered in place of the player while `currentMarketCap < target`.
 * Shows the canonical copy from the spec — "Unlocks at $T (now $current)" —
 * with a progress ring toward the next unlock and concentric rings for
 * overall drip progress. Fails closed: unknown market cap renders as locked.
 *
 * @module components/video/DripLockNotice
 */

import { Lock, RefreshCw } from 'lucide-react'
import { useMarketCap, evaluateDripUnlock } from '@/hooks/useMarketCap'
import { formatUsdCompact } from '@/lib/v4/drip-plan'
import type { DripInfo, Video } from '@/types/video'
import { DripRings } from './DripRings'

export interface DripLockNoticeProps {
  drip: DripInfo
  /** Gate token override (defaults to drip.gateToken). */
  gateTokenOverride?: string | null
}

/**
 * Full-screen lock state. When the live cap meets the target the parent can
 * re-render the player; this component itself never unlocks content.
 */
export function DripLockNotice({ drip, gateTokenOverride }: DripLockNoticeProps) {
  const token = gateTokenOverride ?? drip.gateToken
  const { marketCapUsd, isLoading, refetch } = useMarketCap(token || null)
  const { unlocked, progress } = evaluateDripUnlock(
    drip.marketCapTargetUsd,
    marketCapUsd
  )

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-[#0A0A0F] px-6 py-12 text-center">
      <div className="relative">
        <DripRings
          unlocked={drip.dripIndex}
          total={drip.dripTotal}
          size={96}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Lock className="h-6 w-6 text-fg-3" />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-fg">
          Chunk {drip.dripIndex + 1} of {drip.dripTotal} is locked
        </h2>
        <p className="text-lg text-fg-2" data-testid="drip-lock-copy">
          Unlocks at{' '}
          <span className="font-semibold text-seal-text">
            {formatUsdCompact(drip.marketCapTargetUsd)}
          </span>{' '}
          (now{' '}
          <span className="font-medium text-fg">
            {marketCapUsd != null ? formatUsdCompact(marketCapUsd) : '—'}
          </span>
          )
        </p>
        <p className="max-w-md text-sm text-fg-4">
          The community pumps the gate token to progressively unlock this
          release. Hold the required token balance to decrypt once unlocked.
        </p>
      </div>

      {/* Progress toward next unlock */}
      <div className="w-full max-w-sm space-y-2">
        <div className="h-2 overflow-hidden rounded-full bg-accent">
          <div
            className="h-full rounded-full bg-gradient-to-r bg-primary transition-all duration-700"
            style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-fg-4">
          <span>
            {progress != null ? `${Math.round(progress * 100)}% to unlock` : 'Live price unavailable'}
          </span>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1 hover:text-fg-2 transition-colors"
            aria-label="Refresh market cap"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Compact chip variant for library cards / grids.
 * Returns null when the chunk is already unlocked so cards stay clean.
 */
export function DripLockedChip({
  drip,
  video,
}: {
  drip: DripInfo
  video?: Video
}) {
  void video
  // Chip intentionally shows static info only — polling per grid card would
  // multiply oracle calls; the watch screen owns the live check.
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-seal-text">
      <DripRings unlocked={drip.dripIndex} total={drip.dripTotal} size={14} />
      Drip {drip.dripIndex + 1}/{drip.dripTotal}
    </span>
  )
}
