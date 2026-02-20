/**
 * useExpirationStatus Hook
 *
 * React hook that provides expiration status for cached videos.
 * Monitors block numbers and entity expiration blocks to detect:
 * - Videos that are expiring soon
 * - Videos that have already expired
 *
 * Features:
 * - Automatic re-check every minute
 * - Updates when videos are added/removed from cache
 * - Provides severity levels for UI styling
 *
 * Usage:
 * ```tsx
 * function VideoList() {
 *   const { expiringVideos, expiredVideos, hasExpiringSoon } = useExpirationStatus()
 *   // Render expiration warnings...
 * }
 * ```
 */

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAppKitAccount } from '@reown/appkit/react'
import type { ExpirationInfo } from '../lib/cache/expirationTracker'
import {
  getExpirationTracker,
  EXPIRATION_THRESHOLDS,
  type ExpirationStatus,
} from '../lib/cache/expirationTracker'
import { getVideoCacheService } from '../services/cacheService'
import type { CachedVideo } from '../types/cache'

// ── Return Types ───────────────────────────────────────────────────

/**
 * Return type for useExpirationStatus hook.
 */
export interface UseExpirationStatusReturn {
  /** Videos that are expiring soon (within threshold) */
  expiringVideos: ExpirationInfo[]
  /** Videos that have already expired */
  expiredVideos: ExpirationInfo[]
  /** All videos with expiration info */
  allExpirations: ExpirationInfo[]
  /** Whether there are any videos expiring soon */
  hasExpiringSoon: boolean
  /** Whether there are any expired videos */
  hasExpired: boolean
  /** Number of videos at critical threshold (~6 hours) */
  criticalCount: number
  /** Number of videos at imminent threshold (~1 hour) */
  imminentCount: number
  /** Whether block data is available */
  hasBlockData: boolean
  /** Current block number (0 if not available) */
  currentBlock: number
  /** Re-check expirations manually */
  refresh: () => Promise<void>
  /** Loading state during initial check */
  isLoading: boolean
}

// ── Constants ──────────────────────────────────────────────────────

/** Re-check interval in milliseconds (1 minute) */
const CHECK_INTERVAL_MS = 60 * 1000

// ── Hook Implementation ─────────────────────────────────────────────

/**
 * Hook that provides expiration status for cached videos.
 *
 * Features:
 * - Automatically checks expirations every minute
 * - Provides categorized lists (expiring soon, expired)
 * - Includes severity counts for UI notifications
 *
 * @returns Object with expiration status and controls
 */
export function useExpirationStatus(): UseExpirationStatusReturn {
  const { address, isConnected } = useAppKitAccount()
  const [expiringVideos, setExpiringVideos] = useState<ExpirationInfo[]>([])
  const [expiredVideos, setExpiredVideos] = useState<ExpirationInfo[]>([])
  const [allExpirations, setAllExpirations] = useState<ExpirationInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  /**
   * Check expirations and update state
   */
  const checkExpirations = useCallback(async () => {
    if (!isConnected || !address) {
      setExpiringVideos([])
      setExpiredVideos([])
      setAllExpirations([])
      setIsLoading(false)
      return
    }

    try {
      const tracker = getExpirationTracker()
      const cacheService = getVideoCacheService(address)

      // Get raw CachedVideo[] for expiration check
      // We need to access the DB directly because getVideos() converts to Video[]
      const { getAllCachedVideos } = await import('../lib/cache/db')
      const cachedVideos = await getAllCachedVideos(address)

      // Get expiring and expired videos
      const expiring = tracker.getExpiringSoon(cachedVideos)
      const expired = tracker.getExpired(cachedVideos)

      // Get all videos with expiration info
      const allWithInfo: ExpirationInfo[] = []
      for (const video of cachedVideos) {
        const info = tracker.getExpirationInfo(video)
        if (info) {
          allWithInfo.push(info)
        }
      }

      setExpiringVideos(expiring)
      setExpiredVideos(expired)
      setAllExpirations(allWithInfo.sort((a, b) => a.blocksRemaining - b.blocksRemaining))
    } catch (error) {
      console.warn('[useExpirationStatus] Failed to check expirations:', error)
    } finally {
      setIsLoading(false)
    }
  }, [address, isConnected])

  /**
   * Manual refresh function
   */
  const refresh = useCallback(async () => {
    setIsLoading(true)
    await checkExpirations()
  }, [checkExpirations])

  // Set up interval for periodic checks
  useEffect(() => {
    // Initial check
    checkExpirations()

    // Set up interval
    intervalRef.current = setInterval(checkExpirations, CHECK_INTERVAL_MS)

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [checkExpirations])

  // Re-check when address changes
  useEffect(() => {
    checkExpirations()
  }, [address, checkExpirations])

  // Calculate derived values
  const tracker = getExpirationTracker()
  const hasBlockData = tracker.hasBlockData()
  const currentBlock = tracker.getCurrentBlock()

  const criticalCount = expiringVideos.filter(
    v => v.blocksRemaining <= EXPIRATION_THRESHOLDS.CRITICAL_BLOCKS && v.blocksRemaining > EXPIRATION_THRESHOLDS.IMMINENT_BLOCKS
  ).length

  const imminentCount = expiringVideos.filter(
    v => v.blocksRemaining <= EXPIRATION_THRESHOLDS.IMMINENT_BLOCKS
  ).length

  return {
    expiringVideos,
    expiredVideos,
    allExpirations,
    hasExpiringSoon: expiringVideos.length > 0,
    hasExpired: expiredVideos.length > 0,
    criticalCount,
    imminentCount,
    hasBlockData,
    currentBlock,
    refresh,
    isLoading,
  }
}

// ── Utility Hooks ──────────────────────────────────────────────────

/**
 * Hook that checks if a specific video is expiring soon.
 *
 * @param videoId - The video ID to check
 * @returns Expiration info for the specific video, or null
 */
export function useVideoExpiration(videoId: string | undefined): {
  expirationInfo: ExpirationInfo | null
  isExpiringSoon: boolean
  isExpired: boolean
  severity: 'low' | 'medium' | 'high' | 'critical' | null
} {
  const { address, isConnected } = useAppKitAccount()
  const [expirationInfo, setExpirationInfo] = useState<ExpirationInfo | null>(null)

  useEffect(() => {
    if (!isConnected || !address || !videoId) {
      setExpirationInfo(null)
      return
    }

    const checkVideoExpiration = async () => {
      try {
        const tracker = getExpirationTracker()
        const cacheService = getVideoCacheService(address)
        const video = await cacheService.getVideo(videoId)

        if (!video || !video.expiresAtBlock) {
          setExpirationInfo(null)
          return
        }

        // Need to get raw CachedVideo for expiration check
        const { getCachedVideo } = await import('../lib/cache/db')
        const cachedVideo = await getCachedVideo(address, videoId)

        if (cachedVideo) {
          const info = tracker.getExpirationInfo(cachedVideo)
          setExpirationInfo(info)
        } else {
          setExpirationInfo(null)
        }
      } catch (error) {
        console.warn('[useVideoExpiration] Failed to check expiration:', error)
        setExpirationInfo(null)
      }
    }

    checkVideoExpiration()

    // Re-check periodically
    const interval = setInterval(checkVideoExpiration, CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [address, isConnected, videoId])

  const tracker = getExpirationTracker()
  const severity = expirationInfo ? tracker.getSeverityLevel(expirationInfo) : null

  return {
    expirationInfo,
    isExpiringSoon: expirationInfo?.status === 'expiring-soon' || false,
    isExpired: expirationInfo?.status === 'expired' || false,
    severity,
  }
}

/**
 * Hook that returns the count of videos at each severity level.
 * Useful for showing notification badges.
 *
 * @returns Object with counts for each severity level
 */
export function useExpirationCounts(): {
  safe: number
  expiringSoon: number
  critical: number
  imminent: number
  expired: number
  total: number
} {
  const { allExpirations } = useExpirationStatus()
  const tracker = getExpirationTracker()

  return allExpirations.reduce(
    (counts, info) => {
      const severity = tracker.getSeverityLevel(info)
      counts.total++

      switch (severity) {
        case 'low':
          counts.safe++
          break
        case 'medium':
          counts.expiringSoon++
          break
        case 'high':
          counts.critical++
          break
        case 'critical':
          if (info.status === 'expired') {
            counts.expired++
          } else {
            counts.imminent++
          }
          break
      }

      return counts
    },
    {
      safe: 0,
      expiringSoon: 0,
      critical: 0,
      imminent: 0,
      expired: 0,
      total: 0,
    }
  )
}
