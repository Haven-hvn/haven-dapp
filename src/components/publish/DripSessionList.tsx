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
          className="group rounded-xl border border-[#00F5FF]/30 bg-[#00F5FF]/[0.04] hover:bg-[#00F5FF]/[0.08] p-5 text-left transition-colors"
        >
          <Plus className="h-6 w-6 text-[#00F5FF] mb-3" />
          <p className="font-medium text-white/90">New drip release</p>
          <p className="text-xs text-white/45 mt-1">
            Split a film into market-cap unlock stages and publish them one by one.
          </p>
        </button>

        <button
          onClick={() => importRef.current?.click()}
          data-testid="import-manifest-button"
          className="group rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] p-5 text-left transition-colors"
        >
          <FileUp className="h-6 w-6 text-[#FF00E5] mb-3" />
          <p className="font-medium text-white/90">Continue someone else&apos;s stage</p>
          <p className="text-xs text-white/45 mt-1">
            Import a hand-off kit manifest — your wallet publishes the next unlock rung.
          </p>
        </button>
      </div>

      {sessions.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-white/40">Your drips on this device</p>
          {sessions.map((s) => {
            const done = s.stages.filter((st) => st.result).length
            return (
              <div
                key={s.dripId}
                className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white/85 truncate">
                    {s.title || 'Untitled drip'}
                  </p>
                  <p className="text-xs text-white/35 truncate mt-0.5">
                    {s.fileName} · {(s.fileSize / 1024 / 1024).toFixed(1)} MB ·{' '}
                    <Clock className="inline h-3 w-3 -mt-0.5" /> {timeAgo(s.updatedAtMs)}
                  </p>
                </div>

                {/* Tick marks per stage */}
                <div className="flex items-center gap-1 shrink-0" aria-label={`${done} of ${s.stages.length} stages published`}>
                  {s.stages.map((st, i) => (
                    <span key={i} title={`Stage ${i + 1} · ${stageLabel(i, s.stages.length)}`}>
                      {st.result ? (
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                      ) : (
                        <span className="block h-4 w-4 rounded-full border border-white/15" />
                      )}
                    </span>
                  ))}
                </div>
                <span className="text-xs font-mono text-white/50 shrink-0 w-8 text-right">
                  {done}/{s.stages.length}
                </span>

                <button
                  onClick={() => onResume(s)}
                  data-testid={`resume-${s.dripId}`}
                  className="px-3 py-1.5 rounded-lg bg-[#00F5FF]/10 border border-[#00F5FF]/30 text-xs text-[#00F5FF] hover:bg-[#00F5FF]/20 transition-colors shrink-0"
                >
                  Resume
                </button>
                <button
                  onClick={() => onDelete(s.dripId)}
                  aria-label={`Delete ${s.title || 'draft'}`}
                  className="p-1.5 rounded-lg text-white/25 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {sessions.length === 0 && (
        <p className="text-center text-sm text-white/30 py-4">
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
