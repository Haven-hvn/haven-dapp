/**
 * Entity Expiration Tracker
 *
 * Proactive expiration tracking by monitoring Arkiv block numbers and comparing
 * them against entity `expiresAtBlock` values. Provides early warnings before
 * data disappears from the chain and enables proactive cache refresh.
 */

import type { CachedVideo } from '../../types/cache'
import { getVideoCacheService } from '../../services/cacheService'
import { fetchVideoByIdWithCache } from '../../services/videoService'

/**
 * Expiration status for a video
 */
export type ExpirationStatus = 'safe' | 'expiring-soon' | 'expired'

/**
 * Information about a video's expiration status
 */
export interface ExpirationInfo {
  /** Video ID (Arkiv entity key) */
  videoId: string
  /** Video title */
  title: string
  /** Block number when the entity expires */
  expiresAtBlock: number
  /** Estimated wall-clock expiration time */
  estimatedExpirationTime: Date
  /** Number of blocks remaining until expiration */
  blocksRemaining: number
  /** Current expiration status */
  status: ExpirationStatus
}

/**
 * Configurable expiration thresholds
 */
export const EXPIRATION_THRESHOLDS = {
  /** Blocks until "expiring soon" warning (~24 hours at 12s blocks) */
  EXPIRING_SOON_BLOCKS: 7200,

  /** Blocks until "critical" warning (~6 hours) */
  CRITICAL_BLOCKS: 1800,

  /** Blocks until "imminent" warning (~1 hour) */
  IMMINENT_BLOCKS: 300,
}

/**
 * Block timing information from Arkiv
 */
export interface BlockTiming {
  /** Current block number */
  currentBlock: number
  /** Current block time in seconds */
  currentBlockTime: number
  /** Average block time in seconds */
  averageBlockTime: number
}

/**
 * Expiration Tracker
 *
 * Monitors current block number and compares against entity expiration blocks
 * to provide proactive expiration warnings and cache refresh.
 */
export class ExpirationTracker {
  private currentBlock: number = 0
  private blockTimeSeconds: number = 12 // Default Arkiv block time
  private lastBlockUpdate: number = 0

  /**
   * Update the current block number
   * @param blockNumber - Current block number from Arkiv
   * @param blockTime - Optional block time in seconds (default: 12)
   */
  setCurrentBlock(blockNumber: number, blockTime?: number): void {
    this.currentBlock = blockNumber
    this.lastBlockUpdate = Date.now()
    if (blockTime !== undefined && blockTime > 0) {
      this.blockTimeSeconds = blockTime
    }
  }

  /**
   * Get the current block number
   * @returns Current block number (0 if not set)
   */
  getCurrentBlock(): number {
    return this.currentBlock
  }

  /**
   * Get the current block time setting
   * @returns Block time in seconds
   */
  getBlockTime(): number {
    return this.blockTimeSeconds
  }

  /**
   * Check expiration status for a single video
   * @param video - CachedVideo to check
   * @returns ExpirationInfo or null if no expiration data
   */
  getExpirationInfo(video: CachedVideo): ExpirationInfo | null {
    if (!video.expiresAtBlock || this.currentBlock === 0) {
      return null
    }

    const blocksRemaining = video.expiresAtBlock - this.currentBlock

    let status: ExpirationStatus
    if (blocksRemaining <= 0) {
      status = 'expired'
    } else if (blocksRemaining <= EXPIRATION_THRESHOLDS.EXPIRING_SOON_BLOCKS) {
      status = 'expiring-soon'
    } else {
      status = 'safe'
    }

    return {
      videoId: video.id,
      title: video.title,
      expiresAtBlock: video.expiresAtBlock,
      estimatedExpirationTime: this.estimateBlockTime(video.expiresAtBlock),
      blocksRemaining: Math.max(0, blocksRemaining),
      status,
    }
  }

  /**
   * Get all videos expiring within N blocks
   * @param videos - Array of CachedVideo to check
   * @param withinBlocks - Threshold for "expiring soon" (default: 7200)
   * @returns Array of ExpirationInfo for videos expiring soon
   */
  getExpiringSoon(
    videos: CachedVideo[],
    withinBlocks: number = EXPIRATION_THRESHOLDS.EXPIRING_SOON_BLOCKS
  ): ExpirationInfo[] {
    const result: ExpirationInfo[] = []

    for (const video of videos) {
      const info = this.getExpirationInfo(video)
      if (info && info.status === 'expiring-soon' && info.blocksRemaining <= withinBlocks) {
        result.push(info)
      }
    }

    // Sort by blocks remaining (most urgent first)
    return result.sort((a, b) => a.blocksRemaining - b.blocksRemaining)
  }

  /**
   * Get all already-expired videos
   * @param videos - Array of CachedVideo to check
   * @returns Array of ExpirationInfo for expired videos
   */
  getExpired(videos: CachedVideo[]): ExpirationInfo[] {
    const result: ExpirationInfo[] = []

    for (const video of videos) {
      const info = this.getExpirationInfo(video)
      if (info && info.status === 'expired') {
        result.push(info)
      }
    }

    // Sort by how long ago they expired (most recently expired first)
    return result.sort((a, b) => a.blocksRemaining - b.blocksRemaining)
  }

  /**
   * Estimate wall-clock time for a future block
   * @param targetBlock - Target block number
   * @returns Estimated Date when the block will be reached
   */
  estimateBlockTime(targetBlock: number): Date {
    if (this.currentBlock === 0) {
      // No block data yet, return distant future
      return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    }

    const blocksRemaining = targetBlock - this.currentBlock
    const secondsRemaining = blocksRemaining * this.blockTimeSeconds
    return new Date(Date.now() + secondsRemaining * 1000)
  }

  /**
   * Get the expiration severity level for UI display
   * @param info - ExpirationInfo to check
   * @returns Severity level for UI styling
   */
  getSeverityLevel(info: ExpirationInfo): 'low' | 'medium' | 'high' | 'critical' {
    if (info.status === 'expired') {
      return 'critical'
    }

    if (info.blocksRemaining <= EXPIRATION_THRESHOLDS.IMMINENT_BLOCKS) {
      return 'critical'
    }

    if (info.blocksRemaining <= EXPIRATION_THRESHOLDS.CRITICAL_BLOCKS) {
      return 'high'
    }

    if (info.status === 'expiring-soon') {
      return 'medium'
    }

    return 'low'
  }

  /**
   * Format blocks remaining as human-readable time estimate
   * @param blocksRemaining - Number of blocks
   * @returns Human-readable string (e.g., "~2 hours", "~15 minutes")
   */
  formatTimeEstimate(blocksRemaining: number): string {
    if (blocksRemaining <= 0) {
      return 'Expired'
    }

    const totalSeconds = blocksRemaining * this.blockTimeSeconds
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)

    if (hours > 24) {
      const days = Math.floor(hours / 24)
      return `~${days} day${days === 1 ? '' : 's'}`
    }

    if (hours > 0) {
      if (minutes > 0) {
        return `~${hours}h ${minutes}m`
      }
      return `~${hours} hour${hours === 1 ? '' : 's'}`
    }

    if (minutes > 0) {
      return `~${minutes} minute${minutes === 1 ? '' : 's'}`
    }

    return '< 1 minute'
  }

  /**
   * Check if the tracker has valid block data
   * @returns true if block number has been set
   */
  hasBlockData(): boolean {
    return this.currentBlock > 0
  }

  /**
   * Get time since last block update
   * @returns Milliseconds since last block update, or Infinity if never updated
   */
  getTimeSinceLastUpdate(): number {
    if (this.lastBlockUpdate === 0) {
      return Infinity
    }
    return Date.now() - this.lastBlockUpdate
  }
}

// ── Singleton Instance ───────────────────────────────────────────────

let globalTracker: ExpirationTracker | null = null

/**
 * Get or create the global expiration tracker instance
 * @returns The shared ExpirationTracker instance
 */
export function getExpirationTracker(): ExpirationTracker {
  if (!globalTracker) {
    globalTracker = new ExpirationTracker()
  }
  return globalTracker
}

/**
 * Reset the global tracker instance (useful for testing)
 */
export function resetExpirationTracker(): void {
  globalTracker = null
}

/**
 * Check if a global tracker instance exists
 * @returns true if tracker has been initialized
 */
export function hasExpirationTracker(): boolean {
  return globalTracker !== null
}

// ── Proactive Cache Refresh ──────────────────────────────────────────

/**
 * Refresh cache for videos that are expiring soon
 * @param walletAddress - Wallet address to check
 * @param tracker - Optional ExpirationTracker instance
 * @returns Number of videos refreshed
 */
export async function refreshExpiringSoon(
  walletAddress: string,
  tracker?: ExpirationTracker
): Promise<number> {
  const expirationTracker = tracker || getExpirationTracker()

  // Don't proceed if we don't have block data
  if (!expirationTracker.hasBlockData()) {
    return 0
  }

  const cacheService = getVideoCacheService(walletAddress)
  const allCached = await cacheService.getVideos()

  // Need to get raw CachedVideo[] for expiration check
  // Import directly from db to avoid type conversion
  const { getAllCachedVideos } = await import('./db')
  const cachedVideos = await getAllCachedVideos(walletAddress)

  const expiring = expirationTracker.getExpiringSoon(cachedVideos)

  if (expiring.length === 0) {
    return 0
  }

  console.info(
    `[ExpirationTracker] ${expiring.length} videos expiring soon, refreshing cache`
  )

  let refreshedCount = 0

  // Fetch fresh data for expiring entities
  for (const info of expiring) {
    try {
      const video = await fetchVideoByIdWithCache(info.videoId, walletAddress)
      if (video) {
        await cacheService.cacheVideo(video)
        refreshedCount++
      }
    } catch {
      // Entity may already be expired — that's okay, we have the cached version
      console.warn(`[ExpirationTracker] Failed to refresh expiring video: ${info.videoId}`)
    }
  }

  return refreshedCount
}

/**
 * Mark expired videos in cache based on block number
 * @param walletAddress - Wallet address to process
 * @param tracker - Optional ExpirationTracker instance
 * @returns Number of videos marked as expired
 */
export async function markExpiredVideos(
  walletAddress: string,
  tracker?: ExpirationTracker
): Promise<number> {
  const expirationTracker = tracker || getExpirationTracker()

  // Don't proceed if we don't have block data
  if (!expirationTracker.hasBlockData()) {
    return 0
  }

  const cacheService = getVideoCacheService(walletAddress)

  // Get raw CachedVideo[] for expiration check
  const { getAllCachedVideos } = await import('./db')
  const cachedVideos = await getAllCachedVideos(walletAddress)

  const expired = expirationTracker.getExpired(cachedVideos)

  if (expired.length === 0) {
    return 0
  }

  console.info(
    `[ExpirationTracker] ${expired.length} videos detected as expired based on block number`
  )

  let markedCount = 0

  for (const info of expired) {
    try {
      await cacheService.markVideoExpired(info.videoId)
      markedCount++
    } catch {
      console.warn(`[ExpirationTracker] Failed to mark video as expired: ${info.videoId}`)
    }
  }

  return markedCount
}
