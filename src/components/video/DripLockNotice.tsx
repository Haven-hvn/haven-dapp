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

import { Check, Copy, ExternalLink, Lock, RefreshCw, Share2, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { useMarketCap, evaluateDripUnlock } from '@/hooks/useMarketCap'
import { toNetworkKey } from '@/lib/gate-chains'
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
 *
 * Social-pump presentation: the lock is a collective premiere — every buy
 * moves the bar for all holders. Primary CTA deep-links to the mint.club
 * trade page so viewers can pump; secondary actions copy the token address
 * and share the pump.
 */
export function DripLockNotice({ drip, gateTokenOverride }: DripLockNoticeProps) {
  const token = gateTokenOverride ?? drip.gateToken
  const trimmedToken = token?.trim() ?? ''
  const networkKey = toNetworkKey(drip.gateChain) ?? 'base'
  const { marketCapUsd, symbol, isLoading, refetch } = useMarketCap(
    trimmedToken || null,
    networkKey
  )
  const { progress } = evaluateDripUnlock(
    drip.marketCapTargetUsd,
    marketCapUsd
  )
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)

  const pct = progress != null ? Math.round(progress * 100) : null
  const remainingUsd =
    marketCapUsd != null && Number.isFinite(marketCapUsd)
      ? Math.max(0, drip.marketCapTargetUsd - marketCapUsd)
      : null
  // Enforced bar from the sealed gate record (whole ETH the canister
  // checks). Absent on attribute-only parses — then the USD intent above
  // is all we can honestly show.
  const enforcedEth =
    drip.targetUnit === 'reserve' &&
    typeof drip.marketCapTarget === 'number' &&
    Number.isSafeInteger(drip.marketCapTarget) &&
    drip.marketCapTarget > 0
      ? drip.marketCapTarget
      : null
  const tradeUrl = trimmedToken ? buildMintClubUrl(trimmedToken, networkKey) : null
  const tokenLabel = symbol ?? shortenAddress(trimmedToken)
  const shareText =
    `Help pump ${tokenLabel || 'the gate token'} to unlock Chunk ${drip.dripIndex + 1}/${drip.dripTotal} ` +
    `(${marketCapUsd != null ? formatUsdCompact(marketCapUsd) : '—'} of ${formatUsdCompact(drip.marketCapTargetUsd)})` +
    (tradeUrl ? ` — ${tradeUrl}` : '')

  const handleCopy = async () => {
    if (!trimmedToken) return
    try {
      await navigator.clipboard.writeText(trimmedToken)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      // clipboard unavailable (permissions) — leave the address visible to copy manually
    }
  }

  const handleShare = async () => {
    try {
      const nav = navigator as Navigator & {
        share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>
      }
      if (typeof nav.share === 'function') {
        await nav.share({
          title: `Pump to unlock Chunk ${drip.dripIndex + 1}/${drip.dripTotal}`,
          text: shareText,
          url: tradeUrl ?? undefined,
        })
        setShared(true)
        window.setTimeout(() => setShared(false), 1_500)
        return
      }
      await navigator.clipboard.writeText(shareText)
      setShared(true)
      window.setTimeout(() => setShared(false), 1_500)
    } catch {
      // user dismissed the share sheet — not an error
    }
  }

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
          Chunk {drip.dripIndex + 1} of {drip.dripTotal} is locked — pump to premiere it
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
        {enforcedEth != null && (
          <p className="text-sm text-fg-4" data-testid="drip-enforced-bar">
            Enforced bar{' '}
            <span className="font-medium tabular-nums text-fg-2">
              {enforcedEth.toLocaleString('en-US')} ETH
            </span>{' '}
            — what the canister actually checks
          </p>
        )}
        <p className="mx-auto flex max-w-md items-center justify-center gap-1.5 text-sm font-medium text-fg-2">
          <TrendingUp className="h-4 w-4 text-seal-text" aria-hidden />
          {pct != null ? (
            <span>
              {pct}% pumped
              {remainingUsd != null && remainingUsd > 0 ? (
                <> · {formatUsdCompact(remainingUsd)} to go</>
              ) : (
                <> · almost there</>
              )}
            </span>
          ) : (
            <span>Live price unavailable — showing last known lock state</span>
          )}
        </p>
        <p className="mx-auto max-w-md text-sm text-fg-4">
          Every buy moves this bar for everyone. Once the target hits, the chunk unlocks
          for all holders — hold the gate token to decrypt it.
        </p>
      </div>

      {/* Progress toward next unlock */}
      <div className="w-full max-w-sm space-y-2">
        <div className="h-2 overflow-hidden rounded-full bg-accent">
          <div
            className="h-full rounded-full bg-gradient-to-r bg-primary transition-all duration-700"
            style={{ width: `${pct ?? 0}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-fg-4">
          <span>
            {pct != null ? `${pct}% to unlock` : 'Live price unavailable'}
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

      {/* Pump actions — notice + buy link for the collective unlock */}
      {tradeUrl ? (
        <div className="w-full max-w-sm space-y-2.5">
          <a
            href={tradeUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="drip-pump-link"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-black transition-transform hover:scale-[1.01] active:scale-[0.99]"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            Pump it on mint.club — unlock for everyone
          </a>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={!trimmedToken}
              title={trimmedToken}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-line px-3 font-mono text-xs text-fg-2 transition-colors hover:border-fg-4 hover:text-fg disabled:opacity-50"
            >
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? 'Copied!' : `${tokenLabel} · ${networkKey}`}
            </button>
            <button
              onClick={handleShare}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-line px-3 text-xs font-medium text-fg-2 transition-colors hover:border-fg-4 hover:text-fg"
            >
              <Share2 className="h-3.5 w-3.5" aria-hidden />
              {shared ? 'Link ready!' : 'Share to pump'}
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-fg-5">
            Pumping raises the market cap; holding lets you decrypt after unlock. Two steps, one crew.
          </p>
        </div>
      ) : (
        <p className="max-w-sm text-xs text-fg-4">
          No gate token configured for this chunk yet — the publisher still needs to attach one.
        </p>
      )}
    </div>
  )
}

/**
 * mint.club trade URL for a gate token. Matches UpcomingDrops.mintClubUrl
 * (`/token/{network}/{address}`); null when there is no token to buy.
 */
export function buildMintClubUrl(token: string, networkKey: string): string | null {
  const t = token.trim()
  if (!t) return null
  const chain = networkKey.trim().toLowerCase() || 'base'
  return `https://mint.club/token/${chain}/${t}`
}

function shortenAddress(token: string): string {
  const t = token.trim()
  if (/^0x[a-fA-F0-9]{8,}$/.test(t) && t.length > 14) {
    return `${t.slice(0, 8)}…${t.slice(-6)}`
  }
  return t
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
