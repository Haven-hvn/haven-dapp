/**
 * Video Service
 * 
 * Provides functions for fetching and parsing video entities from Arkiv.
 * Transforms raw Arkiv entities into application-friendly Video objects.
 * 
 * @module services/videoService
 */

import { 
  ArkivPayload, 
  ArkivAttributes,
  Video,
  SegmentMetadata,
  LitEncryptionMetadata,
  CidEncryptionMetadata,
} from '@/types'
import { 
  createArkivClient, 
  queryEntitiesByOwner, 
  getAllEntitiesByOwner,
  getEntity,
  ArkivError,
  type ArkivEntity,
} from '@/lib/arkiv'
import type { PublicArkivClient } from '@arkiv-network/sdk'
import type { Transport, Chain } from 'viem'

// ============================================================================
// Types
// ============================================================================

/**
 * Options for fetching videos.
 */
export interface FetchVideosOptions {
  /** Owner's wallet address */
  ownerAddress: string
  /** Maximum number of results to return */
  maxResults?: number
  /** Cursor for pagination */
  cursor?: string
}

/**
 * Result of a video fetch operation with pagination info.
 */
export interface FetchVideosResult {
  /** Fetched videos */
  videos: Video[]
  /** Cursor for fetching next page */
  cursor?: string
  /** Whether there are more results */
  hasMore: boolean
}

// ============================================================================
// Client Management
// ============================================================================

let clientInstance: PublicArkivClient<Transport, Chain | undefined, undefined> | null = null

/**
 * Get or create the Arkiv client instance.
 */
function getClient(): PublicArkivClient<Transport, Chain | undefined, undefined> {
  if (!clientInstance) {
    clientInstance = createArkivClient()
  }
  return clientInstance
}

// ============================================================================
// Video Fetching
// ============================================================================

/**
 * Fetch videos for a specific owner address.
 * 
 * @param options - Fetch options including owner address and pagination
 * @returns Array of Video objects
 * 
 * @example
 * ```typescript
 * const videos = await fetchVideos({ 
 *   ownerAddress: '0x123...', 
 *   maxResults: 50 
 * })
 * ```
 */
export async function fetchVideos(options: FetchVideosOptions): Promise<Video[]> {
  const client = getClient()
  const { ownerAddress, maxResults = 50 } = options

  const entities = await queryEntitiesByOwner(client, ownerAddress, {
    maxResults,
    includePayload: true,
    includeAttributes: true,
    includeMetadata: true,
  })

  return entities.map(entity => parseArkivEntity(entity))
}

/**
 * Fetch all videos for an owner with automatic pagination.
 * 
 * @param ownerAddress - The wallet address of the owner
 * @param maxResults - Maximum total results to fetch (default: 1000)
 * @returns Array of all Video objects
 */
export async function fetchAllVideos(
  ownerAddress: string, 
  maxResults: number = 1000
): Promise<Video[]> {
  const client = getClient()

  const entities = await getAllEntitiesByOwner(client, ownerAddress, maxResults)

  return entities.map(entity => parseArkivEntity(entity))
}

/**
 * Fetch a single video by its entity key.
 * 
 * @param entityKey - The Arkiv entity key
 * @returns The Video if found, null otherwise
 */
export async function fetchVideoById(entityKey: string): Promise<Video | null> {
  const client = getClient()

  const entity = await getEntity(client, entityKey)

  if (!entity) {
    return null
  }

  return parseArkivEntity(entity)
}

// ============================================================================
// Entity Parsing
// ============================================================================

/**
 * Parse an Arkiv entity into a Video object.
 * 
 * @param entity - Raw Arkiv entity from the SDK
 * @returns Parsed Video object
 */
export function parseArkivEntity(entity: ArkivEntity): Video {
  // Parse payload from base64 JSON
  let payload: ArkivPayload | null = null
  try {
    const payloadJson = atob(entity.payload)
    payload = JSON.parse(payloadJson) as ArkivPayload
  } catch (error) {
    console.error('Failed to parse entity payload:', error)
  }

  // Parse dates from entity timestamps (using created_at in snake_case from lib/arkiv)
  const createdAt = parseDate(entity.created_at) || new Date()
  
  // Parse encryption metadata
  const litEncryptionMetadata = parseLitEncryptionMetadata(
    payload?.lit_encryption_metadata
  )
  const cidEncryptionMetadata = parseCidEncryptionMetadata(
    payload?.cid_encryption_metadata
  )

  // Parse segment metadata
  const segmentMetadata = parseSegmentMetadata(payload?.segment_metadata)

  // Determine encrypted status
  const isEncrypted = determineEncryptedStatus(entity.attributes, payload)

  // Extract attributes with proper typing
  const attributes = entity.attributes as ArkivAttributes

  return {
    id: entity.key,
    owner: entity.owner,
    createdAt,
    updatedAt: undefined, // Not available in current entity format

    // Metadata from attributes (with fallbacks to payload)
    title: attributes.title || payload?.description || 'Untitled Video',
    description: payload?.description,
    duration: attributes.duration || payload?.duration || 0,

    // Source info
    sourceUri: attributes.source_uri || payload?.source_uri,
    creatorHandle: attributes.creator_handle || payload?.creator_handle,

    // Filecoin CIDs
    filecoinCid: payload?.filecoin_root_cid,
    encryptedCid: attributes.encrypted_cid || payload?.encrypted_cid,
    cidHash: payload?.cid_hash,

    // Encryption
    isEncrypted,
    litEncryptionMetadata: litEncryptionMetadata || undefined,
    cidEncryptionMetadata: cidEncryptionMetadata || undefined,

    // AI analysis
    hasAiData: !!payload?.vlm_json_cid,
    vlmJsonCid: payload?.vlm_json_cid,
    analysisModel: attributes.analysis_model,
    phash: attributes.phash,

    // Segment and mint info
    segmentMetadata: segmentMetadata || undefined,
    mintId: attributes.mint_id,
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse a date string safely.
 */
function parseDate(dateString: string | undefined): Date | undefined {
  if (!dateString) return undefined
  
  const date = new Date(dateString)
  return isNaN(date.getTime()) ? undefined : date
}

/**
 * Parse Lit encryption metadata from JSON string.
 */
function parseLitEncryptionMetadata(
  metadataJson: string | undefined
): LitEncryptionMetadata | null {
  if (!metadataJson) return null

  try {
    const parsed = JSON.parse(metadataJson)

    // Basic validation
    if (
      parsed.version === 'hybrid-v1' &&
      typeof parsed.encryptedKey === 'string' &&
      typeof parsed.iv === 'string' &&
      Array.isArray(parsed.accessControlConditions)
    ) {
      return parsed as LitEncryptionMetadata
    }

    return null
  } catch {
    return null
  }
}

/**
 * Parse CID encryption metadata.
 */
function parseCidEncryptionMetadata(
  metadata: unknown
): CidEncryptionMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null

  const meta = metadata as Record<string, unknown>

  // Basic validation
  if (
    typeof meta.ciphertext === 'string' &&
    typeof meta.dataToEncryptHash === 'string' &&
    Array.isArray(meta.accessControlConditions) &&
    typeof meta.chain === 'string'
  ) {
    return meta as unknown as CidEncryptionMetadata
  }

  return null
}

/**
 * Parse segment metadata from Arkiv payload.
 */
function parseSegmentMetadata(
  segmentMeta: unknown
): SegmentMetadata | null {
  if (!segmentMeta || typeof segmentMeta !== 'object') return null

  const meta = segmentMeta as Record<string, unknown>

  // Validate required fields
  if (
    typeof meta.segment_index !== 'number' ||
    typeof meta.mint_id !== 'string' ||
    typeof meta.start_timestamp !== 'string'
  ) {
    return null
  }

  const startTimestamp = new Date(meta.start_timestamp)
  if (isNaN(startTimestamp.getTime())) {
    return null
  }

  let endTimestamp: Date | undefined
  if (meta.end_timestamp) {
    endTimestamp = new Date(meta.end_timestamp as string)
    if (isNaN(endTimestamp.getTime())) {
      endTimestamp = undefined
    }
  }

  return {
    segmentIndex: meta.segment_index,
    startTimestamp,
    endTimestamp,
    mintId: meta.mint_id,
    recordingSessionId: typeof meta.recording_session_id === 'string' 
      ? meta.recording_session_id 
      : undefined,
  }
}

/**
 * Determine if a video is encrypted based on attributes and payload.
 */
function determineEncryptedStatus(
  attributes: Record<string, unknown>,
  payload: ArkivPayload | null
): boolean {
  // Check attributes first
  const isEncryptedAttr = attributes.is_encrypted
  if (isEncryptedAttr === 1) return true
  if (isEncryptedAttr === 0) return false

  // Fall back to payload
  if (payload?.is_encrypted !== undefined) {
    return payload.is_encrypted
  }

  // Default: check for encrypted CID as indicator
  return !!attributes.encrypted_cid || !!payload?.encrypted_cid
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Check if an error is an ArkivError.
 */
export function isArkivError(error: unknown): error is ArkivError {
  return error instanceof ArkivError || 
    (error instanceof Error && error.name === 'ArkivError')
}

/**
 * Get a user-friendly error message from an error.
 */
export function getVideoErrorMessage(error: unknown): string {
  if (error instanceof ArkivError) {
    switch (error.code) {
      case 'QUERY_ERROR':
        return 'Failed to query videos. Please try again.'
      case 'GET_ERROR':
        return 'Failed to load video. Please try again.'
      case 'FETCH_ALL_ERROR':
        return 'Failed to load all videos. Please try again.'
      case 'NOT_INITIALIZED':
        return 'Video service not initialized. Please refresh the page.'
      case 'NO_ADDRESS':
        return 'Please connect your wallet to view videos.'
      case 'NETWORK_ERROR':
        return 'Network error. Please check your connection.'
      default:
        return error.message || 'An unexpected error occurred.'
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'An unexpected error occurred.'
}
