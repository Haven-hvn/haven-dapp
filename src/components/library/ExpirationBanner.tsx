/**
 * ExpirationBanner Component
 *
 * A banner shown at the top of the library when videos are expiring soon
 * or have recently expired. Provides reassuring messaging about cache preservation.
 *
 * Features:
 * - Shows different messages for expiring vs expired videos
 * - Dismissible - user can close the banner
 * - Re-appears if new expirations are detected
 * - Uses warm amber tones (not alarming red)
 */

'use client'

import React, { useCallback, useEffect, useState } from 'react'

// =============================================================================
// Types
// =============================================================================

export interface ExpirationBannerProps {
  /** Number of videos expiring within 24 hours */
  expiringCount: number

  /** Number of videos that have already expired */
  expiredCount: number

  /** Callback when user dismisses the banner */
  onDismiss?: () => void

  /** Optional className for styling */
  className?: string

  /** Whether the banner has been dismissed (controlled) */
  dismissed?: boolean

  /** Callback when dismissed state changes */
  onDismissedChange?: (dismissed: boolean) => void
}

// =============================================================================
// Icons
// =============================================================================

/**
 * Warning icon for expiring videos
 */
function WarningIcon({ className }: { className?: string }) {
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
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  )
}

/**
 * Info icon for expired videos
 */
function InfoIcon({ className }: { className?: string }) {
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
        d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
      />
    </svg>
  )
}

/**
 * Close/X icon for dismiss button
 */
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

// =============================================================================
// Component
// =============================================================================

/**
 * ExpirationBanner - Alerts users about video expirations
 *
 * Shows different messages based on expiration state:
 * - Videos expiring soon: Warning with reassuring message about local cache
 * - Recently expired: Info message about cache preservation
 *
 * @example
 * ```tsx
 * // Videos expiring soon
 * <ExpirationBanner expiringCount={3} expiredCount={0} />
 *
 * // Videos already expired
 * <ExpirationBanner expiringCount={0} expiredCount={5} />
 *
 * // Both expiring and expired
 * <ExpirationBanner expiringCount={2} expiredCount={3} />
 *
 * // With dismiss handler
 * <ExpirationBanner
 *   expiringCount={2}
 *   expiredCount={0}
 *   onDismiss={() => console.log('Banner dismissed')}
 * />
 * ```
 */
export function ExpirationBanner({
  expiringCount,
  expiredCount,
  onDismiss,
  className = '',
  dismissed: controlledDismissed,
  onDismissedChange,
}: ExpirationBannerProps) {
  // Internal dismissed state for uncontrolled usage
  const [internalDismissed, setInternalDismissed] = useState(false)

  // Use controlled or uncontrolled dismissed state
  const isDismissed = controlledDismissed !== undefined ? controlledDismissed : internalDismissed

  // Track dismissed counts to detect new expirations
  const [dismissedExpiringCount, setDismissedExpiringCount] = useState(0)
  const [dismissedExpiredCount, setDismissedExpiredCount] = useState(0)

  // Reset dismissed state if new expirations are detected
  useEffect(() => {
    if (isDismissed) {
      const hasNewExpiring = expiringCount > dismissedExpiringCount
      const hasNewExpired = expiredCount > dismissedExpiredCount

      if (hasNewExpiring || hasNewExpired) {
        // New expirations detected, show banner again
        if (controlledDismissed === undefined) {
          setInternalDismissed(false)
        }
        onDismissedChange?.(false)
      }
    }
  }, [expiringCount, expiredCount, isDismissed, dismissedExpiringCount, dismissedExpiredCount, controlledDismissed, onDismissedChange])

  const handleDismiss = useCallback(() => {
    // Store the counts that were dismissed
    setDismissedExpiringCount(expiringCount)
    setDismissedExpiredCount(expiredCount)

    // Update dismissed state
    if (controlledDismissed === undefined) {
      setInternalDismissed(true)
    }
    onDismissedChange?.(true)
    onDismiss?.()
  }, [expiringCount, expiredCount, onDismiss, controlledDismissed, onDismissedChange])

  // Don't show if no expirations or dismissed
  if (isDismissed || (expiringCount === 0 && expiredCount === 0)) {
    return null
  }

  // Determine banner variant and message
  const hasExpiring = expiringCount > 0
  const hasExpired = expiredCount > 0

  // Priority: show expiring-soon message first if both exist
  const isWarningVariant = hasExpiring

  // Banner styling based on variant
  const bannerStyles = isWarningVariant
    ? {
        container: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800',
        icon: 'text-orange-500',
        title: 'text-orange-800 dark:text-orange-200',
        message: 'text-orange-700 dark:text-orange-300',
        closeButton: 'text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900/50',
      }
    : {
        container: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
        icon: 'text-amber-500',
        title: 'text-amber-800 dark:text-amber-200',
        message: 'text-amber-700 dark:text-amber-300',
        closeButton: 'text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50',
      }

  // Build message
  let title: string
  let message: string

  if (hasExpiring && hasExpired) {
    // Both expiring and expired
    title = `${expiringCount} video${expiringCount !== 1 ? 's' : ''} expiring soon, ${expiredCount} preserved locally`
    message = 'Your expiring videos will be automatically cached. Expired videos are safely preserved in your local cache.'
  } else if (hasExpiring) {
    // Only expiring
    title = `${expiringCount} video${expiringCount !== 1 ? 's' : ''} will expire from Arkiv within 24 hours`
    message = "Don't worry — your data will be automatically preserved in your local cache."
  } else {
    // Only expired
    title = `${expiredCount} video${expiredCount !== 1 ? 's' : ''} no longer on Arkiv`
    message = 'Your video metadata is safely preserved in your local cache. Video content on Filecoin is still accessible.'
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`
        relative rounded-lg border p-4 mb-4
        ${bannerStyles.container}
        ${className}
      `}
    >
      <div className="flex items-start gap-3 pr-8">
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
          {isWarningVariant ? (
            <WarningIcon className={`h-5 w-5 ${bannerStyles.icon}`} />
          ) : (
            <InfoIcon className={`h-5 w-5 ${bannerStyles.icon}`} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className={`text-sm font-medium ${bannerStyles.title}`}>
            {title}
          </h3>
          <p className={`text-sm mt-1 ${bannerStyles.message}`}>
            {message}
          </p>
        </div>

        {/* Dismiss button */}
        <button
          type="button"
          onClick={handleDismiss}
          className={`
            absolute top-3 right-3
            p-1.5 rounded-md
            transition-colors
            focus:outline-none focus:ring-2 focus:ring-offset-2
            ${isWarningVariant ? 'focus:ring-orange-500' : 'focus:ring-amber-500'}
            ${bannerStyles.closeButton}
          `}
          aria-label="Dismiss expiration notice"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// =============================================================================
// Hook for managing banner dismissed state
// =============================================================================

/**
 * Hook to manage expiration banner dismissed state with localStorage persistence
 */
export function useExpirationBannerState(key: string = 'haven-expiration-banner') {
  const [dismissedCounts, setDismissedCounts] = useState<{
    expiring: number
    expired: number
    timestamp: number
  } | null>(null)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored) {
        setDismissedCounts(JSON.parse(stored))
      }
    } catch {
      // localStorage not available
    }
  }, [key])

  // Check if banner should be shown based on current counts vs dismissed counts
  const shouldShowBanner = useCallback((
    currentExpiring: number,
    currentExpired: number
  ): boolean => {
    if (!dismissedCounts) return true

    // Show if there are new expirations since dismissal
    const hasNewExpiring = currentExpiring > dismissedCounts.expiring
    const hasNewExpired = currentExpired > dismissedCounts.expired

    return hasNewExpiring || hasNewExpired
  }, [dismissedCounts])

  // Dismiss banner and persist counts
  const dismissBanner = useCallback((expiring: number, expired: number) => {
    const counts = {
      expiring,
      expired,
      timestamp: Date.now(),
    }
    setDismissedCounts(counts)
    try {
      localStorage.setItem(key, JSON.stringify(counts))
    } catch {
      // localStorage not available
    }
  }, [key])

  // Clear dismissed state
  const clearDismissed = useCallback(() => {
    setDismissedCounts(null)
    try {
      localStorage.removeItem(key)
    } catch {
      // localStorage not available
    }
  }, [key])

  return {
    dismissedCounts,
    shouldShowBanner,
    dismissBanner,
    clearDismissed,
  }
}
