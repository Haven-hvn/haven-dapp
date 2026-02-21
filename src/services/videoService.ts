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
 * Parse cid_encryption_metadata from Arkiv payload.
 *
 * The haven-player stores this as a JSON-serialized LitEncryptionMetadata object
 * with field names: encryptedKey, keyHash, accessControlConditions, chain.
 * Haven-dapp's CidEncryptionMetadata type uses: ciphertext, dataToEncryptHash.
 * This function handles JSON parsing and field name mapping.
 */
function parseCidEncryptionMetadata(raw: unknown): Video['cidEncryptionMetadata'] {
  if (!raw) return undefined

  let parsed: Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return undefined
    }
  } else if (typeof raw === 'object' && raw !== null) {
    parsed = raw as Record<string, unknown>
  } else {
    return undefined
  }

  // Map from LitEncryptionMetadata format (haven-player) to CidEncryptionMetadata format (haven-dapp)
  // haven-player stores: { encryptedKey, keyHash, accessControlConditions, chain, version, ... }
  // haven-dapp expects: { ciphertext, dataToEncryptHash, accessControlConditions, chain }
  const ciphertext = (parsed.ciphertext as string) || (parsed.encryptedKey as string) || ''
  const dataToEncryptHash = (parsed.dataToEncryptHash as string) || (parsed.keyHash as string) || ''
  const accessControlConditions = parsed.accessControlConditions as Video['cidEncryptionMetadata'] extends { accessControlConditions: infer T } ? T : never
  const chain = (parsed.chain as string) || 'yellowstone'

  if (!ciphertext || !dataToEncryptHash) {
    return undefined
  }

  return {
    ciphertext,
    dataToEncryptHash,
    accessControlConditions: accessControlConditions || [],
    chain,
  }
}

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

    // Storage CIDs
    // encrypted_cid: Arkiv attribute — Lit-encrypted ciphertext of the root CID (NOT a usable IPFS CID!)
    //   Must be decrypted via cid_encryption_metadata + Lit Protocol to get the actual IPFS CID.
    // filecoin_root_cid: Arkiv payload — the plain IPFS CID for non-encrypted videos
    filecoinCid: (get('filecoin_root_cid') as string) || '',
    encryptedCid: (get('encrypted_cid') as string) || undefined,

    // Encryption (Arkiv attributes use is_encrypted as number 0/1)
    isEncrypted: Boolean(get('is_encrypted')),
    litEncryptionMetadata: litMeta,

    // CID encryption metadata — stored as JSON string in Arkiv payload, uses LitEncryptionMetadata
    // field names (encryptedKey/keyHash) which must be mapped to CidEncryptionMetadata format
    // (ciphertext/dataToEncryptHash) for use with decryptCid()
    cidEncryptionMetadata: parseCidEncryptionMetadata(get('cid_encryption_metadata')),

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

      // Warn if encrypted video is missing encrypted_cid attribute
      if (video.isEncrypted && !video.encryptedCid) {
        console.warn('[VideoService] Encrypted video missing encrypted_cid attribute:', {
          id: video.id,
          attributes: entity.attributes,
        })
      }

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