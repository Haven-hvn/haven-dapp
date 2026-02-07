/**
 * Type Definitions for Haven Web DApp
 * 
 * This module exports all TypeScript type definitions used throughout
 * the Haven Web DApp. Types are organized by domain:
 * 
 * - auth: Authentication and user types
 * - arkiv: Arkiv blockchain entity types
 * - lit: Lit Protocol encryption types
 * - video: Video entity and metadata types
 * - ui: UI component and state types
 * - guards: Type guards for runtime validation
 * 
 * @module types
 */

// ============================================================================
// Authentication Types
// ============================================================================

export * from './auth'

// ============================================================================
// Arkiv Entity Types
// ============================================================================

export * from './arkiv'

// ============================================================================
// Lit Protocol Types
// ============================================================================

export * from './lit'

// ============================================================================
// Video Entity Types
// ============================================================================

export * from './video'

// ============================================================================
// UI Types
// ============================================================================

// Export UI types except those already exported from video
// to avoid duplicate export errors
export type {
  // Video Card Types
  VideoCardData,
  VideoCardProps,
  // Library Types
  LibraryState,
  ViewMode,
  SortField,
  SortOrder,
  // Pagination Types
  PaginationState,
  PaginationOptions,
  // Selection Types
  SelectionState,
  BulkAction,
  BulkActionConfig,
  // Dialog Types
  DialogState,
  DialogType,
  // Toast Types
  ToastType,
  Toast,
  // Loading States
  LoadingState,
  AsyncState,
  // Empty State Types
  EmptyStateConfig,
} from './ui'

// Re-export filter types from video.ts (these are the canonical definitions)
export type {
  VideoFilters,
  DateRange,
  DurationRange,
  VideoCodec,
  CodecVariant,
} from './video'

// Export UI helper functions
export {
  formatDuration,
  formatDate,
  formatRelativeTime,
  videoToCardData,
  createDefaultLibraryState,
  createDefaultPaginationState,
} from './ui'

// ============================================================================
// Type Guards
// ============================================================================

export * from './guards'

// ============================================================================
// Legacy/Compatibility Exports
// ============================================================================

/**
 * Legacy ArkivEntity type from lib/arkiv.ts.
 * @deprecated Use ArkivEntity from './arkiv' instead
 */
export interface LegacyArkivEntity {
  key: string
  owner: string
  attributes: Record<string, unknown>
  payload: string
  content_type: string
  created_at: string
}

// ============================================================================
// Global Configuration Types
// ============================================================================

/**
 * Global Haven application configuration.
 */
export interface HavenConfig {
  /** Application name */
  name: string
  
  /** Application version */
  version: string
  
  /** Build timestamp */
  buildTime?: string
  
  /** Environment */
  environment: 'development' | 'staging' | 'production'
}

/**
 * API response wrapper.
 */
export interface ApiResponse<T = unknown> {
  /** Whether the request was successful */
  success: boolean
  
  /** Response data (if successful) */
  data?: T
  
  /** Error information (if failed) */
  error?: ApiError
}

/**
 * API error structure.
 */
export interface ApiError {
  /** Error code */
  code: string
  
  /** Human-readable error message */
  message: string
  
  /** Additional error details */
  details?: Record<string, unknown>
}

/**
 * Pagination parameters for API requests.
 */
export interface PaginationParams {
  /** Page number (1-based) */
  page?: number
  
  /** Items per page */
  limit?: number
  
  /** Cursor for cursor-based pagination */
  cursor?: string
}
