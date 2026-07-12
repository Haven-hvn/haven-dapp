'use client'

/**
 * DownloadProgressBadge Component
 *
 * Subtle, aesthetically pleasing progress indicator rendered directly
 * on a video card thumbnail to reflect batch download queue status.
 *
 * Visual phases:
 * - pending:   small pulsing dot
 * - active:    thin gradient progress bar at thumbnail bottom
 * - complete:  brief green ring flash, then fades
 * - error:     small red indicator dot
 *
 * @module components/library/DownloadProgressBadge
 */

import React, { useEffect, useState } from 'react'
import { Check, AlertCircle } from 'lucide-react'
import type { DownloadQueueItem } from '@/hooks/useDownloadQueue'

interface DownloadProgressBadgeProps {
  /** The queue item for this video, or undefined if not in queue */
  queueItem: DownloadQueueItem | undefined
}

export function DownloadProgressBadge({ queueItem }: DownloadProgressBadgeProps) {
  const [showComplete, setShowComplete] = useState(false)
  const [completeOpacity, setCompleteOpacity] = useState(1)

  // When status transitions to 'complete', show the check briefly then fade
  useEffect(() => {
    if (queueItem?.status === 'complete') {
      setShowComplete(true)
      setCompleteOpacity(1)
      // Start fade after 1.5s, fully gone by 2.5s
      const fadeTimer = setTimeout(() => setCompleteOpacity(0), 1500)
      const hideTimer = setTimeout(() => setShowComplete(false), 2500)
      return () => {
        clearTimeout(fadeTimer)
        clearTimeout(hideTimer)
      }
    } else {
      setShowComplete(false)
      setCompleteOpacity(1)
    }
  }, [queueItem?.status])

  // Not in queue — render nothing
  if (!queueItem) return null

  const { status, progress } = queueItem

  // ── Complete state: brief green ring flash ──
  if (showComplete) {
    return (
      <div
        className="absolute inset-0 z-20 pointer-events-none transition-opacity duration-1000"
        style={{ opacity: completeOpacity }}
      >
        {/* Green ring border */}
        <div className="absolute inset-0 rounded-lg ring-2 ring-green-400" />
        {/* Checkmark centered */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-green-500/90 flex items-center justify-center shadow-lg">
            <Check className="w-5 h-5 text-white" strokeWidth={3} />
          </div>
        </div>
      </div>
    )
  }

  // ── Error state: red indicator dot ──
  if (status === 'error') {
    return (
      <div className="absolute top-2 left-2 z-20 pointer-events-none">
        <div className="w-5 h-5 rounded-full bg-red-500/90 flex items-center justify-center shadow-md">
          <AlertCircle className="w-3 h-3 text-white" />
        </div>
      </div>
    )
  }

  // ── Pending state: subtle pulsing dot ──
  if (status === 'pending') {
    return (
      <div className="absolute top-2 left-2 z-20 pointer-events-none">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500" />
        </span>
      </div>
    )
  }

  // ── Active state (downloading / decrypting): thin progress bar ──
  if (status === 'downloading' || status === 'decrypting') {
    return (
      <>
        {/* Subtle overlay to darken thumbnail slightly so progress bar is visible */}
        <div className="absolute inset-0 bg-black/10 z-10 pointer-events-none rounded-t-lg" />

        {/* Thin progress bar at the very bottom of the thumbnail */}
        <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none h-1 bg-black/30 rounded-b-lg overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500"
            style={{
              width: `${Math.max(2, progress)}%`,
              backgroundSize: '200% 100%',
              animation: status === 'decrypting' ? 'shimmer 1.5s linear infinite' : undefined,
            }}
          />
        </div>

        {/* Small percentage label at bottom-right, only when progress > 15% */}
        {progress > 15 && (
          <div className="absolute bottom-1.5 right-1.5 z-20 pointer-events-none">
            <span className="text-[10px] font-medium text-white bg-black/50 px-1.5 py-0.5 rounded-sm backdrop-blur-sm">
              {progress}%
            </span>
          </div>
        )}
      </>
    )
  }

  return null
}
