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
 *   attributes: { grp: 'haven.video.full', title: 'My Video', dur_s: 3600 },
 *   payload: 'base64encodedjson...',
 *   contentType: 'application/json',
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
  /** Group taxonomy (`haven.video.full`, `haven.video.drip.*`, …) */
  grp?: string
  // Basic metadata
  /** Video title (≤128 B) */
  title?: string

  /** Duration in whole seconds (`dur_s`; 0/omit = unknown) */
  dur_s?: number

  /** MIME enum int (shared table in `lib/mime-enum`) */
  mime?: number

  // Gate corpus (public, filterable — see MEDIA_CONTENT_SPEC.md)
  /** Gate ERC-20 contract address (lowercase hex) */
  gate_token?: string
  /** EIP-155 chain id (see `lib/gate-chains`) */
  gate_chain?: number
  /** Token balance threshold */
  gate_threshold?: number
  /** Gate type: 1=per-file, 3=per-epoch, 4=per-marketcap */
  gate_type?: number
  /** Corpus epoch for v3 gates */
  gate_epoch?: number
  /** Locator hash (hex digest of the root locator string) */
  sha256_ct?: string

  // V4 drip coordinates (parts carry stage facts; series carries the rest)
  /** Whole-USD unlock target for this stage */
  mcap_usd?: number
  /** 0-based stage index */
  drip_idx?: number
  /** Stable run id (thread key) */
  drip_id?: string
  /** Total stages (series header) */
  drip_total?: number
  /** Entity key of the series header (parts) */
  series_ref?: string
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
  // Locators (one per record class — never both)
  /**
   * Filecoin CID for clear records.
   */
  fcid?: string

  /**
   * Filecoin piece CID for gated records (Synapse download).
   */
  piece?: string

  // Content gates (Haven-AOL JSON, frozen spellings inside the blob)
  /**
   * CID-layer gate (only when distinct from the content gate).
   */
  cid_gate?: string | Record<string, unknown>

  /**
   * Content gate (v1/v3 full records, v4 drip parts).
   * Stored as JSON string or object in the entity payload.
   */
  gate?: string | Record<string, unknown>

  // AI analysis
  /** CID of VLM analysis JSON on Filecoin */
  vlm?: string

  /** VLM model used for analysis */
  vlm_model?: string

  // Provenance (payload-only — off the indexed surface)
  /** Original source URL */
  src?: string

  /** Creator handle/username */
  creator?: string

  /** Perceptual hash for content identification */
  phash?: string

  /** Plaintext sha256 (pre-encryption) */
  pt_hash?: string

  /** Content size in bytes */
  size?: number

  /** Codec hints (e.g. `["h264"]`) */
  codecs?: string[]

  // Segments (for multi-segment recordings)
  /** Segment block */
  seg?: ArkivSegmentMetadata

  // Attestation (canister-signed holding proof, single or Merkle-v2)
  attn?: Record<string, unknown>
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
