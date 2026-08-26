'use client'

/**
 * DripSessionList — the publish landing screen.
 *
 * Shows every local drip session with its tick-mark progress ("2/3 stages"),
 * plus entry points: start a new drip, or import a hand-off kit published
 * on another machine/wallet. Resuming a session re-attaches the source file
 * and hash-verifies it before anything uploads.
 *
 * @module components/publish/DripSessionList
 */

import { useRef } from 'react'
import {
  CheckCircle2,
  Clock,
  FileUp,
  Plus,
  Trash2,
} from 'lucide-react'

import { stageLabel } from '@/lib/v4/drip-plan'
import type { DripSession } from '@/lib/v4/drip-session'
import { useToast } from '@/hooks/useToast'

export interface DripSessionListProps {
  sessions: DripSession[]
  onResume: (session: DripSession) => void
  onDelete: (dripId: string) => void
  onCreate: () => void
  onImport: (session: DripSession) => void
}

export function DripSessionList({
  sessions,
  onResume,
  onDelete,
  onCreate,
  onImport,
}: DripSessionListProps) {
  const importRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  const importManifestFile = async (file: File | null) => {
    if (!file) return
    try {
      const parsed = parseManifestFile(file)
      const session = await parsed
      if (!session) throw new Error('invalid manifest')
      onImport(session)
    } catch {
      toast.showError('That file is not a valid Haven drip manifest.')
    }
  }

  return (
    <div className="space-y-6" data-testid="drip-session-list">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={onCreate}
          data-testid="new-drip-button"
          className="group border border-seal-edge bg-accent hover:bg-accent p-5 text-left transition-colors"
        >
          <Plus className="h-6 w-6 text-seal-text mb-3" />
          <p className="font-medium text-fg">New drip release</p>
          <p className="text-xs text-fg-3 mt-1">
            Split a film into market-cap unlock stages and publish them one by one.
          </p>
        </button>

        <button
          onClick={() => importRef.current?.click()}
          data-testid="import-manifest-button"
          className="group border border-line-strong bg-card hover:bg-accent p-5 text-left transition-colors"
        >
          <FileUp className="h-6 w-6 text-seal-text mb-3" />
          <p className="font-medium text-fg">Continue someone else&apos;s stage</p>
          <p className="text-xs text-fg-3 mt-1">
            Import a hand-off kit manifest — your wallet publishes the next unlock rung.
          </p>
        </button>
      </div>

      {sessions.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-fg-4">Your drips on this device</p>
          {sessions.map((s) => {
            const done = s.stages.filter((st) => st.result).length
            return (
              <div
                key={s.dripId}
                className="flex items-center gap-4 border border-line bg-card px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg/85 truncate">
                    {s.title || 'Untitled drip'}
                  </p>
                  <p className="text-xs text-fg-4 truncate mt-0.5">
                    {s.fileName} · {(s.fileSize / 1024 / 1024).toFixed(1)} MB ·{' '}
                    <Clock className="inline h-3 w-3 -mt-0.5" /> {timeAgo(s.updatedAtMs)}
                  </p>
                </div>

                {/* Tick marks per stage */}
                <div className="flex items-center gap-1 shrink-0" aria-label={`${done} of ${s.stages.length} stages published`}>
                  {s.stages.map((st, i) => (
                    <span key={i} title={`Stage ${i + 1} · ${stageLabel(i, s.stages.length)}`}>
                      {st.result ? (
                        <CheckCircle2 className="h-4 w-4 text-[var(--color-arkiv)]" />
                      ) : (
                        <span className="block h-4 w-4 rounded-full border border-line-strong" />
                      )}
                    </span>
                  ))}
                </div>
                <span className="text-xs font-mono text-fg-4 shrink-0 w-8 text-right">
                  {done}/{s.stages.length}
                </span>

                <button
                  onClick={() => onResume(s)}
                  data-testid={`resume-${s.dripId}`}
                  className="px-3 py-1.5 bg-accent border border-seal-edge text-xs text-seal-text hover:bg-accent transition-colors shrink-0"
                >
                  Resume
                </button>
                <button
                  onClick={() => onDelete(s.dripId)}
                  aria-label={`Delete ${s.title || 'draft'}`}
                  className="p-1.5 text-fg-5 hover:text-destructive hover:bg-red-400/10 transition-colors shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {sessions.length === 0 && (
        <p className="text-center text-sm text-fg-5 py-4">
          No drips in progress on this device yet.
        </p>
      )}

      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => void importManifestFile(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}

async function parseManifestFile(file: File): Promise<DripSession | null> {
  // Dynamic import keeps the validation helpers out of the landing chunk.
  const { parseDripManifest } = await import('@/lib/v4/drip-session')
  return parseDripManifest(JSON.parse(await file.text()))
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
