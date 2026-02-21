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
import type { CacheSyncResult } from '../../types/cache'
import { getVideoCacheService } from '../../services/cacheService'
import { useCacheStore } from '../../stores/cacheStore'
import { getExpirationTracker, markExpiredVideos } from './expirationTracker'
import {
  createArkivClient,
  getAllEntitiesByOwner as arkivGetAllEntitiesByOwner,
  checkArkivConnection,
  parseEntityPayload,
  type ArkivEntity,
} from '../../lib/arkiv'
import type { PublicArkivClient } from '@arkiv-network/sdk'
import type { Transport, Chain } from 'viem'

// ── Arkiv Client Singleton ──────────────────────────────────────────

let arkivClient: PublicArkivClient<Transport, Chain | undefined, undefined> | null = null

function getClient(): PublicArkivClient<Transport, Chain | undefined, undefined> {
  if (!arkivClient) {
    arkivClient = createArkivClient()
  }
  return arkivClient
}

// ── Entity Parsing ─────────────────────────────────────────────────

/**
 * Parse an Arkiv entity into a Video object.
 * Converts the SDK entity format (key, attributes, payload) into our Video type.
 */
function parseArkivEntity(entity: ArkivEntity): Video {
  // Parse payload (base64 encoded JSON) for video metadata
  const payloadData = parseEntityPayload<Record<string, unknown>>(entity.payload) || {}

  // Merge attributes and payload data (payload takes precedence)
  // Arkiv uses snake_case field names exclusively
  const data: Record<string, unknown> = {
    ...entity.attributes,
    ...payloadData,
  }

  // Helper: look up a value by snake_case key
  const get = (key: string): unknown => data[key]

  // Parse lit_encryption_metadata (stored as JSON string in payload)
  let litMeta: Video['litEncryptionMetadata'] = undefined
  const rawLitMeta = get('lit_encryption_metadata')
  if (rawLitMeta) {
    if (typeof rawLitMeta === 'string') {
      try { litMeta = JSON.parse(rawLitMeta) } catch { /* ignore */ }
    } else {
      litMeta = rawLitMeta as Video['litEncryptionMetadata']
    }
  }

  // Parse segment metadata (snake_case in payload)
  const rawSegment = (get('segment_metadata') as Record<string, unknown>) || null
  const segmentMetadata = rawSegment
    ? {
        startTimestamp: new Date(
          (rawSegment.start_timestamp as string) || ''
        ),
        endTimestamp: rawSegment.end_timestamp
          ? new Date(rawSegment.end_timestamp as string)
          : undefined,
        segmentIndex: (rawSegment.segment_index as number) ?? 0,
        totalSegments: (rawSegment.total_segments as number) ?? 0,
        mintId: (rawSegment.mint_id as string) ?? '',
        recordingSessionId: rawSegment.recording_session_id as string | undefined,
      }
    : undefined

  const vlmJsonCid = (get('vlm_json_cid') as string) || undefined

  return {
    // Identity
    id: entity.key,
    owner: (entity.owner || '').toLowerCase(),

    // Content metadata
    title: (data.title as string) || 'Untitled',
    description: (data.description as string) || '',
    duration: (data.duration as number) || 0,

    // Storage CIDs (Arkiv payload uses filecoin_root_cid / encrypted_cid)
    filecoinCid: (get('filecoin_root_cid') as string) || '',
    encryptedCid: (get('encrypted_cid') as string) || undefined,

    // Encryption (Arkiv attributes use is_encrypted as number 0/1)
    isEncrypted: Boolean(get('is_encrypted')),
    litEncryptionMetadata: litMeta,

    // CID encryption metadata
    cidEncryptionMetadata: (get('cid_encryption_metadata') as Video['cidEncryptionMetadata']) || undefined,

    // AI analysis
    hasAiData: Boolean(get('has_ai_data') || vlmJsonCid),
    vlmJsonCid,

    // Minting
    mintId: (get('mint_id') as string) || undefined,

    // Source tracking
    sourceUri: (get('source_uri') as string) || undefined,
    creatorHandle: (get('creator_handle') as string) || undefined,

    // Timestamps
    createdAt: entity.created_at ? new Date(entity.created_at) : new Date(),
    updatedAt: (get('updated_at') as string)
      ? new Date(get('updated_at') as string)
      : undefined,

    // Variants for adaptive streaming (snake_case: codec_variants)
    codecVariants: (get('codec_variants') as Video['codecVariants']) || undefined,

    // Segment metadata
    segmentMetadata,

    // Content identification
    phash: (get('phash') as string) || undefined,
    analysisModel: (get('analysis_model') as string) || undefined,
    cidHash: (get('cid_hash') as string) || undefined,

    // Cache status - fresh from Arkiv is always 'active'
    arkivStatus: 'active',

    // Expiration tracking
    expiresAtBlock: (get('expires_at_block') as number)
      ? Number(get('expires_at_block'))
      : undefined,
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
      const entities = await arkivGetAllEntitiesByOwner(client, this.walletAddress)
      const arkivVideos = entities.map(parseArkivEntity)

      // 2. Sync with cache
      const cacheService = getVideoCacheService(this.walletAddress)
      const result = await cacheService.syncWithArkiv(arkivVideos)

      // 3. Update block number for expiration tracking
      try {
        const connectionStatus = await checkArkivConnection()
        const blockTiming = {
          currentBlock: connectionStatus.blockNumber || BigInt(0),
          currentBlockTime: connectionStatus.blockTime || 12,
        }
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

// Set up visibility listener once (guard for SSR — document doesn't exist on server)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', handleVisibilityChange)
}
