/**
 * Video Service
 *
 * Primary interface for fetching video metadata from Arkiv and managing local cache.
 * Implements write-through caching: all successful Arkiv fetches are persisted to IndexedDB.
 * Cache preserves metadata for entities that Arkiv has expired (removed as part of normal
 * blockchain operations).
 */

import type { Video } from '../types/video'
import { getVideoCacheService } from './cacheService'

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

interface FetchVideosOptions {
  ownerAddress: string
  maxResults?: number
  cursor?: string
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
  _ownerAddress: string,
  _maxResults: number
): Promise<ArkivEntity[]> {
  // Stub: Replace with actual Arkiv SDK call
  // return arkiv.getAllEntitiesByOwner(client, ownerAddress, maxResults)
  return []
}

async function queryEntitiesByOwner(
  _client: ArkivClient,
  _ownerAddress: string,
  _options: { maxResults: number; cursor?: string }
): Promise<ArkivEntity[]> {
  // Stub: Replace with actual Arkiv SDK call
  // return arkiv.queryEntitiesByOwner(client, ownerAddress, options)
  return []
}

async function getEntity(
  _client: ArkivClient,
  _entityKey: string
): Promise<ArkivEntity | null> {
  // Stub: Replace with actual Arkiv SDK call
  // return arkiv.getEntity(client, entityKey)
  return null
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

    // Expiration tracking - convert bigint to number (safe for block numbers)
    expiresAtBlock: entity.expiresAtBlock ? Number(entity.expiresAtBlock) : undefined,
  }
}

// ── Video Service Functions ────────────────────────────────────────

/**
 * Fetch all videos for an owner (full list with cache merge).
 *
 * Data flow:
 * 1. Try Arkiv SDK first (primary source)
 * 2. On success: sync to cache (write-through, fire-and-forget)
 * 3. Return merged list (Arkiv results + expired cache entries)
 * 4. On Arkiv error: fall back to cached data
 * 5. If both fail: throw original Arkiv error
 *
 * @param ownerAddress - The wallet address to fetch videos for
 * @param maxResults - Maximum number of results to fetch (default: 1000)
 * @returns Promise resolving to array of Video objects
 */
export async function fetchAllVideos(
  ownerAddress: string,
  maxResults: number = 1000
): Promise<Video[]> {
  const cacheService = getVideoCacheService(ownerAddress)

  try {
    // 1. Fetch from Arkiv (primary source)
    const client = getClient()
    const entities = await getAllEntitiesByOwner(client, ownerAddress, maxResults)
    const arkivVideos = entities.map(entity => parseArkivEntity(entity))

    // 2. Sync to cache (write-through) — fire and forget, don't block return
    cacheService.syncWithArkiv(arkivVideos).catch(err => {
      console.warn('[VideoService] Cache sync failed:', err)
    })

    // 3. Return merged list (Arkiv + expired cached entries)
    return await cacheService.getMergedVideos(arkivVideos)
  } catch (arkivError) {
    // 4. Arkiv fetch error — log and return cached data
    console.warn('[VideoService] Arkiv fetch error:', arkivError)

    const cachedVideos = await cacheService.getVideos()
    if (cachedVideos.length > 0) {
      return cachedVideos
    }

    // 5. Both Arkiv and cache failed — throw original error
    throw arkivError
  }
}

/**
 * Fetch videos with pagination (for infinite scroll UIs).
 *
 * Same write-through pattern as fetchAllVideos, but returns only
 * the requested page. Cache fallback returns a slice if available.
 *
 * @param options - FetchVideosOptions with ownerAddress, maxResults, cursor
 * @returns Promise resolving to array of Video objects for the page
 */
export async function fetchVideos(options: FetchVideosOptions): Promise<Video[]> {
  const cacheService = getVideoCacheService(options.ownerAddress)

  try {
    const client = getClient()
    const { ownerAddress, maxResults = 50, cursor } = options
    const entities = await queryEntitiesByOwner(client, ownerAddress, {
      maxResults,
      cursor,
    })
    const arkivVideos = entities.map(entity => parseArkivEntity(entity))

    // Write-through to cache
    cacheService.cacheVideos(arkivVideos).catch(err => {
      console.warn('[VideoService] Cache write failed:', err)
    })

    return arkivVideos
  } catch (arkivError) {
    console.warn('[VideoService] Arkiv fetch failed, using cache:', arkivError)
    const cachedVideos = await cacheService.getVideos()
    if (cachedVideos.length > 0) {
      return cachedVideos.slice(0, options.maxResults || 50)
    }
    throw arkivError
  }
}

/**
 * Fetch a single video by entity key.
 *
 * Tries Arkiv first, then falls back to cache. Note: without knowing
 * the owner address, we cannot check the cache on Arkiv failure.
 * For full cache support including expired entities, use fetchVideoByIdWithCache.
 *
 * @param entityKey - The Arkiv entity key (video ID)
 * @returns Promise resolving to Video object or null if not found
 */
export async function fetchVideoById(entityKey: string): Promise<Video | null> {
  // Try Arkiv first
  try {
    const client = getClient()
    const entity = await getEntity(client, entityKey)

    if (entity) {
      const video = parseArkivEntity(entity)

      // Write-through to cache (need wallet address from the video)
      const cacheService = getVideoCacheService(video.owner)
      cacheService.cacheVideo(video).catch(err => {
        console.warn('[VideoService] Cache write failed:', err)
      })
      // Update last accessed
      cacheService.touchVideo(video.id).catch(() => {})

      return video
    }
  } catch (error) {
    console.warn('[VideoService] Arkiv fetch failed for entity:', entityKey, error)
  }

  // Return cached data — try all known wallet databases
  // Note: This is a limitation since we don't know the owner address
  // The hook layer (useVideoQuery) should pass the owner address when available
  return null
}

/**
 * Fetch a single video by entity key with full cache support.
 *
 * Provides cache lookup for expired entities that Arkiv no longer has.
 * This is the preferred method when the owner address is known.
 *
 * @param entityKey - The Arkiv entity key (video ID)
 * @param ownerAddress - The wallet address that owns the video
 * @returns Promise resolving to Video object or null if not found
 */
export async function fetchVideoByIdWithCache(
  entityKey: string,
  ownerAddress: string
): Promise<Video | null> {
  const cacheService = getVideoCacheService(ownerAddress)

  try {
    const client = getClient()
    const entity = await getEntity(client, entityKey)

    if (entity) {
      const video = parseArkivEntity(entity)
      cacheService.cacheVideo(video).catch(() => {})
      cacheService.touchVideo(video.id).catch(() => {})
      return video
    }

    // Entity not found on Arkiv — check cache (may be expired)
    return await cacheService.getVideo(entityKey)
  } catch (error) {
    console.warn('[VideoService] Arkiv fetch failed, checking cache:', error)
    return await cacheService.getVideo(entityKey)
  }
}

// ── Type Exports ───────────────────────────────────────────────────

export type { FetchVideosOptions }
