'use client'

import React from 'react'
import { Check, Key, Download, Unlock, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VideoCard } from './VideoCard'
import { toast } from 'sonner'
import type { Video } from '@/types'
import type { QueueItemStatus } from '@/hooks/useDownloadQueue'

export interface SelectableVideoCardProps {
  video: Video
  isSelectMode: boolean
  isSelected: boolean
  selectionOrder: number | null
  isMaxReached: boolean
  onToggleSelection: (video: Video) => void
  onClick: (video: Video) => void
  isCached: boolean
  /** Queue status for this video (if it's being batch-processed) */
  queueStatus?: QueueItemStatus
  /** Queue progress (0-100) */
  queueProgress?: number
}

/**
 * Compact step indicator shown on the video card during batch pre-caching.
 */
function QueueOverlay({ status, progress }: { status: QueueItemStatus; progress: number }) {
  const getIcon = () => {
    switch (status) {
      case 'pending':
        return <Loader2 className="w-3 h-3 text-white/80" />
      case 'downloading':
        return <Download className="w-3 h-3 text-white" />
      case 'decrypting':
        return <Unlock className="w-3 h-3 text-white" />
      case 'complete':
        return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
      case 'error':
        return null
      default:
        return null
    }
  }

  const getLabel = () => {
    switch (status) {
      case 'pending':
        return 'Queued'
      case 'downloading':
        return 'Fetching'
      case 'decrypting':
        return 'Decrypting'
      case 'complete':
        return 'Cached'
      case 'error':
        return 'Failed'
      default:
        return ''
    }
  }

  if (status === 'complete') {
    // Brief flash of success — the cached badge will take over
    return (
      <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center bg-black/30 rounded-t-lg transition-opacity duration-500">
        <div className="flex items-center gap-1 px-2 py-1 rounded bg-green-600/90 text-white text-xs font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Ready</span>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center bg-black/30 rounded-t-lg">
        <div className="px-2 py-1 rounded bg-red-600/90 text-white text-xs font-medium">
          Failed
        </div>
      </div>
    )
  }

  const showProgressBar = status === 'downloading' || status === 'decrypting'

  return (
    <div className="absolute inset-0 z-20 pointer-events-none rounded-t-lg">
      {/* Step indicator badge (top-left area, below any existing badges) */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-xs">
        {getIcon()}
        <span>{getLabel()}</span>
      </div>

      {/* Progress bar at the very bottom of the thumbnail */}
      {showProgressBar && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
          <div
            className={cn(
              'h-full transition-all duration-300',
              status === 'downloading' ? 'bg-blue-500' : 'bg-purple-500'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  )
}

export function SelectableVideoCard({
  video,
  isSelectMode,
  isSelected,
  selectionOrder,
  isMaxReached,
  onToggleSelection,
  onClick,
  isCached,
  queueStatus,
  queueProgress = 0,
}: SelectableVideoCardProps) {
  const isInQueue = queueStatus && queueStatus !== 'complete'

  if (!isSelectMode) {
    return (
      <div className="relative">
        {queueStatus && (
          <div className="relative">
            <VideoCard video={video} onClick={onClick} isCached={isCached || queueStatus === 'complete'} />
            {/* Queue overlay on thumbnail area only */}
            <div className="absolute top-0 left-0 right-0 aspect-video">
              <QueueOverlay status={queueStatus} progress={queueProgress} />
            </div>
          </div>
        )}
        {!queueStatus && <VideoCard video={video} onClick={onClick} isCached={isCached} />}
      </div>
    )
  }

  const handleClick = () => {
    if (isMaxReached && !isSelected) {
      toast.warning('Max 20 videos selected')
      return
    }
    onToggleSelection(video)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  return (
    <div
      role="checkbox"
      aria-checked={isSelected}
      aria-label={`Select ${video.title}`}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative rounded-lg cursor-pointer transition-all',
        isSelected && 'ring-2 ring-primary',
        isMaxReached && !isSelected && 'opacity-50'
      )}
    >
      {/* Checkbox overlay */}
      <div className="absolute top-2 left-2 z-10">
        <div
          className={cn(
            'w-6 h-6 rounded border-2 flex items-center justify-center transition-colors',
            isSelected
              ? 'bg-primary border-primary text-primary-foreground'
              : 'bg-background/80 border-muted-foreground/50 backdrop-blur-sm'
          )}
        >
          {isSelected && <Check className="w-4 h-4" />}
        </div>
      </div>

      {/* Order badge */}
      {selectionOrder !== null && (
        <div
          className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center"
          aria-label={`Selection order ${selectionOrder}`}
        >
          {selectionOrder}
        </div>
      )}

      {/* Render VideoCard without its own click handler */}
      <div className="pointer-events-none">
        <VideoCard video={video} isCached={isCached} />
      </div>
    </div>
  )
}
