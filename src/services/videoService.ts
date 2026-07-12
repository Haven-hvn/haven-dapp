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
import { compareVideosByRecency } from '../lib/arkiv-recency'
import { parseArkivEntityToVideo } from '../lib/parse-arkiv-video'
import {
  createArkivClient,
  getAllEntitiesByOwner as arkivGetAllEntitiesByOwner,
  queryEntitiesByOwner as arkivQueryEntitiesByOwner,
  getEntity as arkivGetEntity,
} from '../lib/arkiv'

// ── Arkiv Client Singleton ──────────────────────────────────────────

let _client: ReturnType<typeof createArkivClient> | null = null

function getClient() {
  if (!_client) {
    _client = createArkivClient()
  }
  return _client
}

// ── Video Service Functions ────────────────────────────────────────

/**
 * Return up to `limit` videos sorted by `createdAtBlock` descending (then `createdAt`).
 */
export function pickMostRecentVideos(videos: Video[], limit?: number): Video[] {
  const sorted = [...videos].sort(compareVideosByRecency)
  return limit === undefined ? sorted : sorted.slice(0, limit)
}

/**
 * Fetch all videos for the library (Arkiv + cached expired entries).
 */
export async function fetchLibraryVideos(ownerAddress: string): Promise<Video[]> {
  return fetchAllVideos(ownerAddress)
}

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
    const arkivVideos = entities.map(entity => parseArkivEntityToVideo(entity))

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
    const arkivVideos = entities.map(entity => parseArkivEntityToVideo(entity))

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
      const video = parseArkivEntityToVideo(entity)

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
      const video = parseArkivEntityToVideo(entity)

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