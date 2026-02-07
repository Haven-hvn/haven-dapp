/**
 * Type Guards for Haven Web DApp
 * 
 * Runtime type validation functions for TypeScript types.
 * These guards provide safe type narrowing at runtime.
 * 
 * @module types/guards
 */

import type { Video, VlmAnalysis, SegmentMetadata, VideoProcessingStatus } from './video'
import type { LitEncryptionMetadata, CidEncryptionMetadata, AccessControlCondition } from './lit'
import type { ArkivEntity, ArkivPayload, ArkivAttributes, ArkivSegmentMetadata } from './arkiv'
import type { VideoCardData, LibraryState, ViewMode, SortField, SortOrder } from './ui'

// ============================================================================
// Video Type Guards
// ============================================================================

/**
 * Check if a value is a valid Video object.
 * 
 * @param obj - Value to check
 * @returns True if obj is a valid Video
 * 
 * @example
 * ```typescript
 * const maybeVideo = fetchVideo(id)
 * if (isVideo(maybeVideo)) {
 *   console.log(maybeVideo.title) // TypeScript knows this is Video
 * }
 * ```
 */
export function isVideo(obj: unknown): obj is Video {
  if (typeof obj !== 'object' || obj === null) return false
  
  const v = obj as Record<string, unknown>
  
  return (
    typeof v.id === 'string' &&
    typeof v.owner === 'string' &&
    v.createdAt instanceof Date &&
    typeof v.title === 'string' &&
    typeof v.duration === 'number' &&
    typeof v.isEncrypted === 'boolean' &&
    typeof v.hasAiData === 'boolean'
  )
}

/**
 * Check if a value has the required fields to be a Video.
 * Less strict than isVideo - allows Date strings and missing optional fields.
 * 
 * @param obj - Value to check
 * @returns True if obj has minimum required Video fields
 */
export function isPartialVideo(obj: unknown): obj is Partial<Video> & { id: string; title: string } {
  if (typeof obj !== 'object' || obj === null) return false
  
  const v = obj as Record<string, unknown>
  
  return (
    typeof v.id === 'string' &&
    typeof v.title === 'string'
  )
}

/**
 * Check if a value is a valid SegmentMetadata object.
 * 
 * @param obj - Value to check
 * @returns True if obj is a valid SegmentMetadata
 */
export function isSegmentMetadata(obj: unknown): obj is SegmentMetadata {
  if (typeof obj !== 'object' || obj === null) return false
  
  const s = obj as Record<string, unknown>
  
  return (
    typeof s.segmentIndex === 'number' &&
    s.startTimestamp instanceof Date &&
    (s.endTimestamp === undefined || s.endTimestamp instanceof Date) &&
    typeof s.mintId === 'string'
  )
}

/**
 * Check if a value is a valid VlmAnalysis object.
 * 
 * @param obj - Value to check
 * @returns True if obj is a valid VlmAnalysis
 */
export function isVlmAnalysis(obj: unknown): obj is VlmAnalysis {
  if (typeof obj !== 'object' || obj === null) return false
  
  const a = obj as Record<string, unknown>
  
  return (
    typeof a.version === 'string' &&
    typeof a.model === 'string' &&
    typeof a.analyzedAt === 'string' &&
    Array.isArray(a.segments)
  )
}

/**
 * Check if a string is a valid VideoProcessingStatus.
 * 
 * @param status - String to check
 * @returns True if status is a valid VideoProcessingStatus
 */
export function isVideoProcessingStatus(status: string): status is VideoProcessingStatus {
  return ['pending', 'uploading', 'encrypting', 'analyzing', 'storing', 'complete', 'failed'].includes(status)
}

// ============================================================================
// Lit Protocol Type Guards
// ============================================================================

/**
 * Check if a value is a valid LitEncryptionMetadata object.
 * 
 * @param obj - Value to check
 * @returns True if obj is a valid LitEncryptionMetadata
 * 
 * @example
 * ```typescript
 * const metadata = JSON.parse(jsonString)
 * if (isLitEncryptionMetadata(metadata)) {
 *   // Safe to use metadata.encryptedKey, etc.
 * }
 * ```
 */
export function isLitEncryptionMetadata(obj: unknown): obj is LitEncryptionMetadata {
  if (typeof obj !== 'object' || obj === null) return false
  
  const m = obj as Record<string, unknown>
  
  return (
    m.version === 'hybrid-v1' &&
    typeof m.encryptedKey === 'string' &&
    typeof m.keyHash === 'string' &&
    typeof m.iv === 'string' &&
    m.algorithm === 'AES-GCM' &&
    m.keyLength === 256 &&
    Array.isArray(m.accessControlConditions) &&
    m.accessControlConditions.every(isAccessControlCondition) &&
    typeof m.chain === 'string'
  )
}

/**
 * Check if a value is a valid AccessControlCondition object.
 * 
 * @param obj - Value to check
 * @returns True if obj is a valid AccessControlCondition
 */
export function isAccessControlCondition(obj: unknown): obj is AccessControlCondition {
  if (typeof obj !== 'object' || obj === null) return false
  
  const c = obj as Record<string, unknown>
  
  const validStandardTypes = ['', 'ERC20', 'ERC721', 'ERC1155', 'PKPPermissions']
  const validComparators = ['=', '>', '>=', '<', '<=', 'contains']
  
  return (
    typeof c.contractAddress === 'string' &&
    validStandardTypes.includes(c.standardContractType as string) &&
    typeof c.chain === 'string' &&
    typeof c.method === 'string' &&
    Array.isArray(c.parameters) &&
    typeof c.returnValueTest === 'object' &&
    c.returnValueTest !== null &&
    validComparators.includes((c.returnValueTest as Record<string, unknown>).comparator as string) &&
    typeof (c.returnValueTest as Record<string, unknown>).value === 'string'
  )
}

/**
 * Check if a value is a valid CidEncryptionMetadata object.
 * 
 * @param obj - Value to check
 * @returns True if obj is a valid CidEncryptionMetadata
 */
export function isCidEncryptionMetadata(obj: unknown): obj is CidEncryptionMetadata {
  if (typeof obj !== 'object' || obj === null) return false
  
  const m = obj as Record<string, unknown>
  
  return (
    typeof m.ciphertext === 'string' &&
    typeof m.dataToEncryptHash === 'string' &&
    Array.isArray(m.accessControlConditions) &&
    m.accessControlConditions.every(isAccessControlCondition) &&
    typeof m.chain === 'string'
  )
}

// ============================================================================
// Arkiv Type Guards
// ============================================================================

/**
 * Check if a value is a valid ArkivEntity object.
 * 
 * @param obj - Value to check
 * @returns True if obj is a valid ArkivEntity
 */
export function isArkivEntity(obj: unknown): obj is ArkivEntity {
  if (typeof obj !== 'object' || obj === null) return false
  
  const e = obj as Record<string, unknown>
  
  return (
    typeof e.key === 'string' &&
    typeof e.owner === 'string' &&
    typeof e.attributes === 'object' &&
    e.attributes !== null &&
    typeof e.payload === 'string' &&
    typeof e.contentType === 'string' &&
    typeof e.createdAt === 'string'
  )
}

/**
 * Check if a value is a valid ArkivPayload object.
 * 
 * @param obj - Value to check
 * @returns True if obj is a valid ArkivPayload
 */
export function isArkivPayload(obj: unknown): obj is ArkivPayload {
  if (typeof obj !== 'object' || obj === null) return false
  
  const p = obj as Record<string, unknown>
  
  return typeof p.is_encrypted === 'boolean'
}

/**
 * Check if a value is a valid ArkivAttributes object.
 * 
 * @param obj - Value to check
 * @returns True if obj is a valid ArkivAttributes
 */
export function isArkivAttributes(obj: unknown): obj is ArkivAttributes {
  if (typeof obj !== 'object' || obj === null) return false
  
  const a = obj as Record<string, unknown>
  
  // Attributes are all optional, so just check types if present
  if (a.title !== undefined && typeof a.title !== 'string') return false
  if (a.duration !== undefined && typeof a.duration !== 'number') return false
  if (a.is_encrypted !== undefined && typeof a.is_encrypted !== 'number') return false
  if (a.creator_handle !== undefined && typeof a.creator_handle !== 'string') return false
  if (a.mint_id !== undefined && typeof a.mint_id !== 'string') return false
  if (a.phash !== undefined && typeof a.phash !== 'string') return false
  if (a.analysis_model !== undefined && typeof a.analysis_model !== 'string') return false
  if (a.source_uri !== undefined && typeof a.source_uri !== 'string') return false
  if (a.created_at !== undefined && typeof a.created_at !== 'string') return false
  if (a.updated_at !== undefined && typeof a.updated_at !== 'string') return false
  
  return true
}

/**
 * Check if a value is a valid ArkivSegmentMetadata object.
 * 
 * @param obj - Value to check
 * @returns True if obj is a valid ArkivSegmentMetadata
 */
export function isArkivSegmentMetadata(obj: unknown): obj is ArkivSegmentMetadata {
  if (typeof obj !== 'object' || obj === null) return false
  
  const s = obj as Record<string, unknown>
  
  return (
    typeof s.segment_index === 'number' &&
    typeof s.start_timestamp === 'string' &&
    (s.end_timestamp === undefined || typeof s.end_timestamp === 'string') &&
    typeof s.mint_id === 'string'
  )
}

// ============================================================================
// UI Type Guards
// ============================================================================

/**
 * Check if a value is a valid VideoCardData object.
 * 
 * @param obj - Value to check
 * @returns True if obj is a valid VideoCardData
 */
export function isVideoCardData(obj: unknown): obj is VideoCardData {
  if (typeof obj !== 'object' || obj === null) return false
  
  const c = obj as Record<string, unknown>
  
  return (
    typeof c.id === 'string' &&
    typeof c.title === 'string' &&
    typeof c.duration === 'string' &&
    typeof c.durationSeconds === 'number' &&
    typeof c.isEncrypted === 'boolean' &&
    typeof c.hasAiData === 'boolean' &&
    typeof c.createdAt === 'string' &&
    c.createdAtDate instanceof Date
  )
}

/**
 * Check if a string is a valid ViewMode.
 * 
 * @param mode - String to check
 * @returns True if mode is a valid ViewMode
 */
export function isViewMode(mode: string): mode is ViewMode {
  return mode === 'grid' || mode === 'list'
}

/**
 * Check if a string is a valid SortField.
 * 
 * @param field - String to check
 * @returns True if field is a valid SortField
 */
export function isSortField(field: string): field is SortField {
  return ['date', 'title', 'duration', 'created'].includes(field)
}

/**
 * Check if a string is a valid SortOrder.
 * 
 * @param order - String to check
 * @returns True if order is a valid SortOrder
 */
export function isSortOrder(order: string): order is SortOrder {
  return order === 'asc' || order === 'desc'
}

/**
 * Check if a value is a valid LibraryState object.
 * 
 * @param obj - Value to check
 * @returns True if obj is a valid LibraryState
 */
export function isLibraryState(obj: unknown): obj is LibraryState {
  if (typeof obj !== 'object' || obj === null) return false
  
  const s = obj as Record<string, unknown>
  
  return (
    isViewMode(s.viewMode as string) &&
    isSortField(s.sortBy as string) &&
    isSortOrder(s.sortOrder as string) &&
    typeof s.searchQuery === 'string' &&
    typeof s.filters === 'object' &&
    Array.isArray(s.selectedIds) &&
    s.selectedIds.every(id => typeof id === 'string')
  )
}

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parse an Arkiv payload from base64 JSON string.
 * Validates the result using type guard.
 * 
 * @param payloadBase64 - Base64-encoded JSON payload
 * @returns Parsed ArkivPayload or null if invalid
 * 
 * @example
 * ```typescript
 * const payload = parseArkivPayload(entity.payload)
 * if (payload) {
 *   console.log(payload.filecoin_root_cid)
 * }
 * ```
 */
export function parseArkivPayload(payloadBase64: string): ArkivPayload | null {
  try {
    const json = atob(payloadBase64)
    const parsed = JSON.parse(json)
    return isArkivPayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Safely parse an Arkiv payload with full validation.
 * 
 * @param payloadBase64 - Base64-encoded JSON payload
 * @returns Parsed payload with full type checking
 */
export function parseArkivPayloadSafe(payloadBase64: string): 
  | { success: true; payload: ArkivPayload }
  | { success: false; error: string } {
  try {
    const json = atob(payloadBase64)
    const parsed = JSON.parse(json)
    
    if (!isArkivPayload(parsed)) {
      return { success: false, error: 'Invalid payload structure' }
    }
    
    return { success: true, payload: parsed }
  } catch (e) {
    return { 
      success: false, 
      error: e instanceof Error ? e.message : 'Failed to parse payload' 
    }
  }
}

/**
 * Parse Lit encryption metadata from JSON string.
 * 
 * @param metadataJson - JSON string containing LitEncryptionMetadata
 * @returns Parsed metadata or null if invalid
 */
export function parseLitMetadata(metadataJson: string): LitEncryptionMetadata | null {
  try {
    const parsed = JSON.parse(metadataJson)
    return isLitEncryptionMetadata(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Parse ISO 8601 date string to Date object.
 * Returns null if parsing fails.
 * 
 * @param dateString - ISO 8601 date string
 * @returns Date object or null
 */
export function parseDateSafe(dateString: string): Date | null {
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) {
      return null
    }
    return date
  } catch {
    return null
  }
}

// ============================================================================
// Assertion Functions
// ============================================================================

/**
 * Assert that a value is a valid Video.
 * Throws if the value is not a valid Video.
 * 
 * @param value - Value to check
 * @param message - Optional error message
 * @throws TypeError if value is not a valid Video
 */
export function assertVideo(value: unknown, message?: string): asserts value is Video {
  if (!isVideo(value)) {
    throw new TypeError(message || 'Value is not a valid Video')
  }
}

/**
 * Assert that a value is a valid LitEncryptionMetadata.
 * Throws if the value is not valid.
 * 
 * @param value - Value to check
 * @param message - Optional error message
 * @throws TypeError if value is not valid
 */
export function assertLitEncryptionMetadata(
  value: unknown, 
  message?: string
): asserts value is LitEncryptionMetadata {
  if (!isLitEncryptionMetadata(value)) {
    throw new TypeError(message || 'Value is not valid LitEncryptionMetadata')
  }
}

/**
 * Assert that a value is a valid ArkivPayload.
 * Throws if the value is not valid.
 * 
 * @param value - Value to check
 * @param message - Optional error message
 * @throws TypeError if value is not valid
 */
export function assertArkivPayload(
  value: unknown, 
  message?: string
): asserts value is ArkivPayload {
  if (!isArkivPayload(value)) {
    throw new TypeError(message || 'Value is not a valid ArkivPayload')
  }
}
