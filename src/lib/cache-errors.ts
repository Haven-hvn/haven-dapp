/**
 * Cache Error Logging & Reporting
 *
 * Provides structured error logging for cache-related operations.
 * Captures cache failures with context for debugging and allows
 * viewing recent errors in the settings page.
 *
 * @module lib/cache-errors
 * @see ./video-cache.ts - Uses these utilities for error reporting
 * @see ./cache-integrity.ts - Reports integrity check failures
 */

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes specific to Cache API operations.
 * These provide granular classification for debugging and recovery.
 */
export type CacheErrorCode =
  | 'CACHE_WRITE_FAILED'
  | 'CACHE_READ_FAILED'
  | 'CACHE_CORRUPTED'
  | 'QUOTA_EXCEEDED'
  | 'INTEGRITY_CHECK_FAILED'

/**
 * Structured cache error with context for debugging.
 */
export interface CacheError {
  /** Error code for programmatic handling */
  code: CacheErrorCode

  /** Human-readable error message */
  message: string

  /** Video ID associated with the error (if applicable) */
  videoId?: string

  /** Timestamp when the error occurred */
  timestamp: Date

  /** Original error that caused this (if any) */
  originalError?: Error

  /** Additional context about the error */
  context?: Record<string, unknown>
}

// ============================================================================
// Error Log Storage
// ============================================================================

const MAX_ERROR_LOG = 50

/**
 * In-memory error log for recent cache errors.
 * This is cleared on page refresh but provides debugging info for the session.
 */
const errorLog: CacheError[] = []

// ============================================================================
// Error Logging Functions
// ============================================================================

/**
 * Log a cache error with context.
 * Automatically trims the log to MAX_ERROR_LOG entries.
 *
 * @param error - The cache error to log
 *
 * @example
 * ```typescript
 * logCacheError({
 *   code: 'QUOTA_EXCEEDED',
 *   message: 'Storage quota exceeded while caching video',
 *   videoId: '0x123...',
 *   context: { estimatedSize: 1024 * 1024 }
 * })
 * ```
 */
export function logCacheError(error: Omit<CacheError, 'timestamp'>): void {
  const fullError: CacheError = {
    ...error,
    timestamp: new Date(),
  }

  errorLog.push(fullError)

  // Trim log to max size
  if (errorLog.length > MAX_ERROR_LOG) {
    errorLog.shift()
  }

  console.warn(`[CacheError] ${error.code}: ${error.message}`, {
    videoId: error.videoId,
    context: error.context,
    originalError: error.originalError,
  })
}

/**
 * Get all logged cache errors.
 * Returns a copy of the error log to prevent external mutation.
 *
 * @returns Array of cache errors (newest last)
 *
 * @example
 * ```typescript
 * const errors = getCacheErrors()
 * console.log(`${errors.length} cache errors logged`)
 * ```
 */
export function getCacheErrors(): CacheError[] {
  return [...errorLog]
}

/**
 * Get recent cache errors within a time window.
 *
 * @param since - Get errors since this timestamp
 * @returns Array of cache errors within the time window
 *
 * @example
 * ```typescript
 * // Get errors from the last hour
 * const recentErrors = getRecentCacheErrors(
 *   new Date(Date.now() - 60 * 60 * 1000)
 * )
 * ```
 */
export function getRecentCacheErrors(since: Date): CacheError[] {
  return errorLog.filter((error) => error.timestamp >= since)
}

/**
 * Clear all cache errors from the log.
 *
 * @example
 * ```typescript
 * clearCacheErrors()
 * console.log('Error log cleared')
 * ```
 */
export function clearCacheErrors(): void {
  errorLog.length = 0
}

/**
 * Get the count of errors by code.
 * Useful for displaying statistics in the settings page.
 *
 * @returns Map of error code to count
 *
 * @example
 * ```typescript
 * const counts = getCacheErrorCounts()
 * console.log(`Quota errors: ${counts.get('QUOTA_EXCEEDED') || 0}`)
 * ```
 */
export function getCacheErrorCounts(): Map<CacheErrorCode, number> {
  const counts = new Map<CacheErrorCode, number>()

  for (const error of errorLog) {
    const current = counts.get(error.code) || 0
    counts.set(error.code, current + 1)
  }

  return counts
}

/**
 * Check if there are any errors of a specific type.
 *
 * @param code - The error code to check for
 * @returns true if there are errors with this code
 */
export function hasCacheError(code: CacheErrorCode): boolean {
  return errorLog.some((error) => error.code === code)
}

// ============================================================================
// Error Classification Helpers
// ============================================================================

/**
 * Check if an error is a quota exceeded error.
 * Works with both DOMException and generic Error objects.
 *
 * @param error - The error to check
 * @returns true if this is a quota exceeded error
 */
export function isQuotaExceededError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'QuotaExceededError'
  }
  if (error instanceof Error) {
    return error.message.toLowerCase().includes('quota')
  }
  return false
}

/**
 * Check if an error is a cache corruption error.
 *
 * @param error - The error to check
 * @returns true if this indicates cache corruption
 */
export function isCorruptionError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'InvalidStateError' || error.name === 'DataError'
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return msg.includes('corrupt') || msg.includes('invalid') || msg.includes('checksum')
  }
  return false
}

/**
 * Create a standardized cache error from an unknown error.
 *
 * @param error - The unknown error
 * @param defaultCode - Default error code if classification fails
 * @returns CacheError with proper classification
 */
export function classifyCacheApiError(
  error: unknown,
  defaultCode: CacheErrorCode = 'CACHE_WRITE_FAILED'
): CacheErrorCode {
  if (isQuotaExceededError(error)) {
    return 'QUOTA_EXCEEDED'
  }
  if (isCorruptionError(error)) {
    return 'CACHE_CORRUPTED'
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('read') || msg.includes('fetch')) {
      return 'CACHE_READ_FAILED'
    }
    if (msg.includes('write') || msg.includes('put')) {
      return 'CACHE_WRITE_FAILED'
    }
    if (msg.includes('integrity') || msg.includes('verify')) {
      return 'INTEGRITY_CHECK_FAILED'
    }
  }
  return defaultCode
}
