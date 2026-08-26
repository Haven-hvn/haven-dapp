'use client'

/**
 * Publish — staged V4 market-cap-gated drip uploader (web only).
 *
 * Workflow per unlock stage ("first mkt cap, then second…"):
 *
 *   1. Shape the release in the wizard: pick the unlock ladder, drop ONE
 *      file per stage slate, arm the gate. Sealing freezes byte ranges,
 *      per-file SHA-256 commitments and a shared `dripId` as a resumable
 *      local session.
 *   2. Publish stages ONE BY ONE. Each stage verifies its own file against
 *      its own commitment, encrypts with its own fresh AES key, pins to
 *      Filecoin, IBE-wraps the key to its own VetKD v4 identity and indexes
 *      one Arkiv entity.
 *   3. Any wallet can continue a session (hand-off kit manifest + the
 *      matching stage file) — no secrets are ever shared between uploaders.
 *
 * Crypto invariants kept intact: strictly ascending targets across ALL
 * stages, contiguous ranges committed up-front (per-stage slates tile the
 * virtual concatenation), per-stage independent keys zeroized after
 * wrapping, epoch frozen per stage into metadata readers replay verbatim.
 *
 * @module app/publish/page
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  PartyPopper,
} from 'lucide-react'

import { stageLabel } from '@/lib/v4/drip-plan'
import type { PublishStageResult } from '@/lib/v4/arkiv-publish'
import {
  completedStageCount,
  commitStageResult,
  deleteDripSession,
  isDripComplete,
  listDripSessions,
  nextPublishableIndex,
  saveDripSession,
  type DripSession,
} from '@/lib/v4/drip-session'
import { useMarketCap } from '@/hooks/useMarketCap'
import { useToast } from '@/hooks/useToast'
import { ConnectButton } from '@/components/auth/ConnectButton'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { DripRings } from '@/components/video/DripRings'
import { StageChecklist } from '@/components/publish/StageChecklist'
import { StageRunner } from '@/components/publish/StageRunner'
import { HandoffPanel } from '@/components/publish/HandoffPanel'
import { DripSessionList } from '@/components/publish/DripSessionList'
import { MarketPreview } from '@/components/publish/MarketPreview'
import { CreateWizard } from '@/components/publish/CreateWizard'
import { confettiBurst, confettiCelebration } from '@/components/publish/confetti'

type View = 'browse' | 'create' | 'session'

export default function PublishPage() {
  const { address } = useAccount()
  const toast = useToast()

  const [view, setView] = useState<View>('browse')
  const [sessions, setSessions] = useState<DripSession[]>([])
  const [session, setSession] = useState<DripSession | null>(null)

  /** Stage files picked in this browser session, keyed by dripIndex. */
  const [stageFiles, setStageFiles] = useState<Map<number, File>>(new Map())

  useEffect(() => {
    setSessions(listDripSessions())
  }, [])

  // Live cap for the session-view market panel ---------------------------------
  const havenChainToMintNetwork: Record<string, string> = {
    EthMainnet: 'ethereum',
    EthSepolia: 'sepolia',
    BaseMainnet: 'base',
    ArbitrumOne: 'arbitrum',
    OptimismMainnet: 'optimism',
  }
  const networkHint = session ? havenChainToMintNetwork[session.gate.chain] ?? 'base' : 'base'
  const { marketCapUsd } = useMarketCap(session?.gate.gateToken ?? null, networkHint)

  const handleSealed = useCallback((created: DripSession, files: Map<number, File>) => {
    setSessions(listDripSessions())
    setStageFiles(files)
    setSession(created)
    setView('session')
  }, [])

  const openSession = useCallback((s: DripSession, files: Map<number, File> | null) => {
    setSession(s)
    setStageFiles(files ?? new Map())
    setView('session')
  }, [])

  const resumeSession = useCallback(
    (s: DripSession) => {
      // Stage files must be re-attached + hash-verified before anything uploads.
      openSession(s, null)
    },
    [openSession]
  )

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

  const backToBrowse = useCallback(() => {
    setSession(null)
    setStageFiles(new Map())
    setView('browse')
  }, [])

  const handleStageComplete = useCallback(
    (result: PublishStageResult) => {
      if (!session || nextPublishableIndex(session) == null) return
      const nextIdx = nextPublishableIndex(session)!
      const updated = commitStageResult(session, nextIdx, {
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
        confettiCelebration()
        toast.showSuccess('Final stage published — the full drip is live.')
      } else {
        confettiBurst({ count: 60 })
      }
    },
    [session, address, toast]
  )

  // Session-view derived state -------------------------------------------------
  const nextIndex = session ? nextPublishableIndex(session) : null
  const complete = session ? isDripComplete(session) : false
  const firstEntityKey = useMemo(
    () => session?.stages.find((s) => s.result)?.result?.entityKey ?? undefined,
    [session]
  )

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="min-h-dvh bg-surface text-fg relative overflow-x-clip">
      {/* Nav */}
      <nav className="masthead">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between safe-area-x">
          <div className="flex items-center gap-3 min-w-0">
            {view === 'browse' ? (
              <Link href="/" aria-label="Back to home" className="text-fg-3 hover:text-seal-text transition-colors p-2 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            ) : (
              <button
                onClick={backToBrowse}
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
          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle />
            <ConnectButton />
          </div>
        </div>
      </nav>

      <main className="relative max-w-3xl mx-auto px-6 py-10 space-y-10 safe-area-x">
        {view === 'browse' && (
          <>
            <IntroCopy />
            <ProtocolStrip />
            <DripSessionList
              sessions={sessions}
              onResume={resumeSession}
              onDelete={removeSession}
              onCreate={() => setView('create')}
              onImport={importSession}
            />
          </>
        )}

        {view === 'create' && <CreateWizard onSealed={handleSealed} />}

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
                <CompletionCard session={session} entityKey={firstEntityKey} />
              ) : (
                <StageRunner
                  key={session.stages[nextIndex].plan.dripIndex}
                  plan={session.stages[nextIndex].plan}
                  gate={{ ...session.gate, title: session.title }}
                  mimeType={session.mimeType}
                  sourceSha256={session.sourceSha256}
                  fileSize={session.fileSize}
                  stageSource={session.stages[nextIndex].source}
                  initialSource={null}
                  initialStageFile={stageFiles.get(nextIndex) ?? null}
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
                hasToken={Boolean(session.gate.gateToken)}
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
        Split a release into per-unlock stages — teaser at $1M cap, act at $5M, finale at $10M — each
        with its own file and upload, publishable one at a time from any wallet.
      </p>
    </header>
  )
}

/** The three-step pipeline every stage walks through — data hues only. */
function ProtocolStrip() {
  const steps = [
    { mark: 'net-evm', label: 'Encrypt locally' },
    { mark: 'net-filecoin', label: 'Pin to Filecoin' },
    { mark: 'net-arkiv', label: 'Index on Arkiv' },
  ]
  return (
    <div className="flex items-stretch gap-px border border-line bg-line" aria-hidden="true">
      {steps.map((s, i) => (
        <div key={s.label} className="flex-1 bg-card px-3 py-3 flex items-center gap-2.5 min-w-0">
          <span className={`net-dot ${s.mark}`} />
          <div className="min-w-0">
            <p className="label !tracking-[0.12em] truncate">{`0${i + 1}`}</p>
            <p className="text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.08em] text-fg-4 truncate">
              {s.label}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function CompletionCard({ session, entityKey }: { session: DripSession; entityKey?: string }) {
  return (
    <div className="panel-double p-6 space-y-5 crop-marks relative overflow-hidden" data-testid="publish-success">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2 min-w-0">
          <p className="seal-mark w-fit stamp-in !border-[var(--color-arkiv)] !text-[var(--color-arkiv)] !bg-transparent gap-2">
            <PartyPopper className="h-3.5 w-3.5" /> Fully indexed
          </p>
          <h3 className="statement-title">
            All {session.stages.length} rung{session.stages.length === 1 ? '' : 's'} are live
          </h3>
          <p className="prose-body text-small text-fg-3">
            Every stage encrypted, pinned and indexed. The drip now unlocks rung by rung as the gate
            token&apos;s market cap climbs.
          </p>
        </div>
        <DripRings unlocked={session.stages.length} total={session.stages.length} size={64} />
      </div>

      {entityKey && (
        <Link href={`/watch?v=${entityKey}`} className="action action-sealed w-full py-4 min-h-[52px]">
          Open the release <ArrowRight className="h-4 w-4" />
        </Link>
      )}

      <ul className="divide-y divide-line-soft border-t border-line-soft">
        {session.stages.map((s) =>
          s.result ? (
            <li
              key={s.plan.dripIndex}
              className="py-2 text-nano font-[family-name:var(--font-ledger)] uppercase tracking-[0.06em] text-fg-3 flex items-center gap-2 first:pt-0 last:pb-0"
            >
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

function shortAddr(value: string): string {
  if (!value) return ''
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
}
