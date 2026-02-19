/**
 * AllExpiredEmptyState Component
 *
 * Empty state displayed when all videos have expired and only cache remains.
 * Reassures users that their data is safely preserved locally.
 *
 * Features:
 * - Reassuring messaging (not alarming)
 * - Visual indicator with database icon
 * - Dark mode support
 * - Accessible
 */

'use client'

import React from 'react'

// =============================================================================
// Types
// =============================================================================

export interface AllExpiredEmptyStateProps {
  /** Number of videos in cache */
  cachedVideoCount: number

  /** Optional title override */
  title?: string

  /** Optional description override */
  description?: string

  /** Optional action button */
  action?: {
    label: string
    onClick: () => void
  }

  /** Optional additional className */
  className?: string
}

// =============================================================================
// Icons
// =============================================================================

/**
 * Database icon for cache representation
 */
function DatabaseIcon({ className }: { className?: string }) {
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
        d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
      />
    </svg>
  )
}

/**
 * Check circle icon for reassurance
 */
function CheckCircleIcon({ className }: { className?: string }) {
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
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

/**
 * Shield check icon for security/preservation
 */
function ShieldCheckIcon({ className }: { className?: string }) {
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
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.052 3.875 9.893 9 10.925 5.125-1.032 9-5.873 9-10.925 0-1.322-.207-2.6-.598-3.751A11.959 11.959 0 0112 2.598z"
      />
    </svg>
  )
}

// =============================================================================
// Component
// =============================================================================

/**
 * AllExpiredEmptyState - Empty state when all videos are cached locally
 *
 * Displays reassuring messaging that all Arkiv entities have expired
 * but video metadata is safely stored in the browser's local cache.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <AllExpiredEmptyState cachedVideoCount={10} />
 *
 * // With custom action
 * <AllExpiredEmptyState
 *   cachedVideoCount={10}
 *   action={{ label: 'Upload new video', onClick: handleUpload }}
 * />
 *
 * // With custom messaging
 * <AllExpiredEmptyState
 *   cachedVideoCount={10}
 *   title="Your archive is preserved"
 *   description="All videos are safely stored..."
 * />
 * ```
 */
export function AllExpiredEmptyState({
  cachedVideoCount,
  title,
  description,
  action,
  className = '',
}: AllExpiredEmptyStateProps) {
  const defaultTitle = 'All videos preserved locally'
  const defaultDescription = `Your Arkiv entities have expired, but all ${cachedVideoCount} video${cachedVideoCount !== 1 ? 's are' : ' is'} safely stored in your browser's local cache. Video content remains accessible on Filecoin via Synapse SDK.`

  return (
    <div
      className={`
        text-center py-12 px-4
        ${className}
      `}
      role="status"
      aria-live="polite"
    >
      {/* Icon container */}
      <div className="relative inline-block mb-4">
        {/* Main database icon */}
        <div className="
          inline-flex items-center justify-center
          w-16 h-16 rounded-full
          bg-amber-100 dark:bg-amber-900/30
        ">
          <DatabaseIcon className="h-8 w-8 text-amber-600 dark:text-amber-500" />
        </div>

        {/* Check badge */}
        <div className="
          absolute -bottom-1 -right-1
          inline-flex items-center justify-center
          w-7 h-7 rounded-full
          bg-green-100 dark:bg-green-900/50
          border-2 border-white dark:border-gray-900
        ">
          <CheckCircleIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
        </div>
      </div>

      {/* Title */}
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
        {title ?? defaultTitle}
      </h3>

      {/* Description */}
      <p className="text-muted-foreground mt-2 max-w-md mx-auto text-sm leading-relaxed">
        {description ?? defaultDescription}
      </p>

      {/* Info cards */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
        {/* Metadata preserved card */}
        <div className="
          p-4 rounded-lg text-left
          bg-amber-50/50 dark:bg-amber-950/20
          border border-amber-100 dark:border-amber-900/30
        ">
          <div className="flex items-start gap-3">
            <DatabaseIcon className="h-5 w-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-sm text-amber-800 dark:text-amber-200">
                Metadata preserved
              </h4>
              <p className="text-xs text-amber-700/70 dark:text-amber-300/70 mt-1">
                Video titles, descriptions, and metadata are safely stored in your browser
              </p>
            </div>
          </div>
        </div>

        {/* Content accessible card */}
        <div className="
          p-4 rounded-lg text-left
          bg-blue-50/50 dark:bg-blue-950/20
          border border-blue-100 dark:border-blue-900/30
        ">
          <div className="flex items-start gap-3">
            <ShieldCheckIcon className="h-5 w-5 text-blue-600 dark:text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-sm text-blue-800 dark:text-blue-200">
                Content accessible
              </h4>
              <p className="text-xs text-blue-700/70 dark:text-blue-300/70 mt-1">
                Video files remain available on Filecoin via Synapse SDK
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Optional action button */}
      {action && (
        <div className="mt-8">
          <button
            type="button"
            onClick={action.onClick}
            className="
              inline-flex items-center justify-center
              px-4 py-2 rounded-md
              bg-amber-600 hover:bg-amber-700
              dark:bg-amber-600 dark:hover:bg-amber-700
              text-white text-sm font-medium
              transition-colors
              focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2
              dark:focus:ring-offset-gray-900
            "
          >
            {action.label}
          </button>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Variants
// =============================================================================

/**
 * NoVideosEmptyState - Empty state when there are no videos at all
 *
 * Shows a different message when the library is completely empty.
 */
export function NoVideosEmptyState({
  action,
  className = '',
}: {
  action?: { label: string; onClick: () => void }
  className?: string
}) {
  return (
    <div
      className={`
        text-center py-12 px-4
        ${className}
      `}
      role="status"
    >
      <div className="
        inline-flex items-center justify-center
        w-16 h-16 rounded-full
        bg-gray-100 dark:bg-gray-800
        mb-4
      ">
        <DatabaseIcon className="h-8 w-8 text-gray-400 dark:text-gray-500" />
      </div>

      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
        No videos yet
      </h3>

      <p className="text-muted-foreground mt-2 max-w-md mx-auto text-sm">
        Your video library is empty. Upload your first video to get started.
      </p>

      {action && (
        <div className="mt-6">
          <button
            type="button"
            onClick={action.onClick}
            className="
              inline-flex items-center justify-center
              px-4 py-2 rounded-md
              bg-primary hover:bg-primary/90
              text-primary-foreground text-sm font-medium
              transition-colors
              focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
              dark:focus:ring-offset-gray-900
            "
          >
            {action.label}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * FilteredEmptyState - Empty state when filters hide all videos
 *
 * Shows when the current filter settings result in no visible videos.
 */
export function FilteredEmptyState({
  onClearFilters,
  className = '',
}: {
  onClearFilters: () => void
  className?: string
}) {
  return (
    <div
      className={`
        text-center py-12 px-4
        ${className}
      `}
      role="status"
    >
      <div className="
        inline-flex items-center justify-center
        w-12 h-12 rounded-full
        bg-gray-100 dark:bg-gray-800
        mb-3
      ">
        <DatabaseIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
      </div>

      <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">
        No videos match your filters
      </h3>

      <p className="text-muted-foreground mt-1 text-sm">
        Try adjusting your filter settings to see more videos.
      </p>

      <button
        type="button"
        onClick={onClearFilters}
        className="
          mt-4 text-sm text-primary hover:text-primary/80
          underline underline-offset-2
          focus:outline-none focus:ring-2 focus:ring-primary rounded
        "
      >
        Clear all filters
      </button>
    </div>
  )
}
