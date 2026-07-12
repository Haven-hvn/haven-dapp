'use client'

/**
 * View Toggle Component
 * 
 * Toggle between grid and list view modes for the video library.
 * 
 * @module components/library/ViewToggle
 */

import { LayoutGrid, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ViewMode } from '@/types'

interface ViewToggleProps {
  /** Current view mode */
  mode: ViewMode
  /** Callback when view mode changes */
  onChange: (mode: ViewMode) => void
}

/**
 * Toggle button group for switching between grid and list views.
 * 
 * Features:
 * - Grid view button
 * - List view button
 * - Active state highlighting
 * - Accessible button labels
 */
export function ViewToggle({ mode, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center border rounded-md overflow-hidden">
      <Button
        variant={mode === 'grid' ? 'secondary' : 'ghost'}
        size="icon"
        className="rounded-none h-10 w-10 sm:h-9 sm:w-9 min-h-[40px] min-w-[40px] touch-manipulation"
        onClick={() => onChange('grid')}
        aria-label="Grid view"
        aria-pressed={mode === 'grid'}
      >
        <LayoutGrid className="w-4 h-4" />
      </Button>
      <Button
        variant={mode === 'list' ? 'secondary' : 'ghost'}
        size="icon"
        className="rounded-none h-10 w-10 sm:h-9 sm:w-9 min-h-[40px] min-w-[40px] touch-manipulation"
        onClick={() => onChange('list')}
        aria-label="List view"
        aria-pressed={mode === 'list'}
      >
        <List className="w-4 h-4" />
      </Button>
    </div>
  )
}
