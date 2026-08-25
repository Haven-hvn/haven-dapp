'use client'

/**
 * Publish — staged V4 market-cap-gated drip uploader (web only).
 *
 * Workflow per unlock stage ("first mkt cap, then second…"):
 *
 *   1. Create a drip plan once: drop the film, pick the target ladder and
 *      gate. The plan freezes byte ranges + a SHA-256 commitment + a shared
 *      `dripId`, and is saved locally as a resumable session.
 *   2. Publish stages ONE BY ONE. Each stage re-verifies the source hash,
 *      encrypts with its own fresh AES key, pins to Filecoin, IBE-wraps the
 *      key to its own VetKD v4 identity and indexes one Arkiv entity.
 *   3. Any wallet can continue a session (hand-off kit manifest + original
 *      film) — no secrets are ever shared between uploaders.
 *
 * Crypto invariants kept intact: strictly ascending targets across ALL
 * stages, contiguous ranges committed up-front, per-stage independent keys
 * zeroized after wrapping, epoch frozen per stage into metadata readers
 * replay verbatim.
 *
 * @module app/publish/page
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAccount, useWalletClient } from 'wagmi'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileVideo,
  Loader2,
  PartyPopper,
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
import type { PublishStageResult } from '@/lib/v4/arkiv-publish'
import {
  commitStageResult,
  completedStageCount,
  createDripSession,
  deleteDripSession,
  isDripComplete,
  listDripSessions,
  nextPublishableIndex,
  saveDripSession,
  type DripSession,
} from '@/lib/v4/drip-session'
import { resolveMintToken } from '@/lib/v4/market-cap'
import { useMarketCap, evaluateDripUnlock } from '@/hooks/useMarketCap'
import { useToast } from '@/hooks/useToast'
import { ConnectButton } from '@/components/auth/ConnectButton'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { DripRings } from '@/components/video/DripRings'
import { StageChecklist } from '@/components/publish/StageChecklist'
import { StageRunner } from '@/components/publish/StageRunner'
import { HandoffPanel } from '@/components/publish/HandoffPanel'
import { DripSessionList } from '@/components/publish/DripSessionList'
import { VALID_CHAINS } from 'haven-aol'
import type { Chain } from 'haven-aol'

type View = 'browse' | 'create' | 'session'

const ORACLE_ADDR_RE = /^0x[0-9a-fA-F]{40}$/

export default function PublishPage() {
  const { address } = useAccount()
  const toast = useToast()

  const [view, setView] = useState<View>('browse')
  const [sessions, setSessions] = useState<DripSession[]>([])
  const [session, setSession] = useState<DripSession | null>(null)

  /** Source bytes held in memory between plan creation and stage uploads. */
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null)
  const creating = useRef(false)

  // Create-flow state ---------------------------------------------------------
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [chunkCount, setChunkCount] = useState(3)
  const [targetsUsd, setTargetsUsd] = useState<number[]>([1_000_000, 5_000_000, 10_000_000])
  const [gateTokenInput, setGateTokenInput] = useState('')
  const [resolvedToken, setResolvedToken] = useState<{ address: string; symbol: string | null } | null>(
    null
  )
  const [oracleAddress, setOracleAddress] = useState('')
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [chain, setChain] = useState<Chain>('BaseMainnet')
  const [threshold, setThreshold] = useState(1)
  const inputRef = useRef<HTMLInputElement>(null)

  // Session list refresh on mount (client-only storage).
  useEffect(() => {
    setSessions(listDripSessions())
  }, [])

  // Gate resolution + live cap ------------------------------------------------
  const activeGateToken =
    session?.gate.gateToken ?? resolvedToken?.address ?? ''
  const networkHint = (session ? session.gate.chain : chain) === 'EthMainnet' ? 'ethereum' : 'base'
  const { marketCapUsd } = useMarketCap(activeGateToken || null, networkHint)

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

  // Create-view planning --------------------------------------------------------
  const config = useMemo(() => ({ chunkCount, targetsUsd }), [chunkCount, targetsUsd])
  const configErrors = useMemo(() => validateDripConfig(config), [config])
  const draftPlans = useMemo(() => {
    if (!file) return null
    const result = planDripChunks(file.size, config)
    return result.ok ? result.chunks : null
  }, [file, config])
  const oracleValid = ORACLE_ADDR_RE.test(oracleAddress.trim())
  const canCreate =
    file != null &&
    resolvedToken != null &&
    oracleValid &&
    configErrors.length === 0 &&
    draftPlans != null &&
    !creating.current

  // Session-view derived state -----------------------------------------------
  const nextIndex = session ? nextPublishableIndex(session) : null
  const complete = session ? isDripComplete(session) : false
  const firstEntityKey = useMemo(
    () => session?.stages.find((s) => s.result)?.result?.entityKey ?? undefined,
    [session]
  )

  // Handlers -------------------------------------------------------------------
  const acceptFile = useCallback(
    (f: File | null) => {
      if (!f) return
      setFile(f)
      if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''))
    },
    [title]
  )

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

  const startNewDrip = useCallback(() => {
    setFile(null)
    setResolvedToken(null)
    setGateTokenInput('')
    setOracleAddress('')
    setResolveError(null)
    setView('create')
  }, [])

  const handleCreatePlan = useCallback(async () => {
    if (!file || !resolvedToken || creating.current) return
    if (configErrors.length > 0 || !oracleValid) return
    creating.current = true
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const created = await createDripSession({
        fileName: file.name,
        mimeType: file.type || 'video/mp4',
        source: bytes,
        config: { chunkCount, targetsUsd },
        gate: {
          chain,
          gateToken: resolvedToken.address,
          gateThreshold: threshold,
          oracleAddress: oracleAddress.trim(),
        },
        title: title.trim() || 'Untitled drip',
      })
      if (!created) {
        toast.showError('Could not lock that plan — check the ladder and gate.')
        return
      }
      saveDripSession(created)
      setSessions(listDripSessions())
      setSourceBytes(bytes)
      setSession(created)
      setView('session')
      toast.showSuccess(
        `Plan locked — ${created.stages.length} stages. Publish stage 1 whenever you're ready.`
      )
    } finally {
      creating.current = false
    }
  }, [
    file,
    resolvedToken,
    configErrors.length,
    oracleValid,
    chunkCount,
    targetsUsd,
    chain,
    threshold,
    oracleAddress,
    title,
    toast,
  ])

  const openSession = useCallback((s: DripSession, withBytes: Uint8Array | null) => {
    setSession(s)
    setSourceBytes(withBytes)
    setView('session')
  }, [])

  const resumeSession = useCallback((s: DripSession) => {
    // Source must be re-attached + hash-verified before anything uploads.
    openSession(s, null)
  }, [openSession])

  const importSession = useCallback(
    (s: DripSession) => {
      saveDripSession(s)
      setSessions(listDripSessions())
      openSession(s, null)
    },
    [openSession]
  )

  const removeSession = useCallback((dripId: string) => {
    deleteDripSession(dripId)
    setSessions(listDripSessions())
  }, [])

  const handleStageComplete = useCallback(
    (result: PublishStageResult) => {
      if (!session || nextIndex == null) return
      const updated = commitStageResult(session, nextIndex, {
        ...result,
        publishedBy: address ?? '',
        publishedAtMs: Date.now(),
      })
      if (!updated) {
        toast.showError('Stage recorded out of order — reload before continuing.')
        return
      }
      saveDripSession(updated)
      setSession(updated)
      setSessions(listDripSessions())
      if (isDripComplete(updated)) {
        toast.showSuccess('Final stage published — the full drip is live.')
      }
    },
    [session, nextIndex, address, toast]
  )

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0F] via-[#0d1117] to-[#0A0A0F]" />

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/[0.06] bg-[#0A0A0F]/50 backdrop-blur-xl sticky top-0">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {view === 'browse' ? (
              <Link href="/" aria-label="Back to home" className="text-white/70 hover:text-white transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            ) : (
              <button
                onClick={() => setView('browse')}
                aria-label="Back to drips"
                className="text-white/70 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <img src="/favicon.ico" alt="Haven" className="w-8 h-8 rounded-lg" />
            <span className="text-lg font-semibold tracking-tight">Publish · Drip</span>
            {session && (
              <span className="hidden sm:inline-flex items-center gap-1.5 ml-2 text-xs text-white/40">
                <DripRings unlocked={completedStageCount(session)} total={session.stages.length} size={14} />
                {completedStageCount(session)}/{session.stages.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ConnectButton />
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-3xl mx-auto px-6 py-10 space-y-8">
        {view === 'browse' && (
          <>
            <IntroCopy />
            <DripSessionList
              sessions={sessions}
              onResume={resumeSession}
              onDelete={removeSession}
              onCreate={startNewDrip}
              onImport={importSession}
            />
          </>
        )}

        {view === 'create' && (
          <>
            {/* Step 1 — Drop */}
            <Section step={1} title="Drop your film">
              {!file ? (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    acceptFile(e.dataTransfer.files?.[0] ?? null)
                  }}
                  data-testid="publish-dropzone"
                  className="w-full rounded-2xl border-2 border-dashed border-white/15 hover:border-[#00F5FF]/50 bg-white/[0.02] hover:bg-white/[0.04] transition-all p-12 flex flex-col items-center gap-4"
                >
                  <FileVideo className="w-10 h-10 text-[#00F5FF]" />
                  <span className="text-white/70">Drag & drop your video, or click to browse</span>
                  <span className="text-xs text-white/40">
                    Encrypted locally · pinned to Filecoin · indexed on Arkiv
                  </span>
                </button>
              ) : (
                <div className="flex items-center gap-4 rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                  <FileVideo className="w-8 h-8 text-[#00F5FF] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Title"
                      className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-white/30"
                    />
                    <p className="text-xs text-white/40 mt-0.5">
                      {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setFile(null)
                      inputRef.current?.click()
                    }}
                    className="text-xs text-white/50 hover:text-white transition-colors"
                  >
                    Replace
                  </button>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="video/*,application/octet-stream"
                className="hidden"
                onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
              />
            </Section>

            {/* Step 2 — Configure drip */}
            <Section step={2} title="Configure the unlock ladder">
              <div className="space-y-5 rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
                <p className="text-xs leading-relaxed text-white/45">
                  Each rung is a separate upload with its own key — release the teaser today at{' '}
                  {'$'}1M cap, let a teammate ship Act I next week, and so on.
                </p>

                <div>
                  <label className="flex items-center justify-between text-sm text-white/60 mb-2">
                    <span>Stages</span>
                    <span className="font-mono text-[#00F5FF]">{chunkCount}</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={MAX_DRIP_CHUNKS}
                    value={chunkCount}
                    onChange={(e) => setChunkCountSafe(Number(e.target.value))}
                    className="w-full accent-[#00F5FF]"
                    data-testid="drip-chunk-slider"
                  />
                </div>

                <div className="space-y-2" data-testid="drip-target-list">
                  {targetsUsd.map((t, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-xs uppercase tracking-wide text-white/40 truncate">
                        {stageLabel(i, targetsUsd.length)}
                      </span>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">$</span>
                        <input
                          inputMode="numeric"
                          value={String(t)}
                          onChange={(e) => setTarget(i, e.target.value)}
                          className="w-full rounded-lg bg-black/30 border border-white/10 focus:border-[#00F5FF]/50 outline-none pl-7 pr-3 py-1.5 text-sm font-mono"
                        />
                      </div>
                      <span className="w-12 text-right text-xs text-white/40">{formatUsdCompact(t)}</span>
                    </div>
                  ))}
                  {configErrors.some((e) => e.code === 'TARGETS_NOT_ASCENDING') && (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Targets must be strictly ascending.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {DRIP_TARGET_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => applyPreset(preset.targetsUsd)}
                        className="px-2.5 py-1 rounded-full border border-white/10 text-xs text-white/50 hover:border-[#00F5FF]/40 hover:text-white transition-colors"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Gate token */}
                <div className="space-y-2">
                  <label className="block text-sm text-white/60">
                    Gate token (mint.club bonding curve)
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={gateTokenInput}
                      onChange={(e) => {
                        setGateTokenInput(e.target.value)
                        setResolvedToken(null)
                        setOracleAddress('')
                        setResolveError(null)
                      }}
                      placeholder="Symbol or 0x… address"
                      className="flex-1 rounded-lg bg-black/30 border border-white/10 focus:border-[#00F5FF]/50 outline-none px-3 py-1.5 text-sm font-mono"
                      data-testid="gate-token-input"
                    />
                    <button
                      onClick={() => void handleResolveToken()}
                      disabled={!gateTokenInput.trim() || resolving}
                      className="px-3 py-1.5 rounded-lg border border-white/10 text-sm text-white/70 hover:border-[#00F5FF]/40 hover:text-white disabled:opacity-40 transition-colors"
                    >
                      {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Resolve'}
                    </button>
                  </div>
                  {resolvedToken && (
                    <p className="text-xs text-green-400 flex items-center gap-1" data-testid="gate-token-resolved">
                      <CheckCircle2 className="h-3 w-3" />
                      {resolvedToken.symbol ?? 'token'} · {shortAddr(resolvedToken.address)}
                    </p>
                  )}
                  {resolvedToken && (
                    <div className="space-y-2 pt-1">
                      <label className="block text-xs text-white/50">
                        Chainlink USD price feed (oracle) for this token
                      </label>
                      <input
                        value={oracleAddress}
                        onChange={(e) => setOracleAddress(e.target.value)}
                        placeholder="0x… AggregatorV3 proxy address"
                        className="w-full rounded-lg bg-black/30 border border-white/10 focus:border-[#00F5FF]/50 outline-none px-3 py-1.5 text-sm font-mono"
                        data-testid="oracle-address-input"
                      />
                      {oracleAddress.trim().length > 0 && !oracleValid && (
                        <p className="text-xs text-amber-400/80">
                          Must be a 42-char 0x address — the canister calls latestRoundData() on it
                          and fails closed on bad feeds.
                        </p>
                      )}
                    </div>
                  )}
                  {resolveError && (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {resolveError}
                    </p>
                  )}
                </div>

                {/* Chain + threshold */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-white/60 mb-2">Gate chain</label>
                    <select
                      value={chain}
                      onChange={(e) => setChain(e.target.value as Chain)}
                      className="w-full rounded-lg bg-black/30 border border-white/10 outline-none px-3 py-1.5 text-sm"
                    >
                      {VALID_CHAINS.map((c) => (
                        <option key={c} value={c} className="bg-[#0A0A0F]">
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-2">Holder threshold</label>
                    <input
                      inputMode="numeric"
                      value={String(threshold)}
                      onChange={(e) =>
                        setThreshold(Math.max(1, Number(e.target.value.replace(/[^0-9]/g, '')) || 1))
                      }
                      className="w-full rounded-lg bg-black/30 border border-white/10 outline-none px-3 py-1.5 text-sm font-mono"
                    />
                  </div>
                </div>
              </div>
            </Section>

            {/* Step 3 — Live preview */}
            {draftPlans && (
              <Section step={3} title="Live preview">
                <MarketPreview
                  plans={draftPlans}
                  marketCapUsd={marketCapUsd}
                  hasToken={Boolean(activeGateToken)}
                />
              </Section>
            )}

            {/* Step 4 — Lock the plan */}
            <Section step={4} title="Lock the plan">
              <button
                onClick={() => void handleCreatePlan()}
                disabled={!canCreate}
                data-testid="create-plan-button"
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#00F5FF] to-[#FF00E5] text-[#0A0A0F] font-semibold disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-[#00F5FF]/20"
              >
                Lock in {chunkCount}-stage plan → open stage uploader
              </button>
              <p className="mt-3 text-xs text-white/30 leading-relaxed">
                Locking freezes the byte ranges, a SHA-256 commitment of your file and the shared
                drip id. Nothing is uploaded yet — each stage publishes separately afterwards.
              </p>
            </Section>
          </>
        )}

        {view === 'session' && session && (
          <>
            {/* Header */}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold truncate">{session.title}</h2>
                  <p className="text-xs text-white/35 mt-0.5">
                    {session.fileName} · drip {shortAddr(session.dripId)} · gate{' '}
                    {shortAddr(session.gate.gateToken)} on {session.gate.chain}
                  </p>
                </div>
                <DripRings
                  unlocked={completedStageCount(session)}
                  total={session.stages.length}
                  size={40}
                />
              </div>
              {complete && firstEntityKey && (
                <Link
                  href={`/watch?v=${firstEntityKey}`}
                  className="inline-flex items-center gap-1 mt-3 text-sm text-[#00F5FF] hover:underline"
                >
                  Open the release <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>

            {/* Checklist */}
            <section>
              <h2 className="flex items-baseline gap-3 mb-3">
                <span className="font-mono text-xs text-[#00F5FF]">01</span>
                <span className="text-lg font-semibold">Unlock checklist</span>
              </h2>
              <StageChecklist stages={session.stages} />
            </section>

            {/* Runner or completion */}
            <section>
              <h2 className="flex items-baseline gap-3 mb-3">
                <span className="font-mono text-xs text-[#00F5FF]">02</span>
                <span className="text-lg font-semibold">
                  {complete ? 'All stages live' : `Upload ${stageLabel(nextIndex ?? 0, session.stages.length)}`}
                </span>
              </h2>
              {complete || nextIndex == null ? (
                <CompletionCard session={session} />
              ) : (
                <StageRunner
                  key={session.stages[nextIndex].plan.dripIndex}
                  plan={session.stages[nextIndex].plan}
                  gate={{ ...session.gate, title: session.title }}
                  mimeType={session.mimeType}
                  sourceSha256={session.sourceSha256}
                  fileSize={session.fileSize}
                  initialSource={sourceBytes}
                  onComplete={handleStageComplete}
                />
              )}
            </section>

            {/* Live preview */}
            <section>
              <h2 className="flex items-baseline gap-3 mb-3">
                <span className="font-mono text-xs text-[#00F5FF]">03</span>
                <span className="text-lg font-semibold">Live market</span>
              </h2>
              <MarketPreview
                plans={session.stages.map((s) => s.plan)}
                marketCapUsd={marketCapUsd}
                hasToken={Boolean(activeGateToken)}
              />
            </section>

            {/* Handoff */}
            <HandoffPanel session={session} firstEntityKey={firstEntityKey} onImported={importSession} />
          </>
        )}
      </main>
    </div>
  )
}

// ============================================================================
// Local components
// ============================================================================

function IntroCopy() {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">Release by market-cap rungs</h1>
      <p className="text-sm text-white/45 leading-relaxed">
        Split one film into per-unlock stages — teaser at $1M cap, act at $5M, finale at $10M —
        then upload them one at a time, from any wallet, with tick-mark tracking and hash-verified
        hand-offs.
      </p>
    </div>
  )
}

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="flex items-baseline gap-3 mb-3">
        <span className="font-mono text-xs text-[#00F5FF]">0{step}</span>
        <span className="text-lg font-semibold">{title}</span>
      </h2>
      {children}
    </section>
  )
}

/** Live cap + per-stage unlock rows shared by create preview & session view. */
function MarketPreview({
  plans,
  marketCapUsd: liveCap,
  hasToken,
}: {
  plans: DripChunkPlan[]
  marketCapUsd: number | null | undefined
  hasToken: boolean
}) {
  const marketCapUsd = liveCap ?? null
  const nextUnlock =
    plans.find((p) => p.marketCapTargetUsd > (marketCapUsd ?? Infinity)) ?? plans[plans.length - 1]
  const showNextUnlock =
    nextUnlock && !evaluateDripUnlock(nextUnlock.marketCapTargetUsd, marketCapUsd).unlocked

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 space-y-4" data-testid="market-preview">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wide">Market cap</p>
          <p className="text-2xl font-semibold">
            {hasToken ? (
              marketCapUsd != null ? (
                formatUsdCompact(marketCapUsd)
              ) : (
                <span className="text-white/40">—</span>
              )
            ) : (
              <span className="text-white/40">Resolve a token first</span>
            )}
          </p>
        </div>
        {showNextUnlock && (
          <div className="text-right">
            <p className="text-xs text-white/40 uppercase tracking-wide">Next unlock</p>
            <p className="text-lg font-medium text-[#FF00E5]">
              {formatUsdCompact(nextUnlock.marketCapTargetUsd)}{' '}
              <span className="text-sm text-white/50">
                {progressPct(marketCapUsd, nextUnlock.marketCapTargetUsd)}% to go
              </span>
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {plans.map((plan) => {
          const { unlocked } = evaluateDripUnlock(plan.marketCapTargetUsd, marketCapUsd)
          return (
            <div key={plan.dripIndex} className="flex items-center gap-3 text-sm">
              <DripRings unlocked={unlocked ? 1 : 0} total={1} size={16} />
              <span className="flex-1 text-white/60">
                Stage {plan.dripIndex + 1} · {stageLabel(plan.dripIndex, plan.dripTotal)}
              </span>
              <span className={unlocked ? 'text-green-400' : 'text-white/70'}>
                {formatUsdCompact(plan.marketCapTargetUsd)}
                {unlocked && ' ✓'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CompletionCard({ session }: { session: DripSession }) {
  return (
    <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-5 space-y-3" data-testid="publish-success">
      <p className="text-sm text-green-400 font-medium flex items-center gap-2">
        <PartyPopper className="h-4 w-4" /> All {session.stages.length} stages published — the drip is fully indexed.
      </p>
      <ul className="space-y-1">
        {session.stages.map((s) =>
          s.result ? (
            <li key={s.plan.dripIndex} className="text-xs text-white/50 flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
              {stageLabel(s.plan.dripIndex, session.stages.length)} · entity {shortAddr(s.result.entityKey)} · by{' '}
              {shortAddr(s.result.publishedBy)}
            </li>
          ) : null
        )}
      </ul>
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

function progressPct(current: number | null, target: number): number {
  if (current == null || !Number.isFinite(current)) return 0
  return Math.min(99, Math.max(0, Math.floor((current / target) * 100)))
}

function shortAddr(value: string): string {
  if (!value) return ''
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
}