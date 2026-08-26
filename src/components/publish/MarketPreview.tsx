'use client'

/**
 * MarketPreview — live cap readout + per-rung unlock register.
 *
 * Shared by the wizard's seal step and the session view: shows the token's
 * live market cap, the next unlock with distance-to-go, and a specimen
 * register of every rung (green tick once the live cap clears it).
 * Fails closed: an unknown cap renders as "—" and every rung stays locked.
 *
 * @module components/publish/MarketPreview
 */

import { formatUsdCompact, stageLabel, type DripChunkPlan } from '@/lib/v4/drip-plan'
import { evaluateDripUnlock } from '@/hooks/useMarketCap'
import { DripRings } from '@/components/video/DripRings'

export interface MarketPreviewProps {
  plans: DripChunkPlan[]
  marketCapUsd: number | null | undefined
  hasToken: boolean
}

export function MarketPreview({ plans, marketCapUsd: liveCap, hasToken }: MarketPreviewProps) {
  const marketCapUsd = liveCap ?? null
  const nextUnlock =
    plans.find((p) => p.marketCapTargetUsd > (marketCapUsd ?? Infinity)) ?? plans[plans.length - 1]
  const showNextUnlock =
    nextUnlock && !evaluateDripUnlock(nextUnlock.marketCapTargetUsd, marketCapUsd).unlocked

  return (
    <div className="panel p-5 space-y-5" data-testid="market-preview">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="label mb-2">Market cap</p>
          <p className="statement-title tabular-nums">
            {hasToken ? (
              marketCapUsd != null ? (
                formatUsdCompact(marketCapUsd)
              ) : (
                <span className="text-fg-4">—</span>
              )
            ) : (
              <span className="text-fg-4">Resolve a token first</span>
            )}
          </p>
        </div>
        {showNextUnlock && (
          <div className="text-right">
            <p className="label mb-2">Next unlock</p>
            <p className="statement-subtitle text-seal-text tabular-nums">
              {formatUsdCompact(nextUnlock.marketCapTargetUsd)}{' '}
              <span className="text-small text-fg-3 font-normal">
                {progressPct(marketCapUsd, nextUnlock.marketCapTargetUsd)}% to go
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Unlock register — specimen rows */}
      <table className="specimen">
        <thead>
          <tr>
            <th>Stage</th>
            <th>Rung</th>
            <th className="!text-right">Target</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((plan) => {
            const { unlocked } = evaluateDripUnlock(plan.marketCapTargetUsd, marketCapUsd)
            return (
              <tr key={plan.dripIndex}>
                <td className="whitespace-nowrap">
                  <DripRings unlocked={unlocked ? 1 : 0} total={1} size={14} />
                  <span className="ml-2 align-middle">{stageLabel(plan.dripIndex, plan.dripTotal)}</span>
                </td>
                <td className="font-[family-name:var(--font-ledger)] text-nano uppercase tracking-[0.1em] text-fg-4">
                  Stage {plan.dripIndex + 1}
                </td>
                <td
                  className={`text-right tabular-nums ${unlocked ? 'text-[var(--color-arkiv)]' : 'text-fg-2'}`}
                >
                  {formatUsdCompact(plan.marketCapTargetUsd)}
                  {unlocked ? ' ✓' : ''}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function progressPct(current: number | null, target: number): number {
  if (current == null || !Number.isFinite(current)) return 0
  return Math.min(99, Math.max(0, Math.floor((current / target) * 100)))
}
