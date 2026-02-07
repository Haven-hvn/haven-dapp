/**
 * Video Entity Types for Haven Web DApp
 * 
 * Defines TypeScript interfaces for video entities parsed from Arkiv,
 * including metadata, encryption structures, and UI state.
 * 
 * @module types/video
 */

import type { LitEncryptionMetadata, CidEncryptionMetadata } from './lit'

// ============================================================================
// Core Video Types
// ============================================================================

/**
 * Represents a video in the Haven system.
 * Parsed from Arkiv entity data.
 * 
 * @example
 * ```typescript
 * const video: Video = {
 *   id: '0x123...',
 *   owner: '0xabc...',
 *   title: 'My Recording',
 *   duration: 3600,
 *   isEncrypted: true,
 *   hasAiData: true,
 *   createdAt: new Date('2024-01-15'),
 * }
 * ```
 */
export interface Video {
  /** Entity identification - Arkiv entity key (hex string) */
  id: string
  
  /** Wallet address of the owner */
  owner: string
  
  /** When the video was created */
  createdAt: Date
  
  /** When the video was last updated (optional) */
  updatedAt?: Date
  
  // Video metadata (from Arkiv attributes)
  /** Video title */
  title: string
  
  /** Video description (optional) */
  description?: string
  
  /** Duration in seconds */
  duration: number
  
  /** URL to thumbnail image (optional) */
  thumbnailUrl?: string
  
  // Source information
  /** Original source URL (YouTube, etc.) */
  sourceUri?: string
  
  /** Content creator handle/username */
  creatorHandle?: string
  
  // Filecoin storage
  /** Root CID for non-encrypted videos */
  filecoinCid?: string
  
  /** Encrypted CID for encrypted videos */
  encryptedCid?: string
  
  /** CID hash for deduplication */
  cidHash?: string
  
  // Encryption
  /** Whether the video content is encrypted */
  isEncrypted: boolean
  
  /** Lit Protocol encryption metadata (for encrypted videos) */
  litEncryptionMetadata?: LitEncryptionMetadata
  
  /** CID encryption metadata (when CID itself is encrypted) */
  cidEncryptionMetadata?: CidEncryptionMetadata
  
  // AI analysis
  /** Whether AI analysis data is available */
  hasAiData: boolean
  
  /** CID of VLM analysis JSON on Filecoin */
  vlmJsonCid?: string
  
  /** VLM model used for analysis */
  analysisModel?: string
  
  /** Perceptual hash for content identification */
  phash?: string
  
  /** VLM analysis data (loaded from vlmJsonCid) */
  vlmAnalysis?: VlmAnalysis
  
  // Segments (for multi-segment recordings)
  /** Segment metadata for multi-segment recordings */
  segmentMetadata?: SegmentMetadata
  
  // Codec variants for adaptive playback
  /** Available codec variants for this video */
  codecVariants?: CodecVariant[]
  
  // Minting
  /** Mint ID if video has been minted as NFT */
  mintId?: string
  
  // UI state (not from Arkiv - local only)
  /** Whether video data is loading */
  isLoading?: boolean
  
  /** Error message if loading failed */
  error?: string
}

/**
 * Segment metadata for multi-segment recordings.
 * Used when a recording is split into multiple segments.
 */
export interface SegmentMetadata {
  /** Index of this segment in the sequence */
  segmentIndex: number
  
  /** When this segment started recording */
  startTimestamp: Date
  
  /** When this segment ended recording (undefined if still recording) */
  endTimestamp?: Date
  
  /** Mint ID associated with this segment */
  mintId: string
  
  /** Recording session ID for grouping segments */
  recordingSessionId?: string
}

// ============================================================================
// AI Analysis Types
// ============================================================================

/**
 * VLM (Vision Language Model) analysis data structure.
 * Stored as JSON on Filecoin and referenced by vlmJsonCid.
 */
export interface VlmAnalysis {
  /** Version of the analysis format */
  version: string
  
  /** Model used for analysis */
  model: string
  
  /** When the analysis was performed */
  analyzedAt: string
  
  /** Array of analysis segments (typically per-frame or per-interval) */
  segments: VlmSegment[]
  
  /** Summary of the entire video */
  summary?: string
  
  /** Key topics/entities detected */
  topics?: string[]
  
  /** Perceptual hash for the video */
  phash?: string
}

/**
 * A single segment of VLM analysis.
 */
export interface VlmSegment {
  /** Start time in seconds */
  startTime: number
  
  /** End time in seconds */
  endTime: number
  
  /** Text description of this segment */
  description: string
  
  /** Confidence score (0-1) */
  confidence?: number
  
  /** Objects detected in this segment */
  objects?: DetectedObject[]
  
  /** Events detected in this segment */
  events?: DetectedEvent[]
}

/**
 * Object detected in a video segment.
 */
export interface DetectedObject {
  /** Object label/class */
  label: string
  
  /** Confidence score (0-1) */
  confidence: number
  
  /** Bounding box coordinates (normalized 0-1) */
  bbox?: [number, number, number, number]
}

/**
 * Event detected in a video segment.
 */
export interface DetectedEvent {
  /** Event type/name */
  type: string
  
  /** When the event occurred within the segment */
  timestamp: number
  
  /** Event description */
  description?: string
}

// ============================================================================
// Video Creation/Update Types
// ============================================================================

/**
 * Input data for creating a new video entity.
 * Used when uploading or importing videos.
 */
export interface CreateVideoInput {
  /** Video title */
  title: string
  
  /** Video description (optional) */
  description?: string
  
  /** Duration in seconds */
  duration: number
  
  /** Original source URL (optional) */
  sourceUri?: string
  
  /** Creator handle (optional) */
  creatorHandle?: string
  
  /** Filecoin CID for the video content */
  filecoinCid?: string
  
  /** Whether to encrypt the video */
  isEncrypted?: boolean
  
  /** Thumbnail URL (optional) */
  thumbnailUrl?: string
}

/**
 * Input data for updating an existing video entity.
 */
export interface UpdateVideoInput {
  /** Updated title (optional) */
  title?: string
  
  /** Updated description (optional) */
  description?: string
  
  /** Updated thumbnail URL (optional) */
  thumbnailUrl?: string
}

// ============================================================================
// Video Status Types
// ============================================================================

/**
 * Processing status for video upload/import.
 */
export type VideoProcessingStatus = 
  | 'pending'      // Waiting to start
  | 'uploading'    // Uploading to Filecoin
  | 'encrypting'   // Encrypting with Lit
  | 'analyzing'    // Running AI analysis
  | 'storing'      // Storing in Arkiv
  | 'complete'     // All done
  | 'failed'       // Processing failed

/**
 * Detailed status information for a video being processed.
 */
export interface VideoProcessingState {
  /** Current processing step */
  status: VideoProcessingStatus
  
  /** Progress percentage (0-100) */
  progress: number
  
  /** Current operation message */
  message?: string
  
  /** Error message if failed */
  error?: string
  
  /** When processing started */
  startedAt?: Date
  
  /** Estimated completion time */
  estimatedCompletion?: Date
}

// ============================================================================
// Video Source Types
// ============================================================================

/**
 * Source type for video content.
 */
export type VideoSourceType = 
  | 'recording'    // Live recording from Haven
  | 'upload'       // Direct file upload
  | 'youtube'      // Imported from YouTube
  | 'import'       // Imported from other source

/**
 * Information about where the video came from.
 */
export interface VideoSourceInfo {
  /** Type of source */
  type: VideoSourceType
  
  /** Original URL or identifier */
  url?: string
  
  /** Original file name (for uploads) */
  fileName?: string
  
  /** File size in bytes */
  fileSize?: number
  
  /** MIME type of original file */
  mimeType?: string
  
  /** When the source was created (if available) */
  sourceCreatedAt?: Date
}

// ============================================================================
// Codec Variant Types
// ============================================================================

/**
 * Video codec types supported for adaptive playback.
 */
export type VideoCodec = 'av1' | 'h264' | 'vp9' | 'hevc' | 'auto'

/**
 * Codec variant information for multi-codec videos.
 * 
 * Used when a video is available in multiple codec formats
 * for adaptive playback based on browser support.
 */
export interface CodecVariant {
  /** Codec type */
  codec: VideoCodec
  
  /** IPFS/Filecoin CID for this variant */
  cid: string
  
  /** Direct URL (if different from IPFS gateway) */
  url?: string
  
  /** Quality score (0-100, relative to other variants) */
  qualityScore: number
  
  /** Average bitrate in kbps */
  bitrate?: number
  
  /** Video resolution */
  resolution?: {
    width: number
    height: number
  }
  
  /** File size in bytes */
  fileSize?: number
  
  /** Whether this variant was hardware-encoded */
  hardwareEncoded?: boolean
  
  /** Encoding preset/quality setting used */
  encodingPreset?: string
}

// ============================================================================
// Video Filter Types
// ============================================================================

/**
 * Date range filter for videos.
 */
export interface DateRange {
  /** Start date (inclusive) */
  start: Date
  
  /** End date (inclusive) */
  end: Date
}

/**
 * Duration range filter for videos (in seconds).
 */
export interface DurationRange {
  /** Minimum duration in seconds */
  min: number
  
  /** Maximum duration in seconds */
  max: number
}

/**
 * Filters for video search and filtering.
 */
export interface VideoFilters {
  /** Filter by encrypted status */
  encrypted?: boolean
  
  /** Filter by AI data availability */
  hasAiData?: boolean
  
  /** Filter by date range */
  dateRange?: DateRange
  
  /** Filter by duration range */
  durationRange?: DurationRange
  
  /** Filter by source type */
  sourceType?: VideoSourceType
  
  /** Filter by creator handle */
  creatorHandle?: string
}
