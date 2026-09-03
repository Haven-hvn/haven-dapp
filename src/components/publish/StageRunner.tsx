'use client'

/**
 * StageRunner — per-stage upload console for the next unlock rung.
 *
 * Slate-mode sessions carry a per-stage commitment (`stageSource`): the
 * operator attaches ONLY that stage's own file, it is SHA-256-verified
 * against the slot's commitment, and publishing wraps the bytes in a
 * windowed adapter so the frozen plan ranges still apply — no master file
 * required. Legacy sessions without stage commitments fall back to
 * whole-source verification.
 *
 * A green fingerprint badge then walks through encrypt → pin → index,
 * ending in a check mark. Any connected wallet can run this stage — IBE
 * wrapping needs only public inputs, so stage 2 can be published by a
 * different teammate than stage 1.
 *
 * @module components/publish/StageRunner
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  FileVideo,
  Fingerprint,
  Loader2,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react'
import { useWalletClient } from 'wagmi'

import { formatUsdCompact, stageLabel, type DripChunkPlan } from '@/lib/v4/drip-plan'
import {
  verifySourceAgainstCommitment,
  verifyStageSource,
  type DripGateConfigSnapshot,
  type DripStageSourceMeta,
} from '@/lib/v4/drip-session'
import {
  publishDripStage,
  type DripChunkProgress,
  type DripGateConfig,
  type PublishStageResult,
} from '@/lib/v4/arkiv-publish'

export interface StageRunnerProps {
  plan: DripChunkPlan
  /** Gate snapshot from the session (title is appended internally). */
  gate: DripGateConfigSnapshot & { title: string }
  mimeType: string
  /** Whole-source commitment (legacy sessions). */
  sourceSha256?: string
  /** Whole-source size (legacy sessions). */
  fileSize?: number
  /** This slot's own commitment — slate-mode sessions. */
  stageSource?: DripStageSourceMeta
  /** Bytes already in memory (same browser session as plan creation). */
  initialSource?: Uint8Array | null
  /** This stage's own file already picked in the wizard (slate mode). */
  initialStageFile?: File | null
  onComplete: (result: PublishStageResult) => void
}

type VerifyState = 'idle' | 'hashing' | 'ok' | 'size-mismatch' | 'hash-mismatch'

const PIPELINE_ORDER: Array<DripChunkProgress['stage']> = [
  'encrypting',
  'uploading',
  'indexing',
  'done',
]

/**
 * Presents one stage's bytes as if they were the full logical source, so
 * `publishDripStage` can keep slicing by the frozen global plan ranges.
 * Only `.slice(start, end)` is consumed downstream.
 */
class WindowedStageSource {
  constructor(
    private readonly bytes: Uint8Array,
    private readonly offset: number
  ) {}
  slice(start: number, end: number): Uint8Array {
    return this.bytes.slice(start - this.offset, end - this.offset)
  }
}

export function StageRunner({
  plan,
  gate,
  mimeType,
  sourceSha256,
  fileSize,
  stageSource,
  initialSource,
  initialStageFile,
  onComplete,
}: StageRunnerProps) {
  const { data: walletClient } = useWalletClient()

  const [verify, setVerify] = useState<VerifyState>('idle')
  const [publishing, setPublishing] = useState(false)
  const [progress, setProgress] = useState<DripChunkProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stageDone, setStageDone] = useState(false)

  const fileRef = useRef<File | null>(null)
  const bytesRef = useRef<Uint8Array | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const verifyBytes = useCallback(
    async (bytes: Uint8Array) => {
      setVerify('hashing')
      const result =
        stageSource != null
          ? await verifyStageSource(bytes, stageSource)
          : await verifySourceAgainstCommitment(bytes, sourceSha256 ?? '', fileSize ?? -1)
      setVerify(
        result.ok ? 'ok' : result.reason === 'SIZE_MISMATCH' ? 'size-mismatch' : 'hash-mismatch'
      )
    },
    [stageSource, sourceSha256, fileSize]
  )

  // Attach bytes handed over from the wizard / previous session state.
  useEffect(() => {
    let cancelled = false
    async function attach() {
      try {
        if (initialStageFile) {
          fileRef.current = initialStageFile
          const bytes = new Uint8Array(await initialStageFile.arrayBuffer())
          if (!cancelled) {
            bytesRef.current = bytes
            await verifyBytes(bytes)
          }
        } else if (initialSource) {
          bytesRef.current = initialSource
          await verifyBytes(initialSource)
        }
      } catch {
        if (!cancelled) setVerify('idle')
      }
    }
    void attach()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const acceptFile = useCallback(
    async (file: File | null) => {
      if (!file) return
      setError(null)
      setStageDone(false)
      try {
        fileRef.current = file
        const bytes = new Uint8Array(await file.arrayBuffer())
        bytesRef.current = bytes
        await verifyBytes(bytes)
      } catch {
        setError('Could not read that file.')
        setVerify('idle')
      }
    },
    [verifyBytes]
  )

  const clearSource = useCallback(() => {
    fileRef.current = null
    bytesRef.current = null
    setVerify('idle')
    setProgress(null)
    setError(null)
    setStageDone(false)
  }, [])

  const handleUpload = useCallback(async () => {
    const bytes = bytesRef.current
    if (!bytes || !walletClient || publishing || verify !== 'ok') return
    setPublishing(true)
    setError(null)
    setProgress(null)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      // Slate mode: publish from just this stage's bytes through a windowed
      // view; legacy mode publishes straight from the full attached source.
      const sourceArg =
        stageSource != null && fileRef.current
          ? (new WindowedStageSource(bytes, plan.startByte) as unknown as Uint8Array)
          : bytes
      const result = await publishDripStage({
        source: sourceArg,
        plan,
        gate: gate as DripGateConfig,
        mimeType,
        wallet: walletClient as unknown as Parameters<typeof publishDripStage>[0]['wallet'],
        signal: controller.signal,
        onChunkStage: (p) => setProgress(p),
      })
      setStageDone(true)
      onComplete(result)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError('Upload cancelled — nothing was indexed.')
      } else {
        setError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      abortRef.current = null
      setPublishing(false)
    }
  }, [walletClient, publishing, verify, plan, gate, mimeType, onComplete, stageSource])

  const verified = verify === 'ok'
  const ready = verified && !publishing && !stageDone && walletClient != null
  const hasSourceAttached = fileRef.current != null || bytesRef.current != null
  const expectedName = stageSource?.fileName

  return (
    <div className="border border-line bg-card p-5 space-y-4" data-testid="stage-runner">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-xs uppercase tracking-wide text-seal-text/80 font-medium">
              Up next · Stage {plan.dripIndex + 1} of {plan.dripTotal}
            </p>
            <StagePosition index={plan.dripIndex} total={plan.dripTotal} />
          </div>
          <p className="text-sm text-fg-2 mt-0.5">
            {stageLabel(plan.dripIndex, plan.dripTotal)} unlocks at{' '}
            <span className="font-mono">{formatUsdCompact(plan.marketCapTargetUsd)}</span> market cap ·{' '}
            {(Math.max(0, plan.endByte - plan.startByte) / 1024 / 1024).toFixed(1)} MB slice
          </p>
          {expectedName && (
            <p className="text-[11px] text-fg-5 mt-1 truncate font-[family-name:var(--font-ledger)]">
              expects “{expectedName}” ({((stageSource?.fileSize ?? 0) / 1024 / 1024).toFixed(1)} MB)
            </p>
          )}
        </div>
        {stageDone && <CheckCircle2 className="h-6 w-6 text-[var(--color-arkiv)] shrink-0" />}
      </div>

      {!stageDone && (
        <>
          {/* Source attachment + verification */}
          {!hasSourceAttached && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                void acceptFile(e.dataTransfer.files?.[0] ?? null)
              }}
              className="w-full border border-dashed border-line-strong hover:border-seal p-4 flex flex-col items-center justify-center gap-1.5 text-sm text-fg-3 hover:text-fg-2 transition-colors"
              data-testid="runner-source-dropzone"
            >
              <span className="flex items-center gap-2">
                <FileVideo className="h-4 w-4" />
                {expectedName ? (
                  <>
                    Attach <strong className="text-fg">{expectedName}</strong> for this stage
                  </>
                ) : (
                  'Attach the original film to encrypt this stage'
                )}
              </span>
              {expectedName && (
                <span className="text-[11px] text-fg-5">
                  Only this rung&apos;s file is needed — each stage carries its own commitment.
                </span>
              )}
            </button>
          )}

          {hasSourceAttached && (
            <div className="flex items-center gap-3 bg-black/30 px-3 py-2.5" data-testid="runner-source-status">
              <Fingerprint className="h-4 w-4 shrink-0 text-fg-4" />
              <span className="text-sm text-fg-3 flex-1 min-w-0 truncate">
                {stageSource ? `Stage file · ${fileRef.current?.name ?? 'attached'}` : `Source · ${(fileSize ?? 0).toLocaleString()} bytes`}
              </span>
              {verify === 'hashing' && (
                <span className="flex items-center gap-1.5 text-xs text-fg-4">
                  <Loader2 className="h-3 w-3 animate-spin" /> hashing…
                </span>
              )}
              {verified && (
                <span className="flex items-center gap-1.5 text-xs text-[var(--color-arkiv)]" data-testid="source-verified-badge">
                  <ShieldCheck className="h-3.5 w-3.5" /> SHA-256 match
                </span>
              )}
              {(verify === 'size-mismatch' || verify === 'hash-mismatch') && (
                <span className="flex items-center gap-1.5 text-xs text-destructive" data-testid="source-mismatch-badge">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {verify === 'size-mismatch' ? 'Wrong file size' : 'Different content'}
                </span>
              )}
              {!publishing && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => inputRef.current?.click()}
                    className="text-xs text-fg-4 hover:text-fg transition-colors"
                  >
                    Swap
                  </button>
                  <button
                    onClick={clearSource}
                    aria-label="Detach source file"
                    className="text-fg-5 hover:text-fg-2 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="video/*,application/octet-stream"
            className="hidden"
            onChange={(e) => void acceptFile(e.target.files?.[0] ?? null)}
          />

          {/* Live pipeline progress */}
          {progress && (
            <div className="space-y-2 bg-black/20 px-3 py-2.5" data-testid="drip-progress">
              <ProgressLine label="Encrypting locally (AES-256-GCM)" state={progress.stage} target="encrypting" />
              <ProgressLine
                label={
                  progress.stage === 'uploading'
                    ? `Pinning to Filecoin ${uploadPct(progress)}`
                    : 'Pin to Filecoin'
                }
                state={progress.stage}
                target="uploading"
              />
              <ProgressLine label="Indexing entity on Arkiv" state={progress.stage} target="indexing" />
            </div>
          )}

          {!walletClient && (
            <p className="text-xs text-seal-text flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> Connect a wallet — this stage&apos;s storage fees are paid by whoever uploads it.
            </p>
          )}

          {error && (
            <p className="text-xs text-destructive flex items-start gap-1.5" data-testid="publish-error">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => void handleUpload()}
              disabled={!ready}
              data-testid="publish-button"
              className="action action-sealed flex-1 min-h-[44px] disabled:opacity-30 disabled:pointer-events-none"
            >
              {publishing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Publishing stage {plan.dripIndex + 1}…
                </>
              ) : (
                <>
                  <UploadCloud className="h-4 w-4" /> Encrypt &amp; publish stage {plan.dripIndex + 1}
                </>
              )}
            </button>
            {publishing && (
              <button
                onClick={() => abortRef.current?.abort()}
                className="px-4 py-3 border border-line-strong text-sm text-fg-3 hover:text-fg transition-colors"
              >
                Cancel
              </button>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-fg-5">
            This stage gets its own AES key wrapped to its own VetKD identity — nothing is shared
            with other stages or uploaders. Publishing out of order is blocked so no chunk ever
            lands behind a missing middle piece.
          </p>
        </>
      )}

      {stageDone && (
        <p className="text-sm text-[var(--color-arkiv)] flex items-center gap-2" data-testid="stage-done-copy">
          <CheckCircle2 className="h-4 w-4" /> Stage {plan.dripIndex + 1} is live — tick moved on the checklist.
        </p>
      )}
    </div>
  )
}

function StagePosition({ index, total }: { index: number; total: number }) {
  return (
    <span className="inline-flex gap-[3px]" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-[5px] w-4 ${
            i < index
              ? 'bg-[var(--color-arkiv)]'
              : i === index
                ? 'bg-seal'
                : 'bg-line-strong opacity-60'
          }`}
        />
      ))}
    </span>
  )
}

function ProgressLine({
  label,
  state,
  target,
}: {
  label: string
  state: DripChunkProgress['stage']
  target: DripChunkProgress['stage']
}) {
  const stateIdx = PIPELINE_ORDER.indexOf(state)
  const targetIdx = PIPELINE_ORDER.indexOf(target)
  const done = stateIdx > targetIdx || state === 'done'
  const active = state === target

  return (
    <div className="flex items-center gap-2 text-xs">
      {done ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-arkiv)] shrink-0" />
      ) : active ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-seal-text shrink-0" />
      ) : (
        <CircleDashed className="h-3.5 w-3.5 text-fg/20 shrink-0" />
      )}
      <span className={done ? 'text-fg-3' : active ? 'text-fg' : 'text-fg-4'}>{label}</span>
    </div>
  )
}

function uploadPct(progress: DripChunkProgress): string {
  if (!progress.totalBytes || progress.bytesUploaded == null) return '…'
  return `${Math.min(100, Math.round((progress.bytesUploaded / progress.totalBytes) * 100))}%`
}
