/**
 * UI Types for Haven Web DApp
 * 
 * Defines TypeScript interfaces for UI component data structures,
 * view states, filters, and pagination.
 * 
 * @module types/ui
 */

import type { Video, VideoProcessingStatus, VideoFilters, DateRange, DurationRange } from './video'

// ============================================================================
// Video Card Types
// ============================================================================

/**
 * Video card display data.
 * Derived from Video, formatted for UI components.
 * 
 * This is a flattened, UI-optimized version of the Video entity
 * with pre-formatted strings for display.
 * 
 * @example
 * ```typescript
 * const cardData: VideoCardData = {
 *   id: '0x123...',
 *   title: 'My Video',
 *   thumbnailUrl: 'https://...',
 *   duration: '01:30:45',
 *   durationSeconds: 5445,
 *   isEncrypted: true,
 *   hasAiData: true,
 *   createdAt: 'Jan 15, 2024',
 *   creatorHandle: '@username',
 * }
 * ```
 */
export interface VideoCardData {
  /** Entity ID */
  id: string
  
  /** Video title */
  title: string
  
  /** URL to thumbnail image */
  thumbnailUrl?: string
  
  /** Duration formatted as string (e.g., "MM:SS" or "HH:MM:SS") */
  duration: string
  
  /** Duration in seconds (for sorting/filtering) */
  durationSeconds: number
  
  /** Whether the video is encrypted */
  isEncrypted: boolean
  
  /** Whether AI analysis data is available */
  hasAiData: boolean
  
  /** Formatted creation date */
  createdAt: string
  
  /** Original Date object (for sorting) */
  createdAtDate: Date
  
  /** Creator handle/username (if available) */
  creatorHandle?: string
  
  /** Current processing status (if applicable) */
  processingStatus?: VideoProcessingStatus
  
  /** Processing progress percentage (0-100) */
  processingProgress?: number
}

/**
 * Props for video card components.
 */
export interface VideoCardProps {
  /** Video data to display */
  video: VideoCardData
  
  /** Layout variant */
  variant?: 'default' | 'compact' | 'detailed'
  
  /** Whether the card is selected */
  isSelected?: boolean
  
  /** Click handler */
  onClick?: (video: VideoCardData) => void
  
  /** Select handler */
  onSelect?: (video: VideoCardData, selected: boolean) => void
  
  /** More actions handler */
  onMoreActions?: (video: VideoCardData) => void
}

// ============================================================================
// Library View Types
// ============================================================================

/**
 * Library view state.
 * Controls the display and organization of the video library.
 */
export interface LibraryState {
  /** Current view mode */
  viewMode: ViewMode
  
  /** Field to sort by */
  sortBy: SortField
  
  /** Sort order direction */
  sortOrder: SortOrder
  
  /** Current search query */
  searchQuery: string
  
  /** Applied filters */
  filters: VideoFilters
  
  /** Selected video IDs */
  selectedIds: string[]
}

/** View mode for library display */
export type ViewMode = 'grid' | 'list'

/** Fields that can be sorted */
export type SortField = 'date' | 'title' | 'duration' | 'created'

/** Sort order direction */
export type SortOrder = 'asc' | 'desc'

// Re-export filter types from video.ts for convenience
export type { VideoFilters, DateRange, DurationRange }

// ============================================================================
// Pagination Types
// ============================================================================

/**
 * Pagination state.
 */
export interface PaginationState {
  /** Current page number (1-based) */
  page: number
  
  /** Number of items per page */
  pageSize: number
  
  /** Total number of items (if known) */
  totalCount: number
  
  /** Whether there are more pages */
  hasMore: boolean
  
  /** Cursor for cursor-based pagination */
  cursor?: string
}

/**
 * Pagination options.
 */
export interface PaginationOptions {
  /** Page number to fetch */
  page?: number
  
  /** Number of items per page */
  pageSize?: number
  
  /** Cursor for pagination */
  cursor?: string
}

// ============================================================================
// Selection Types
// ============================================================================

/**
 * Selection state for bulk operations.
 */
export interface SelectionState {
  /** IDs of selected items */
  selectedIds: Set<string>
  
  /** Whether all items are selected (across all pages) */
  isAllSelected: boolean
  
  /** Whether selection mode is active */
  isSelectionMode: boolean
}

/**
 * Bulk action available for selected videos.
 */
export type BulkAction = 
  | 'delete'
  | 'download'
  | 'share'
  | 'encrypt'
  | 'decrypt'
  | 'mint'
  | 'tag'
  | 'export'

/**
 * Bulk action configuration.
 */
export interface BulkActionConfig {
  /** Action identifier */
  id: BulkAction
  
  /** Display label */
  label: string
  
  /** Icon name or component */
  icon: string
  
  /** Whether action requires confirmation */
  requiresConfirmation?: boolean
  
  /** Confirmation message */
  confirmationMessage?: string
  
  /** Whether action is destructive */
  isDestructive?: boolean
}

// ============================================================================
// Dialog/Modal Types
// ============================================================================

/**
 * Dialog state for modal management.
 */
export interface DialogState {
  /** Currently open dialog */
  openDialog: DialogType | null
  
  /** Data passed to the dialog */
  dialogData?: unknown
}

/** Available dialog types */
export type DialogType = 
  | 'videoDetails'
  | 'share'
  | 'encrypt'
  | 'delete'
  | 'upload'
  | 'import'
  | 'settings'
  | 'filters'

// ============================================================================
// Toast/Notification Types
// ============================================================================

/**
 * Toast notification types.
 */
export type ToastType = 'info' | 'success' | 'warning' | 'error'

/**
 * Toast notification.
 */
export interface Toast {
  /** Unique ID */
  id: string
  
  /** Message to display */
  message: string
  
  /** Notification type */
  type: ToastType
  
  /** Duration in milliseconds (undefined = persistent) */
  duration?: number
  
  /** Action button text */
  actionLabel?: string
  
  /** Action handler */
  onAction?: () => void
}

// ============================================================================
// Loading States
// ============================================================================

/**
 * Generic loading state.
 */
export type LoadingState = 'idle' | 'loading' | 'success' | 'error'

/**
 * Async operation state.
 */
export interface AsyncState<T = unknown> {
  /** Current state */
  state: LoadingState
  
  /** Data (if successful) */
  data?: T
  
  /** Error (if failed) */
  error?: Error
}

// ============================================================================
// Empty State Types
// ============================================================================

/**
 * Empty state configuration.
 */
export interface EmptyStateConfig {
  /** Icon to display */
  icon: string
  
  /** Title text */
  title: string
  
  /** Description text */
  description: string
  
  /** Primary action label */
  actionLabel?: string
  
  /** Primary action handler */
  onAction?: () => void
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format duration in seconds to display string.
 * 
 * @param seconds - Duration in seconds
 * @returns Formatted string (e.g., "01:30" or "01:30:45")
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0) return '00:00'
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  const pad = (n: number) => n.toString().padStart(2, '0')
  
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`
  }
  
  return `${pad(minutes)}:${pad(secs)}`
}

/**
 * Format a date for display.
 * 
 * @param date - Date to format
 * @returns Formatted date string
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Format relative time (e.g., "2 hours ago").
 * 
 * @param date - Date to format
 * @returns Relative time string
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffDays > 30) {
    return formatDate(d)
  } else if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  } else if (diffMins > 0) {
    return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
  } else {
    return 'Just now'
  }
}

/**
 * Convert a Video entity to VideoCardData.
 * 
 * @param video - Video entity
 * @returns VideoCardData for UI display
 */
export function videoToCardData(video: Video): VideoCardData {
  return {
    id: video.id,
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    duration: formatDuration(video.duration),
    durationSeconds: video.duration,
    isEncrypted: video.isEncrypted,
    hasAiData: video.hasAiData,
    createdAt: formatDate(video.createdAt),
    createdAtDate: video.createdAt,
    creatorHandle: video.creatorHandle,
    processingStatus: video.isLoading ? 'pending' : undefined,
  }
}

/**
 * Create default library state.
 * 
 * @returns Default LibraryState
 */
export function createDefaultLibraryState(): LibraryState {
  return {
    viewMode: 'grid',
    sortBy: 'date',
    sortOrder: 'desc',
    searchQuery: '',
    filters: {},
    selectedIds: [],
  }
}

/**
 * Create default pagination state.
 * 
 * @returns Default PaginationState
 */
export function createDefaultPaginationState(): PaginationState {
  return {
    page: 1,
    pageSize: 20,
    totalCount: 0,
    hasMore: false,
  }
}
