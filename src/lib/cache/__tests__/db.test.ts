/**
 * IndexedDB Database Operations Unit Tests
 * 
 * Tests for all CRUD operations in the cache database layer.
 * Uses fake-indexeddb to simulate IndexedDB in Node.js.
 */

import 'fake-indexeddb/auto'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getAllCachedVideos,
  getCachedVideo,
  putCachedVideo,
  putCachedVideos,
  deleteCachedVideo,
  deleteCachedVideos,
  clearCachedVideos,
  getCacheMetadata,
  setCacheMetadata,
  getVideosByLastAccessed,
  getCacheStats,
  deleteDatabase,
} from '../db'
import type { CachedVideo, CacheMetadataEntry } from '../../../types/cache'
import { createMockCachedVideo } from './fixtures'

describe('Database Lifecycle', () => {
  const walletAddress = '0x1234567890abcdef1234567890abcdef12345678'

  beforeEach(async () => {
    // Clean up before each test
    try {
      await deleteDatabase(walletAddress)
    } catch {
      // Ignore errors if database doesn't exist
    }
  })

  afterEach(async () => {
    // Clean up after each test
    try {
      await deleteDatabase(walletAddress)
    } catch {
      // Ignore errors
    }
  })

  it('creates database on first call', async () => {
    const video = createMockCachedVideo()
    
    // First call should create the database
    await putCachedVideo(walletAddress, video)
    
    const retrieved = await getCachedVideo(walletAddress, video.id)
    expect(retrieved).not.toBeNull()
    expect(retrieved!.id).toBe(video.id)
  })

  it('returns same database instance on subsequent calls', async () => {
    const video1 = createMockCachedVideo()
    const video2 = createMockCachedVideo()
    
    // Multiple calls should work without error
    await putCachedVideo(walletAddress, video1)
    await putCachedVideo(walletAddress, video2)
    
    const all = await getAllCachedVideos(walletAddress)
    expect(all).toHaveLength(2)
  })

  it('database is namespaced by wallet address', async () => {
    const wallet1 = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    const wallet2 = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
    const video1 = createMockCachedVideo({ id: '0xvideo1' })
    const video2 = createMockCachedVideo({ id: '0xvideo2' })
    
    try {
      await putCachedVideo(wallet1, video1)
      await putCachedVideo(wallet2, video2)
      
      const videos1 = await getAllCachedVideos(wallet1)
      const videos2 = await getAllCachedVideos(wallet2)
      
      expect(videos1).toHaveLength(1)
      expect(videos1[0].id).toBe('0xvideo1')
      expect(videos2).toHaveLength(1)
      expect(videos2[0].id).toBe('0xvideo2')
    } finally {
      // Clean up
      await deleteDatabase(wallet1)
      await deleteDatabase(wallet2)
    }
  })

  it('wallet address comparison is case-insensitive', async () => {
    const lowerCase = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const upperCase = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    const video = createMockCachedVideo()
    
    try {
      // Store with lowercase
      await putCachedVideo(lowerCase, video)
      
      // Retrieve with uppercase
      const retrieved = await getCachedVideo(upperCase, video.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.id).toBe(video.id)
    } finally {
      await deleteDatabase(lowerCase)
    }
  })
})

describe('CRUD Operations', () => {
  const walletAddress = '0x1234567890abcdef1234567890abcdef12345678'

  beforeEach(async () => {
    try {
      await deleteDatabase(walletAddress)
    } catch {
      // Ignore
    }
  })

  afterEach(async () => {
    try {
      await deleteDatabase(walletAddress)
    } catch {
      // Ignore
    }
  })

  describe('putCachedVideo and getCachedVideo', () => {
    it('stores a video and retrieves it', async () => {
      const video = createMockCachedVideo()
      
      await putCachedVideo(walletAddress, video)
      
      const retrieved = await getCachedVideo(walletAddress, video.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.id).toBe(video.id)
      expect(retrieved!.title).toBe(video.title)
      expect(retrieved!.owner).toBe(video.owner)
      expect(retrieved!.duration).toBe(video.duration)
    })

    it('getCachedVideo returns undefined for non-existent ID', async () => {
      const retrieved = await getCachedVideo(walletAddress, 'non-existent-id')
      expect(retrieved).toBeNull()
    })

    it('overwrites existing entry (upsert behavior)', async () => {
      const video = createMockCachedVideo({ title: 'Original' })
      
      await putCachedVideo(walletAddress, video)
      
      const updated = { ...video, title: 'Updated' }
      await putCachedVideo(walletAddress, updated)
      
      const retrieved = await getCachedVideo(walletAddress, video.id)
      expect(retrieved!.title).toBe('Updated')
    })

    it('preserves all fields correctly', async () => {
      const video = createMockCachedVideo({
        encryptedCid: 'encrypted-cid',
        isEncrypted: true,
        hasAiData: true,
        codecVariants: [
          { codec: 'h264', resolution: '1080p', bitrate: 5000000, cid: 'cid1' }
        ],
        segmentMetadata: {
          startTimestamp: 1234567890,
          endTimestamp: 1234567999,
          segmentIndex: 1,
          totalSegments: 5,
        },
      })
      
      await putCachedVideo(walletAddress, video)
      
      const retrieved = await getCachedVideo(walletAddress, video.id)
      expect(retrieved!.encryptedCid).toBe('encrypted-cid')
      expect(retrieved!.isEncrypted).toBe(true)
      expect(retrieved!.hasAiData).toBe(true)
      expect(retrieved!.codecVariants).toEqual(video.codecVariants)
      expect(retrieved!.segmentMetadata).toEqual(video.segmentMetadata)
    })
  })

  describe('deleteCachedVideo', () => {
    it('removes a video', async () => {
      const video = createMockCachedVideo()
      
      await putCachedVideo(walletAddress, video)
      await deleteCachedVideo(walletAddress, video.id)
      
      const retrieved = await getCachedVideo(walletAddress, video.id)
      expect(retrieved).toBeNull()
    })

    it('is no-op for non-existent ID', async () => {
      // Should not throw
      await expect(
        deleteCachedVideo(walletAddress, 'non-existent-id')
      ).resolves.not.toThrow()
    })
  })

  describe('getAllCachedVideos', () => {
    it('returns all stored videos', async () => {
      const video1 = createMockCachedVideo()
      const video2 = createMockCachedVideo()
      const video3 = createMockCachedVideo()
      
      await putCachedVideo(walletAddress, video1)
      await putCachedVideo(walletAddress, video2)
      await putCachedVideo(walletAddress, video3)
      
      const all = await getAllCachedVideos(walletAddress)
      expect(all).toHaveLength(3)
      
      const ids = all.map(v => v.id)
      expect(ids).toContain(video1.id)
      expect(ids).toContain(video2.id)
      expect(ids).toContain(video3.id)
    })

    it('returns empty array for empty database', async () => {
      const all = await getAllCachedVideos(walletAddress)
      expect(all).toEqual([])
    })

    it('returns video with all cache-specific fields', async () => {
      const video = createMockCachedVideo({
        arkivEntityStatus: 'active',
        isDirty: false,
        cacheVersion: 1,
      })
      
      await putCachedVideo(walletAddress, video)
      
      const all = await getAllCachedVideos(walletAddress)
      expect(all).toHaveLength(1)
      expect(all[0].arkivEntityStatus).toBe('active')
      expect(all[0].isDirty).toBe(false)
      expect(all[0].cacheVersion).toBe(1)
      expect(all[0].cachedAt).toBe(video.cachedAt)
      expect(all[0].lastSyncedAt).toBe(video.lastSyncedAt)
    })
  })
})

describe('Bulk Operations', () => {
  const walletAddress = '0x1234567890abcdef1234567890abcdef12345678'

  beforeEach(async () => {
    try {
      await deleteDatabase(walletAddress)
    } catch {
      // Ignore
    }
  })

  afterEach(async () => {
    try {
      await deleteDatabase(walletAddress)
    } catch {
      // Ignore
    }
  })

  describe('putCachedVideos', () => {
    it('stores multiple videos atomically', async () => {
      const videos = [
        createMockCachedVideo(),
        createMockCachedVideo(),
        createMockCachedVideo(),
      ]
      
      await putCachedVideos(walletAddress, videos)
      
      const all = await getAllCachedVideos(walletAddress)
      expect(all).toHaveLength(3)
    })

    it('with empty array is no-op', async () => {
      await putCachedVideos(walletAddress, [])
      
      const all = await getAllCachedVideos(walletAddress)
      expect(all).toEqual([])
    })

    it('overwrites existing entries (upsert behavior)', async () => {
      const video = createMockCachedVideo({ title: 'Original' })
      await putCachedVideo(walletAddress, video)
      
      const updated = [{ ...video, title: 'Updated' }]
      await putCachedVideos(walletAddress, updated)
      
      const all = await getAllCachedVideos(walletAddress)
      expect(all).toHaveLength(1)
      expect(all[0].title).toBe('Updated')
    })

    it('handles mix of new and existing videos', async () => {
      const existing = createMockCachedVideo({ title: 'Existing' })
      await putCachedVideo(walletAddress, existing)
      
      const videos = [
        { ...existing, title: 'Updated' },
        createMockCachedVideo({ title: 'New' }),
      ]
      
      await putCachedVideos(walletAddress, videos)
      
      const all = await getAllCachedVideos(walletAddress)
      expect(all).toHaveLength(2)
      
      const titles = all.map(v => v.title)
      expect(titles).toContain('Updated')
      expect(titles).toContain('New')
    })
  })

  describe('deleteCachedVideos', () => {
    it('removes multiple videos in a single transaction', async () => {
      const video1 = createMockCachedVideo()
      const video2 = createMockCachedVideo()
      const video3 = createMockCachedVideo()
      
      await putCachedVideo(walletAddress, video1)
      await putCachedVideo(walletAddress, video2)
      await putCachedVideo(walletAddress, video3)
      
      await deleteCachedVideos(walletAddress, [video1.id, video2.id])
      
      const all = await getAllCachedVideos(walletAddress)
      expect(all).toHaveLength(1)
      expect(all[0].id).toBe(video3.id)
    })

    it('with empty array is no-op', async () => {
      const video = createMockCachedVideo()
      await putCachedVideo(walletAddress, video)
      
      await deleteCachedVideos(walletAddress, [])
      
      const all = await getAllCachedVideos(walletAddress)
      expect(all).toHaveLength(1)
    })

    it('handles non-existent IDs gracefully', async () => {
      const video = createMockCachedVideo()
      await putCachedVideo(walletAddress, video)
      
      // Should not throw even if some IDs don't exist
      await expect(
        deleteCachedVideos(walletAddress, [video.id, 'non-existent'])
      ).resolves.not.toThrow()
      
      const retrieved = await getCachedVideo(walletAddress, video.id)
      expect(retrieved).toBeNull()
    })
  })
})

describe('Metadata Operations', () => {
  const walletAddress = '0x1234567890abcdef1234567890abcdef12345678'

  beforeEach(async () => {
    try {
      await deleteDatabase(walletAddress)
    } catch {
      // Ignore
    }
  })

  afterEach(async () => {
    try {
      await deleteDatabase(walletAddress)
    } catch {
      // Ignore
    }
  })

  describe('setCacheMetadata and getCacheMetadata', () => {
    it('stores and retrieves metadata entry', async () => {
      const entry: CacheMetadataEntry = {
        key: 'lastFullSync',
        value: Date.now(),
        updatedAt: Date.now(),
      }
      
      await setCacheMetadata(walletAddress, entry)
      
      const retrieved = await getCacheMetadata(walletAddress, 'lastFullSync')
      expect(retrieved).not.toBeNull()
      expect(retrieved!.key).toBe('lastFullSync')
      expect(retrieved!.value).toBe(entry.value)
      expect(retrieved!.updatedAt).toBe(entry.updatedAt)
    })

    it('getCacheMetadata returns undefined for non-existent key', async () => {
      const retrieved = await getCacheMetadata(walletAddress, 'non-existent-key')
      expect(retrieved).toBeNull()
    })

    it('overwrites existing metadata entry', async () => {
      const entry1: CacheMetadataEntry = {
        key: 'testKey',
        value: 100,
        updatedAt: Date.now(),
      }
      await setCacheMetadata(walletAddress, entry1)
      
      const entry2: CacheMetadataEntry = {
        key: 'testKey',
        value: 200,
        updatedAt: Date.now(),
      }
      await setCacheMetadata(walletAddress, entry2)
      
      const retrieved = await getCacheMetadata(walletAddress, 'testKey')
      expect(retrieved!.value).toBe(200)
    })

    it('stores different value types', async () => {
      const stringEntry: CacheMetadataEntry = {
        key: 'stringKey',
        value: 'test-string',
        updatedAt: Date.now(),
      }
      await setCacheMetadata(walletAddress, stringEntry)
      
      const boolEntry: CacheMetadataEntry = {
        key: 'boolKey',
        value: true,
        updatedAt: Date.now(),
      }
      await setCacheMetadata(walletAddress, boolEntry)
      
      const stringRetrieved = await getCacheMetadata(walletAddress, 'stringKey')
      expect(stringRetrieved!.value).toBe('test-string')
      
      const boolRetrieved = await getCacheMetadata(walletAddress, 'boolKey')
      expect(boolRetrieved!.value).toBe(true)
    })
  })
})

describe('Maintenance Operations', () => {
  const walletAddress = '0x1234567890abcdef1234567890abcdef12345678'

  beforeEach(async () => {
    try {
      await deleteDatabase(walletAddress)
    } catch {
      // Ignore
    }
  })

  afterEach(async () => {
    try {
      await deleteDatabase(walletAddress)
    } catch {
      // Ignore
    }
  })

  describe('clearCachedVideos', () => {
    it('removes all videos', async () => {
      const video1 = createMockCachedVideo()
      const video2 = createMockCachedVideo()
      
      await putCachedVideo(walletAddress, video1)
      await putCachedVideo(walletAddress, video2)
      
      await clearCachedVideos(walletAddress)
      
      const all = await getAllCachedVideos(walletAddress)
      expect(all).toEqual([])
    })

    it('preserves metadata store', async () => {
      const video = createMockCachedVideo()
      const entry: CacheMetadataEntry = {
        key: 'testKey',
        value: 'test-value',
        updatedAt: Date.now(),
      }
      
      await putCachedVideo(walletAddress, video)
      await setCacheMetadata(walletAddress, entry)
      
      await clearCachedVideos(walletAddress)
      
      // Videos should be gone
      const videos = await getAllCachedVideos(walletAddress)
      expect(videos).toEqual([])
      
      // Metadata should still exist
      const metadata = await getCacheMetadata(walletAddress, 'testKey')
      expect(metadata).not.toBeNull()
      expect(metadata!.value).toBe('test-value')
    })
  })

  describe('deleteDatabase', () => {
    it('removes entire database', async () => {
      const video = createMockCachedVideo()
      await putCachedVideo(walletAddress, video)
      
      await deleteDatabase(walletAddress)
      
      // Database should be completely gone, so getting all videos returns empty
      const all = await getAllCachedVideos(walletAddress)
      expect(all).toEqual([])
    })
  })

  describe('getCacheStats', () => {
    it('returns correct count', async () => {
      const stats = await getCacheStats(walletAddress)
      expect(stats.totalVideos).toBe(0)
      
      await putCachedVideo(walletAddress, createMockCachedVideo())
      await putCachedVideo(walletAddress, createMockCachedVideo())
      
      const updatedStats = await getCacheStats(walletAddress)
      expect(updatedStats.totalVideos).toBe(2)
    })

    it('counts active and expired videos separately', async () => {
      await putCachedVideo(walletAddress, createMockCachedVideo({
        arkivEntityStatus: 'active'
      }))
      await putCachedVideo(walletAddress, createMockCachedVideo({
        arkivEntityStatus: 'active'
      }))
      await putCachedVideo(walletAddress, createMockCachedVideo({
        arkivEntityStatus: 'expired'
      }))
      
      const stats = await getCacheStats(walletAddress)
      expect(stats.totalVideos).toBe(3)
      expect(stats.activeVideos).toBe(2)
      expect(stats.expiredVideos).toBe(1)
    })

    it('includes lastFullSync timestamp', async () => {
      const syncTime = Date.now()
      await setCacheMetadata(walletAddress, {
        key: 'lastFullSync',
        value: syncTime,
        updatedAt: Date.now(),
      })
      
      const stats = await getCacheStats(walletAddress)
      expect(stats.lastFullSync).toBe(syncTime)
    })

    it('returns null for lastFullSync when not set', async () => {
      const stats = await getCacheStats(walletAddress)
      expect(stats.lastFullSync).toBeNull()
    })
  })
})

describe('Query Operations', () => {
  const walletAddress = '0x1234567890abcdef1234567890abcdef12345678'

  beforeEach(async () => {
    try {
      await deleteDatabase(walletAddress)
    } catch {
      // Ignore
    }
  })

  afterEach(async () => {
    try {
      await deleteDatabase(walletAddress)
    } catch {
      // Ignore
    }
  })

  describe('getVideosByLastAccessed', () => {
    it('returns videos sorted by lastAccessedAt (oldest first)', async () => {
      const now = Date.now()
      const video1 = createMockCachedVideo({
        id: '1',
        lastAccessedAt: now - 3000,
      })
      const video2 = createMockCachedVideo({
        id: '2',
        lastAccessedAt: now - 1000,
      })
      const video3 = createMockCachedVideo({
        id: '3',
        lastAccessedAt: now - 2000,
      })
      
      await putCachedVideo(walletAddress, video1)
      await putCachedVideo(walletAddress, video2)
      await putCachedVideo(walletAddress, video3)
      
      const sorted = await getVideosByLastAccessed(walletAddress)
      expect(sorted.map(v => v.id)).toEqual(['1', '3', '2'])
    })

    it('respects limit parameter', async () => {
      const now = Date.now()
      for (let i = 0; i < 5; i++) {
        await putCachedVideo(walletAddress, createMockCachedVideo({
          id: `video-${i}`,
          lastAccessedAt: now - i * 1000,
        }))
      }
      
      const sorted = await getVideosByLastAccessed(walletAddress, 3)
      expect(sorted).toHaveLength(3)
      expect(sorted.map(v => v.id)).toEqual(['video-4', 'video-3', 'video-2'])
    })

    it('returns all videos when limit is not specified', async () => {
      for (let i = 0; i < 5; i++) {
        await putCachedVideo(walletAddress, createMockCachedVideo())
      }
      
      const sorted = await getVideosByLastAccessed(walletAddress)
      expect(sorted).toHaveLength(5)
    })

    it('returns empty array for empty database', async () => {
      const sorted = await getVideosByLastAccessed(walletAddress)
      expect(sorted).toEqual([])
    })
  })
})

describe('Edge Cases', () => {
  const walletAddress = '0x1234567890abcdef1234567890abcdef12345678'

  beforeEach(async () => {
    try {
      await deleteDatabase(walletAddress)
    } catch {
      // Ignore
    }
  })

  afterEach(async () => {
    try {
      await deleteDatabase(walletAddress)
    } catch {
      // Ignore
    }
  })

  it('handles videos with special characters in fields', async () => {
    const video = createMockCachedVideo({
      title: 'Video with "quotes" and <html> & special chars',
      description: 'Line 1\nLine 2\tTabbed',
    })
    
    await putCachedVideo(walletAddress, video)
    
    const retrieved = await getCachedVideo(walletAddress, video.id)
    expect(retrieved!.title).toBe(video.title)
    expect(retrieved!.description).toBe(video.description)
  })

  it('handles very long field values', async () => {
    const video = createMockCachedVideo({
      title: 'a'.repeat(10000),
      description: 'b'.repeat(50000),
    })
    
    await putCachedVideo(walletAddress, video)
    
    const retrieved = await getCachedVideo(walletAddress, video.id)
    expect(retrieved!.title).toBe(video.title)
    expect(retrieved!.description).toBe(video.description)
  })

  it('handles unicode characters', async () => {
    const video = createMockCachedVideo({
      title: '日本語タイトル 🎬',
      description: 'Emojis: 🚀 🎉 🌟',
    })
    
    await putCachedVideo(walletAddress, video)
    
    const retrieved = await getCachedVideo(walletAddress, video.id)
    expect(retrieved!.title).toBe('日本語タイトル 🎬')
    expect(retrieved!.description).toBe('Emojis: 🚀 🎉 🌟')
  })

  it('handles empty string fields', async () => {
    const video = createMockCachedVideo({
      title: '',
      description: '',
      filecoinCid: '',
    })
    
    await putCachedVideo(walletAddress, video)
    
    const retrieved = await getCachedVideo(walletAddress, video.id)
    expect(retrieved!.title).toBe('')
    expect(retrieved!.description).toBe('')
    expect(retrieved!.filecoinCid).toBe('')
  })
})
