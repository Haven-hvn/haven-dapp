'use client'

import React from 'react'
import { CheckCircle2, Download, Loader2, Clock, XCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DownloadQueueItem } from '@/hooks/useDownloadQueue'

export interface DownloadQueuePanelProps {
  queue: DownloadQueueItem[]
  isProcessing: boolean
  currentItem: DownloadQueueItem | null
  completedCount: number
  totalCount: number
  onCancel: () => void
  onClear: () => void
  onRemoveItem: (videoId: string) => void
}

function StatusIcon({ status }: { status: DownloadQueueItem['status'] }) {
  switch (status) {
    case 'complete':
      return <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
    case 'downloading':
    case 'decrypting':
      return <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
    case 'error':
      return <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />
    default:
      return <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
  }
}

export function DownloadQueuePanel({
  queue,
  isProcessing,
  completedCount,
  totalCount,
  onCancel,
  onClear,
  onRemoveItem,
}: DownloadQueuePanelProps) {
  if (queue.length === 0) return null

  const allDone = !isProcessing && queue.every(
    (item) => item.status === 'complete' || item.status === 'error'
  )

  return (
    <div className="border rounded-lg bg-background shadow-sm mt-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          <span className="text-sm font-medium">
            Download Queue ({completedCount}/{totalCount} complete)
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isProcessing && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {allDone && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="max-h-60 overflow-y-auto divide-y">
        {queue.map((item) => (
          <div
            key={item.video.id}
            className="flex items-center gap-3 px-4 py-2"
          >
            <StatusIcon status={item.status} />

            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{item.video.title}</p>

              {/* Human-readable status text */}
              {item.statusText && item.status !== 'complete' && item.status !== 'error' && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {item.statusText}
                </p>
              )}

              {item.status === 'error' && item.error && (
                <p className="text-xs text-destructive truncate">
                  {item.error.message}
                </p>
              )}

              {(item.status === 'downloading' || item.status === 'decrypting') && (
                <div className="mt-1 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}

              {item.status === 'complete' && (
                <p className="text-xs text-green-600 truncate mt-0.5">
                  ✓ Downloaded
                </p>
              )}
            </div>

            {item.status === 'pending' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0"
                onClick={() => onRemoveItem(item.video.id)}
                aria-label={`Remove ${item.video.title} from queue`}
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
