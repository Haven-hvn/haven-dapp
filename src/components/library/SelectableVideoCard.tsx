'use client'

import React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VideoCard } from './VideoCard'
import { toast } from 'sonner'
import type { Video } from '@/types'

export interface SelectableVideoCardProps {
  video: Video
  isSelectMode: boolean
  isSelected: boolean
  selectionOrder: number | null
  isMaxReached: boolean
  onToggleSelection: (video: Video) => void
  onClick: (video: Video) => void
  isCached: boolean
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
}: SelectableVideoCardProps) {
  if (!isSelectMode) {
    return <VideoCard video={video} onClick={onClick} isCached={isCached} />
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
