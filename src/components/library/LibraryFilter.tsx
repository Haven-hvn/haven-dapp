/**
 * LibraryFilter Component
 *
 * Filter bar for the video library with options to show/hide expired videos.
 * Integrates with the Zustand cache store for state management.
 *
 * Features:
 * - Toggle for showing expired videos
 * - Count of cached videos
 * - Responsive layout
 * - Dark mode support
 */

'use client'

import React from 'react'
import { useCachePreferences } from '../../stores/cacheStore'

// =============================================================================
// Types
// =============================================================================

export interface LibraryFilterProps {
  /** Number of expired videos in cache */
  expiredCount: number

  /** Number of active videos */
  activeCount: number

  /** Optional total count for display */
  totalCount?: number

  /** Optional additional className */
  className?: string

  /** Optional callback when filter changes */
  onFilterChange?: (showExpired: boolean) => void
}

// =============================================================================
// Icons
// =============================================================================

/**
 * Filter icon
 */
function FilterIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z"
      />
    </svg>
  )
}

/**
 * Check icon for checked state
 */
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

// =============================================================================
// Components
// =============================================================================

/**
 * Checkbox component for the filter toggle
 */
interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  id: string
  children: React.ReactNode
}

function Checkbox({ checked, onChange, id, children }: CheckboxProps) {
  return (
    <label
      htmlFor={id}
      className="
        inline-flex items-center gap-2 cursor-pointer
        text-sm text-gray-700 dark:text-gray-300
        select-none
      "
    >
      <span className="relative inline-flex">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="
            peer sr-only
          "
        />
        <span
          className="
            w-4 h-4 rounded
            border-2 border-gray-300 dark:border-gray-600
            bg-white dark:bg-gray-800
            peer-checked:bg-amber-500 peer-checked:border-amber-500
            peer-focus:ring-2 peer-focus:ring-amber-500/50
            transition-colors
          "
          aria-hidden="true"
        />
        <CheckIcon
          className="
            absolute inset-0 m-auto w-3 h-3
            text-white
            opacity-0 peer-checked:opacity-100
            transition-opacity
          "
        />
      </span>
      {children}
    </label>
  )
}

/**
 * LibraryFilter - Filter bar for video library
 *
 * Shows options to filter videos by cache status.
 * Integrates with the Zustand cache store for the "show expired" preference.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <LibraryFilter expiredCount={5} activeCount={10} />
 *
 * // With filter change callback
 * <LibraryFilter
 *   expiredCount={5}
 *   activeCount={10}
 *   onFilterChange={(showExpired) => console.log('Show expired:', showExpired)}
 * />
 * ```
 */
export function LibraryFilter({
  expiredCount,
  activeCount,
  totalCount,
  className = '',
  onFilterChange,
}: LibraryFilterProps) {
  // Get preferences from Zustand store
  const { showExpiredVideos, toggleShowExpiredVideos } = useCachePreferences()

  const handleToggle = () => {
    toggleShowExpiredVideos()
    onFilterChange?.(!showExpiredVideos)
  }

  const showingCount = showExpiredVideos ? totalCount || activeCount + expiredCount : activeCount

  return (
    <div
      className={`
        flex flex-wrap items-center gap-4
        p-3 rounded-lg
        bg-gray-50 dark:bg-gray-900
        border border-gray-200 dark:border-gray-800
        ${className}
      `}
    >
      {/* Filter icon and label */}
      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
        <FilterIcon className="h-4 w-4" />
        <span className="text-sm font-medium">Filters</span>
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-gray-300 dark:bg-gray-700" />

      {/* Show expired checkbox */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="show-expired"
          checked={showExpiredVideos}
          onChange={() => handleToggle()}
        >
          Show expired videos
        </Checkbox>

        {expiredCount > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            ({expiredCount} cached locally)
          </span>
        )}
      </div>

      {/* Results count */}
      <div className="ml-auto text-sm text-gray-500 dark:text-gray-400">
        Showing {showingCount} video{showingCount !== 1 ? 's' : ''}
        {!showExpiredVideos && expiredCount > 0 && (
          <span className="text-gray-400 dark:text-gray-500">
            {' '}(+{expiredCount} hidden)
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * LibraryFilterSkeleton - Loading placeholder for LibraryFilter
 */
export function LibraryFilterSkeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`
        flex items-center gap-4
        p-3 rounded-lg
        bg-gray-50 dark:bg-gray-900
        border border-gray-200 dark:border-gray-800
        ${className}
      `}
    >
      <div className="h-4 w-16 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
      <div className="h-4 w-px bg-gray-300 dark:bg-gray-700" />
      <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
      <div className="ml-auto h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
    </div>
  )
}

/**
 * Simple standalone toggle for "Show expired videos"
 *
 * Use this when you need just the checkbox without the full filter bar.
 */
export function ShowExpiredToggle({
  className = '',
  onChange,
}: {
  className?: string
  onChange?: (showExpired: boolean) => void
}) {
  const { showExpiredVideos, toggleShowExpiredVideos } = useCachePreferences()

  const handleToggle = () => {
    toggleShowExpiredVideos()
    onChange?.(!showExpiredVideos)
  }

  return (
    <Checkbox
      id="show-expired-simple"
      checked={showExpiredVideos}
      onChange={() => handleToggle()}
    >
      <span className={className}>Show expired videos</span>
    </Checkbox>
  )
}
