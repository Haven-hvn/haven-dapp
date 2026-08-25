'use client'

/**
 * Publish — V4 market-cap-gated drip uploader (web only).
 *
 * One drag-drop: file → split(n) → per-chunk stream-encrypt (haven-cli
 * compatible format) → pin to Filecoin via Synapse → IBE-wrap per-CID key →
 * index in Arkiv with `gate_version="v4"` + `market_cap_target_usd` attrs.
 *
 * Live preview polls the gate token's mint.club market cap and validates the
 * target ladder is strictly ascending before publishing is allowed.
 *
 * @module app/publish/page
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAccount, useWalletClient } from 'wagmi'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileVideo,
  Loader2,
  Rocket,
  UploadCloud,
} from 'lucide-react'

import {
  DRIP_TARGET_PRESETS,
  MAX_DRIP_CHUNKS,
  formatUsdCompact,
  planDripChunks,
  validateDripConfig,
} from '@/lib/v4/drip-plan'
import { publishDripChunks, type DripChunkProgress } from '@/lib/v4/arkiv-publish'
import { resolveMintToken } from '@/lib/v4/market-cap'
import { useMarketCap, evaluateDripUnlock } from '@/hooks/useMarketCap'
import { ConnectButton } from '@/components/auth/ConnectButton'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { DripRings } from '@/components/video/DripRings'
import { VALID_CHAINS } from 'haven-aol'
import type { Chain } from 'haven-aol'

// ============================================================================
// Page
// ============================================================================

interface ChunkRunState {
  stage: 'pending' | 'encrypting' | 'uploading' | 'indexing' | 'done' | 'error'
  bytesUploaded?: number
  totalBytes?: number
  pieceCid?: string
  entityKey?: string
  message?: string
}

export default function PublishPage() {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [chunkCount, setChunkCount] = useState(3)
  const [targetsUsd, setTargetsUsd] = useState<number[]>([
    1_000_000, 5_000_000, 10_000_000,
  ])
  const [gateTokenInput, setGateTokenInput] = useState('')
  const [resolvedToken, setResolvedToken] = useState<{
    address: string
    symbol: string | null
  } | null>(null)
  const [oracleAddress, setOracleAddress] = useState('')
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [chain, setChain] = useState<Chain>('BaseMainnet')
  const [threshold, setThreshold] = useState(1)
  const [publishing, setPublishing] = useState(false)
  const [runStates, setRunStates] = useState<ChunkRunState[]>([])
  const [publishedKeys, setPublishedKeys] = useState<string[] | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Gate resolution + live cap ------------------------------------------------
  const networkHint = chain === 'EthMainnet' ? 'ethereum' : 'base'

  const handleResolveToken = useCallback(async () => {
    setResolving(true)
    setResolveError(null)
    try {
      const result = await resolveMintToken({
        token: gateTokenInput,
        network: networkHint,
      })
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

  // Market cap of the RESOLVED address (falls back to raw input for ERC-20s
  // that are not mint.club bonds — those will simply report unknown).
  const capToken = resolvedToken?.address ?? ''
  const { marketCapUsd } = useMarketCap(capToken || null, networkHint)

  // Planning ------------------------------------------------------------------
  const config = useMemo(
    () => ({ chunkCount, targetsUsd }),
    [chunkCount, targetsUsd]
  )
  const configErrors = useMemo(() => validateDripConfig(config), [config])
  const plans = useMemo(() => {
    if (!file) return null
    const result = planDripChunks(file.size, config)
    return result.ok ? result.chunks : null
  }, [file, config])

  const nextUnlock = useMemo(() => {
    if (!plans || plans.length === 0) return null
    const locked = plans.find((p) => p.marketCapTargetUsd > (marketCapUsd ?? Infinity))
      ?? plans[plans.length - 1]
    return evaluateDripUnlock(locked.marketCapTargetUsd, marketCapUsd).unlocked
      ? null
      : locked
  }, [plans, marketCapUsd])

  const ORACLE_ADDR_RE = /^0x[0-9a-fA-F]{40}$/
  const oracleValid = ORACLE_ADDR_RE.test(oracleAddress.trim())
  const canPublish =
    file != null &&
    resolvedToken != null &&
    oracleValid &&
    walletClient != null &&
    address != null &&
    configErrors.length === 0 &&
    plans != null &&
    !publishing

  // Handlers --------------------------------------------------------------------
  const acceptFile = useCallback((f: File | null) => {
    if (!f) return
    setFile(f)
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''))
    setPublishedKeys(null)
    setPublishError(null)
    setRunStates([])
    void f
  }, [title])

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

  const handlePublish = useCallback(async () => {
    if (!file || !plans || !resolvedToken || !walletClient) return
    setPublishing(true)
    setPublishError(null)
    setPublishedKeys(null)
    setRunStates(plans.map(() => ({ stage: 'pending' as const })))

    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const keys = await publishDripChunks({
        source: bytes,
        plans,
        mimeType: file.type || 'video/mp4',
        wallet: walletClient as unknown as Parameters<typeof publishDripChunks>[0]['wallet'],
        gate: {
          chain,
          gateToken: resolvedToken.address,
          gateThreshold: threshold,
          oracleAddress: oracleAddress.trim(),
          title: title.trim() || 'Untitled drip',
        },
        onChunkStage: (p: DripChunkProgress) => {
          setRunStates((prev) => {
            const next = [...prev]
            const cur = next[p.dripIndex] ?? { stage: 'pending' as const }
            next[p.dripIndex] = {
              ...cur,
              stage: p.stage,
              bytesUploaded: p.bytesUploaded,
              totalBytes: p.totalBytes,
              pieceCid: p.pieceCid ?? cur.pieceCid,
              entityKey: p.entityKey ?? cur.entityKey,
            }
            return next
          })
        },
      })
      setPublishedKeys(keys)
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : String(error))
    } finally {
      setPublishing(false)
    }
  }, [file, plans, resolvedToken, chain, threshold, title, walletClient, oracleAddress])

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0F] via-[#0d1117] to-[#0A0A0F]" />

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/[0.06] bg-[#0A0A0F]/50 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-white/70 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <img src="/favicon.ico" alt="Haven" className="w-8 h-8 rounded-lg" />
            <span className="text-lg font-semibold tracking-tight">Publish · Drip</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ConnectButton />
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-3xl mx-auto px-6 py-10 space-y-8">
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
              <UploadCloud className="w-10 h-10 text-[#00F5FF]" />
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
                onClick={() => { setFile(null); inputRef.current?.click() }}
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
        <Section step={2} title="Configure the drip">
          <div className="space-y-5 rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
            {/* Chunk count */}
            <div>
              <label className="flex items-center justify-between text-sm text-white/60 mb-2">
                <span>Chunks</span>
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

            {/* Targets */}
            <div className="space-y-2" data-testid="drip-target-list">
              {targetsUsd.map((t, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-white/40">
                    T{i} unlock
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
                  onChange={(e) => { setGateTokenInput(e.target.value); setResolvedToken(null); setOracleAddress(''); setResolveError(null) }}
                  placeholder="Symbol or 0x… address"
                  className="flex-1 rounded-lg bg-black/30 border border-white/10 focus:border-[#00F5FF]/50 outline-none px-3 py-1.5 text-sm font-mono"
                  data-testid="gate-token-input"
                />
                <button
                  onClick={handleResolveToken}
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
                      Must be a 42-char 0x address — the canister calls
                      latestRoundData() on it and fails closed on bad feeds.
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
                    <option key={c} value={c} className="bg-[#0A0A0F]">{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-2">Holder threshold</label>
                <input
                  inputMode="numeric"
                  value={String(threshold)}
                  onChange={(e) => setThreshold(Math.max(1, Number(e.target.value.replace(/[^0-9]/g, '')) || 1))}
                  className="w-full rounded-lg bg-black/30 border border-white/10 outline-none px-3 py-1.5 text-sm font-mono"
                />
              </div>
            </div>
          </div>
        </Section>

        {/* Step 3 — Preview */}
        <Section step={3} title="Live preview">
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 space-y-4" data-testid="market-preview">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wide">Market cap</p>
                <p className="text-2xl font-semibold">
                  {capToken
                    ? marketCapUsd != null
                      ? formatUsdCompact(marketCapUsd)
                      : <span className="text-white/40">—</span>
                    : <span className="text-white/40">Resolve a token first</span>}
                </p>
              </div>
              {nextUnlock && (
                <div className="text-right">
                  <p className="text-xs text-white/40 uppercase tracking-wide">Next unlock</p>
                  <p className="text-lg font-medium text-[#FF00E5]">
                    {formatUsdCompact(nextUnlock.marketCapTargetUsd)}{' '}
                    <span className="text-sm text-white/50">
                      {progressPct(marketCapUsd ?? null, nextUnlock.marketCapTargetUsd)}% to go
                    </span>
                  </p>
                </div>
              )}
            </div>

            {plans && (
              <div className="space-y-2">
                {plans.map((plan) => {
                  const { unlocked } = evaluateDripUnlock(plan.marketCapTargetUsd, marketCapUsd)
                  return (
                    <div key={plan.dripIndex} className="flex items-center gap-3 text-sm">
                      <DripRings unlocked={unlocked ? 1 : 0} total={1} size={16} />
                      <span className="flex-1 text-white/60">
                        Chunk {plan.dripIndex + 1}
                        <span className="text-white/30"> · bytes [{plan.startByte}, {plan.endByte})</span>
                      </span>
                      <span className={unlocked ? 'text-green-400' : 'text-white/70'}>
                        {formatUsdCompact(plan.marketCapTargetUsd)}
                        {unlocked && ' ✓'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Section>

        {/* Step 4 — Publish */}
        <Section step={4} title="Encrypt, pin & index">
          <button
            onClick={handlePublish}
            disabled={!canPublish}
            data-testid="publish-button"
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#00F5FF] to-[#FF00E5] text-[#0A0A0F] font-semibold disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-[#00F5FF]/20"
          >
            {publishing ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Publishing drip…</>
            ) : (
              <><Rocket className="w-5 h-5" /> Publish {chunkCount}-chunk drip</>
            )}
          </button>

          {!walletClient && (
            <p className="mt-2 text-xs text-amber-400/80 text-center">
              Connect your wallet first — publishing signs Filecoin + Arkiv transactions.
            </p>
          )}

          {runStates.length > 0 && (
            <div className="mt-4 space-y-2" data-testid="drip-progress">
              {runStates.map((state, i) => (
                <ProgressRow key={i} index={i} state={state} />
              ))}
            </div>
          )}

          {publishError && (
            <p className="mt-4 text-sm text-red-400 flex items-start gap-2" data-testid="publish-error">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {publishError}
            </p>
          )}

          {publishedKeys && (
            <div className="mt-4 rounded-xl border border-green-500/30 bg-green-500/5 p-4 space-y-2" data-testid="publish-success">
              <p className="text-sm text-green-400 font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Drip published — {publishedKeys.length} chunks indexed
              </p>
              <Link
                href={`/watch?v=${publishedKeys[0]}`}
                className="inline-block text-sm text-[#00F5FF] hover:underline"
              >
                Open chunk 1 →
              </Link>
            </div>
          )}

          <p className="mt-3 text-xs text-white/30 leading-relaxed">
            Each chunk gets its own AES key wrapped to its own CID identity via
            Haven-AOL VetKD. Readers must hold {threshold} gate token
            {threshold > 1 ? 's' : ''}; chunks stay locked until the live
            market cap reaches their target.
          </p>
        </Section>
      </main>
    </div>
  )
}

// ============================================================================
// Local UI helpers
// ============================================================================

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

function ProgressRow({ index, state }: { index: number; state: ChunkRunState }) {
  const label =
    state.stage === 'done'
      ? `Indexed ${state.entityKey ? shortAddr(state.entityKey) : ''}`
      : state.stage === 'indexing'
        ? 'Indexing on Arkiv…'
        : state.stage === 'uploading'
          ? `Uploading ${pct(state.bytesUploaded, state.totalBytes)}`
          : state.stage === 'encrypting'
            ? 'Encrypting…'
            : 'Waiting…'

  return (
    <div className="flex items-center gap-3 text-sm rounded-lg bg-white/[0.03] px-3 py-2">
      {state.stage === 'done' ? (
        <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
      ) : (
        <Loader2 className={`h-4 w-4 shrink-0 ${state.stage === 'pending' ? 'text-white/20' : 'animate-spin text-[#00F5FF]'}`} />
      )}
      <span className="text-white/60">Chunk {index + 1}</span>
      <span className="ml-auto text-white/50 font-mono text-xs">{label}</span>
    </div>
  )
}

function pct(part?: number, total?: number): string {
  if (!part || !total) return '0%'
  return `${Math.min(100, Math.round((part / total) * 100))}%`
}

function progressPct(current: number | null, target: number): number {
  if (current == null || !Number.isFinite(current)) return 0
  return Math.min(99, Math.max(0, Math.floor((current / target) * 100)))
}

function shortAddr(value: string): string {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
}
