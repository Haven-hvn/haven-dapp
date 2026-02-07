'use client'

/**
 * Filter Controls Component
 * 
 * Dropdown menu for filtering videos by encrypted status and AI data availability.
 * 
 * @module components/library/FilterControls
 */

import { Lock, Sparkles, Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import type { VideoFilters } from '@/types'

interface FilterControlsProps {
  /** Current filter state */
  filters: VideoFilters
  /** Callback when filters change */
  onChange: (filters: VideoFilters) => void
}

/**
 * Filter controls dropdown for video library.
 * 
 * Features:
 * - Filter by encrypted status
 * - Filter by AI data availability
 * - Clear all filters
 * - Active filter indicator
 */
export function FilterControls({ filters, onChange }: FilterControlsProps) {
  const hasActiveFilters = 
    filters.encrypted !== undefined || 
    filters.hasAiData !== undefined
  
  const handleClearFilters = () => {
    onChange({})
  }
  
  const handleEncryptedChange = (checked: boolean) => {
    onChange({ 
      ...filters, 
      encrypted: checked ? true : undefined 
    })
  }
  
  const handleAiDataChange = (checked: boolean) => {
    onChange({ 
      ...filters, 
      hasAiData: checked ? true : undefined 
    })
  }
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="icon"
          className={`
            ${hasActiveFilters ? 'bg-primary/10 border-primary/30' : ''}
            min-h-[44px] min-w-[44px] touch-manipulation
          `}
          aria-label="Filter videos"
        >
          <Filter className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-sm font-semibold">
          Filter Videos
        </div>
        
        <DropdownMenuCheckboxItem
          checked={filters.encrypted === true}
          onCheckedChange={handleEncryptedChange}
        >
          <Lock className="w-4 h-4 mr-2" />
          Encrypted only
        </DropdownMenuCheckboxItem>
        
        <DropdownMenuCheckboxItem
          checked={filters.hasAiData === true}
          onCheckedChange={handleAiDataChange}
        >
          <Sparkles className="w-4 h-4 mr-2" />
          With AI analysis
        </DropdownMenuCheckboxItem>
        
        {hasActiveFilters && (
          <>
            <DropdownMenuSeparator />
            <div className="p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-muted-foreground hover:text-foreground"
                onClick={handleClearFilters}
              >
                <X className="w-4 h-4 mr-2" />
                Clear filters
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
