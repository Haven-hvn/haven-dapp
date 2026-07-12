/**
 * Format Utilities for Haven Web DApp
 * 
 * Provides formatting functions for displaying video metadata,
 * durations, dates, and other UI elements.
 * 
 * @module lib/format
 */

// ============================================================================
// Duration Formatting
// ============================================================================

/**
 * Format duration in seconds to display string.
 * 
 * @param seconds - Duration in seconds
 * @returns Formatted string (e.g., "01:30" or "01:30:45")
 * 
 * @example
 * ```typescript
 * formatDuration(90) // "01:30"
 * formatDuration(3661) // "01:01:01"
 * ```
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00'
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  const pad = (n: number) => n.toString().padStart(2, '0')
  
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(secs)}`
  }
  
  return `${minutes}:${pad(secs)}`
}

// ============================================================================
// Date Formatting
// ============================================================================

/**
 * Format a date for display.
 * 
 * @param date - Date to format (Date object or string)
 * @returns Formatted date string (e.g., "Jan 15, 2024")
 */
export function formatDate(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' 
    ? new Date(date) 
    : date
  
  if (isNaN(d.getTime())) {
    return 'Invalid date'
  }
  
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d)
}

/**
 * Format relative time (e.g., "2 hours ago").
 * 
 * @param date - Date to format
 * @returns Relative time string
 */
export function formatRelativeTime(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number'
    ? new Date(date)
    : date
  
  if (isNaN(d.getTime())) {
    return 'Invalid date'
  }
  
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
 * Format file size in bytes to human-readable string.
 * 
 * @param bytes - Size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`
}

/**
 * Format number with commas as thousands separators.
 * 
 * @param num - Number to format
 * @returns Formatted string (e.g., "1,234,567")
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num)
}

/**
 * Format a count with proper pluralization.
 * 
 * @param count - The count
 * @param singular - Singular form of the word
 * @param plural - Plural form of the word (optional, defaults to singular + 's')
 * @returns Formatted string (e.g., "1 video", "5 videos")
 */
export function formatCount(count: number, singular: string, plural?: string): string {
  const pluralForm = plural || `${singular}s`
  return `${count} ${count === 1 ? singular : pluralForm}`
}
