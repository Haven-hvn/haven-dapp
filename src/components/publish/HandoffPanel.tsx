'use client'

/**
 * HandoffPanel — export/import drip manifests ("hand-off kits").
 *
 * A manifest is the complete, SECRET-FREE description of a drip session:
 * plan, source commitment, gate config and any committed stage results.
 * Send it to a teammate together with the original file and they can
 * publish the next unlock stage from their own wallet — the VetKD/IBE
 * design needs no shared secrets between uploaders.
 *
 * @module components/publish/HandoffPanel
 */

import { useRef } from 'react'
import { FileDown, FileUp, Link2, Users } from 'lucide-react'

import {
  parseDripManifest,
  toDripManifest,
  completedStageCount,
  type DripSession,
} from '@/lib/v4/drip-session'
import { useToast } from '@/hooks/useToast'

export interface HandoffPanelProps {
  session: DripSession
  /** First published entity key, when a shareable watch link exists. */
  firstEntityKey?: string
  onImported: (session: DripSession) => void
}

export function HandoffPanel({ session, firstEntityKey, onImported }: HandoffPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  const downloadManifest = () => {
    const blob = new Blob([JSON.stringify(toDripManifest(session), null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const safeName = (session.title || 'drip').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
    anchor.href = url
    anchor.download = `${safeName}-stage-${completedStageCount(session)}of${session.stages.length}.manifest.json`
    anchor.click()
    URL.revokeObjectURL(url)
    toast.showSuccess('Hand-off kit downloaded — pair it with the original film.')
  }

  const copyWatchLink = async () => {
    if (!firstEntityKey) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/watch?v=${firstEntityKey}`)
      toast.showSuccess('Watch link copied.')
    } catch {
      toast.showError('Could not access the clipboard.')
    }
  }

  const importManifestFile = async (file: File | null) => {
    if (!file) return
    try {
      const parsed = parseDripManifest(JSON.parse(await file.text()))
      if (!parsed) throw new Error('invalid manifest')
      onImported(parsed)
      toast.showSuccess(`Loaded "${parsed.title || 'drip'}" — ${completedStageCount(parsed)}/${parsed.stages.length} stages published.`)
    } catch {
      toast.showError('That file is not a valid Haven drip manifest.')
    }
  }

  return (
    <div className="border border-line bg-card p-5 space-y-3" data-testid="handoff-panel">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-seal-text" />
        <p className="text-sm font-medium text-fg/85">Stage handoff</p>
      </div>
      <p className="text-xs leading-relaxed text-fg-3">
        Any teammate can upload the next stage from their own wallet. Send them this manifest
        plus the original film — it carries the plan, hashes and progress but never key material,
        and their uploads are hash-verified against this commitment.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={downloadManifest}
          data-testid="handoff-export"
          className="inline-flex items-center gap-2 px-3 py-1.5 border border-line-strong text-xs text-fg-2 hover:border-seal hover:text-fg transition-colors"
        >
          <FileDown className="h-3.5 w-3.5" /> Download hand-off kit
        </button>
        <button
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 px-3 py-1.5 border border-line-strong text-xs text-fg-2 hover:border-seal hover:text-fg transition-colors"
        >
          <FileUp className="h-3.5 w-3.5" /> Import kit
        </button>
        {firstEntityKey && (
          <button
            onClick={() => void copyWatchLink()}
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-line-strong text-xs text-fg-2 hover:border-seal hover:text-fg transition-colors"
            title="Copy watch link"
          >
            <Link2 className="h-3.5 w-3.5" /> Copy watch link
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => void importManifestFile(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}
