/**
 * Cache Types for Haven DApp Local Cache Implementation
 *
 * Defines TypeScript interfaces for the local cache layer, including cached
 * video records, cache metadata, database schema, and configuration types.
 *
 * These types bridge the application-level Video entities with the IndexedDB
 * cache storage and the video content cache system (Service Worker + Cache API).
 *
 * @module types/cache
 */

import type { Video } from './video'

// ============================================================================
// Cache Version
// ============================================================================

/**
 * Current cache schema version.
 * Increment this when making breaking changes to the CachedVideo schema
 * to trigger migration logic in the cache service.
 */
export const CURRENT_CACHE_VERSION = 1

// ============================================================================
// Core Cache Types
// ============================================================================

/**
 * Status of an Arkiv entity in the cache.
 * Tracks whether the video is still available on Arkiv or has expired.
 */
export type ArkivEntityStatus = 'active' | 'expired' | 'unknown'

/**
 * Status of video content in the Cache API.
 * Tracks whether decrypted video bytes are available for offline playback.
 *
 * @remarks
 * This is part of the Video Content Cache integration. The video-cache system
 * (Service Worker + Cache API) populates these fields after successfully caching
 * decrypted video bytes. Until that system is implemented, this defaults to
 * 'not-cached' in all transforms.
 *
 * @see ../../../video-cache/README.md
 */
export type VideoCacheStatus = 'not-cached' | 'cached' | 'stale'

/**
 * A cached video record that extends the base Video type with cache-specific
 * metadata for IndexedDB storage and synchronization tracking.
 *
 * @example
 * ```typescript
 * const cachedVideo: CachedVideo = {
 *   // ...Video fields
 *   id: '0x123...',
 *   title: 'My Video',
 *
 *   // Cache metadata
 *   cachedAt: Date.now(),
 *   lastSyncedAt: Date.now(),
 *   lastAccessedAt: Date.now(),
 *   cacheVersion: 1,
 *
 *   // Arkiv status
 *   arkivEntityStatus: 'active',
 *   arkivEntityKey: '0x123...',
 *
 *   // Sync metadata
 *   isDirty: false,
 *
 *   // Video Content Cache integration
 *   videoCacheStatus: 'not-cached',
 * }
 * ```
 */
// Helper type to convert Date to number for serialization
type DateToNumber<T> = T extends Date ? number : T

// CachedVideo overrides Video's Date fields with numbers for IndexedDB
export interface CachedVideo extends Omit<Video, 'createdAt' | 'updatedAt' | 'segmentMetadata'> {
  // ========================================================================
  // Cache Metadata
  // ========================================================================

  /**
   * Unix timestamp (ms) when this video was first cached.
   * Used for cache age calculations and LRU eviction.
   */
  cachedAt: number

  /**
   * Unix timestamp (ms) of the last successful sync with Arkiv.
   * Updated whenever we fetch fresh data from the blockchain.
   */
  lastSyncedAt: number

  /**
   * Unix timestamp (ms) of the last user access to this video.
   * Updated when the user views, plays, or interacts with the video.
   * Used for LRU cache eviction decisions.
   */
  lastAccessedAt: number

  /**
   * Schema version of this cached record.
   * Used for detecting and performing migrations when the schema changes.
   * Should match CURRENT_CACHE_VERSION at time of caching.
   */
  cacheVersion: number

  // Override Video Date fields with timestamps for IndexedDB
  /** Creation timestamp (Unix ms) - overrides Video.createdAt */
  createdAt: number
  
  /** Last update timestamp (Unix ms) - overrides Video.updatedAt */
  updatedAt?: number
  
  /** Segment metadata with timestamps - overrides Video.segmentMetadata */
  segmentMetadata?: {
    segmentIndex: number
    startTimestamp: number
    endTimestamp?: number
    totalSegments: number
    mintId: string
    recordingSessionId?: string
  }

  // ========================================================================
  // Arkiv Entity Status
  // ========================================================================

  /**
   * Current status of the Arkiv entity.
   * - 'active': Entity exists on Arkiv and is accessible
   * - 'expired': Entity no longer exists on Arkiv (deleted/removed)
   * - 'unknown': Status could not be determined (sync error, etc.)
   */
  arkivEntityStatus: ArkivEntityStatus

  /**
   * Block number when the Arkiv entity expires, if applicable.
   * For time-locked or expirable entities, this tracks when they become
   * unavailable. Undefined for non-expiring entities.
   */
  expiresAtBlock?: number

  /**
   * Original Arkiv entity key (same as Video.id).
   * Stored redundantly for queries and indexing purposes.
   */
  arkivEntityKey: string

  // ========================================================================
  // Sync Metadata
  // ========================================================================

  /**
   * SHA-256 hash of the last synced video data.
   * Used for efficient change detection - if the hash hasn't changed,
   * we can skip expensive object comparisons during sync.
   *
   * @remarks
   * Computed from the serialized video data. If this differs from
   * a fresh Arkiv fetch, we know the data has changed.
   */
  syncHash?: string

  /**
   * Whether local changes haven't been synced to Arkiv.
   * Reserved for future local-first editing support.
   *
   * @remarks
   * When true, the cached version has modifications that need to be
   * pushed to Arkiv. Currently always false as local editing is not
   * yet implemented.
   */
  isDirty: boolean

  // ========================================================================
  // Video Content Cache Integration
  // ========================================================================

  /**
   * Whether decrypted video bytes are available in the Cache API.
   *
   * - 'not-cached': Video content is not cached locally
   * - 'cached': Video content is available for offline playback
   * - 'stale': Video content is cached but may be outdated
   *
   * @remarks
   * This field bridges the arkiv-cache (metadata in IndexedDB) with the
   * video-cache (decrypted bytes in Cache API). The video-cache system
   * writes this field after successful content caching. Default to
   * 'not-cached' in all transforms until video-cache is implemented.
   *
   * @see ../../../video-cache/README.md
   */
  videoCacheStatus: VideoCacheStatus

  /**
   * Unix timestamp (ms) when video content was cached in the Cache API.
   * Set by the video-cache system after successfully storing decrypted bytes.
   * Undefined if video content has never been cached.
   *
   * @see ../../../video-cache/README.md
   */
  videoCachedAt?: number
}

// ============================================================================
// Cache Metadata Types
// ============================================================================

/**
 * A single metadata entry stored in the cache metadata store.
 * Used for storing cache-wide configuration and state values.
 */
export interface CacheMetadataEntry {
  /**
   * Metadata key identifier.
   * Common keys: 'lastFullSync', 'schemaVersion', 'cacheInitialized'
   */
  key: string

  /**
   * Metadata value. Can be a string, number, or boolean depending on the key.
   */
  value: string | number | boolean

  /**
   * Unix timestamp (ms) when this metadata entry was last updated.
   */
  updatedAt: number
}

// ============================================================================
// IndexedDB Schema Types
// ============================================================================

/**
 * IndexedDB database schema for the Haven cache.
 * Defines the structure of object stores and their indexes.
 *
 * @remarks
 * This schema is used with IndexedDB and follows the DBSchema pattern
 * for type safety. The 'videos' store holds CachedVideo records, and
 * the 'metadata' store holds CacheMetadataEntry records.
 */
export interface CacheDBSchema {
  /**
   * Video records store.
   * Contains all cached videos with their metadata and sync state.
   */
  videos: {
    /**
     * Primary key: Video ID (Arkiv entity key / hex string).
     * Same as Video.id and CachedVideo.arkivEntityKey.
     */
    key: string

    /**
     * Value type: CachedVideo with all cache metadata.
     */
    value: CachedVideo

    /**
     * Indexes for efficient querying.
     */
    indexes: {
      /**
       * Index by owner wallet address.
       * Allows efficient lookup of all videos owned by a specific wallet.
       */
      'by-owner': string

      /**
       * Index by cache timestamp.
       * Allows sorting by when videos were first cached (LRU eviction).
       */
      'by-cached-at': number

      /**
       * Index by last sync timestamp.
       * Allows finding stale records that need re-sync.
       */
      'by-last-synced': number

      /**
       * Index by Arkiv entity status.
       * Allows filtering by active/expired/unknown status.
       */
      'by-status': string
    }
  }

  /**
   * Metadata store for cache-wide configuration and state.
   * Contains key-value pairs for cache management.
   */
  metadata: {
    /**
     * Primary key: Metadata key identifier.
     * Examples: 'lastFullSync', 'schemaVersion'
     */
    key: string

    /**
     * Value type: Metadata entry with value and timestamp.
     */
    value: CacheMetadataEntry
  }
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration options for the cache system.
 * These settings control cache behavior, limits, and sync intervals.
 *
 * @example
 * ```typescript
 * const config: CacheConfig = {
 *   dbName: 'haven-cache',
 *   dbVersion: 1,
 *   maxEntries: 5000,
 *   maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days
 *   syncIntervalMs: 5 * 60 * 1000,       // 5 minutes
 * }
 * ```
 */
export interface CacheConfig {
  /**
   * Name of the IndexedDB database.
   * Default: 'haven-cache'
   */
  dbName: string

  /**
   * Current schema version of the database.
   * Increment to trigger database upgrade/migrations.
   */
  dbVersion: number

  /**
   * Maximum number of cached videos per wallet.
   * Used for LRU eviction when cache is full.
   * Default: 5000
   */
  maxEntries: number

  /**
   * Maximum age of cached entries before forced re-sync (in milliseconds).
   * Entries older than this will be refreshed on next access.
   * Default: 30 days (30 * 24 * 60 * 60 * 1000)
   */
  maxAgeMs: number

  /**
   * Background sync interval in milliseconds.
   * How often to automatically sync with Arkiv in the background.
   * Default: 5 minutes (5 * 60 * 1000)
   */
  syncIntervalMs: number
}

/**
 * Default cache configuration values.
 */
export const DEFAULT_CACHE_CONFIG: Readonly<CacheConfig> = {
  dbName: 'haven-cache',
  dbVersion: 1,
  maxEntries: 5000,
  maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  syncIntervalMs: 5 * 60 * 1000,       // 5 minutes
} as const

// ============================================================================
// Statistics Types
// ============================================================================

/**
 * Cache statistics and health metrics.
 * Used for monitoring cache state and displaying in UI.
 */
export interface CacheStats {
  /**
   * Total number of videos in the cache.
   */
  totalVideos: number

  /**
   * Number of videos that are still active on Arkiv.
   */
  activeVideos: number

  /**
   * Number of videos that have expired (no longer on Arkiv).
   */
  expiredVideos: number

  /**
   * Estimated cache size in bytes.
   * This is an approximation based on IndexedDB storage usage.
   */
  cacheSize: number

  /**
   * Unix timestamp (ms) of the last full cache sync with Arkiv.
   * Null if a full sync has never been performed.
   */
  lastFullSync: number | null

  /**
   * Unix timestamp (ms) of the oldest entry in the cache.
   * Null if cache is empty.
   */
  oldestEntry: number | null

  /**
   * Unix timestamp (ms) of the newest entry in the cache.
   * Null if cache is empty.
   */
  newestEntry: number | null
}

// ============================================================================
// Sync Result Types
// ============================================================================

/**
 * Result of a cache synchronization operation.
 * Reports what changed during the sync with Arkiv.
 */
export interface CacheSyncResult {
  /**
   * Number of new videos added to the cache from Arkiv.
   */
  added: number

  /**
   * Number of existing videos updated with new data from Arkiv.
   */
  updated: number

  /**
   * Number of entities that were on Arkiv but are now gone (removed/deleted).
   * These are marked with arkivEntityStatus: 'expired'.
   */
  expired: number

  /**
   * Number of videos that were checked but had no changes.
   */
  unchanged: number

  /**
   * Array of error messages for any sync failures.
   * Empty array if all operations succeeded.
   */
  errors: string[]

  /**
   * Unix timestamp (ms) when this sync completed.
   */
  syncedAt: number
}

// ============================================================================
// Cache Error Types
// ============================================================================

/**
 * Error codes specific to cache operations.
 */
export type CacheErrorCode =
  | 'DB_OPEN_FAILED'        // Failed to open IndexedDB
  | 'DB_UPGRADE_FAILED'     // Database upgrade/migration failed
  | 'STORE_NOT_FOUND'       // Object store doesn't exist
  | 'RECORD_NOT_FOUND'      // Requested record not found
  | 'WRITE_FAILED'          // Failed to write to cache
  | 'READ_FAILED'           // Failed to read from cache
  | 'DELETE_FAILED'         // Failed to delete from cache
  | 'SYNC_FAILED'           // Sync with Arkiv failed
  | 'QUOTA_EXCEEDED'        // Storage quota exceeded
  | 'INVALID_DATA'          // Data validation failed
  | 'VERSION_MISMATCH'      // Schema version mismatch

/**
 * Cache-specific error with code and context.
 */
export interface CacheError extends Error {
  /**
   * Error code for programmatic handling.
   */
  code: CacheErrorCode

  /**
   * Additional context about the error.
   */
  context?: Record<string, unknown>
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Options for cache queries.
 */
export interface CacheQueryOptions {
  /**
   * Maximum number of results to return.
   */
  limit?: number

  /**
   * Number of results to skip (for pagination).
   */
  offset?: number

  /**
   * Sort order for results.
   */
  sortBy?: 'cachedAt' | 'lastAccessedAt' | 'lastSyncedAt' | 'createdAt'

  /**
   * Sort direction.
   */
  sortOrder?: 'asc' | 'desc'
}

/**
 * Result of a cache query with pagination info.
 */
export interface CacheQueryResult<T> {
  /**
   * Query results.
   */
  data: T[]

  /**
   * Total count of matching records (for pagination).
   */
  total: number

  /**
   * Whether there are more results available.
   */
  hasMore: boolean
}

// ============================================================================
// Error Recovery Types
// ============================================================================

/**
 * Cache error types for classification and recovery
 */
export type CacheErrorType =
  | 'QUOTA_EXCEEDED' // Storage full
  | 'DB_BLOCKED' // Another tab has an older version open
  | 'DB_CORRUPTED' // Data integrity check failed
  | 'STORAGE_EVICTED' // Browser evicted our data
  | 'PERMISSION_DENIED' // Private browsing or user denied storage
  | 'TRANSACTION_FAILED' // IndexedDB transaction aborted
  | 'SERIALIZATION_ERROR' // Data can't be serialized/deserialized
  | 'UNKNOWN' // Unclassified error

/**
 * Result of a recovery attempt
 */
export interface RecoveryResult {
  success: boolean
  strategy: string
  message: string
}
