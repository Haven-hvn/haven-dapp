'use client'

/**
 * CreateWizard — staged drip onboarding: decide the structure, then fill it.
 *
 * Four numbered filings, one on screen at a time; completed sections fold
 * into stamped receipt rows you can reopen. Order is intentional:
 *
 *   01 THE LADDER  how many rungs, which market caps (no files yet)
 *   02 THE SLATES  one upload slot PER STAGE — drop each rung's own file
 *   03 THE GATE    mint.club token + oracle + chain + holder threshold
 *   04 SEAL        manifest review, live cap preview, commitment
 *
 * Each slate is hashed the moment it lands (progressive feedback), and the
 * sealed session carries per-stage commitments so publishing never needs a
 * merged master file again.
 *
 * @module components/publish/CreateWizard
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWalletClient } from 'wagmi'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileVideo,
  Loader2,
  Lock,
  RotateCcw,
  X,
} from 'lucide-react'

import {
  DRIP_TARGET_PRESETS,
  MAX_DRIP_CHUNKS,
  formatUsdCompact,
  planDripChunks,
  stageLabel,
  validateDripConfig,
  type DripChunkPlan,
} from '@/lib/v4/drip-plan'
import { createDripSessionFromSlates, saveDripSession, type DripSession } from '@/lib/v4/drip-session'
import { sha256Hex } from '@/lib/crypto'
import { resolveMintToken } from '@/lib/v4/market-cap'
import { createMintClubToken } from '@/lib/v4/mint-create'
import { useMarketCap } from '@/hooks/useMarketCap'
import { useToast } from '@/hooks/useToast'
import { VALID_CHAINS, type Chain } from 'haven-aol'
import { MarketPreview } from './MarketPreview'
import { confettiBurst } from './confetti'

type StepId = 'ladder' | 'slates' | 'gate' | 'seal'

const STEP_ORDER: StepId[] = ['ladder', 'slates', 'gate', 'seal']

const STEP_META: Record<StepId, { folio: string; title: string }> = {
  ladder: { folio: '01', title: 'The unlock ladder' },
  slates: { folio: '02', title: 'The stage files' },
  gate: { folio: '03', title: 'The gate' },
  seal: { folio: '04', title: 'Seal the plan' },
}

const ORACLE_ADDR_RE = /^0x[0-9a-fA-F]{40}$/

type SlateEntry =
  | { status: 'hashing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; file: File; size: number; sha256: string }

export interface CreateWizardProps {
  /** Called once the plan is sealed; files stay readable for stage uploads. */
  onSealed: (session: DripSession, stageFiles: Map<number, File>) => void
}

export function CreateWizard({ onSealed }: CreateWizardProps) {
  const toast = useToast()
  const { data: walletClient } = useWalletClient()

  const [step, setStep] = useState<StepId>('ladder')

  // 01 — ladder ---------------------------------------------------------------
  const [chunkCount, setChunkCount] = useState(3)
  const [targetsUsd, setTargetsUsd] = useState<number[]>([1_000_000, 5_000_000, 10_000_000])

  // 02 — slates ---------------------------------------------------------------
  const [slates, setSlates] = useState<(SlateEntry | null)[]>([])
  const dragIndex = useRef<number | null>(null)

  // 03 — gate -----------------------------------------------------------------
  const [gateMode, setGateMode] = useState<'existing' | 'create'>('existing')
  const [newTokenName, setNewTokenName] = useState('')
  const [newTokenSymbol, setNewTokenSymbol] = useState('')
  const [creatingToken, setCreatingToken] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [gateTokenInput, setGateTokenInput] = useState('')
  const [resolvedToken, setResolvedToken] = useState<{ address: string; symbol: string | null } | null>(
    null
  )
  const [oracleAddress, setOracleAddress] = useState('')
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [chain, setChain] = useState<Chain>('BaseMainnet')
  const [threshold, setThreshold] = useState(1)

  // 04 — seal -----------------------------------------------------------------
  const [title, setTitle] = useState('')
  const [sealing, setSealing] = useState(false)

  // Keep the slate slots in lockstep with the ladder.
  useEffect(() => {
    setSlates((prev) => {
      const next = prev.slice(0, chunkCount)
      while (next.length < chunkCount) next.push(null)
      return next
    })
  }, [chunkCount])

  // Derived — completion flags drive reachability -----------------------------
  const config = useMemo(() => ({ chunkCount, targetsUsd }), [chunkCount, targetsUsd])
  const configErrors = useMemo(() => validateDripConfig(config), [config])
  const ladderDone = configErrors.length === 0

  const readySlates = useMemo(
    () => slates.filter((s): s is Extract<SlateEntry, { status: 'ready' }> => s?.status === 'ready'),
    [slates]
  )
  const slatesDone = slates.length === chunkCount && readySlates.length === chunkCount

  const oracleValid = ORACLE_ADDR_RE.test(oracleAddress.trim())
  const gateDone = resolvedToken != null && oracleValid && threshold >= 1

  const doneFlags: Record<StepId, boolean> = {
    ladder: ladderDone,
    slates: slatesDone,
    gate: gateDone,
    seal: false,
  }
  const doneCount = STEP_ORDER.filter((id) => doneFlags[id]).length

  // Byte plans come from slate SIZES alone — no master file exists.
  const draftPlans = useMemo(() => {
    if (!slatesDone) return null
    const total = readySlates.reduce((acc, s) => acc + s.size, 0)
    const result = planDripChunks(total, config)
    return result.ok ? result.chunks : null
  }, [slatesDone, readySlates, config])

  // Live market cap for the seal-step preview ---------------------------------
  const havenChainToMintNetwork: Record<string, string> = {
    EthMainnet: 'ethereum',
    EthSepolia: 'sepolia',
    BaseMainnet: 'base',
    ArbitrumOne: 'arbitrum',
    OptimismMainnet: 'optimism',
  }
  const networkHint = havenChainToMintNetwork[chain] ?? 'base'
  const { marketCapUsd } = useMarketCap(resolvedToken?.address ?? null, networkHint)

  // Handlers — ladder ----------------------------------------------------------
  const applyPreset = useCallback((targets: number[]) => {
    setChunkCount(targets.length)
    setTargetsUsd([...targets])
  }, [])

  const setChunkCountSafe = useCallback((n: number) => {
    const clamped = Math.max(1, Math.min(MAX_DRIP_CHUNKS, n))
    setChunkCount(clamped)
    setTargetsUsd((prev) => {
      const next = [...prev]
      while (next.length < clamped) {
        const last = next[next.length - 1] ?? 1_000_000
        next.push(last * 5)
      }
      next.length = clamped
      return next
    })
  }, [])

  const setTarget = useCallback((index: number, value: string) => {
    const parsed = Number(value.replace(/[^0-9.]/g, ''))
    setTargetsUsd((prev) => {
      const next = [...prev]
      next[index] = Number.isFinite(parsed) ? Math.round(parsed) : 0
      return next
    })
  }, [])

  // Handlers — slates ----------------------------------------------------------
  const acceptSlate = useCallback(async (index: number, file: File | null) => {
    if (!file) return
    setSlates((prev) => {
      const next = [...prev]
      next[index] = { status: 'hashing' }
      return next
    })
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const sha256 = await sha256Hex(bytes)
      setSlates((prev) => {
        const next = [...prev]
        next[index] = { status: 'ready', file, size: file.size, sha256 }
        return next
      })
    } catch {
      setSlates((prev) => {
        const next = [...prev]
        next[index] = { status: 'error', message: 'Could not read that file.' }
        return next
      })
    }
  }, [])

  const clearSlate = useCallback((index: number) => {
    setSlates((prev) => {
      const next = [...prev]
      next[index] = null
      return next
    })
  }, [])

  // Momentum: the moment every slot is filled, walk to the gate.
  const advancedRef = useRef(false)
  useEffect(() => {
    if (!slatesDone) advancedRef.current = false
  }, [slatesDone])
  useEffect(() => {
    if (step !== 'slates' || !slatesDone || advancedRef.current) return
    advancedRef.current = true
    const t = window.setTimeout(() => setStep('gate'), 900)
    return () => window.clearTimeout(t)
  }, [step, slatesDone])

  // Handlers — gate ------------------------------------------------------------
  const handleResolveToken = useCallback(async () => {
    setResolving(true)
    setResolveError(null)
    try {
      const result = await resolveMintToken({ token: gateTokenInput, network: networkHint })
      if (!result.exists || !result.address) {
        setResolvedToken(null)
        setResolveError('Token not found on this Mint Club network.')
      } else {
        setResolvedToken({ address: result.address, symbol: result.symbol })
      }
    } catch {
      setResolvedToken(null)
      setResolveError('Could not reach Mint Club. Try a direct token address.')
    } finally {
      setResolving(false)
    }
  }, [gateTokenInput, networkHint])

  const handleCreateToken = useCallback(async () => {
    if (!walletClient) {
      setCreateError('Connect wallet first')
      return
    }
    setCreatingToken(true)
    setCreateError(null)
    const r = await createMintClubToken({
      walletClient: walletClient as Parameters<typeof createMintClubToken>[0]['walletClient'],
      network: networkHint,
      name: newTokenName,
      symbol: newTokenSymbol,
    })
    setCreatingToken(false)
    if (r.address) {
      setResolvedToken({ address: r.address, symbol: newTokenSymbol })
      const bond = await (await import('@/lib/v4/market-cap')).getBondContractAddress(networkHint)
      if (bond) setOracleAddress(bond)
      toast.showSuccess('Token created: ' + r.address)
    } else {
      setCreateError(r.error ?? 'Create failed')
    }
  }, [walletClient, networkHint, newTokenName, newTokenSymbol, toast])

  // Handlers — seal --------------------------------------------------------------
  const canSeal = ladderDone && slatesDone && gateDone && !sealing
  const sealingRef = useRef(false)

  const handleSeal = useCallback(async () => {
    if (sealingRef.current || !canSeal || !resolvedToken) return
    sealingRef.current = true
    setSealing(true)
    try {
      const created = await createDripSessionFromSlates({
        title: title.trim() || 'Untitled drip',
        mimeType: readySlates[0]?.file.type || 'video/mp4',
        config: { chunkCount, targetsUsd },
        gate: {
          chain,
          gateToken: resolvedToken.address,
          gateThreshold: threshold,
          oracleAddress: oracleAddress.trim(),
        },
        slates: readySlates.map((s) => ({
          fileName: s.file.name,
          fileSize: s.size,
          sha256: s.sha256,
        })),
      })
      if (!created) {
        toast.showError('Could not lock that plan — check the ladder and gate.')
        return
      }
      saveDripSession(created)
      confettiBurst()
      toast.showSuccess(
        `Plan sealed — ${created.stages.length} stages. Publish ${stageLabel(0, created.stages.length)} whenever you're ready.`
      )
      onSealed(created, new Map(readySlates.map((s, i) => [i, s.file])))
    } finally {
      sealingRef.current = false
      setSealing(false)
    }
  }, [
    canSeal,
    resolvedToken,
    title,
    readySlates,
    chunkCount,
    targetsUsd,
    chain,
    threshold,
    oracleAddress,
    toast,
    onSealed,
  ])

  const goNext = useCallback(() => {
    const idx = STEP_ORDER.indexOf(step)
    const next = STEP_ORDER[idx + 1]
    if (next) setStep(next)
  }, [step])

  // ============================================================================
  // Render
  // ============================================================================

  const totalBytes = readySlates.reduce((acc, s) => acc + s.size, 0)

  const summaries: Record<StepId, string> = {
    ladder: `${chunkCount} rung${chunkCount === 1 ? '' : 's'} · ${formatUsdCompact(Math.min(...targetsUsd))} → ${formatUsdCompact(Math.max(...targetsUsd))}`,
    slates: `${readySlates.length}/${chunkCount} files · ${(totalBytes / 1024 / 1024).toFixed(1)} MB`,
    gate: resolvedToken
      ? `${resolvedToken.symbol ?? shortAddr(resolvedToken.address)} · ${chain} · ≥${threshold} holder${threshold === 1 ? '' : 's'}`
      : '',
    seal: '',
  }

  return (
    <>
      {/* Filing header */}
      <header className="space-y-3">
        <p className="seal-mark w-fit">V4 · Drip Protocol</p>
        <h1 className="statement-headline [font-size:clamp(1.75rem,1.1rem+2.2vw,2.75rem)] pt-2">
          Release by <em className="voice-editorial overprint">market-cap rungs</em>
        </h1>
        <p className="lede max-w-prose">
          Decide the unlock ladder first, then give every rung its own file — one encrypted upload
          per stage, publishable one at a time from any wallet.
        </p>
      </header>

      {/* Progress meter */}
      <div className="space-y-2.5" aria-label={`Filing progress: ${doneCount} of 4 sections complete`}>
        <div className="flex items-center justify-between">
          <span className="label">Filing DP-4</span>
          <span className="datum text-seal-text tabular-nums">
            {doneCount}/4 <span className="text-fg-5">sealed</span>
          </span>
        </div>
        <div className="h-[2px] bg-line relative">
          <div
            className="absolute inset-y-0 left-0 bg-seal transition-all duration-700 ease-out"
            style={{ width: `${(doneCount / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* Sections — completed fold into receipts, current expands, future locks */}
      <div className="space-y-5">
        {STEP_ORDER.map((id) =>
          id === step ? (
            <ActiveSection key={id} id={id}>
              {id === 'ladder' && (
                <LadderPanel
                  chunkCount={chunkCount}
                  targetsUsd={targetsUsd}
                  configErrors={configErrors}
                  onChunkCount={setChunkCountSafe}
                  onTarget={setTarget}
                  onPreset={applyPreset}
                  onNext={goNext}
                />
              )}
              {id === 'slates' && (
                <SlatesPanel
                  slates={slates}
                  chunkCount={chunkCount}
                  targetsUsd={targetsUsd}
                  dragIndex={dragIndex}
                  plans={draftPlans}
                  onAccept={acceptSlate}
                  onClear={clearSlate}
                  onNext={goNext}
                />
              )}
              {id === 'gate' && (
                <GatePanel
                  walletConnected={walletClient != null}
                  gateMode={gateMode}
                  onGateMode={setGateMode}
                  newTokenName={newTokenName}
                  onNewTokenName={setNewTokenName}
                  newTokenSymbol={newTokenSymbol}
                  onNewTokenSymbol={setNewTokenSymbol}
                  creatingToken={creatingToken}
                  createError={createError}
                  onCreateToken={() => void handleCreateToken()}
                  gateTokenInput={gateTokenInput}
                  onGateTokenInput={(v) => {
                    setGateTokenInput(v)
                    setResolvedToken(null)
                    setOracleAddress('')
                    setResolveError(null)
                  }}
                  resolving={resolving}
                  onResolve={() => void handleResolveToken()}
                  resolveError={resolveError}
                  resolvedToken={resolvedToken}
                  oracleAddress={oracleAddress}
                  onOracle={setOracleAddress}
                  oracleValid={oracleValid}
                  chain={chain}
                  onChain={setChain}
                  threshold={threshold}
                  onThreshold={setThreshold}
                  onNext={goNext}
                />
              )}
              {id === 'seal' && (
                <SealPanel
                  title={title}
                  onTitle={setTitle}
                  chunkCount={chunkCount}
                  targetsUsd={targetsUsd}
                  slates={slates}
                  plans={draftPlans}
                  resolvedToken={resolvedToken}
                  chain={chain}
                  threshold={threshold}
                  marketCapUsd={marketCapUsd}
                  canSeal={canSeal}
                  sealing={sealing}
                  onSeal={() => void handleSeal()}
                />
              )}
            </ActiveSection>
          ) : doneFlags[id] ? (
            <FiledEntry
              key={id}
              id={id}
              summary={summaries[id]}
              onRevise={() => setStep(id)}
            />
          ) : (
            <LockedEntry key={id} id={id} />
          )
        )}
      </div>
    </>
  )
}

// ============================================================================
// Section shells
// ============================================================================

function ActiveSection({ id, children }: { id: StepId; children: React.ReactNode }) {
  return (
    <section key={STEP_META[id].folio} className="wizard-step-enter">
      <div className="flex items-baseline gap-4 mb-4 pb-2 border-b border-line-strong">
        <span className="folio">{STEP_META[id].folio}</span>
        <span className="section-head-rule" aria-hidden="true" />
        <h2 className="statement-subtitle">{STEP_META[id].title}</h2>
      </div>
      {children}
    </section>
  )
}

function FiledEntry({ id, summary, onRevise }: { id: StepId; summary: string; onRevise: () => void }) {
  return (
    <button
      onClick={onRevise}
      data-testid={`wizard-filed-${id}`}
      className="group w-full flex items-center gap-3 border border-line bg-card px-4 py-3 text-left hover:border-seal transition-colors crop-marks touch-manipulation"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--color-arkiv)]" />
      <span className="folio">{STEP_META[id].folio}</span>
      <span className="label !text-fg-3 group-hover:!text-seal-text transition-colors">
        {STEP_META[id].title}
      </span>
      <span className="ml-auto datum text-fg-4 truncate hidden sm:block">{summary}</span>
      <RotateCcw
        className="h-3.5 w-3.5 shrink-0 text-fg-5 group-hover:text-seal-text transition-colors"
        aria-hidden
      />
      <span className="sr-only">Revise {STEP_META[id].title.toLowerCase()}</span>
    </button>
  )
}

function LockedEntry({ id }: { id: StepId }) {
  const hints: Record<Exclude<StepId, 'ladder'>, string> = {
    slates: 'Pick the rung count first',
    gate: 'Fill every stage file first',
    seal: 'Complete the gate first',
  }
  const priorIdx = STEP_ORDER.indexOf(id) - 1
  const hintKey = STEP_ORDER[priorIdx] as Exclude<StepId, 'ladder'>
  return (
    <div
      className="w-full flex items-center gap-3 border border-line-soft bg-transparent px-4 py-3 opacity-60 cursor-not-allowed select-none"
      aria-disabled="true"
    >
      <Lock className="h-3.5 w-3.5 shrink-0 text-fg-5" aria-hidden />
      <span className="folio !text-fg-5">{STEP_META[id].folio}</span>
      <span className="label !text-fg-5">{STEP_META[id].title}</span>
      <span className="ml-auto label !whitespace-normal normal-case tracking-[0.02em] text-fg-5 hidden sm:block">
        {hints[hintKey]}
      </span>
    </div>
  )
}

// ============================================================================
// 01 — The unlock ladder
// ============================================================================

function LadderPanel({
  chunkCount,
  targetsUsd,
  configErrors,
  onChunkCount,
  onTarget,
  onPreset,
  onNext,
}: {
  chunkCount: number
  targetsUsd: number[]
  configErrors: ReturnType<typeof validateDripConfig>
  onChunkCount: (n: number) => void
  onTarget: (index: number, value: string) => void
  onPreset: (targets: number[]) => void
  onNext: () => void
}) {
  const valid = configErrors.length === 0
  return (
    <div className="panel-double p-5 sm:p-6 space-y-6 crop-marks">
      <p className="prose-body text-fine leading-relaxed text-fg-3">
        How many separate uploads should this release have, and what market cap unlocks each?
        Every rung gets its own file, its own key, its own reveal.
      </p>

      {/* FIG.01 — the ladder, drawn to log-scale */}
      <TargetStaircase targets={targetsUsd} />

      <div>
        <label className="flex items-center justify-between label mb-3">
          <span className="normal-case tracking-[0.04em] text-[0.8125rem] font-[family-name:var(--font-institution)]">
            Stages — each is its own upload
          </span>
          <span className="datum !text-base text-seal-text">{chunkCount}</span>
        </label>
        <input
          type="range"
          min={1}
          max={MAX_DRIP_CHUNKS}
          value={chunkCount}
          onChange={(e) => onChunkCount(Number(e.target.value))}
          className="w-full accent-[var(--seal)]"
          data-testid="drip-chunk-slider"
        />
      </div>

      <div className="space-y-2" data-testid="drip-target-list">
        {targetsUsd.map((t, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-24 shrink-0 label text-fg-4 truncate">
              {stageLabel(i, targetsUsd.length)}
            </span>
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-5">$</span>
              <input
                inputMode="numeric"
                value={String(t)}
                onChange={(e) => onTarget(i, e.target.value)}
                className="w-full bg-transparent border border-line-strong focus:border-seal outline-none pl-7 pr-3 py-1.5 text-small font-[family-name:var(--font-ledger)] tabular-nums"
              />
            </div>
            <span className="w-14 text-right datum text-fg-4">{formatUsdCompact(t)}</span>
          </div>
        ))}
        {configErrors.some((e) => e.code === 'TARGETS_NOT_ASCENDING') && (
          <p className="text-nano text-destructive flex items-center gap-1.5 font-[family-name:var(--font-ledger)] uppercase tracking-[0.08em]">
            <AlertCircle className="h-3 w-3" /> Targets must be strictly ascending.
          </p>
        )}
        {configErrors.some((e) => e.code === 'TARGET_NOT_POSITIVE') && (
          <p className="text-nano text-destructive flex items-center gap-1.5 font-[family-name:var(--font-ledger)] uppercase tracking-[0.08em]">
            <AlertCircle className="h-3 w-3" /> Every target must be above $0.
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {DRIP_TARGET_PRESETS.map((preset) => {
            const active =
              preset.targetsUsd.length === chunkCount &&
              preset.targetsUsd.every((t, i) => t === targetsUsd[i])
            return (
              <button
                key={preset.label}
                onClick={() => onPreset(preset.targetsUsd)}
                className={`px-2.5 py-1.5 border text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.1em] transition-colors ${
                  active
                    ? 'border-seal bg-seal-wash text-seal-text'
                    : 'border-line text-fg-3 hover:border-seal hover:text-seal-text hover:bg-accent'
                }`}
              >
                {preset.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 pt-1">
        <span
          className={`label inline-flex items-center gap-1.5 ${valid ? 'text-[var(--color-arkiv)]' : 'text-fg-5'}`}
          role="status"
        >
          {valid ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" /> Ladder ok —{' '}
              {chunkCount === 1 ? 'single drop' : `${chunkCount} reveals`}
            </>
          ) : (
            'Fix the ladder to continue'
          )}
        </span>
        <button onClick={onNext} disabled={!valid} className="action action-sealed disabled:opacity-30 disabled:pointer-events-none">
          Set the stage files <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

/** Log-scaled bar chart of the target ladder — the shape of the release. */
function TargetStaircase({ targets }: { targets: number[] }) {
  const finite = targets.filter((t) => Number.isFinite(t) && t > 0)
  const min = finite.length ? Math.min(...finite) : 1
  const max = finite.length ? Math.max(...finite) : 1
  const span = Math.log10(Math.max(max / Math.max(min, 1), 1.0001))

  return (
    <figure className="plate crop-marks m-0">
      <div className="flex items-end gap-[3px] h-36 px-4 pt-6 pb-0">
        {targets.map((t, i) => {
          const ok = Number.isFinite(t) && t > 0
          const ratio = ok ? Math.log10(Math.max(t, min) / min) / span : 0
          const heightPct = ok ? 14 + ratio * 86 : 4
          return (
            <div key={i} className="flex-1 h-full flex flex-col items-center justify-end min-w-0">
              <span className="label !tracking-[0.08em] mb-1.5 whitespace-nowrap text-seal-text">
                {ok ? formatUsdCompact(t) : '$·?'}
              </span>
              <div
                className={`w-full transition-[height] duration-500 ease-out ${
                  ok ? 'bg-seal-wash border-t border-seal' : 'bg-surface-sunk border-t border-line-strong'
                }`}
                style={{ height: `${heightPct}%` }}
              />
            </div>
          )
        })}
      </div>
      <div className="border-t border-line px-4 py-2 flex gap-[3px]">
        {targets.map((_, i) => (
          <span
            key={i}
            className="flex-1 text-center text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.12em] text-fg-4 truncate"
          >
            {stageLabel(i, targets.length)}
          </span>
        ))}
      </div>
      <figcaption className="plate-caption mx-4 pb-3">
        <span className="plate-number">Fig. 01</span>
        Unlock ladder, log scale — the cap each rung must clear to reveal its file.
      </figcaption>
    </figure>
  )
}

// ============================================================================
// 02 — The stage files (one slot per rung)
// ============================================================================

function SlatesPanel({
  slates,
  chunkCount,
  targetsUsd,
  dragIndex,
  plans,
  onAccept,
  onClear,
  onNext,
}: {
  slates: (SlateEntry | null)[]
  chunkCount: number
  targetsUsd: number[]
  dragIndex: React.RefObject<number | null>
  plans: DripChunkPlan[] | null
  onAccept: (index: number, file: File | null) => void
  onClear: (index: number) => void
  onNext: () => void
}) {
  const ready = slates.filter((s): s is Extract<SlateEntry, { status: 'ready' }> => s?.status === 'ready')
  const allDone = ready.length === chunkCount
  const totalMb = (ready.reduce((a, s) => a + s.size, 0) / 1024 / 1024).toFixed(1)

  return (
    <div className="space-y-4">
      <div className="panel-double p-5 sm:p-6 space-y-5 crop-marks">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <p className="prose-body text-fine leading-relaxed text-fg-3 !max-w-none">
            One file per rung — a teaser cut, an act, the finale. Each becomes its own encrypted
            upload with its own key.
          </p>
          <span className="datum text-fg-4 tabular-nums whitespace-nowrap">
            {ready.length}/{chunkCount} loaded · {totalMb} MB
          </span>
        </div>

        <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
          {Array.from({ length: chunkCount }, (_, i) => (
            <SlateCard
              key={`${chunkCount}-${i}`}
              index={i}
              total={chunkCount}
              targetUsd={targetsUsd[i] ?? 0}
              entry={slates[i] ?? null}
              dragIndex={dragIndex}
              byteRangeLabel={
                plans && plans[i] ? formatByteRange(plans[i]) : null
              }
              onAccept={(f) => void onAccept(i, f)}
              onClear={() => onClear(i)}
            />
          ))}
        </div>

        {plans && <AllocationStrip plans={plans} />}

        <div className="flex items-center justify-between gap-4 pt-1">
          <span
            className={`label inline-flex items-center gap-1.5 ${allDone ? 'text-[var(--color-arkiv)]' : 'text-fg-5'}`}
            role="status"
          >
            {allDone ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" /> Every rung has its file
              </>
            ) : (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting on{' '}
                {chunkCount - ready.length} file{chunkCount - ready.length === 1 ? '' : 's'}
              </>
            )}
          </span>
          <button onClick={onNext} disabled={!allDone} className="action action-sealed disabled:opacity-30 disabled:pointer-events-none">
            Configure the gate <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function SlateCard({
  index,
  total,
  targetUsd,
  entry,
  dragIndex,
  byteRangeLabel,
  onAccept,
  onClear,
}: {
  index: number
  total: number
  targetUsd: number
  entry: SlateEntry | null
  dragIndex: React.RefObject<number | null>
  byteRangeLabel: string | null
  onAccept: (file: File | null) => void
  onClear: () => void
}) {
  const [hover, setHover] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const ready = entry?.status === 'ready'

  return (
    <div className={`panel crop-marks p-4 space-y-3 ${ready ? 'border-seal-edge' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {entry?.status === 'ready' ? (
            <CheckCircle2 className="stamp-in h-4 w-4 shrink-0 text-[var(--color-arkiv)]" />
          ) : (
            <FileVideo className="h-4 w-4 shrink-0 text-fg-4" aria-hidden />
          )}
          <h4 className="statement-subtitle !text-[1.05rem] truncate">{stageLabel(index, total)}</h4>
        </div>
        <span className="seal-mark !px-2 !py-1 !gap-1 shrink-0">{formatUsdCompact(targetUsd)}</span>
      </div>

      {entry == null || entry.status === 'error' ? (
        <button
          type="button"
          data-testid={`slate-dropzone-${index}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setHover(true)
          }}
          onDragLeave={() => setHover(false)}
          onDrop={(e) => {
            e.preventDefault()
            setHover(false)
            dragIndex.current = index
            onAccept(e.dataTransfer.files?.[0] ?? null)
          }}
          className={`w-full border border-dashed p-5 flex flex-col items-center gap-2 transition-colors duration-200 ${
            hover ? 'border-seal bg-accent' : 'border-line-strong hover:border-seal hover:bg-accent'
          }`}
        >
          <FileVideo className="w-6 h-6 text-seal" aria-hidden />
          <span className="label normal-case tracking-[0.06em] whitespace-normal text-center text-fg-3">
            Drop {stageLabel(index, total).toLowerCase()}&apos;s video
          </span>
          {entry?.status === 'error' && (
            <span className="text-nano text-destructive font-[family-name:var(--font-ledger)] uppercase tracking-[0.08em]">
              {entry.message}
            </span>
          )}
        </button>
      ) : entry.status === 'hashing' ? (
        <div className="panel-sunk hatch px-3 py-4 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-seal-text" />
          <span className="datum text-fg-3">Fingerprinting…</span>
        </div>
      ) : (
        <div className="panel-sunk px-3 py-2.5 space-y-1 relative" data-testid={`slate-ready-${index}`}>
          <p className="text-small text-fg truncate pr-6">{entry.file.name}</p>
          <p className="datum text-fg-4 tabular-nums">
            {(entry.size / 1024 / 1024).toFixed(1)} MB · sha {entry.sha256.slice(0, 10)}…
          </p>
          {byteRangeLabel && (
            <p className="text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.1em] text-fg-5">
              slice {byteRangeLabel}
            </p>
          )}
          <button
            onClick={onClear}
            aria-label={`Replace ${stageLabel(index, total)} file`}
            className="absolute top-2 right-2 p-1 text-fg-5 hover:text-fg-2 transition-colors touch-manipulation"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="video/*,application/octet-stream"
        className="hidden"
        onChange={(e) => onAccept(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}

/** Proportional byte-allocation strip — who owns which slice of the release. */
function AllocationStrip({ plans }: { plans: DripChunkPlan[] }) {
  const total = plans[plans.length - 1]?.endByte ?? 0
  return (
    <div>
      <div className="label mb-2">Slice map</div>
      <div className="flex h-14 border border-line overflow-hidden">
        {plans.map((p) => {
          const pct = total > 0 ? ((p.endByte - p.startByte) / total) * 100 : 100 / plans.length
          return (
            <div
              key={p.dripIndex}
              style={{ width: `${pct}%` }}
              className="relative border-r border-line last:border-r-0 bg-card hover:bg-accent transition-colors group min-w-0"
            >
              <div className="absolute inset-x-0.5 top-1/2 -translate-y-1/2 text-center overflow-hidden">
                <p className="text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.1em] text-fg-3 truncate group-hover:text-seal-text transition-colors">
                  {stageLabel(p.dripIndex, p.dripTotal)}
                </p>
                <p className="text-nano font-[family-name:var(--font-ledger)] tabular-nums text-fg-5 truncate">
                  {((p.endByte - p.startByte) / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatByteRange(plan: { startByte: number; endByte: number }): string {
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1)
  return `${mb(plan.startByte)}–${mb(plan.endByte)} MB`
}

// ============================================================================
// 03 — The gate
// ============================================================================

interface GatePanelProps {
  walletConnected: boolean
  gateMode: 'existing' | 'create'
  onGateMode: (m: 'existing' | 'create') => void
  newTokenName: string
  onNewTokenName: (v: string) => void
  newTokenSymbol: string
  onNewTokenSymbol: (v: string) => void
  creatingToken: boolean
  createError: string | null
  onCreateToken: () => void
  gateTokenInput: string
  onGateTokenInput: (v: string) => void
  resolving: boolean
  onResolve: () => void
  resolveError: string | null
  resolvedToken: { address: string; symbol: string | null } | null
  oracleAddress: string
  onOracle: (v: string) => void
  oracleValid: boolean
  chain: Chain
  onChain: (c: Chain) => void
  threshold: number
  onThreshold: (n: number) => void
  onNext: () => void
}

function GatePanel(props: GatePanelProps) {
  const {
    gateMode,
    onGateMode,
    newTokenName,
    onNewTokenName,
    newTokenSymbol,
    onNewTokenSymbol,
    creatingToken,
    createError,
    onCreateToken,
    gateTokenInput,
    onGateTokenInput,
    resolving,
    onResolve,
    resolveError,
    resolvedToken,
    oracleAddress,
    onOracle,
    oracleValid,
    chain,
    onChain,
    threshold,
    onThreshold,
    onNext,
    walletConnected,
  } = props
  const done = resolvedToken != null && oracleValid && threshold >= 1

  return (
    <div className="panel-double p-5 sm:p-6 space-y-5 crop-marks">
      <p className="prose-body text-fine leading-relaxed text-fg-3">
        Readers hold this token; its live market cap decides which rungs are open. Pick an existing
        bonding-curve token or mint a fresh one — the oracle auto-fills on mint.
      </p>

      <div className="space-y-2">
        <label className="block label mb-2">Gate token (mint.club bonding curve)</label>
        <div className="flex gap-px border border-line w-fit mb-2">
          <button
            onClick={() => onGateMode('existing')}
            className={`px-3 py-1.5 text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.12em] transition-colors ${gateMode === 'existing' ? 'bg-seal-wash text-seal-text' : 'text-fg-4 hover:text-fg-2'}`}
            data-testid="gate-mode-existing"
          >
            Use existing
          </button>
          <button
            onClick={() => onGateMode('create')}
            className={`px-3 py-1.5 text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.12em] transition-colors ${gateMode === 'create' ? 'bg-seal-wash text-seal-text' : 'text-fg-4 hover:text-fg-2'}`}
            data-testid="gate-mode-create"
          >
            Mint new
          </button>
        </div>

        {gateMode === 'create' && (
          <div className="space-y-3 panel-sunk p-4">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={newTokenName}
                onChange={(e) => onNewTokenName(e.target.value)}
                placeholder="Name e.g. Haven Drop"
                className="field-input"
                data-testid="new-token-name"
              />
              <input
                value={newTokenSymbol}
                onChange={(e) => onNewTokenSymbol(e.target.value.toUpperCase())}
                placeholder="Symbol e.g. HAVEN"
                className="field-input uppercase"
                data-testid="new-token-symbol"
              />
            </div>
            <button
              onClick={onCreateToken}
              disabled={creatingToken || !newTokenName.trim() || !newTokenSymbol.trim() || !walletConnected}
              className="action action-sealed w-full py-3 disabled:opacity-40 disabled:pointer-events-none"
              data-testid="create-token-btn"
            >
              {creatingToken ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Minting…
                </>
              ) : (
                'Mint token on ' + (chain === 'BaseMainnet' ? 'base' : chain.toLowerCase())
              )}
            </button>
            {!walletConnected && (
              <p className="text-nano text-seal-text flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3" /> Connect a wallet to mint.
              </p>
            )}
            {createError && (
              <p className="text-nano text-destructive font-[family-name:var(--font-ledger)] uppercase tracking-[0.08em]">
                {createError}
              </p>
            )}
            <p className="label !whitespace-normal normal-case tracking-[0.02em] leading-relaxed">
              Creates ERC20 via mint.club bonding curve; oracle auto-filled to Bond contract. No
              copy-paste needed.
            </p>
          </div>
        )}

        {gateMode === 'existing' && (
          <div className="flex gap-2">
            <input
              value={gateTokenInput}
              onChange={(e) => onGateTokenInput(e.target.value)}
              placeholder="Symbol or 0x… address"
              className="field-input flex-1"
              data-testid="gate-token-input"
            />
            <button
              onClick={onResolve}
              disabled={!gateTokenInput.trim() || resolving}
              className="action action-keyline px-4 min-h-[44px] disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Resolve'}
            </button>
          </div>
        )}

        {resolvedToken && (
          <p
            className="seal-mark stamp-in w-fit !border-[var(--color-arkiv)] !text-[var(--color-arkiv)] !bg-transparent"
            data-testid="gate-token-resolved"
          >
            <CheckCircle2 className="h-3 w-3" />
            {resolvedToken.symbol ?? 'token'} · {shortAddr(resolvedToken.address)}
          </p>
        )}

        {resolvedToken && (
          <div className="space-y-2 pt-1">
            <label className="block label mb-2">Chainlink USD price feed (oracle) for this token</label>
            <input
              value={oracleAddress}
              onChange={(e) => onOracle(e.target.value)}
              placeholder="0x… AggregatorV3 proxy address"
              className="field-input"
              data-testid="oracle-address-input"
            />
            {oracleAddress.trim().length > 0 && !oracleValid && (
              <p className="text-nano font-[family-name:var(--font-ledger)] tracking-[0.04em] text-seal-text leading-relaxed">
                Must be a 42-char 0x address — the canister calls latestRoundData() on it and fails
                closed on bad feeds.
              </p>
            )}
          </div>
        )}

        {resolveError && (
          <p className="text-nano text-destructive flex items-center gap-1.5 font-[family-name:var(--font-ledger)] uppercase tracking-[0.08em]">
            <AlertCircle className="h-3 w-3" /> {resolveError}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block label mb-2">Gate chain</label>
          <select
            value={chain}
            onChange={(e) => onChain(e.target.value as Chain)}
            className="field-input cursor-pointer"
          >
            {VALID_CHAINS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block label mb-2">Holder threshold</label>
          <input
            inputMode="numeric"
            value={String(threshold)}
            onChange={(e) => onThreshold(Math.max(1, Number(e.target.value.replace(/[^0-9]/g, '')) || 1))}
            className="field-input tabular-nums"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 pt-1">
        <span
          className={`label inline-flex items-center gap-1.5 ${done ? 'text-[var(--color-arkiv)]' : 'text-fg-5'}`}
          role="status"
        >
          {done ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" /> Gate armed
            </>
          ) : (
            'Resolve a token + oracle to continue'
          )}
        </span>
        <button onClick={onNext} disabled={!done} className="action action-sealed disabled:opacity-30 disabled:pointer-events-none">
          Review &amp; seal <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// 04 — Seal the plan
// ============================================================================

function SealPanel({
  title,
  onTitle,
  chunkCount,
  targetsUsd,
  slates,
  plans,
  resolvedToken,
  chain,
  threshold,
  marketCapUsd,
  canSeal,
  sealing,
  onSeal,
}: {
  title: string
  onTitle: (v: string) => void
  chunkCount: number
  targetsUsd: number[]
  slates: (SlateEntry | null)[]
  plans: DripChunkPlan[] | null
  resolvedToken: { address: string; symbol: string | null } | null
  chain: Chain
  threshold: number
  marketCapUsd: number | null | undefined
  canSeal: boolean
  sealing: boolean
  onSeal: () => void
}) {
  const ready = slates.filter((s): s is Extract<SlateEntry, { status: 'ready' }> => s?.status === 'ready')

  return (
    <div className="panel-double p-5 sm:p-6 space-y-6 crop-marks">
      <div>
        <label className="block label mb-2">Release title</label>
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="e.g. Atlas Skies — Director's Cut"
          className="field-input !text-base"
          data-testid="release-title-input"
        />
      </div>

      {/* Manifest — specimen register of the exact filing */}
      <div>
        <div className="label mb-2">Stage manifest</div>
        <table className="specimen" data-testid="seal-manifest">
          <thead>
            <tr>
              <th>Rung</th>
              <th>File</th>
              <th className="!text-right">Size</th>
              <th className="!text-right">Unlocks @</th>
            </tr>
          </thead>
          <tbody>
            {ready.map((s, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap">{stageLabel(i, chunkCount)}</td>
                <td className="max-w-[180px] truncate">{s.file.name}</td>
                <td className="text-right tabular-nums">{(s.size / 1024 / 1024).toFixed(1)} MB</td>
                <td className="text-right tabular-nums text-seal-text">
                  {formatUsdCompact(targetsUsd[i] ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {resolvedToken && (
          <p className="mt-3 text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.1em] text-fg-4">
            gate {resolvedToken.symbol ?? shortAddr(resolvedToken.address)} · {chain} · ≥{threshold}{' '}
            holder{threshold === 1 ? '' : 's'} · oracle {shortAddr(resolvedToken.address)}
          </p>
        )}
      </div>

      {plans && (
        <MarketPreview plans={plans} marketCapUsd={marketCapUsd} hasToken={Boolean(resolvedToken)} />
      )}

      <div className="space-y-3">
        <button
          onClick={onSeal}
          disabled={!canSeal}
          data-testid="create-plan-button"
          className="action action-sealed w-full py-4 min-h-[52px] disabled:opacity-30 disabled:pointer-events-none"
        >
          {sealing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Sealing…
            </>
          ) : (
            <>Seal the {chunkCount}-stage plan → open the uploader</>
          )}
        </button>
        <p className="label !whitespace-normal normal-case tracking-[0.02em] leading-relaxed">
          Sealing freezes each stage&apos;s byte range, a SHA-256 fingerprint per file and the shared
          drip id. Nothing uploads yet — every stage publishes separately, whenever you&apos;re ready.
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

function shortAddr(value: string): string {
  if (!value) return ''
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
}
