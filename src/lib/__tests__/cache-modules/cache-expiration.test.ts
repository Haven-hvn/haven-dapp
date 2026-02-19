/**
 * Unit tests for cache-expiration.ts
 * 
 * Tests for the cache TTL & expiration strategy utilities.
 */

import {
  isExpired,
  runCleanupSweep,
  enforceMaxVideos,
  touchVideo,
  getLastAccessed,
  removeFromLRU,
  clearLRUTracking,
  getExpirationTime,
  getTimeUntilExpiration,
  runStoragePressureCleanup,
  runCriticalStorageCleanup,
  startPeriodicCleanup,
  stopPeriodicCleanup,
  isPeriodicCleanupRunning,
  validateTTL,
  getCacheExpirationStats,
  DEFAULT_CONFIG,
} from '../../cache-expiration'
import { putVideo, deleteVideo, CacheMetadata, getCacheStorageEstimate } from '../../video-cache'
import { setupCacheMock, resetCacheMock, teardownCacheMock } from './mocks/cache-api'

// Mock video-cache module
jest.mock('../../video-cache', () => ({
  ...jest.requireActual('../../video-cache'),
  getCacheStorageEstimate: jest.fn(),
}))

const mockedGetStorageEstimate = getCacheStorageEstimate as jest.MockedFunction<typeof getCacheStorageEstimate>

describe('cache-expiration', () => {
  beforeAll(() => {
    setupCacheMock()
  })

  beforeEach(() => {
    resetCacheMock()
    clearLRUTracking()
    jest.clearAllMocks()
    stopPeriodicCleanup()
  })

  afterAll(() => {
    teardownCacheMock()
    stopPeriodicCleanup()
  })

  describe('isExpired', () => {
    it('returns false for fresh entry', () => {
      const metadata: CacheMetadata = {
        videoId: 'fresh',
        mimeType: 'video/mp4',
        size: 1000,
        cachedAt: new Date(), // Just cached
      }

      expect(isExpired(metadata)).toBe(false)
    })

    it('returns true for expired entry', () => {
      const metadata: CacheMetadata = {
        videoId: 'expired',
        mimeType: 'video/mp4',
        size: 1000,
        cachedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
      }

      expect(isExpired(metadata)).toBe(true)
    })

    it('uses default TTL when none specified', () => {
      const metadata: CacheMetadata = {
        videoId: 'default-ttl',
        mimeType: 'video/mp4',
        size: 1000,
        cachedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), // 6 days ago
      }

      // Default TTL is 7 days, so should not be expired
      expect(isExpired(metadata)).toBe(false)

      // 8 days should be expired
      metadata.cachedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
      expect(isExpired(metadata)).toBe(true)
    })

    it('uses custom TTL from metadata', () => {
      const metadata: CacheMetadata = {
        videoId: 'custom-ttl',
        mimeType: 'video/mp4',
        size: 1000,
        cachedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        ttl: 60 * 60 * 1000, // 1 hour TTL
      }

      expect(isExpired(metadata)).toBe(true)
    })

    it('uses custom config TTL', () => {
      const metadata: CacheMetadata = {
        videoId: 'config-ttl',
        mimeType: 'video/mp4',
        size: 1000,
        cachedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      }

      expect(isExpired(metadata, { defaultTTL: 3 * 60 * 60 * 1000 })).toBe(false)
      expect(isExpired(metadata, { defaultTTL: 60 * 60 * 1000 })).toBe(true)
    })
  })

  describe('runCleanupSweep', () => {
    it('removes expired entries', async () => {
      // Create mock for listCachedVideos
      const { listCachedVideos } = require('../../video-cache')
      const mockList = jest.spyOn(require('../../video-cache'), 'listCachedVideos')
      
      mockList.mockResolvedValue([
        {
          videoId: 'expired-1',
          mimeType: 'video/mp4',
          size: 1000,
          cachedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
          url: 'https://test/haven/v/expired-1',
        },
        {
          videoId: 'fresh-1',
          mimeType: 'video/mp4',
          size: 1000,
          cachedAt: new Date(), // Just cached
          url: 'https://test/haven/v/fresh-1',
        },
      ])

      const mockDelete = jest.spyOn(require('../../video-cache'), 'deleteVideo')
        .mockResolvedValue(true)

      const removed = await runCleanupSweep()

      expect(removed).toBe(1)
      expect(mockDelete).toHaveBeenCalledWith('expired-1')
      expect(mockDelete).not.toHaveBeenCalledWith('fresh-1')

      mockList.mockRestore()
      mockDelete.mockRestore()
    })

    it('keeps non-expired entries', async () => {
      const mockList = jest.spyOn(require('../../video-cache'), 'listCachedVideos')
      mockList.mockResolvedValue([
        {
          videoId: 'fresh-a',
          mimeType: 'video/mp4',
          size: 1000,
          cachedAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          url: 'https://test/haven/v/fresh-a',
        },
        {
          videoId: 'fresh-b',
          mimeType: 'video/mp4',
          size: 1000,
          cachedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
          url: 'https://test/haven/v/fresh-b',
        },
      ])

      const mockDelete = jest.spyOn(require('../../video-cache'), 'deleteVideo')
        .mockResolvedValue(true)

      const removed = await runCleanupSweep()

      expect(removed).toBe(0)
      expect(mockDelete).not.toHaveBeenCalled()

      mockList.mockRestore()
      mockDelete.mockRestore()
    })

    it('returns count of removed entries', async () => {
      const mockList = jest.spyOn(require('../../video-cache'), 'listCachedVideos')
      mockList.mockResolvedValue([
        {
          videoId: 'expired-1',
          mimeType: 'video/mp4',
          size: 1000,
          cachedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          url: 'https://test/haven/v/expired-1',
        },
        {
          videoId: 'expired-2',
          mimeType: 'video/mp4',
          size: 1000,
          cachedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
          url: 'https://test/haven/v/expired-2',
        },
      ])

      const mockDelete = jest.spyOn(require('../../video-cache'), 'deleteVideo')
        .mockResolvedValue(true)

      const removed = await runCleanupSweep()

      expect(removed).toBe(2)

      mockList.mockRestore()
      mockDelete.mockRestore()
    })

    it('handles errors gracefully', async () => {
      const mockList = jest.spyOn(require('../../video-cache'), 'listCachedVideos')
      mockList.mockRejectedValue(new Error('Cache error'))

      const removed = await runCleanupSweep()

      expect(removed).toBe(0)

      mockList.mockRestore()
    })
  })

  describe('enforceMaxVideos', () => {
    it('does nothing when under limit', async () => {
      const mockList = jest.spyOn(require('../../video-cache'), 'listCachedVideos')
      mockList.mockResolvedValue([
        { videoId: 'v1', mimeType: 'video/mp4', size: 1000, cachedAt: new Date(), url: '' },
        { videoId: 'v2', mimeType: 'video/mp4', size: 1000, cachedAt: new Date(), url: '' },
      ])

      const mockDelete = jest.spyOn(require('../../video-cache'), 'deleteVideo')
        .mockResolvedValue(true)

      const removed = await enforceMaxVideos({ maxCachedVideos: 10 })

      expect(removed).toBe(0)
      expect(mockDelete).not.toHaveBeenCalled()

      mockList.mockRestore()
      mockDelete.mockRestore()
    })

    it('removes oldest entries when over limit', async () => {
      const now = Date.now()
      const mockList = jest.spyOn(require('../../video-cache'), 'listCachedVideos')
      mockList.mockResolvedValue([
        { videoId: 'oldest', mimeType: 'video/mp4', size: 1000, cachedAt: new Date(now - 3000), url: '' },
        { videoId: 'middle', mimeType: 'video/mp4', size: 1000, cachedAt: new Date(now - 2000), url: '' },
        { videoId: 'newest', mimeType: 'video/mp4', size: 1000, cachedAt: new Date(now - 1000), url: '' },
      ])

      const mockDelete = jest.spyOn(require('../../video-cache'), 'deleteVideo')
        .mockResolvedValue(true)

      const removed = await enforceMaxVideos({ maxCachedVideos: 2 })

      expect(removed).toBe(1)
      expect(mockDelete).toHaveBeenCalledWith('oldest')
      expect(mockDelete).not.toHaveBeenCalledWith('middle')
      expect(mockDelete).not.toHaveBeenCalledWith('newest')

      mockList.mockRestore()
      mockDelete.mockRestore()
    })

    it('removes based on LRU tracking when available', async () => {
      const now = Date.now()
      const mockList = jest.spyOn(require('../../video-cache'), 'listCachedVideos')
      mockList.mockResolvedValue([
        { videoId: 'v1', mimeType: 'video/mp4', size: 1000, cachedAt: new Date(now - 1000), url: '' },
        { videoId: 'v2', mimeType: 'video/mp4', size: 1000, cachedAt: new Date(now - 3000), url: '' },
        { videoId: 'v3', mimeType: 'video/mp4', size: 1000, cachedAt: new Date(now - 2000), url: '' },
      ])

      // Set up LRU tracking (v2 was accessed most recently despite oldest cache time)
      touchVideo('v2')
      touchVideo('v3')

      const mockDelete = jest.spyOn(require('../../video-cache'), 'deleteVideo')
        .mockResolvedValue(true)

      const removed = await enforceMaxVideos({ maxCachedVideos: 2 })

      expect(removed).toBe(1)
      // v1 should be removed - never accessed and newest cache time
      expect(mockDelete).toHaveBeenCalledWith('v1')

      mockList.mockRestore()
      mockDelete.mockRestore()
    })
  })

  describe('LRU Tracking', () => {
    describe('touchVideo', () => {
      it('updates last accessed time', () => {
        const before = Date.now()
        touchVideo('video1')
        const after = Date.now()

        const lastAccessed = getLastAccessed('video1')
        expect(lastAccessed).toBeGreaterThanOrEqual(before)
        expect(lastAccessed).toBeLessThanOrEqual(after)
      })

      it('updates existing entry', async () => {
        touchVideo('video1')
        const firstAccess = getLastAccessed('video1')

        // Wait a bit
        await new Promise(r => setTimeout(r, 10))

        touchVideo('video1')
        const secondAccess = getLastAccessed('video1')

        expect(secondAccess).toBeGreaterThan(firstAccess!)
      })
    })

    describe('getLastAccessed', () => {
      it('returns undefined for untracked video', () => {
        expect(getLastAccessed('not-tracked')).toBeUndefined()
      })

      it('returns timestamp for tracked video', () => {
        touchVideo('tracked')
        expect(getLastAccessed('tracked')).toBeDefined()
      })
    })

    describe('removeFromLRU', () => {
      it('removes video from tracking', () => {
        touchVideo('to-remove')
        expect(getLastAccessed('to-remove')).toBeDefined()

        removeFromLRU('to-remove')
        expect(getLastAccessed('to-remove')).toBeUndefined()
      })

      it('does not throw for untracked video', () => {
        expect(() => removeFromLRU('never-tracked')).not.toThrow()
      })
    })

    describe('clearLRUTracking', () => {
      it('clears all tracking data', () => {
        touchVideo('v1')
        touchVideo('v2')
        touchVideo('v3')

        expect(getLastAccessed('v1')).toBeDefined()

        clearLRUTracking()

        expect(getLastAccessed('v1')).toBeUndefined()
        expect(getLastAccessed('v2')).toBeUndefined()
        expect(getLastAccessed('v3')).toBeUndefined()
      })
    })
  })

  describe('getExpirationTime', () => {
    it('returns expiration date for entry with TTL', () => {
      const cachedAt = new Date('2024-01-01T00:00:00Z')
      const metadata: CacheMetadata = {
        videoId: 'test',
        mimeType: 'video/mp4',
        size: 1000,
        cachedAt,
        ttl: 24 * 60 * 60 * 1000, // 1 day
      }

      const expiration = getExpirationTime(metadata)
      expect(expiration).toEqual(new Date('2024-01-02T00:00:00Z'))
    })

    it('returns null when no TTL', () => {
      const metadata: CacheMetadata = {
        videoId: 'test',
        mimeType: 'video/mp4',
        size: 1000,
        cachedAt: new Date(),
      }

      expect(getExpirationTime(metadata)).toBeNull()
    })

    it('uses default TTL when no metadata TTL', () => {
      const cachedAt = new Date('2024-01-01T00:00:00Z')
      const metadata: CacheMetadata = {
        videoId: 'test',
        mimeType: 'video/mp4',
        size: 1000,
        cachedAt,
      }

      const expiration = getExpirationTime(metadata)
      // Default is 7 days
      expect(expiration).toEqual(new Date('2024-01-08T00:00:00Z'))
    })
  })

  describe('getTimeUntilExpiration', () => {
    it('returns positive time for fresh entry', () => {
      const metadata: CacheMetadata = {
        videoId: 'test',
        mimeType: 'video/mp4',
        size: 1000,
        cachedAt: new Date(),
        ttl: 24 * 60 * 60 * 1000, // 1 day
      }

      const timeLeft = getTimeUntilExpiration(metadata)
      expect(timeLeft).toBeGreaterThan(0)
      expect(timeLeft).toBeLessThanOrEqual(24 * 60 * 60 * 1000)
    })

    it('returns negative time for expired entry', () => {
      const metadata: CacheMetadata = {
        videoId: 'test',
        mimeType: 'video/mp4',
        size: 1000,
        cachedAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
        ttl: 24 * 60 * 60 * 1000, // 1 day TTL
      }

      const timeLeft = getTimeUntilExpiration(metadata)
      expect(timeLeft).toBeLessThan(0)
    })

    it('returns Infinity when no TTL', () => {
      const metadata: CacheMetadata = {
        videoId: 'test',
        mimeType: 'video/mp4',
        size: 1000,
        cachedAt: new Date(),
      }

      expect(getTimeUntilExpiration(metadata)).toBe(Infinity)
    })
  })

  describe('runStoragePressureCleanup', () => {
    it('does nothing when storage is under threshold', async () => {
      mockedGetStorageEstimate.mockResolvedValue({ usage: 50, quota: 1000, percent: 5 })

      const mockList = jest.spyOn(require('../../video-cache'), 'listCachedVideos')
      mockList.mockResolvedValue([])

      const removed = await runStoragePressureCleanup()
      expect(removed).toBe(0)

      mockList.mockRestore()
    })

    it('removes videos when over threshold', async () => {
      mockedGetStorageEstimate
        .mockResolvedValueOnce({ usage: 850, quota: 1000, percent: 85 }) // Over 80% threshold
        .mockResolvedValueOnce({ usage: 500, quota: 1000, percent: 50 }) // After cleanup

      const mockList = jest.spyOn(require('../../video-cache'), 'listCachedVideos')
      mockList.mockResolvedValue([
        { videoId: 'v1', mimeType: 'video/mp4', size: 100, cachedAt: new Date(), url: '' },
      ])

      const mockDelete = jest.spyOn(require('../../video-cache'), 'deleteVideo')
        .mockResolvedValue(true)

      const removed = await runStoragePressureCleanup()

      expect(removed).toBeGreaterThanOrEqual(0)

      mockList.mockRestore()
      mockDelete.mockRestore()
    })

    it('returns 0 when no videos cached', async () => {
      mockedGetStorageEstimate.mockResolvedValue({ usage: 900, quota: 1000, percent: 90 })

      const mockList = jest.spyOn(require('../../video-cache'), 'listCachedVideos')
      mockList.mockResolvedValue([])

      const removed = await runStoragePressureCleanup()
      expect(removed).toBe(0)

      mockList.mockRestore()
    })
  })

  describe('runCriticalStorageCleanup', () => {
    it('does nothing when storage is not critical', async () => {
      mockedGetStorageEstimate.mockResolvedValue({ usage: 80, quota: 100, percent: 80 })

      const mockList = jest.spyOn(require('../../video-cache'), 'listCachedVideos')
      mockList.mockResolvedValue([])

      const removed = await runCriticalStorageCleanup()
      expect(removed).toBe(0)

      mockList.mockRestore()
    })

    it('removes largest videos first when critical', async () => {
      mockedGetStorageEstimate
        .mockResolvedValueOnce({ usage: 950, quota: 1000, percent: 95 }) // Critical
        .mockResolvedValueOnce({ usage: 400, quota: 1000, percent: 40 }) // After removal

      const mockList = jest.spyOn(require('../../video-cache'), 'listCachedVideos')
      mockList.mockResolvedValue([
        { videoId: 'small', mimeType: 'video/mp4', size: 100, cachedAt: new Date(), url: '' },
        { videoId: 'large', mimeType: 'video/mp4', size: 500, cachedAt: new Date(), url: '' },
      ])

      const mockDelete = jest.spyOn(require('../../video-cache'), 'deleteVideo')
        .mockResolvedValue(true)

      const removed = await runCriticalStorageCleanup()

      expect(removed).toBeGreaterThanOrEqual(0)

      mockList.mockRestore()
      mockDelete.mockRestore()
    })
  })

  describe('Periodic Cleanup', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
      stopPeriodicCleanup()
    })

    describe('startPeriodicCleanup', () => {
      it('returns cleanup function', () => {
        const stop = startPeriodicCleanup()
        expect(typeof stop).toBe('function')
        stop()
      })

      it('starts periodic cleanup', () => {
        startPeriodicCleanup()
        expect(isPeriodicCleanupRunning()).toBe(true)
      })

      it('stops existing timer when started again', () => {
        startPeriodicCleanup({ cleanupInterval: 1000 })
        startPeriodicCleanup({ cleanupInterval: 2000 })

        // Should only have one timer running
        expect(isPeriodicCleanupRunning()).toBe(true)
      })

      it('runs cleanup immediately on start', async () => {
        const mockList = jest.spyOn(require('../../video-cache'), 'listCachedVideos')
        mockList.mockResolvedValue([])

        startPeriodicCleanup()

        // Wait for immediate execution
        await Promise.resolve()

        expect(mockList).toHaveBeenCalled()

        mockList.mockRestore()
      })
    })

    describe('stopPeriodicCleanup', () => {
      it('stops the cleanup timer', () => {
        startPeriodicCleanup()
        expect(isPeriodicCleanupRunning()).toBe(true)

        stopPeriodicCleanup()
        expect(isPeriodicCleanupRunning()).toBe(false)
      })

      it('does not throw when no timer running', () => {
        expect(isPeriodicCleanupRunning()).toBe(false)
        expect(() => stopPeriodicCleanup()).not.toThrow()
      })
    })

    describe('isPeriodicCleanupRunning', () => {
      it('returns false when not running', () => {
        expect(isPeriodicCleanupRunning()).toBe(false)
      })

      it('returns true when running', () => {
        startPeriodicCleanup()
        expect(isPeriodicCleanupRunning()).toBe(true)
      })
    })
  })

  describe('validateTTL', () => {
    it('returns value within range', () => {
      expect(validateTTL(12 * 60 * 60 * 1000)).toBe(12 * 60 * 60 * 1000) // 12 hours
    })

    it('clamps to minTTL when below minimum', () => {
      const belowMin = DEFAULT_CONFIG.minTTL - 1
      expect(validateTTL(belowMin)).toBe(DEFAULT_CONFIG.minTTL)
    })

    it('clamps to maxTTL when above maximum', () => {
      const aboveMax = DEFAULT_CONFIG.maxTTL + 1
      expect(validateTTL(aboveMax)).toBe(DEFAULT_CONFIG.maxTTL)
    })

    it('uses custom config limits', () => {
      expect(validateTTL(100, { minTTL: 200, maxTTL: 1000 })).toBe(200)
      expect(validateTTL(2000, { minTTL: 200, maxTTL: 1000 })).toBe(1000)
    })
  })

  describe('getCacheExpirationStats', () => {
    it('returns stats for empty cache', async () => {
      const mockList = jest.spyOn(require('../../video-cache'), 'listCachedVideos')
      mockList.mockResolvedValue([])
      mockedGetStorageEstimate.mockResolvedValue({ usage: 0, quota: 1000, percent: 0 })

      const stats = await getCacheExpirationStats()

      expect(stats.totalVideos).toBe(0)
      expect(stats.expired).toBe(0)
      expect(stats.expiringSoon).toBe(0)
      expect(stats.fresh).toBe(0)
      expect(stats.totalSize).toBe(0)

      mockList.mockRestore()
    })

    it('categorizes videos correctly', async () => {
      const now = Date.now()
      const oneDay = 24 * 60 * 60 * 1000

      const mockList = jest.spyOn(require('../../video-cache'), 'listCachedVideos')
      mockList.mockResolvedValue([
        {
          videoId: 'expired',
          mimeType: 'video/mp4',
          size: 100,
          cachedAt: new Date(now - 8 * oneDay), // 8 days ago (default TTL is 7 days)
          url: '',
        },
        {
          videoId: 'expiring-soon',
          mimeType: 'video/mp4',
          size: 200,
          cachedAt: new Date(now - 6.5 * oneDay), // Expires in ~12 hours
          url: '',
        },
        {
          videoId: 'fresh',
          mimeType: 'video/mp4',
          size: 300,
          cachedAt: new Date(now - oneDay), // 1 day ago
          url: '',
        },
      ])

      mockedGetStorageEstimate.mockResolvedValue({ usage: 600, quota: 1000, percent: 60 })

      const stats = await getCacheExpirationStats()

      expect(stats.totalVideos).toBe(3)
      expect(stats.expired).toBe(1)
      expect(stats.expiringSoon).toBe(1)
      expect(stats.fresh).toBe(1)
      expect(stats.totalSize).toBe(600)

      mockList.mockRestore()
    })

    it('handles errors gracefully', async () => {
      const mockList = jest.spyOn(require('../../video-cache'), 'listCachedVideos')
      mockList.mockRejectedValue(new Error('Cache error'))

      const stats = await getCacheExpirationStats()

      expect(stats.totalVideos).toBe(0)
      expect(stats.expired).toBe(0)

      mockList.mockRestore()
    })
  })

  describe('DEFAULT_CONFIG', () => {
    it('has correct default values', () => {
      expect(DEFAULT_CONFIG.defaultTTL).toBe(7 * 24 * 60 * 60 * 1000) // 7 days
      expect(DEFAULT_CONFIG.maxTTL).toBe(30 * 24 * 60 * 60 * 1000) // 30 days
      expect(DEFAULT_CONFIG.minTTL).toBe(60 * 60 * 1000) // 1 hour
      expect(DEFAULT_CONFIG.storageThreshold).toBe(0.8) // 80%
      expect(DEFAULT_CONFIG.cleanupInterval).toBe(60 * 60 * 1000) // 1 hour
      expect(DEFAULT_CONFIG.maxCachedVideos).toBe(50)
    })
  })
})
