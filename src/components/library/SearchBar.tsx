'use client'

/**
 * Search Bar Component
 * 
 * Provides a debounced search input with clear button.
 * Used for filtering videos by title and creator.
 * 
 * @module components/library/SearchBar
 */

import { useState, useEffect, useCallback } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface SearchBarProps {
  /** Current search value */
  value: string
  /** Callback when search value changes (debounced) */
  onChange: (value: string) => void
  /** Placeholder text */
  placeholder?: string
  /** Debounce delay in milliseconds */
  debounceMs?: number
}

/**
 * Search bar with debounced input and clear button.
 * 
 * Features:
 * - Debounced onChange callback (300ms default)
 * - Clear button when input has value
 * - Search icon
 * - Accessible input
 */
export function SearchBar({ 
  value, 
  onChange, 
  placeholder = 'Search videos...',
  debounceMs = 300 
}: SearchBarProps) {
  const [inputValue, setInputValue] = useState(value)
  
  // Debounce input changes
  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(inputValue)
    }, debounceMs)
    
    return () => clearTimeout(timer)
  }, [inputValue, onChange, debounceMs])
  
  // Sync with external value
  useEffect(() => {
    setInputValue(value)
  }, [value])
  
  const handleClear = useCallback(() => {
    setInputValue('')
    onChange('')
  }, [onChange])
  
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <Input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder={placeholder}
        className="pl-10 pr-10 w-full min-h-[44px] text-base-ios touch-manipulation"
        aria-label="Search videos"
      />
      {inputValue && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 min-h-[32px] min-w-[32px] hover:bg-transparent touch-manipulation"
          onClick={handleClear}
          aria-label="Clear search"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </Button>
      )}
    </div>
  )
}
