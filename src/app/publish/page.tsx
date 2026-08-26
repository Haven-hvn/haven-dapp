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
import { createMintClubToken } from '@/lib/v4/mint-create'
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
  const { data: walletClient } = useWalletClient()
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
  const [gateMode, setGateMode] = useState<'existing'|'create'>('existing')
  const [newTokenName, setNewTokenName] = useState('')
  const [newTokenSymbol, setNewTokenSymbol] = useState('')
  const [creatingToken, setCreatingToken] = useState(false)
  const [createError, setCreateError] = useState<string|null>(null)
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
  const havenChainToMintNetwork: Record<string,string> = { EthMainnet: 'ethereum', EthSepolia: 'sepolia', BaseMainnet: 'base', ArbitrumOne: 'arbitrum', OptimismMainnet: 'optimism' }
  const networkHint = havenChainToMintNetwork[(session ? session.gate.chain : chain) as string] ?? 'base'
  const { marketCapUsd } = useMarketCap(activeGateToken || null, networkHint)

  const handleCreateToken = useCallback(async () => {
    if (!walletClient) { setCreateError('Connect wallet first'); return }
    setCreatingToken(true); setCreateError(null)
    const r = await createMintClubToken({ walletClient: walletClient as any, network: networkHint, name: newTokenName, symbol: newTokenSymbol })
    setCreatingToken(false)
    if (r.address) { setResolvedToken({ address: r.address, symbol: newTokenSymbol }); const bond = await (await import('@/lib/v4/market-cap')).getBondContractAddress(networkHint); if (bond) setOracleAddress(bond); toast.showSuccess('Token created: '+r.address) } else setCreateError(r.error ?? 'Create failed')
  }, [walletClient, networkHint, newTokenName, newTokenSymbol, toast])

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
    <div className="min-h-dvh bg-surface text-fg relative overflow-x-clip">

      {/* Nav */}
      <nav className="masthead">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between safe-area-x">
          <div className="flex items-center gap-3">
            {view === 'browse' ? (
              <Link href="/" aria-label="Back to home" className="text-fg-3 hover:text-seal-text transition-colors p-2 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            ) : (
              <button
                onClick={() => setView('browse')}
                aria-label="Back to drips"
                className="text-fg-3 hover:text-seal-text transition-colors p-2 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <span className="wordmark">Publish</span>
            <span className="lockup-rule" aria-hidden="true" />
            <span className="label hidden sm:block">Drip</span>
            {session && (
              <span className="hidden sm:inline-flex items-center gap-2 ml-2 datum text-fg-3 tabular-nums">
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

      <main className="relative max-w-3xl mx-auto px-6 py-10 space-y-10 safe-area-x">
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
                  className="w-full border border-dashed border-line-strong hover:border-seal bg-card hover:bg-accent transition-colors duration-300 p-12 flex flex-col items-center gap-4 crop-marks"
                >
                  <FileVideo className="w-9 h-9 text-seal" aria-hidden />
                  <span className="statement-subtitle text-fg">Drag & drop your video, or click to browse</span>
                  <span className="label text-fg-4 normal-case tracking-[0.06em] whitespace-normal text-center">
                    Encrypted locally · pinned to Filecoin · indexed on Arkiv
                  </span>
                </button>
              ) : (
                <div className="flex items-center gap-4 border border-line bg-card p-4 panel">
                  <FileVideo className="w-7 h-7 text-seal shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Title"
                      className="w-full bg-transparent statement-subtitle outline-none placeholder:text-fg-5 focus-visible:outline-none"
                    />
                    <p className="datum text-fg-4 mt-0.5 truncate">
                      {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setFile(null)
                      inputRef.current?.click()
                    }}
                    className="label link-rule shrink-0"
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
              <div className="space-y-5 panel p-5">
                <p className="prose-body text-fine leading-relaxed text-fg-3">
                  Each rung is a separate upload with its own key — release the teaser today at{' '}
                  {'$'}1M cap, let a teammate ship Act I next week, and so on.
                </p>

                <div>
                  <label className="flex items-center justify-between label mb-3">
                    <span className="normal-case tracking-[0.04em] text-[0.8125rem] font-[family-name:var(--font-institution)]">Stages</span>
                    <span className="datum !text-base text-seal-text">{chunkCount}</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={MAX_DRIP_CHUNKS}
                    value={chunkCount}
                    onChange={(e) => setChunkCountSafe(Number(e.target.value))}
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
                          onChange={(e) => setTarget(i, e.target.value)}
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
                  <div className="flex flex-wrap gap-2 pt-1">
                    {DRIP_TARGET_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => applyPreset(preset.targetsUsd)}
                        className="px-2.5 py-1.5 border border-line text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.1em] text-fg-3 hover:border-seal hover:text-seal-text hover:bg-accent transition-colors"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Gate token */}
                <div className="space-y-2">
                  <label className="block label mb-2">
                    Gate token (mint.club bonding curve)
                  </label>
                  <div className="flex gap-px border border-line w-fit mb-2">
                    <button onClick={()=>setGateMode('existing')} className={`px-3 py-1.5 text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.12em] transition-colors ${gateMode==='existing'?'bg-seal-wash text-seal-text':'text-fg-4 hover:text-fg-2'}`}  data-testid="gate-mode-existing">Use existing</button>
                    <button onClick={()=>setGateMode('create')} className={`px-3 py-1.5 text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.12em] transition-colors ${gateMode==='create'?'bg-seal-wash text-seal-text':'text-fg-4 hover:text-fg-2'}`}  data-testid="gate-mode-create">Mint new</button>
                  </div>
                  {gateMode==='create' && (
                    <div className="space-y-3 panel-sunk p-4">
                      <div className="grid grid-cols-2 gap-2">
                        <input value={newTokenName} onChange={e=>setNewTokenName(e.target.value)} placeholder="Name e.g. Haven Drop" className="border border-line-strong bg-transparent px-3 py-1.5 text-small outline-none focus:border-seal" data-testid="new-token-name"/>
                        <input value={newTokenSymbol} onChange={e=>setNewTokenSymbol(e.target.value.toUpperCase())} placeholder="Symbol e.g. HAVEN" className="border border-line-strong bg-transparent px-3 py-1.5 text-small font-[family-name:var(--font-ledger)] uppercase outline-none focus:border-seal" data-testid="new-token-symbol"/>
                      </div>
                      <button onClick={()=>void handleCreateToken()} disabled={creatingToken || !newTokenName.trim() || !newTokenSymbol.trim()} className="action action-sealed w-full py-3 disabled:opacity-40 disabled:pointer-events-none" data-testid="create-token-btn">{creatingToken ? 'Minting…' : 'Mint token on '+networkHint}</button>
                      {createError && <p className="text-nano text-destructive font-[family-name:var(--font-ledger)] uppercase tracking-[0.08em]">{createError}</p>}
                      <p className="label !whitespace-normal normal-case tracking-[0.02em] leading-relaxed">Creates ERC20 via mint.club bonding curve; oracle auto-filled to Bond contract. No copy-paste needed.</p>
                    </div>
                  )}
                  {gateMode==='existing' && (<div className="flex gap-2">
                    <input
                      value={gateTokenInput}
                      onChange={(e) => {
                        setGateTokenInput(e.target.value)
                        setResolvedToken(null)
                        setOracleAddress('')
                        setResolveError(null)
                      }}
                      placeholder="Symbol or 0x… address"
                      className="flex-1 bg-transparent border border-line-strong focus:border-seal outline-none px-3 py-1.5 text-small font-[family-name:var(--font-ledger)] min-h-[44px]"
                      data-testid="gate-token-input"
                    />
                    <button
                      onClick={() => void handleResolveToken()}
                      disabled={!gateTokenInput.trim() || resolving}
                      className="action action-keyline px-4 min-h-[44px] disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    >
                      {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Resolve'}
                    </button>
                  </div>)}
                  {resolvedToken && (
                    <p className="inline-flex items-center gap-1.5 text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.1em] text-[var(--color-arkiv)] border border-line px-2 py-1" data-testid="gate-token-resolved">
                      <CheckCircle2 className="h-3 w-3" />
                      {resolvedToken.symbol ?? 'token'} · {shortAddr(resolvedToken.address)}
                    </p>
                  )}
                  {resolvedToken && (
                    <div className="space-y-2 pt-1">
                      <label className="block label mb-2">
                        Chainlink USD price feed (oracle) for this token
                      </label>
                      <input
                        value={oracleAddress}
                        onChange={(e) => setOracleAddress(e.target.value)}
                        placeholder="0x… AggregatorV3 proxy address"
                        className="w-full bg-transparent border border-line-strong focus:border-seal outline-none px-3 py-1.5 text-small font-[family-name:var(--font-ledger)] min-h-[44px]"
                        data-testid="oracle-address-input"
                      />
                      {oracleAddress.trim().length > 0 && !oracleValid && (
                        <p className="text-nano font-[family-name:var(--font-ledger)] tracking-[0.04em] text-seal-text leading-relaxed">
                          Must be a 42-char 0x address — the canister calls latestRoundData() on it
                          and fails closed on bad feeds.
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

                {/* Chain + threshold */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block label mb-2">Gate chain</label>
                    <select
                      value={chain}
                      onChange={(e) => setChain(e.target.value as Chain)}
                      className="w-full bg-transparent border border-line-strong outline-none focus:border-seal px-3 py-1.5 text-small font-[family-name:var(--font-ledger)] min-h-[44px]"
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
                      onChange={(e) =>
                        setThreshold(Math.max(1, Number(e.target.value.replace(/[^0-9]/g, '')) || 1))
                      }
                      className="w-full bg-transparent border border-line-strong focus:border-seal outline-none px-3 py-1.5 text-small font-[family-name:var(--font-ledger)] tabular-nums min-h-[44px]"
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
                className="action action-sealed w-full py-4 min-h-[52px] disabled:opacity-30 disabled:pointer-events-none"
              >
                Lock in {chunkCount}-stage plan → open stage uploader
              </button>
              <p className="mt-4 label !whitespace-normal normal-case tracking-[0.02em] leading-relaxed">
                Locking freezes the byte ranges, a SHA-256 commitment of your file and the shared
                drip id. Nothing is uploaded yet — each stage publishes separately afterwards.
              </p>
            </Section>
          </>
        )}

        {view === 'session' && session && (
          <>
            {/* Header */}
            <div className="panel-double p-5 crop-marks">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="statement-title truncate">{session.title}</h2>
                  <p className="addr mt-1.5">
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
                  className="link-rule inline-flex items-center gap-1.5 mt-4 label label-seal"
                >
                  Open the release <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>

            {/* Checklist */}
            <section className="section-head flex-col !items-stretch gap-3">
              <div className="section-head-meta">
                <span className="folio">01</span>
                <span className="section-head-rule" aria-hidden="true" />
                <h2 className="statement-subtitle">Unlock checklist</h2>
              </div>
              <StageChecklist stages={session.stages} />
            </section>

            {/* Runner or completion */}
            <section>
              <div className="flex items-baseline gap-4 mb-4 pb-2 border-b border-line-strong">
                <span className="folio">02</span>
                <span className="section-head-rule" aria-hidden="true" />
                <h2 className="statement-subtitle">
                  {complete ? 'All stages live' : `Upload ${stageLabel(nextIndex ?? 0, session.stages.length)}`}
                </h2>
              </div>
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
              <div className="flex items-baseline gap-4 mb-4 pb-2 border-b border-line-strong">
                <span className="folio">03</span>
                <span className="section-head-rule" aria-hidden="true" />
                <h2 className="statement-subtitle">Live market</h2>
              </div>
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
    <header className="space-y-3">
      <p className="seal-mark w-fit">V4 · Drip Protocol</p>
      <h1 className="statement-headline [font-size:clamp(1.75rem,1.1rem+2.2vw,2.75rem)] pt-2">
        Release by <em className="voice-editorial overprint">market-cap rungs</em>
      </h1>
      <p className="lede max-w-prose">
        Split one film into per-unlock stages — teaser at $1M cap, act at $5M, finale at $10M —
        then upload them one at a time, from any wallet, with tick-mark tracking and hash-verified
        hand-offs.
      </p>
    </header>
  )
}

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-4 mb-4 pb-2 border-b border-line-strong">
        <span className="folio">{'0'}{step}</span>
        <span className="section-head-rule" aria-hidden="true" />
        <h2 className="statement-subtitle">{title}</h2>
      </div>
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

function CompletionCard({ session }: { session: DripSession }) {
  return (
    <div className="panel p-5 space-y-4 crop-marks" data-testid="publish-success">
      <p className="seal-mark w-fit !border-[var(--color-arkiv)] !text-[var(--color-arkiv)] gap-2">
        <PartyPopper className="h-3.5 w-3.5" /> All {session.stages.length} stages published — the drip is fully indexed.
      </p>
      <ul className="divide-y divide-line-soft border-t border-line-soft">
        {session.stages.map((s) =>
          s.result ? (
            <li key={s.plan.dripIndex} className="py-2 text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.06em] text-fg-3 flex items-center gap-2 first:pt-0 last:pb-0">
              <CheckCircle2 className="h-3 w-3 text-[var(--color-arkiv)] shrink-0" />
              {stageLabel(s.plan.dripIndex, session.stages.length)} · entity{' '}
              <span className="normal-case">{shortAddr(s.result.entityKey)}</span> · by{' '}
              <span className="normal-case">{shortAddr(s.result.publishedBy)}</span>
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