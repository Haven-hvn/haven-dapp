/**
 * Video ↔ CachedVideo Transform Utilities
 * 
 * Provides conversion between the application Video type (with Date objects)
 * and the CachedVideo type (with Unix timestamps) used for IndexedDB storage.
 * 
 * Also includes sync hash computation for efficient change detection.
 */

import type { Video, SegmentMetadata } from '../../types/video'
import type { CachedVideo } from '../../types/cache'
import { CURRENT_CACHE_VERSION } from '../../types/cache'

/**
 * Convert a Video (from Arkiv) into a CachedVideo (for IndexedDB).
 * 
 * Key behaviors:
 * - Preserves cachedAt from existing cache entry if updating
 * - Always updates lastSyncedAt to current time
 * - Sets arkivEntityStatus to 'active' since we just fetched it from Arkiv
 * - Computes fresh syncHash
 * 
 * @param video - The Video object from Arkiv
 * @param existingCache - Optional existing cache entry to preserve timestamps
 * @returns CachedVideo ready for IndexedDB storage
 */
export async function videoToCachedVideo(
  video: Video,
  existingCache?: CachedVideo
): Promise<CachedVideo> {
  const now = Date.now()

  // Convert segment metadata dates if present
  const segmentMetadata = video.segmentMetadata
    ? convertSegmentMetadataToCached(video.segmentMetadata)
    : undefined

  return {
    // Spread all Video fields (except Date objects and UI state)
    id: video.id,
    owner: video.owner,
    title: video.title,
    description: video.description,
    duration: video.duration,
    filecoinCid: video.filecoinCid,
    encryptedCid: video.encryptedCid,
    isEncrypted: video.isEncrypted,
    litEncryptionMetadata: video.litEncryptionMetadata,
    hasAiData: video.hasAiData,
    vlmJsonCid: video.vlmJsonCid,
    mintId: video.mintId,
    sourceUri: video.sourceUri,
    creatorHandle: video.creatorHandle,

    // Convert Date objects to timestamps for IndexedDB
    createdAt: typeof video.createdAt === 'number' ? video.createdAt : video.createdAt.getTime(),
    updatedAt: typeof video.updatedAt === 'number' 
      ? video.updatedAt 
      : video.updatedAt?.getTime(),

    // Array/object fields (already serializable)
    codecVariants: video.codecVariants,
    segmentMetadata,

    // Cache metadata
    cachedAt: existingCache?.cachedAt ?? now,
    lastSyncedAt: now,
    lastAccessedAt: existingCache?.lastAccessedAt ?? now,
    cacheVersion: CURRENT_CACHE_VERSION,

    // Arkiv status
    arkivEntityStatus: 'active',
    arkivEntityKey: video.id,
    expiresAtBlock: video.expiresAtBlock,

    // Sync metadata
    syncHash: await computeSyncHash(video),
    isDirty: false,

    // Video Content Cache integration (default to not-cached)
    videoCacheStatus: 'not-cached',
    videoCachedAt: undefined,

    // Preserve decrypted CID from existing cache entry
    decryptedCid: existingCache?.decryptedCid ?? video.decryptedCid,
  }
}

/**
 * Convert a CachedVideo (from IndexedDB) back to a Video (for UI).
 * 
 * Key behaviors:
 * - Strips all cache-specific fields
 * - Converts timestamps back to Date objects
 * - Returns a clean Video type for existing UI components
 * 
 * @param cached - The CachedVideo from IndexedDB
 * @returns Video object for UI consumption
 */
export function cachedVideoToVideo(cached: CachedVideo): Video {
  // Convert segment metadata timestamps back to Dates
  const segmentMetadata = cached.segmentMetadata
    ? convertSegmentMetadataFromCached(cached.segmentMetadata)
    : undefined

  return {
    // Core Video fields (exclude cache metadata)
    id: cached.id,
    owner: cached.owner,
    title: cached.title,
    description: cached.description,
    duration: cached.duration,
    filecoinCid: cached.filecoinCid,
    encryptedCid: cached.encryptedCid,
    isEncrypted: cached.isEncrypted,
    litEncryptionMetadata: cached.litEncryptionMetadata as Video['litEncryptionMetadata'],
    hasAiData: cached.hasAiData,
    vlmJsonCid: cached.vlmJsonCid,
    mintId: cached.mintId,
    sourceUri: cached.sourceUri,
    creatorHandle: cached.creatorHandle,

    // Convert timestamps back to Date objects
    createdAt: new Date(cached.createdAt),
    updatedAt: cached.updatedAt ? new Date(cached.updatedAt) : undefined,

    // Array/object fields
    codecVariants: cached.codecVariants,
    segmentMetadata,

    // UI state defaults (not persisted)
    isLoading: false,
    error: undefined,

    // Cache status from cached data
    arkivStatus: cached.arkivEntityStatus,

    // Expiration tracking
    expiresAtBlock: cached.expiresAtBlock,

    // Decrypted CID (from cache)
    decryptedCid: cached.decryptedCid,
  }
}

/**
 * Generate a deterministic hash of video data for change detection.
 * 
 * Excludes UI-only fields (isLoading, error) and volatile fields to ensure
 * the hash represents the actual content, not transient state.
 * 
 * Uses Web Crypto API (SHA-256) for hashing.
 * 
 * @param video - The Video object to hash
 * @returns Hex string of the SHA-256 hash
 */
export async function computeSyncHash(video: Video): Promise<string> {
  // Create a deterministic string from the video's content fields
  // Exclude UI-only fields and volatile fields
  const hashInput = JSON.stringify({
    id: video.id,
    owner: video.owner,
    title: video.title,
    description: video.description,
    duration: video.duration,
    filecoinCid: video.filecoinCid,
    encryptedCid: video.encryptedCid,
    isEncrypted: video.isEncrypted,
    hasAiData: video.hasAiData,
    vlmJsonCid: video.vlmJsonCid,
    mintId: video.mintId,
    sourceUri: video.sourceUri,
    creatorHandle: video.creatorHandle,
    codecVariants: video.codecVariants,
    // Include segment metadata if present
    segmentMetadata: video.segmentMetadata
      ? {
          startTimestamp: typeof video.segmentMetadata.startTimestamp === 'number'
            ? video.segmentMetadata.startTimestamp
            : video.segmentMetadata.startTimestamp.getTime(),
          endTimestamp: video.segmentMetadata.endTimestamp
            ? (typeof video.segmentMetadata.endTimestamp === 'number'
              ? video.segmentMetadata.endTimestamp
              : video.segmentMetadata.endTimestamp.getTime())
            : undefined,
          segmentIndex: video.segmentMetadata.segmentIndex,
          totalSegments: video.segmentMetadata.totalSegments,
        }
      : undefined,
    // Include encryption metadata if present
    litEncryptionMetadata: video.litEncryptionMetadata,
    // Include expiration block for change detection
    expiresAtBlock: video.expiresAtBlock,
  })

  // Use Web Crypto API for hashing (available in all modern browsers)
  const encoder = new TextEncoder()
  const data = encoder.encode(hashInput)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Quick check if a video needs updating in cache.
 * 
 * Compares the computed hash of the current video against the stored syncHash.
 * 
 * @param video - The current Video object from Arkiv
 * @param cached - The existing CachedVideo from IndexedDB
 * @returns true if the video has changed since last sync
 */
export async function hasVideoChanged(
  video: Video,
  cached: CachedVideo
): Promise<boolean> {
  const newHash = await computeSyncHash(video)
  return newHash !== cached.syncHash
}

/**
 * Mark a cached video as expired (entity no longer on Arkiv).
 * 
 * Preserves all data while updating the status for UI indication.
 * 
 * @param cached - The CachedVideo to mark as expired
 * @returns Updated CachedVideo with expired status
 */
export function markAsExpired(cached: CachedVideo): CachedVideo {
  return {
    ...cached,
    arkivEntityStatus: 'expired',
    lastSyncedAt: Date.now(),
  }
}

/**
 * Update the access timestamp for LRU eviction tracking.
 * 
 * Should be called whenever a video is accessed from cache.
 * 
 * @param cached - The CachedVideo to update
 * @returns Updated CachedVideo with new lastAccessedAt
 */
export function updateLastAccessed(cached: CachedVideo): CachedVideo {
  return {
    ...cached,
    lastAccessedAt: Date.now(),
  }
}

/**
 * Convert SegmentMetadata dates to cached format (timestamps).
 * 
 * @param metadata - SegmentMetadata with Date objects
 * @returns SegmentMetadata with timestamps
 */
function convertSegmentMetadataToCached(
  metadata: SegmentMetadata
): CachedVideo['segmentMetadata'] {
  return {
    startTimestamp: typeof metadata.startTimestamp === 'number'
      ? metadata.startTimestamp
      : metadata.startTimestamp.getTime(),
    endTimestamp: typeof metadata.endTimestamp === 'number'
      ? metadata.endTimestamp
      : metadata.endTimestamp?.getTime(),
    segmentIndex: metadata.segmentIndex,
    totalSegments: metadata.totalSegments,
    mintId: metadata.mintId,
    recordingSessionId: metadata.recordingSessionId,
  }
}

/**
 * Convert cached segment metadata timestamps back to Dates.
 * 
 * @param metadata - SegmentMetadata with timestamps
 * @returns SegmentMetadata with Date objects
 */
function convertSegmentMetadataFromCached(
  metadata: NonNullable<CachedVideo['segmentMetadata']>
): SegmentMetadata {
  return {
    startTimestamp: new Date(metadata.startTimestamp),
    endTimestamp: metadata.endTimestamp ? new Date(metadata.endTimestamp) : undefined,
    segmentIndex: metadata.segmentIndex,
    totalSegments: metadata.totalSegments,
    mintId: metadata.mintId,
    recordingSessionId: metadata.recordingSessionId,
  }
}

/**
 * Update the video content cache status.
 * 
 * This is called by the video-cache system after successfully caching
 * decrypted video bytes in the Cache API.
 * 
 * @param cached - The CachedVideo to update
 * @param status - The new video cache status
 * @returns Updated CachedVideo with new video cache status
 */
export function updateVideoCacheStatus(
  cached: CachedVideo,
  status: CachedVideo['videoCacheStatus']
): CachedVideo {
  return {
    ...cached,
    videoCacheStatus: status,
    videoCachedAt: status === 'cached' ? Date.now() : undefined,
  }
}

/**
 * Create an initial CachedVideo from a Video without an existing cache entry.
 * 
 * This is a convenience wrapper around videoToCachedVideo for new entries.
 * 
 * @param video - The Video object from Arkiv
 * @returns CachedVideo ready for IndexedDB storage
 */
export function createInitialCachedVideo(video: Video): Promise<CachedVideo> {
  return videoToCachedVideo(video, undefined)
}

/**
 * Ensure a cached video is at the latest schema version.
 * 
 * This enables lazy migration — records that haven't been fully migrated
 * can be detected and migrated on read. This is useful for:
 * 1. Handling partial migration failures
 * 2. Avoiding long migration times on app startup
 * 3. Gracefully handling records added during migration
 * 
 * @param video - The CachedVideo from IndexedDB
 * @returns A CachedVideo guaranteed to be at the current schema version
 * 
 * @example
 * const video = await getCachedVideo(wallet, videoId)
 * const upToDateVideo = ensureLatestVersion(video!)
 * // Now safe to use all current fields
 */
export function ensureLatestVersion(video: CachedVideo): CachedVideo {
  if (video.cacheVersion === CURRENT_CACHE_VERSION) {
    return video
  }

  let migrated = { ...video }

  // Apply migrations in sequence
  // Add version checks as needed for future migrations:
  //
  // if (migrated.cacheVersion < 2) {
  //   migrated = migrateVideoV1toV2(migrated)
  // }
  //
  // if (migrated.cacheVersion < 3) {
  //   migrated = migrateVideoV2toV3(migrated)
  // }

  // Update to current version after all migrations
  migrated.cacheVersion = CURRENT_CACHE_VERSION

  return migrated
}

/**
 * Migration function: v1 to v2
 * 
 * Example for future use. When adding a new field in v2:
 * 1. Add the field type to CachedVideo in types/cache.ts
 * 2. Implement this function
 * 3. Add the migration to migrations.ts
 * 4. Call this from ensureLatestVersion
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function migrateVideoV1toV2(video: CachedVideo): CachedVideo {
  return {
    ...video,
    // Add new fields with default values
    // tags: [],
    cacheVersion: 2,
  }
}
