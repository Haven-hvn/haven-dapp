/**
 * Transform Utilities Unit Tests
 * 
 * Tests for videoToCachedVideo, cachedVideoToVideo, computeSyncHash,
 * hasVideoChanged, and markAsExpired functions.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest'
import {
  videoToCachedVideo,
  cachedVideoToVideo,
  computeSyncHash,
  hasVideoChanged,
  markAsExpired,
  updateLastAccessed,
  updateVideoCacheStatus,
  createInitialCachedVideo,
} from '../transforms'
import type { Video } from '../../../types/video'
import type { CachedVideo } from '../../../types/cache'
import {
  createMockVideo,
  createMockCachedVideo,
  createMinimalVideo,
  createFullVideo,
  createFullCachedVideo,
  createMockSegmentMetadata,
  createMockCodecVariants,
  generateId,
} from './fixtures'

describe('videoToCachedVideo', () => {
  it('converts Date fields to Unix timestamps', async () => {
    const createdAt = new Date('2024-06-15T10:00:00Z')
    const updatedAt = new Date('2024-06-16T12:30:00Z')
    const video = createMockVideo({ createdAt, updatedAt })

    const cached = await videoToCachedVideo(video)

    expect(cached.createdAt).toBe(createdAt.getTime())
    expect(cached.updatedAt).toBe(updatedAt.getTime())
  })

  it('sets cachedAt to current time for new entries', async () => {
    const before = Date.now()
    const video = createMockVideo()

    const cached = await videoToCachedVideo(video)

    const after = Date.now()
    expect(cached.cachedAt).toBeGreaterThanOrEqual(before)
    expect(cached.cachedAt).toBeLessThanOrEqual(after)
  })

  it('preserves cachedAt from existing cache entry on update', async () => {
    const existingCachedAt = Date.now() - 10000 // 10 seconds ago
    const existing = createMockCachedVideo({ cachedAt: existingCachedAt })
    const video = createMockVideo({ id: existing.id })

    const cached = await videoToCachedVideo(video, existing)

    expect(cached.cachedAt).toBe(existingCachedAt)
  })

  it('sets arkivEntityStatus to active', async () => {
    const video = createMockVideo()

    const cached = await videoToCachedVideo(video)

    expect(cached.arkivEntityStatus).toBe('active')
  })

  it('sets isDirty to false', async () => {
    const video = createMockVideo()

    const cached = await videoToCachedVideo(video)

    expect(cached.isDirty).toBe(false)
  })

  it('handles video with all optional fields populated', async () => {
    const video = createFullVideo()

    const cached = await videoToCachedVideo(video)

    expect(cached.encryptedCid).toBe(video.encryptedCid)
    expect(cached.isEncrypted).toBe(true)
    expect(cached.litEncryptionMetadata).toEqual(video.litEncryptionMetadata)
    expect(cached.hasAiData).toBe(true)
    expect(cached.vlmJsonCid).toBe(video.vlmJsonCid)
    expect(cached.mintId).toBe(video.mintId)
    expect(cached.sourceUri).toBe(video.sourceUri)
    expect(cached.creatorHandle).toBe(video.creatorHandle)
    expect(cached.codecVariants).toEqual(video.codecVariants)
  })

  it('handles video with minimal fields (only required)', async () => {
    const video = createMinimalVideo()

    const cached = await videoToCachedVideo(video)

    expect(cached.id).toBe(video.id)
    expect(cached.owner).toBe(video.owner)
    expect(cached.title).toBe(video.title)
    expect(cached.description).toBe(video.description)
    expect(cached.duration).toBe(video.duration)
    expect(cached.filecoinCid).toBe(video.filecoinCid)
    expect(cached.isEncrypted).toBe(video.isEncrypted)
    expect(cached.hasAiData).toBe(video.hasAiData)
    expect(cached.createdAt).toBe(video.createdAt.getTime())
    // Optional fields should be undefined
    expect(cached.updatedAt).toBeUndefined()
    expect(cached.codecVariants).toBeUndefined()
    expect(cached.segmentMetadata).toBeUndefined()
  })

  it('handles video with segment metadata (nested Date conversion)', async () => {
    const startDate = new Date('2024-06-15T10:00:00Z')
    const endDate = new Date('2024-06-15T10:05:00Z')
    const video = createMockVideo({
      segmentMetadata: createMockSegmentMetadata({
        startTimestamp: startDate,
        endTimestamp: endDate,
      }),
    })

    const cached = await videoToCachedVideo(video)

    expect(cached.segmentMetadata).toBeDefined()
    expect(cached.segmentMetadata!.startTimestamp).toBe(startDate.getTime())
    expect(cached.segmentMetadata!.endTimestamp).toBe(endDate.getTime())
    expect(cached.segmentMetadata!.segmentIndex).toBe(1)
    expect(cached.segmentMetadata!.totalSegments).toBe(5)
  })

  it('handles video with codec variants array', async () => {
    const variants = createMockCodecVariants()
    const video = createMockVideo({ codecVariants: variants })

    const cached = await videoToCachedVideo(video)

    expect(cached.codecVariants).toEqual(variants)
    expect(cached.codecVariants).toHaveLength(3)
  })

  it('preserves lastAccessedAt from existing cache entry', async () => {
    const existingLastAccessed = Date.now() - 5000
    const existing = createMockCachedVideo({ lastAccessedAt: existingLastAccessed })
    const video = createMockVideo({ id: existing.id })

    const cached = await videoToCachedVideo(video, existing)

    expect(cached.lastAccessedAt).toBe(existingLastAccessed)
  })

  it('sets lastSyncedAt to current time', async () => {
    const before = Date.now()
    const video = createMockVideo()

    const cached = await videoToCachedVideo(video)

    const after = Date.now()
    expect(cached.lastSyncedAt).toBeGreaterThanOrEqual(before)
    expect(cached.lastSyncedAt).toBeLessThanOrEqual(after)
  })

  it('sets arkivEntityKey to video id', async () => {
    const video = createMockVideo()

    const cached = await videoToCachedVideo(video)

    expect(cached.arkivEntityKey).toBe(video.id)
  })

  it('sets cacheVersion to current version', async () => {
    const video = createMockVideo()

    const cached = await videoToCachedVideo(video)

    expect(cached.cacheVersion).toBe(1)
  })
})

describe('cachedVideoToVideo', () => {
  it('converts Unix timestamps back to Date objects', () => {
    const createdAtTime = new Date('2024-06-15T10:00:00Z').getTime()
    const updatedAtTime = new Date('2024-06-16T12:30:00Z').getTime()
    const cached = createMockCachedVideo({
      createdAt: createdAtTime,
      updatedAt: updatedAtTime,
    })

    const video = cachedVideoToVideo(cached)

    expect(video.createdAt).toBeInstanceOf(Date)
    expect(video.createdAt.getTime()).toBe(createdAtTime)
    expect(video.updatedAt).toBeInstanceOf(Date)
    expect(video.updatedAt!.getTime()).toBe(updatedAtTime)
  })

  it('strips all cache-specific fields', () => {
    const cached = createFullCachedVideo()

    const video = cachedVideoToVideo(cached)

    // Cache-specific fields should not exist on Video
    expect(video).not.toHaveProperty('cachedAt')
    expect(video).not.toHaveProperty('lastSyncedAt')
    expect(video).not.toHaveProperty('lastAccessedAt')
    expect(video).not.toHaveProperty('cacheVersion')
    expect(video).not.toHaveProperty('arkivEntityStatus')
    expect(video).not.toHaveProperty('arkivEntityKey')
    // Note: expiresAtBlock is NOT a cache-specific field - it's Arkiv entity data
    // that should be preserved on Video type
    expect(video).not.toHaveProperty('syncHash')
    expect(video).not.toHaveProperty('isDirty')
    expect(video).not.toHaveProperty('videoCacheStatus')
    expect(video).not.toHaveProperty('videoCachedAt')
  })

  it('result passes TypeScript Video type check', () => {
    const cached = createFullCachedVideo()

    const video = cachedVideoToVideo(cached)

    // Type check: ensure all required Video fields exist
    expect(video.id).toBeDefined()
    expect(video.owner).toBeDefined()
    expect(video.title).toBeDefined()
    expect(video.description).toBeDefined()
    expect(video.duration).toBeDefined()
    expect(video.filecoinCid).toBeDefined()
    expect(video.isEncrypted).toBeDefined()
    expect(video.hasAiData).toBeDefined()
    expect(video.createdAt).toBeDefined()

    // UI state should have default values
    expect(video.isLoading).toBe(false)
    expect(video.error).toBeUndefined()
  })

  it('handles cached video with arkivEntityStatus: expired', () => {
    const cached = createMockCachedVideo({
      arkivEntityStatus: 'expired',
    })

    const video = cachedVideoToVideo(cached)

    expect(video.id).toBe(cached.id)
    expect(video.title).toBe(cached.title)
    // The status is stripped, only Video fields remain
  })

  it('handles nested segment metadata date conversion', () => {
    const startTime = new Date('2024-06-15T10:00:00Z').getTime()
    const endTime = new Date('2024-06-15T10:05:00Z').getTime()
    const cached = createMockCachedVideo({
      segmentMetadata: {
        startTimestamp: startTime,
        endTimestamp: endTime,
        segmentIndex: 2,
        totalSegments: 10,
      },
    })

    const video = cachedVideoToVideo(cached)

    expect(video.segmentMetadata).toBeDefined()
    expect(video.segmentMetadata!.startTimestamp).toBeInstanceOf(Date)
    expect(video.segmentMetadata!.startTimestamp.getTime()).toBe(startTime)
    expect(video.segmentMetadata!.endTimestamp).toBeInstanceOf(Date)
    expect(video.segmentMetadata!.endTimestamp!.getTime()).toBe(endTime)
    expect(video.segmentMetadata!.segmentIndex).toBe(2)
    expect(video.segmentMetadata!.totalSegments).toBe(10)
  })

  it('handles undefined endTimestamp in segment metadata', () => {
    const cached = createMockCachedVideo({
      segmentMetadata: {
        startTimestamp: Date.now(),
        endTimestamp: undefined,
        segmentIndex: 1,
        totalSegments: 5,
      },
    })

    const video = cachedVideoToVideo(cached)

    expect(video.segmentMetadata).toBeDefined()
    expect(video.segmentMetadata!.endTimestamp).toBeUndefined()
  })

  it('handles undefined optional fields correctly', () => {
    const cached = createMockCachedVideo({
      encryptedCid: undefined,
      litEncryptionMetadata: undefined,
      vlmJsonCid: undefined,
      mintId: undefined,
      sourceUri: undefined,
      creatorHandle: undefined,
      updatedAt: undefined,
      codecVariants: undefined,
      segmentMetadata: undefined,
    })

    const video = cachedVideoToVideo(cached)

    expect(video.encryptedCid).toBeUndefined()
    expect(video.litEncryptionMetadata).toBeUndefined()
    expect(video.vlmJsonCid).toBeUndefined()
    expect(video.mintId).toBeUndefined()
    expect(video.sourceUri).toBeUndefined()
    expect(video.creatorHandle).toBeUndefined()
    expect(video.updatedAt).toBeUndefined()
    expect(video.codecVariants).toBeUndefined()
    expect(video.segmentMetadata).toBeUndefined()
  })
})

describe('Round-trip Tests', () => {
  it('Video -> CachedVideo -> Video produces equivalent data', async () => {
    const original = createFullVideo()

    const cached = await videoToCachedVideo(original)
    const restored = cachedVideoToVideo(cached)

    expect(restored.id).toBe(original.id)
    expect(restored.owner).toBe(original.owner)
    expect(restored.title).toBe(original.title)
    expect(restored.description).toBe(original.description)
    expect(restored.duration).toBe(original.duration)
    expect(restored.filecoinCid).toBe(original.filecoinCid)
    expect(restored.encryptedCid).toBe(original.encryptedCid)
    expect(restored.isEncrypted).toBe(original.isEncrypted)
    expect(restored.hasAiData).toBe(original.hasAiData)
    expect(restored.vlmJsonCid).toBe(original.vlmJsonCid)
    expect(restored.mintId).toBe(original.mintId)
    expect(restored.sourceUri).toBe(original.sourceUri)
    expect(restored.creatorHandle).toBe(original.creatorHandle)
    expect(restored.createdAt.getTime()).toBe(original.createdAt.getTime())
    expect(restored.updatedAt?.getTime()).toBe(original.updatedAt?.getTime())
    expect(restored.codecVariants).toEqual(original.codecVariants)
  })

  it('round-trip preserves all optional fields when present', async () => {
    const original = createFullVideo()

    const cached = await videoToCachedVideo(original)
    const restored = cachedVideoToVideo(cached)

    expect(restored.litEncryptionMetadata).toEqual(original.litEncryptionMetadata)
    expect(restored.segmentMetadata?.startTimestamp.getTime()).toBe(
      original.segmentMetadata?.startTimestamp.getTime()
    )
    expect(restored.segmentMetadata?.endTimestamp?.getTime()).toBe(
      original.segmentMetadata?.endTimestamp?.getTime()
    )
    expect(restored.segmentMetadata?.segmentIndex).toBe(original.segmentMetadata?.segmentIndex)
    expect(restored.segmentMetadata?.totalSegments).toBe(original.segmentMetadata?.totalSegments)
  })

  it('round-trip handles undefined optional fields correctly', async () => {
    const original = createMinimalVideo()

    const cached = await videoToCachedVideo(original)
    const restored = cachedVideoToVideo(cached)

    expect(restored.encryptedCid).toBeUndefined()
    expect(restored.litEncryptionMetadata).toBeUndefined()
    expect(restored.vlmJsonCid).toBeUndefined()
    expect(restored.mintId).toBeUndefined()
    expect(restored.sourceUri).toBeUndefined()
    expect(restored.creatorHandle).toBeUndefined()
    expect(restored.updatedAt).toBeUndefined()
    expect(restored.codecVariants).toBeUndefined()
    expect(restored.segmentMetadata).toBeUndefined()
  })
})

describe('computeSyncHash', () => {
  it('same video produces same hash (deterministic)', async () => {
    const video = createMockVideo()

    const hash1 = await computeSyncHash(video)
    const hash2 = await computeSyncHash(video)

    expect(hash1).toBe(hash2)
  })

  it('different title produces different hash', async () => {
    const video1 = createMockVideo({ title: 'Video One' })
    const video2 = createMockVideo({ title: 'Video Two', id: video1.id, owner: video1.owner })

    const hash1 = await computeSyncHash(video1)
    const hash2 = await computeSyncHash(video2)

    expect(hash1).not.toBe(hash2)
  })

  it('different CID produces different hash', async () => {
    const video1 = createMockVideo({ filecoinCid: 'cid1' })
    const video2 = createMockVideo({ filecoinCid: 'cid2', id: video1.id, owner: video1.owner })

    const hash1 = await computeSyncHash(video1)
    const hash2 = await computeSyncHash(video2)

    expect(hash1).not.toBe(hash2)
  })

  it('ignores isLoading field changes', async () => {
    const baseVideo = createMockVideo()
    const video1 = { ...baseVideo, isLoading: true }
    const video2 = { ...baseVideo, isLoading: false }

    const hash1 = await computeSyncHash(video1)
    const hash2 = await computeSyncHash(video2)

    expect(hash1).toBe(hash2)
  })

  it('ignores error field changes', async () => {
    const baseVideo = createMockVideo()
    const video1 = { ...baseVideo, error: 'Some error' }
    const video2 = { ...baseVideo, error: undefined }
    const video3 = { ...baseVideo, error: 'Different error' }

    const hash1 = await computeSyncHash(video1)
    const hash2 = await computeSyncHash(video2)
    const hash3 = await computeSyncHash(video3)

    expect(hash1).toBe(hash2)
    expect(hash2).toBe(hash3)
  })

  it('handles undefined optional fields consistently', async () => {
    const minimal = createMinimalVideo()
    const withOptionals = createMockVideo({
      id: minimal.id,
      owner: minimal.owner,
      title: minimal.title,
      description: minimal.description,
      duration: minimal.duration,
      filecoinCid: minimal.filecoinCid,
      isEncrypted: minimal.isEncrypted,
      hasAiData: minimal.hasAiData,
      createdAt: minimal.createdAt,
      // All optional fields are explicitly undefined
      encryptedCid: undefined,
      litEncryptionMetadata: undefined,
      vlmJsonCid: undefined,
      mintId: undefined,
      sourceUri: undefined,
      creatorHandle: undefined,
      updatedAt: undefined,
      codecVariants: undefined,
      segmentMetadata: undefined,
    })

    const hash1 = await computeSyncHash(minimal)
    const hash2 = await computeSyncHash(withOptionals)

    expect(hash1).toBe(hash2)
  })

  it('produces 64-character hex hash', async () => {
    const video = createMockVideo()

    const hash = await computeSyncHash(video)

    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('hasVideoChanged', () => {
  it('returns false for identical video and cache', async () => {
    const video = createMockVideo()
    const cached = await videoToCachedVideo(video)

    const changed = await hasVideoChanged(video, cached)

    expect(changed).toBe(false)
  })

  it('returns true when title changes', async () => {
    const video = createMockVideo()
    const cached = await videoToCachedVideo(video)
    const modifiedVideo = { ...video, title: 'Modified Title' }

    const changed = await hasVideoChanged(modifiedVideo, cached)

    expect(changed).toBe(true)
  })

  it('returns true when CID changes', async () => {
    const video = createMockVideo()
    const cached = await videoToCachedVideo(video)
    const modifiedVideo = { ...video, filecoinCid: 'different-cid' }

    const changed = await hasVideoChanged(modifiedVideo, cached)

    expect(changed).toBe(true)
  })

  it('returns true when encryption status changes', async () => {
    const video = createMockVideo({ isEncrypted: false })
    const cached = await videoToCachedVideo(video)
    const modifiedVideo = { ...video, isEncrypted: true }

    const changed = await hasVideoChanged(modifiedVideo, cached)

    expect(changed).toBe(true)
  })

  it('returns false when only isLoading changes', async () => {
    const video = createMockVideo({ isLoading: false })
    const cached = await videoToCachedVideo(video)
    const modifiedVideo = { ...video, isLoading: true }

    const changed = await hasVideoChanged(modifiedVideo, cached)

    expect(changed).toBe(false)
  })

  it('returns false when only error changes', async () => {
    const video = createMockVideo({ error: undefined })
    const cached = await videoToCachedVideo(video)
    const modifiedVideo = { ...video, error: 'Some error' }

    const changed = await hasVideoChanged(modifiedVideo, cached)

    expect(changed).toBe(false)
  })
})

describe('markAsExpired', () => {
  it('sets arkivEntityStatus to expired', () => {
    const cached = createMockCachedVideo({ arkivEntityStatus: 'active' })

    const expired = markAsExpired(cached)

    expect(expired.arkivEntityStatus).toBe('expired')
  })

  it('updates lastSyncedAt', () => {
    const originalLastSynced = Date.now() - 10000
    const cached = createMockCachedVideo({ lastSyncedAt: originalLastSynced })

    const before = Date.now()
    const expired = markAsExpired(cached)
    const after = Date.now()

    expect(expired.lastSyncedAt).toBeGreaterThanOrEqual(before)
    expect(expired.lastSyncedAt).toBeLessThanOrEqual(after)
    expect(expired.lastSyncedAt).not.toBe(originalLastSynced)
  })

  it('preserves all other fields', () => {
    const cached = createFullCachedVideo()

    const expired = markAsExpired(cached)

    expect(expired.id).toBe(cached.id)
    expect(expired.owner).toBe(cached.owner)
    expect(expired.title).toBe(cached.title)
    expect(expired.description).toBe(cached.description)
    expect(expired.duration).toBe(cached.duration)
    expect(expired.filecoinCid).toBe(cached.filecoinCid)
    expect(expired.encryptedCid).toBe(cached.encryptedCid)
    expect(expired.isEncrypted).toBe(cached.isEncrypted)
    expect(expired.hasAiData).toBe(cached.hasAiData)
    expect(expired.createdAt).toBe(cached.createdAt)
    expect(expired.cachedAt).toBe(cached.cachedAt)
    expect(expired.lastAccessedAt).toBe(cached.lastAccessedAt)
    expect(expired.cacheVersion).toBe(cached.cacheVersion)
    expect(expired.arkivEntityKey).toBe(cached.arkivEntityKey)
    expect(expired.syncHash).toBe(cached.syncHash)
    expect(expired.isDirty).toBe(cached.isDirty)
  })
})

describe('updateLastAccessed', () => {
  it('updates lastAccessedAt to current time', () => {
    const cached = createMockCachedVideo({ lastAccessedAt: Date.now() - 5000 })

    const before = Date.now()
    const updated = updateLastAccessed(cached)
    const after = Date.now()

    expect(updated.lastAccessedAt).toBeGreaterThanOrEqual(before)
    expect(updated.lastAccessedAt).toBeLessThanOrEqual(after)
  })

  it('preserves all other fields', () => {
    const cached = createFullCachedVideo()

    const updated = updateLastAccessed(cached)

    expect(updated.id).toBe(cached.id)
    expect(updated.title).toBe(cached.title)
    expect(updated.cachedAt).toBe(cached.cachedAt)
  })
})

describe('updateVideoCacheStatus', () => {
  it('updates videoCacheStatus', () => {
    const cached = createMockCachedVideo({ videoCacheStatus: 'not-cached' })

    const updated = updateVideoCacheStatus(cached, 'cached')

    expect(updated.videoCacheStatus).toBe('cached')
  })

  it('sets videoCachedAt when status is cached', () => {
    const cached = createMockCachedVideo({
      videoCacheStatus: 'not-cached',
      videoCachedAt: undefined,
    })

    const before = Date.now()
    const updated = updateVideoCacheStatus(cached, 'cached')
    const after = Date.now()

    expect(updated.videoCachedAt).toBeGreaterThanOrEqual(before)
    expect(updated.videoCachedAt).toBeLessThanOrEqual(after)
  })

  it('clears videoCachedAt when status is not-cached', () => {
    const cached = createMockCachedVideo({
      videoCacheStatus: 'cached',
      videoCachedAt: Date.now(),
    })

    const updated = updateVideoCacheStatus(cached, 'not-cached')

    expect(updated.videoCachedAt).toBeUndefined()
  })

  it('clears videoCachedAt when status is stale', () => {
    const cached = createMockCachedVideo({
      videoCacheStatus: 'cached',
      videoCachedAt: Date.now(),
    })

    const updated = updateVideoCacheStatus(cached, 'stale')

    expect(updated.videoCachedAt).toBeUndefined()
  })
})

describe('createInitialCachedVideo', () => {
  it('creates a new CachedVideo without existing cache entry', async () => {
    const video = createMockVideo()

    const cached = await createInitialCachedVideo(video)

    expect(cached.id).toBe(video.id)
    expect(cached.arkivEntityStatus).toBe('active')
    expect(cached.isDirty).toBe(false)
  })
})

// Fix typo in test
describe('videoToCachedVideo - typo fix', () => {
  it('correctly assigns isEncrypted', async () => {
    const video = createMockVideo({ isEncrypted: true })
    const cached = await videoToCachedVideo(video)
    expect(cached.isEncrypted).toBe(true)
  })
})
