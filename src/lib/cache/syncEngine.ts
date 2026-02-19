/**
 * Background Sync Engine
 *
 * Periodic sync engine that reconciles the local cache with Arkiv.
 * Keeps the cache fresh, detects newly expired entities, and picks up
 * any changes made from other devices or sessions.
 *
 * Features:
 * - Configurable sync interval (default: 5 minutes)
 * - Prevents concurrent syncs (mutex)
 * - Respects page visibility (pauses when hidden)
 * - Network-aware (pauses when offline, syncs when back online)
 * - Updates Zustand store with sync results
 */

import type { Video } from '../../types/video'
import type { CacheStats, CacheSyncResult } from '../../types/cache'
import { getVideoCacheService } from '../../services/cacheService'
import { useCacheStore } from '../../stores/cacheStore'
import { getExpirationTracker, markExpiredVideos } from './expirationTracker'

// ── Arkiv SDK Types (minimal stubs for compilation) ─────────────────

interface ArkivClient {
  // Arkiv SDK client instance
}

interface ArkivEntity {
  // Raw entity from Arkiv SDK
  entityKey: string
  owner: string
  label: string
  data: Record<string, unknown>
  createdAt: string
  updatedAt?: string
  expiresAt?: number
  expiresAtBlock?: bigint
}

// ── Arkiv SDK Stubs (to be replaced with actual SDK imports) ────────

let arkivClient: ArkivClient | null = null

function getClient(): ArkivClient {
  if (!arkivClient) {
    // Initialize Arkiv client - replace with actual SDK initialization
    arkivClient = {} as ArkivClient
  }
  return arkivClient
}

async function getAllEntitiesByOwner(
  _client: ArkivClient,
  _ownerAddress: string
): Promise<ArkivEntity[]> {
  // Stub: Replace with actual Arkiv SDK call
  // return arkiv.getAllEntitiesByOwner(client, ownerAddress)
  return []
}

async function getBlockTiming(_client: ArkivClient): Promise<{
  currentBlock: bigint
  currentBlockTime: number
  averageBlockTime: number
}> {
  // Stub: Replace with actual Arkiv SDK call
  // return arkiv.getBlockTiming(client)
  return {
    currentBlock: BigInt(0),
    currentBlockTime: 12,
    averageBlockTime: 12,
  }
}

// ── Entity Parsing ─────────────────────────────────────────────────

/**
 * Parse an Arkiv entity into a Video object.
 * Converts string dates to Date objects and normalizes field names.
 */
function parseArkivEntity(entity: ArkivEntity): Video {
  const data = entity.data || {}

  return {
    // Identity
    id: entity.entityKey,
    owner: entity.owner.toLowerCase(),

    // Content metadata
    title: (data.title as string) || 'Untitled',
    description: (data.description as string) || '',
    duration: (data.duration as number) || 0,

    // Storage CIDs
    filecoinCid: (data.filecoinCid as string) || '',
    encryptedCid: data.encryptedCid as string | undefined,

    // Encryption
    isEncrypted: Boolean(data.isEncrypted),
    litEncryptionMetadata: data.litEncryptionMetadata as Video['litEncryptionMetadata'],

    // AI analysis
    hasAiData: Boolean(data.hasAiData || data.vlmJsonCid),
    vlmJsonCid: data.vlmJsonCid as string | undefined,

    // Minting
    mintId: data.mintId as string | undefined,

    // Source tracking
    sourceUri: data.sourceUri as string | undefined,
    creatorHandle: data.creatorHandle as string | undefined,

    // Timestamps
    createdAt: new Date(entity.createdAt),
    updatedAt: entity.updatedAt ? new Date(entity.updatedAt) : undefined,

    // Variants for adaptive streaming
    codecVariants: data.codecVariants as Video['codecVariants'],

    // Segment metadata
    segmentMetadata: data.segmentMetadata
      ? {
          startTimestamp: new Date((data.segmentMetadata as Record<string, string>).startTimestamp),
          endTimestamp: (data.segmentMetadata as Record<string, string>).endTimestamp
            ? new Date((data.segmentMetadata as Record<string, string>).endTimestamp!)
            : undefined,
          segmentIndex: (data.segmentMetadata as Record<string, number>).segmentIndex,
          totalSegments: (data.segmentMetadata as Record<string, number>).totalSegments,
          mintId: (data.segmentMetadata as Record<string, string>).mintId ?? '',
          recordingSessionId: (data.segmentMetadata as Record<string, string>).recordingSessionId,
        }
      : undefined,

    // Cache status - fresh from Arkiv is always 'active'
    arkivStatus: 'active',

    // Expiration tracking
    expiresAtBlock: entity.expiresAtBlock ? Number(entity.expiresAtBlock) : undefined,
  }
}

// ── Active Engine Management ───────────────────────────────────────

const activeEngines = new Map<string, CacheSyncEngine>()

/**
 * Get or create a sync engine for a wallet.
 * Prevents duplicate engines for the same wallet.
 * @param walletAddress - The wallet address
 * @returns The shared CacheSyncEngine instance for this wallet
 */
export function getSyncEngine(walletAddress: string): CacheSyncEngine {
  const key = walletAddress.toLowerCase()
  if (!activeEngines.has(key)) {
    activeEngines.set(key, new CacheSyncEngine(key))
  }
  return activeEngines.get(key)!
}

/**
 * Stop all active sync engines.
 * Useful for app unmount or emergency cleanup.
 */
export function stopAllSyncEngines(): void {
  for (const engine of activeEngines.values()) {
    engine.stop()
  }
  activeEngines.clear()
}

/**
 * Check if a sync engine exists for a wallet.
 * @param walletAddress - The wallet address
 * @returns true if an engine exists for this wallet
 */
export function hasSyncEngine(walletAddress: string): boolean {
  return activeEngines.has(walletAddress.toLowerCase())
}

/**
 * Remove a sync engine from the active engines map.
 * Called internally when an engine is stopped.
 * @param walletAddress - The wallet address
 */
function removeSyncEngine(walletAddress: string): void {
  activeEngines.delete(walletAddress.toLowerCase())
}

// ── Cache Sync Engine ──────────────────────────────────────────────

/**
 * Background sync engine that periodically reconciles local cache with Arkiv.
 */
export class CacheSyncEngine {
  private walletAddress: string
  private intervalId: ReturnType<typeof setInterval> | null = null
  private isRunning: boolean = false
  private syncIntervalMs: number
  private idleTimeoutMs: number = 15 * 60 * 1000 // 15 minutes
  private lastUserActivity: number = Date.now()
  private activityHandler: (() => void) | null = null

  /**
   * Create a new CacheSyncEngine instance
   * @param walletAddress - The wallet address for this sync engine
   * @param syncIntervalMs - Sync interval in milliseconds (default: 5 minutes)
   */
  constructor(walletAddress: string, syncIntervalMs: number = 5 * 60 * 1000) {
    this.walletAddress = walletAddress.toLowerCase()
    this.syncIntervalMs = syncIntervalMs
  }

  /**
   * Start the background sync loop.
   * Sets up network listeners and schedules periodic syncs.
   */
  start(): void {
    if (this.intervalId) return // Already running

    // Set up network listeners
    this.setupNetworkListeners()

    // Set up idle detection
    this.setupIdleDetection()

    // Run initial sync after a short delay (let the app settle)
    setTimeout(() => this.syncOnce(), 2000)

    // Schedule periodic syncs
    this.intervalId = setInterval(() => {
      this.checkAndSync()
    }, this.syncIntervalMs)

    console.info(`[SyncEngine] Started for ${this.walletAddress.slice(0, 8)}...`)
  }

  /**
   * Stop the background sync loop.
   * Clears the interval and removes event listeners.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    // Remove network listeners
    window.removeEventListener('online', this.handleOnline)
    window.removeEventListener('offline', this.handleOffline)

    // Remove idle detection
    if (this.activityHandler) {
      document.removeEventListener('mousemove', this.activityHandler)
      document.removeEventListener('keydown', this.activityHandler)
      document.removeEventListener('click', this.activityHandler)
      document.removeEventListener('scroll', this.activityHandler)
      document.removeEventListener('touchstart', this.activityHandler)
    }

    // Remove from active engines
    removeSyncEngine(this.walletAddress)

    console.info(`[SyncEngine] Stopped for ${this.walletAddress.slice(0, 8)}...`)
  }

  /**
   * Run a single sync cycle.
   * Can be called manually to force a sync.
   * @returns Promise resolving to CacheSyncResult
   */
  async syncOnce(): Promise<CacheSyncResult> {
    if (this.isRunning) {
      // Prevent concurrent syncs
      return {
        added: 0,
        updated: 0,
        expired: 0,
        unchanged: 0,
        errors: ['Sync already in progress'],
        syncedAt: Date.now(),
      }
    }

    this.isRunning = true
    const cacheStore = useCacheStore.getState()
    cacheStore.setSyncing(true)

    try {
      // 1. Fetch current videos from Arkiv
      const client = getClient()
      const entities = await getAllEntitiesByOwner(client, this.walletAddress)
      const arkivVideos = entities.map(parseArkivEntity)

      // 2. Sync with cache
      const cacheService = getVideoCacheService(this.walletAddress)
      const result = await cacheService.syncWithArkiv(arkivVideos)

      // 3. Update block number for expiration tracking
      try {
        const blockTiming = await getBlockTiming(client)
        const tracker = getExpirationTracker()
        tracker.setCurrentBlock(
          Number(blockTiming.currentBlock),
          blockTiming.currentBlockTime
        )

        // Mark expired videos based on block number
        const newlyExpired = await markExpiredVideos(this.walletAddress, tracker)
        if (newlyExpired > 0) {
          result.expired += newlyExpired
        }
      } catch {
        // Non-critical — continue without block update
        console.warn('[SyncEngine] Failed to update block timing')
      }

      // 4. Update store
      cacheStore.setSyncResult(result)
      const stats = await cacheService.getStats()
      cacheStore.setStats(stats)

      // 5. Log summary
      if (result.added > 0 || result.updated > 0 || result.expired > 0) {
        console.info(
          `[SyncEngine] Sync complete:`,
          `+${result.added} added,`,
          `~${result.updated} updated,`,
          `-${result.expired} expired,`,
          `=${result.unchanged} unchanged`
        )
      }

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown sync error'
      cacheStore.setSyncError(errorMsg)
      console.warn('[SyncEngine] Sync failed:', errorMsg)

      return {
        added: 0,
        updated: 0,
        expired: 0,
        unchanged: 0,
        errors: [errorMsg],
        syncedAt: Date.now(),
      }
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Whether the engine is currently running (has an active interval).
   * @returns true if the engine is running
   */
  get active(): boolean {
    return this.intervalId !== null
  }

  /**
   * Whether a sync is currently in progress.
   * @returns true if a sync is running
   */
  get syncing(): boolean {
    return this.isRunning
  }

  /**
   * Update the sync interval.
   * Restarts the loop with the new interval.
   * @param ms - New interval in milliseconds
   */
  setSyncInterval(ms: number): void {
    this.syncIntervalMs = ms
    if (this.active) {
      // Restart with new interval
      this.stop()
      this.start()
    }
  }

  // ── Private Methods ──────────────────────────────────────────────

  /**
   * Check conditions and sync if appropriate.
   * Called by the interval timer.
   */
  private checkAndSync(): void {
    // Skip sync if page is hidden
    if (document.hidden) {
      return
    }

    // Skip sync if offline
    if (!navigator.onLine) {
      return
    }

    // Skip sync if user is idle (use longer interval)
    const idleTime = Date.now() - this.lastUserActivity
    if (idleTime > this.idleTimeoutMs) {
      // User is idle, use extended interval (3x normal)
      const extendedInterval = this.syncIntervalMs * 3
      const timeSinceLastSync = Date.now() - (useCacheStore.getState().lastSyncedAt || 0)
      if (timeSinceLastSync < extendedInterval) {
        return
      }
    }

    this.syncOnce()
  }

  /**
   * Set up network event listeners.
   */
  private setupNetworkListeners(): void {
    window.addEventListener('online', this.handleOnline)
    window.addEventListener('offline', this.handleOffline)
  }

  /**
   * Handle coming back online.
   */
  private handleOnline = (): void => {
    console.info('[SyncEngine] Network restored, triggering sync')
    this.syncOnce()
  }

  /**
   * Handle going offline.
   */
  private handleOffline = (): void => {
    console.info('[SyncEngine] Network lost, pausing sync')
  }

  /**
   * Set up idle detection.
   * Tracks user activity to adjust sync frequency.
   */
  private setupIdleDetection(): void {
    this.lastUserActivity = Date.now()

    this.activityHandler = () => {
      this.lastUserActivity = Date.now()
    }

    // Track various user interactions
    document.addEventListener('mousemove', this.activityHandler)
    document.addEventListener('keydown', this.activityHandler)
    document.addEventListener('click', this.activityHandler)
    document.addEventListener('scroll', this.activityHandler)
    document.addEventListener('touchstart', this.activityHandler)
  }
}

// ── Page Visibility Handling ───────────────────────────────────────

/**
 * Handle page visibility changes.
 * Triggers a sync when the page becomes visible if stale.
 */
function handleVisibilityChange(): void {
  if (!document.hidden) {
    // Page became visible - check if sync is needed
    const state = useCacheStore.getState()
    if (!state.autoSyncEnabled) return

    const lastSync = state.lastSyncedAt
    const staleThreshold = 5 * 60 * 1000 // 5 minutes

    if (!lastSync || Date.now() - lastSync > staleThreshold) {
      // Trigger sync for all active engines
      for (const engine of activeEngines.values()) {
        engine.syncOnce()
      }
    }
  }
}

// Set up visibility listener once
document.addEventListener('visibilitychange', handleVisibilityChange)
