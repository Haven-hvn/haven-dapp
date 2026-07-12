'use client'

import React from 'react'
import { CheckSquare, Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface MultiSelectToolbarProps {
  isSelectMode: boolean
  onToggleSelectMode: () => void
  selectedCount: number
  isMaxReached: boolean
  onDownloadAll: () => void
  onClearSelection: () => void
  isProcessing: boolean
}

export function MultiSelectToolbar({
  isSelectMode,
  onToggleSelectMode,
  selectedCount,
  onDownloadAll,
  onClearSelection,
  isProcessing,
}: MultiSelectToolbarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        variant={isSelectMode ? 'secondary' : 'outline'}
        size="sm"
        onClick={onToggleSelectMode}
        aria-pressed={isSelectMode}
      >
        <CheckSquare className="w-4 h-4" />
        <span className="hidden sm:inline">Select</span>
      </Button>

      {isSelectMode && (
        <>
          <span className="text-sm text-muted-foreground">
            {selectedCount} selected
          </span>

          {selectedCount > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearSelection}
                aria-label="Clear selection"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Clear</span>
              </Button>

              <Button
                size="sm"
                onClick={onDownloadAll}
                disabled={isProcessing}
                aria-label={`Download ${selectedCount} selected videos`}
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Download All</span>
              </Button>
            </>
          )}
        </>
      )}
    </div>
  )
}
