/**
 * Arkiv Entity Types for Haven Web DApp
 * 
 * Defines TypeScript interfaces for raw Arkiv entities as returned
 * from the SDK/API, including attributes and payload structures.
 * 
 * These types represent the "wire format" from Arkiv and are typically
 * transformed into higher-level types like Video for application use.
 * 
 * @module types/arkiv
 */

import type { CidEncryptionMetadata, LitEncryptionMetadata } from './lit'

// ============================================================================
// Raw Arkiv Entity Types
// ============================================================================

/**
 * Raw Arkiv entity as returned from the SDK/API.
 * 
 * This is the low-level representation directly from the Arkiv SDK.
 * For application use, entities are typically transformed into higher-level
 * types like Video using transformation functions.
 * 
 * @example
 * ```typescript
 * const entity: ArkivEntity = {
 *   key: '0xabc123...',
 *   owner: '0xdef456...',
 *   attributes: { title: 'My Video', duration: 3600 },
 *   payload: 'base64encodedjson...',
 *   contentType: 'application/json',
 *   createdAt: '2024-01-15T10:30:00Z',
 * }
 * ```
 */
export interface ArkivEntity {
  /** Entity key - unique identifier (hex string) */
  key: string
  
  /** Wallet address of the owner */
  owner: string
  
  /** Public attributes (searchable, unencrypted) */
  attributes: ArkivAttributes
  
  /** 
   * Base64-encoded JSON payload.
   * Contains encrypted or sensitive data.
   */
  payload: string
  
  /** MIME type of the content */
  contentType: string
  
  /** ISO 8601 timestamp when entity was created */
  createdAt: string
  
  /** ISO 8601 timestamp when entity was last modified (optional) */
  modifiedAt?: string
}

/**
 * Alternative Arkiv entity format used by some SDK methods.
 * Matches the SDK's internal Entity class structure.
 */
export interface ArkivSdkEntity {
  /** Entity key (hex string) */
  key: `0x${string}`
  
  /** Content MIME type */
  contentType?: string
  
  /** Owner address */
  owner?: `0x${string}`
  
  /** Block number when entity expires (undefined = never) */
  expiresAtBlock?: bigint
  
  /** Block number when entity was created */
  createdAtBlock?: bigint
  
  /** Block number when entity was last modified */
  lastModifiedAtBlock?: bigint
  
  /** Transaction index within the block */
  transactionIndexInBlock?: bigint
  
  /** Operation index within the transaction */
  operationIndexInTransaction?: bigint
  
  /** Raw payload bytes */
  payload?: Uint8Array
  
  /** Array of attributes */
  attributes: ArkivSdkAttribute[]
}

// ============================================================================
// Attribute Types
// ============================================================================

/**
 * Arkiv entity attributes (public, searchable).
 * 
 * Attributes are stored publicly on the blockchain and can be used
 * for querying and filtering entities. They should not contain
 * sensitive information.
 * 
 * Note: Attribute keys use snake_case to match the Arkiv SDK convention.
 */
export interface ArkivAttributes {
  // Basic metadata
  /** Video title */
  title?: string
  
  /** Duration in seconds */
  duration?: number
  
  // Creator info
  /** Content creator handle/username */
  creator_handle?: string
  
  /** Mint ID if video has been minted */
  mint_id?: string
  
  // Encryption indicators
  /** 
   * Whether the video is encrypted.
   * 1 = encrypted, undefined/0 = not encrypted
   */
  is_encrypted?: number
  
  /** 
   * Encrypted CID (public for privacy-preserving lookups).
   * The actual CID is encrypted; this allows checking existence
   * without revealing the CID to everyone.
   */
  encrypted_cid?: string
  
  // Content identification
  /** Perceptual hash for content deduplication */
  phash?: string
  
  /** VLM model used for AI analysis */
  analysis_model?: string
  
  /** Original source URL */
  source_uri?: string
  
  // Timestamps (ISO 8601)
  /** When the content was created */
  created_at?: string
  
  /** When the content was last updated */
  updated_at?: string
  
  // Additional searchable metadata
  /** Tags for categorization */
  tags?: string
  
  /** Content category */
  category?: string
  
  /** Language code (e.g., 'en', 'es') */
  language?: string
}

/**
 * Single attribute as stored by the SDK.
 * The SDK stores attributes as an array of key-value pairs.
 */
export interface ArkivSdkAttribute {
  /** Attribute key */
  key: string
  
  /** Attribute value (string or number) */
  value: string | number
}

// ============================================================================
// Payload Types
// ============================================================================

/**
 * Arkiv entity payload (encrypted/sensitive data).
 * 
 * The payload contains sensitive data that should not be publicly
 * searchable. It is stored as base64-encoded JSON within the entity.
 * 
 * Note: Field names use snake_case to match the storage format.
 */
export interface ArkivPayload {
  // CID storage
  /** 
   * Root Filecoin CID for non-encrypted videos.
   * This is the direct CID that can be used to fetch content.
   */
  filecoin_root_cid?: string
  
  /** 
   * Encrypted CID (duplicate for convenience).
   * Same as encrypted_cid in attributes but in decrypted form.
   */
  encrypted_cid?: string
  
  /** 
   * CID hash for deduplication.
   * Used to check if identical content already exists.
   */
  cid_hash?: string
  
  // Encryption metadata
  /** 
   * CID encryption metadata.
   * Used when the CID itself is encrypted for privacy.
   */
  cid_encryption_metadata?: CidEncryptionMetadata
  
  /** 
   * Lit encryption metadata as JSON string.
   * Contains the full LitEncryptionMetadata object serialized.
   * Use parseLitEncryptionMetadata() to convert to object.
   */
  lit_encryption_metadata?: string
  
  // AI analysis
  /** CID of VLM analysis JSON on Filecoin */
  vlm_json_cid?: string
  
  // Essential flags
  /** Whether the content is encrypted */
  is_encrypted: boolean
  
  // Segment metadata
  /** Metadata for multi-segment recordings */
  segment_metadata?: ArkivSegmentMetadata
  
  // Codec variants for adaptive playback
  /** Available codec variants for this video */
  codec_variants?: ArkivCodecVariant[]
  
  // Source information
  /** Original source URL */
  source_uri?: string
  
  /** Creator handle/username */
  creator_handle?: string
  
  // Video metadata
  /** Video description (can be longer than attribute) */
  description?: string
  
  /** Thumbnail CID or URL */
  thumbnail_cid?: string
  
  /** Video duration in seconds */
  duration?: number
}

/**
 * Codec variant for multi-codec videos.
 * Stored within the Arkiv payload (snake_case to match storage format).
 */
export interface ArkivCodecVariant {
  /** Codec type */
  codec: 'av1' | 'h264' | 'vp9' | 'hevc'
  
  /** IPFS/Filecoin CID for this variant */
  cid: string
  
  /** Quality score (0-100) */
  quality_score: number
  
  /** Average bitrate in kbps */
  bitrate?: number
  
  /** Video resolution */
  resolution?: {
    width: number
    height: number
  }
  
  /** File size in bytes */
  file_size?: number
}

/**
 * Segment metadata for multi-segment recordings.
 * Stored within the Arkiv payload.
 */
export interface ArkivSegmentMetadata {
  /** Index of this segment */
  segment_index: number
  
  /** ISO 8601 timestamp when segment started */
  start_timestamp: string
  
  /** ISO 8601 timestamp when segment ended (optional) */
  end_timestamp?: string
  
  /** Mint ID for this segment */
  mint_id: string
  
  /** Recording session ID for grouping */
  recording_session_id?: string
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Options for querying Arkiv entities.
 */
export interface ArkivQueryOptions {
  /** Maximum number of results to return */
  maxResults?: number
  
  /** Cursor for pagination */
  cursor?: string
  
  /** Whether to include payload data in results */
  includePayload?: boolean
  
  /** Whether to include attributes in results */
  includeAttributes?: boolean
  
  /** Whether to include metadata (owner, created_at, etc.) */
  includeMetadata?: boolean
  
  /** Order by field */
  orderBy?: 'created_at' | 'updated_at' | 'title'
  
  /** Sort order */
  orderDirection?: 'asc' | 'desc'
}

/**
 * Result of an Arkiv query operation.
 */
export interface ArkivQueryResult {
  /** Matching entities */
  entities: ArkivEntity[]
  
  /** Cursor for fetching next page */
  cursor?: string
  
  /** Whether there are more results */
  hasMore: boolean
  
  /** Total count (if available) */
  totalCount?: number
}

// ============================================================================
// Connection Types
// ============================================================================

/**
 * Connection status for the Arkiv client.
 */
export interface ArkivConnectionStatus {
  /** Whether connected to the Arkiv network */
  isConnected: boolean
  
  /** Error message if not connected */
  error?: string
  
  /** Current block number */
  blockNumber?: bigint
  
  /** Current block timestamp */
  blockTime?: number
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Arkiv error codes.
 */
export type ArkivErrorCode =
  | 'QUERY_ERROR'
  | 'GET_ERROR'
  | 'FETCH_ALL_ERROR'
  | 'NOT_INITIALIZED'
  | 'NO_ADDRESS'
  | 'PARSE_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN_ERROR'

/**
 * Custom error class for Arkiv operations.
 */
export class ArkivError extends Error {
  constructor(
    message: string,
    public code?: ArkivErrorCode,
    public cause?: Error
  ) {
    super(message)
    this.name = 'ArkivError'
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse Lit encryption metadata from JSON string.
 * 
 * @param metadataJson - JSON string from Arkiv payload
 * @returns Parsed LitEncryptionMetadata or null if invalid
 */
export function parseLitEncryptionMetadata(
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
 * Convert attributes array to record object.
 * 
 * @param attributes - Array of SDK attributes
 * @returns Record object for easier access
 */
export function attributesArrayToRecord(
  attributes: ArkivSdkAttribute[]
): Record<string, string | number> {
  const record: Record<string, string | number> = {}
  
  for (const attr of attributes) {
    record[attr.key] = attr.value
  }
  
  return record
}

/**
 * Convert attributes record to array format.
 * 
 * @param record - Record object
 * @returns Array of SDK attributes
 */
export function attributesRecordToArray(
  record: Record<string, string | number | undefined>
): ArkivSdkAttribute[] {
  const array: ArkivSdkAttribute[] = []
  
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      array.push({ key, value })
    }
  }
  
  return array
}
