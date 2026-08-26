'use client'

/**
 * StageChecklist — the tick-box spine of a staged drip publish.
 *
 * One row per unlock rung ("first mkt cap, then second…"): green check for
 * committed stages (with uploader badge), a pulsing marker for the single
 * publishable stage, and dim locks for future ones. Mirrors exactly what
 * readers see on-chain — a row turns green only after its Arkiv entity exists.
 *
 * @module components/publish/StageChecklist
 */

import { CheckCircle2, CircleDashed, Lock } from 'lucide-react'

import { formatUsdCompact, stageLabel, type DripChunkPlan } from '@/lib/v4/drip-plan'
import type { DripStageResult, DripStageState } from '@/lib/v4/drip-session'
import { DripRings } from '@/components/video/DripRings'

export interface StageChecklistProps {
  stages: DripStageState[]
}

export function StageChecklist({ stages }: StageChecklistProps) {
  const activeIndex = stages.findIndex((s) => !s.result)

  return (
    <div className="space-y-2" data-testid="stage-checklist">
      {stages.map((stage, i) => (
        <StageRow
          key={i}
          plan={stage.plan}
          result={stage.result}
          state={stage.result ? 'done' : i === activeIndex ? 'active' : 'locked'}
        />
      ))}
      <div className="flex items-center gap-3 pt-1 pl-1">
        <DripRings
          unlocked={stages.filter((s) => s.result).length}
          total={stages.length}
          size={20}
        />
        <span className="text-xs text-fg-4">
          {stages.filter((s) => s.result).length}/{stages.length} stages live on-chain
        </span>
      </div>
    </div>
  )
}

type RowState = 'done' | 'active' | 'locked'

function StageRow({
  plan,
  result,
  state,
}: {
  plan: DripChunkPlan
  result?: DripStageResult
  state: RowState
}) {
  return (
    <div
      data-testid={state === 'done' ? 'stage-row-done' : undefined}
      className={`flex items-center gap-3 px-3 py-2.5 border transition-colors ${
        state === 'done'
          ? 'border-green-500/25 bg-green-500/[0.04]'
          : state === 'active'
            ? 'border-seal bg-accent'
            : 'border-line bg-card'
      }`}
    >
      {state === 'done' ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--color-arkiv)]" />
      ) : state === 'active' ? (
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          <CircleDashed className="h-5 w-5 animate-spin text-seal-text" />
        </span>
      ) : (
        <Lock className="h-4 w-4 shrink-0 text-fg/20" />
      )}

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${state === 'locked' ? 'text-fg-4' : 'text-fg/85'}`}>
          Stage {plan.dripIndex + 1} · {stageLabel(plan.dripIndex, plan.dripTotal)}
          <span className="ml-2 font-normal text-xs text-fg-5">
            unlocks @ {formatUsdCompact(plan.marketCapTargetUsd)}
          </span>
        </p>
        <p className="text-[11px] text-fg-5 truncate">
          {state === 'done' && result ? (
            <>
              by {shortAddr(result.publishedBy)} · entity {shortAddr(result.entityKey)} ·{' '}
              {new Date(result.publishedAtMs).toLocaleDateString()}
            </>
          ) : (
            <>bytes [{plan.startByte.toLocaleString()}, {plan.endByte.toLocaleString()})</>
          )}
        </p>
      </div>

      {state === 'done' ? (
        <span className="text-xs font-medium text-[var(--color-arkiv)]">Published</span>
      ) : state === 'active' ? (
        <span className="text-xs font-medium text-seal-text">Up next</span>
      ) : (
        <span className="text-xs text-fg-5">Locked</span>
      )}
    </div>
  )
}

function shortAddr(value: string): string {
  if (!value) return ''
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
}
