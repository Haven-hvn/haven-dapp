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
import {
  createArkivClient,
  getAllEntitiesByOwner as arkivGetAllEntitiesByOwner,
  queryEntitiesByOwner as arkivQueryEntitiesByOwner,
  getEntity as arkivGetEntity,
  parseEntityPayload,
  type ArkivEntity,
} from '../lib/arkiv'

// ── Arkiv Client Singleton ──────────────────────────────────────────

let _client: ReturnType<typeof createArkivClient> | null = null

function getClient() {
  if (!_client) {
    _client = createArkivClient()
  }
  return _client
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
  // Arkiv uses snake_case field names; we check both snake_case and camelCase
  const data: Record<string, unknown> = {
    ...entity.attributes,
    ...payloadData,
  }

  // DEBUG: Log actual entity data to verify field names from Arkiv
  console.log('[parseArkivEntity] entity.key:', entity.key)
  console.log('[parseArkivEntity] attributes:', JSON.stringify(entity.attributes, null, 2))
  console.log('[parseArkivEntity] payload:', JSON.stringify(payloadData, null, 2))
  console.log('[parseArkivEntity] merged data keys:', Object.keys(data))

  // Helper: look up a value by snake_case key first, then camelCase fallback
  const get = (snakeKey: string, camelKey: string): unknown =>
    data[snakeKey] ?? data[camelKey]

  // Parse lit_encryption_metadata (stored as JSON string in payload)
  let litMeta: Video['litEncryptionMetadata'] = undefined
  const rawLitMeta = get('lit_encryption_metadata', 'litEncryptionMetadata')
  if (rawLitMeta) {
    if (typeof rawLitMeta === 'string') {
      try { litMeta = JSON.parse(rawLitMeta) } catch { /* ignore */ }
    } else {
      litMeta = rawLitMeta as Video['litEncryptionMetadata']
    }
  }

  // Parse segment metadata (snake_case in payload)
  const rawSegment = (get('segment_metadata', 'segmentMetadata') as Record<string, unknown>) || null
  const segmentMetadata = rawSegment
    ? {
        startTimestamp: new Date(
          (rawSegment.start_timestamp as string) ||
          (rawSegment.startTimestamp as string) ||
          ''
        ),
        endTimestamp:
          (rawSegment.end_timestamp || rawSegment.endTimestamp)
            ? new Date(
                (rawSegment.end_timestamp as string) ||
                (rawSegment.endTimestamp as string)
              )
            : undefined,
        segmentIndex:
          (rawSegment.segment_index as number) ??
          (rawSegment.segmentIndex as number) ??
          0,
        totalSegments:
          (rawSegment.total_segments as number) ??
          (rawSegment.totalSegments as number) ??
          0,
        mintId:
          (rawSegment.mint_id as string) ??
          (rawSegment.mintId as string) ??
          '',
        recordingSessionId:
          (rawSegment.recording_session_id as string) ??
          (rawSegment.recordingSessionId as string),
      }
    : undefined

  const vlmJsonCid = (get('vlm_json_cid', 'vlmJsonCid') as string) || undefined

  return {
    // Identity
    id: entity.key,
    owner: (entity.owner || '').toLowerCase(),

    // Content metadata
    title: (data.title as string) || 'Untitled',
    description: (data.description as string) || '',
    duration: (data.duration as number) || 0,

    // Storage CIDs (Arkiv payload uses filecoin_root_cid / encrypted_cid)
    filecoinCid: (get('filecoin_root_cid', 'filecoinCid') as string) || '',
    encryptedCid: (get('encrypted_cid', 'encryptedCid') as string) || undefined,

    // Encryption (Arkiv attributes use is_encrypted as number 0/1)
    isEncrypted: Boolean(get('is_encrypted', 'isEncrypted')),
    litEncryptionMetadata: litMeta,

    // CID encryption metadata
    cidEncryptionMetadata: (get('cid_encryption_metadata', 'cidEncryptionMetadata') as Video['cidEncryptionMetadata']) || undefined,

    // AI analysis
    hasAiData: Boolean(get('has_ai_data', 'hasAiData') || vlmJsonCid),
    vlmJsonCid,

    // Minting
    mintId: (get('mint_id', 'mintId') as string) || undefined,

    // Source tracking
    sourceUri: (get('source_uri', 'sourceUri') as string) || undefined,
    creatorHandle: (get('creator_handle', 'creatorHandle') as string) || undefined,

    // Timestamps
    createdAt: entity.created_at ? new Date(entity.created_at) : new Date(),
    updatedAt: (get('updated_at', 'updatedAt') as string)
      ? new Date(get('updated_at', 'updatedAt') as string)
      : undefined,

    // Variants for adaptive streaming (snake_case: codec_variants)
    codecVariants: (get('codec_variants', 'codecVariants') as Video['codecVariants']) || undefined,

    // Segment metadata
    segmentMetadata,

    // Content identification
    phash: (get('phash', 'phash') as string) || undefined,
    analysisModel: (get('analysis_model', 'analysisModel') as string) || undefined,
    cidHash: (get('cid_hash', 'cidHash') as string) || undefined,

    // Cache status - fresh from Arkiv is always 'active'
    arkivStatus: 'active',

    // Expiration tracking
    expiresAtBlock: (get('expires_at_block', 'expiresAtBlock') as number)
      ? Number(get('expires_at_block', 'expiresAtBlock'))
      : undefined,
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
    const entities = await arkivGetAllEntitiesByOwner(client, ownerAddress, maxResults)
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
    const entities = await arkivQueryEntitiesByOwner(client, ownerAddress, {
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
    const entity = await arkivGetEntity(client, entityKey)

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
    const entity = await arkivGetEntity(client, entityKey)

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

// ── Types ──────────────────────────────────────────────────────────

interface FetchVideosOptions {
  ownerAddress: string
  maxResults?: number
  cursor?: string
}

// ── Type Exports ───────────────────────────────────────────────────

export type { FetchVideosOptions }