/**
 * Cache Store Integration Tests
 *
 * Tests the integration between cacheStore and cacheService.
 * Verifies sync status tracking and stats updates.
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useCacheStore } from '../cacheStore'
import { getVideoCacheService, clearServiceInstances } from '@/services/cacheService'
import { deleteDatabase } from '@/lib/cache'
import { createMockVideo } from '@/lib/cache/__tests__/fixtures'
import type { CacheSyncResult, CacheStats } from '@/types/cache'

const TEST_WALLET = '0x1234567890abcdef1234567890abcdef12345678'

describe('Cache Store Integration', () => {
  beforeEach(async () => {
    // Reset store state
    useCacheStore.getState().reset()
    clearServiceInstances()
    try {
      await deleteDatabase(TEST_WALLET)
    } catch {
      // Ignore cleanup errors
    }
  })

  afterEach(async () => {
    useCacheStore.getState().reset()
    clearServiceInstances()
    try {
      await deleteDatabase(TEST_WALLET)
    } catch {
      // Ignore
    }
  })

  describe('Sync status tracking', () => {
    it('isSyncing is false before sync starts', () => {
      const state = useCacheStore.getState()
      expect(state.isSyncing).toBe(false)
    })

    it('isSyncing is true during sync', () => {
      useCacheStore.getState().setSyncing(true)
      expect(useCacheStore.getState().isSyncing).toBe(true)
    })

    it('isSyncing is false after sync completes', () => {
      const result: CacheSyncResult = {
        added: 3,
        updated: 0,
        expired: 0,
        unchanged: 0,
        errors: [],
        syncedAt: Date.now(),
      }

      useCacheStore.getState().setSyncing(true)
      expect(useCacheStore.getState().isSyncing).toBe(true)

      useCacheStore.getState().setSyncResult(result)
      expect(useCacheStore.getState().isSyncing).toBe(false)
    })

    it('lastSyncedAt is set after successful sync', () => {
      const syncedAt = Date.now()
      const result: CacheSyncResult = {
        added: 3,
        updated: 0,
        expired: 0,
        unchanged: 0,
        errors: [],
        syncedAt,
      }

      useCacheStore.getState().setSyncResult(result)
      expect(useCacheStore.getState().lastSyncedAt).toBe(syncedAt)
    })

    it('lastSyncResult is populated after sync', () => {
      const result: CacheSyncResult = {
        added: 5,
        updated: 2,
        expired: 1,
        unchanged: 10,
        errors: [],
        syncedAt: Date.now(),
      }

      useCacheStore.getState().setSyncResult(result)
      expect(useCacheStore.getState().lastSyncResult).toEqual(result)
    })

    it('lastSyncError is set on sync error', () => {
      useCacheStore.getState().setSyncing(true)
      useCacheStore.getState().setSyncError('Network connection failed')

      const state = useCacheStore.getState()
      expect(state.lastSyncError).toBe('Network connection failed')
      expect(state.isSyncing).toBe(false)
    })

    it('isSyncing is false after sync error', () => {
      useCacheStore.getState().setSyncing(true)
      expect(useCacheStore.getState().isSyncing).toBe(true)

      useCacheStore.getState().setSyncError('Sync failed')
      expect(useCacheStore.getState().isSyncing).toBe(false)
    })
  })

  describe('Stats update after sync', () => {
    it('stats are updated with correct counts after sync', async () => {
      const cacheService = getVideoCacheService(TEST_WALLET)

      // Sync 3 new videos
      const videos = Array.from({ length: 3 }, (_, i) =>
        createMockVideo({
          id: `0x${i}`,
          owner: TEST_WALLET,
          title: `Video ${i}`,
        })
      )

      await cacheService.syncWithArkiv(videos)

      // Get stats from cache service
      const stats = await cacheService.getStats()

      // Update store with stats
      useCacheStore.getState().setStats(stats)

      expect(useCacheStore.getState().stats?.totalVideos).toBe(3)
      expect(useCacheStore.getState().stats?.activeVideos).toBe(3)
      expect(useCacheStore.getState().stats?.expiredVideos).toBe(0)
    })

    it('stats reflect expired videos after sync', async () => {
      const cacheService = getVideoCacheService(TEST_WALLET)

      // Start with 3 videos
      const initialVideos = Array.from({ length: 3 }, (_, i) =>
        createMockVideo({
          id: `0x${i}`,
          owner: TEST_WALLET,
        })
      )
      await cacheService.syncWithArkiv(initialVideos)

      // Sync with only 2 videos (one expired)
      const updatedVideos = Array.from({ length: 2 }, (_, i) =>
        createMockVideo({
          id: `0x${i}`,
          owner: TEST_WALLET,
        })
      )
      const result = await cacheService.syncWithArkiv(updatedVideos)

      // Update store with sync result
      useCacheStore.getState().setSyncResult(result)

      // Get updated stats
      const stats = await cacheService.getStats()
      useCacheStore.getState().setStats(stats)

      expect(stats.totalVideos).toBe(3) // Still 3 total
      expect(stats.activeVideos).toBe(2)
      expect(stats.expiredVideos).toBe(1)
      expect(useCacheStore.getState().stats?.expiredVideos).toBe(1)
    })

    it('sync result contains correct counts', async () => {
      const cacheService = getVideoCacheService(TEST_WALLET)

      // First sync - 3 new videos
      const videos1 = [
        createMockVideo({ id: '0x1', owner: TEST_WALLET }),
        createMockVideo({ id: '0x2', owner: TEST_WALLET }),
        createMockVideo({ id: '0x3', owner: TEST_WALLET }),
      ]
      const result1 = await cacheService.syncWithArkiv(videos1)

      expect(result1.added).toBe(3)
      expect(result1.updated).toBe(0)
      expect(result1.expired).toBe(0)

      // Update store
      useCacheStore.getState().setSyncResult(result1)
      expect(useCacheStore.getState().lastSyncResult?.added).toBe(3)

      // Second sync - 1 updated, 1 expired, 1 unchanged, 1 new
      const videos2 = [
        createMockVideo({ id: '0x1', owner: TEST_WALLET, title: 'Updated' }), // Changed
        createMockVideo({ id: '0x2', owner: TEST_WALLET }), // Unchanged
        // 0x3 is gone (expired)
        createMockVideo({ id: '0x4', owner: TEST_WALLET }), // New
      ]
      const result2 = await cacheService.syncWithArkiv(videos2)

      expect(result2.added).toBe(1)
      expect(result2.updated).toBe(1)
      expect(result2.unchanged).toBe(1)
      expect(result2.expired).toBe(1)

      // Update store
      useCacheStore.getState().setSyncResult(result2)
      expect(useCacheStore.getState().lastSyncResult?.updated).toBe(1)
      expect(useCacheStore.getState().lastSyncResult?.expired).toBe(1)
    })
  })

  describe('Store and service integration', () => {
    it('store reflects cache service operations', async () => {
      const cacheService = getVideoCacheService(TEST_WALLET)

      // Initially empty
      let stats = await cacheService.getStats()
      expect(stats.totalVideos).toBe(0)

      // Add videos through service
      await cacheService.cacheVideos([
        createMockVideo({ id: '0x1', owner: TEST_WALLET }),
        createMockVideo({ id: '0x2', owner: TEST_WALLET }),
      ])

      // Update store stats
      stats = await cacheService.getStats()
      useCacheStore.getState().setStats(stats)

      expect(useCacheStore.getState().stats?.totalVideos).toBe(2)
    })

    it('clearing cache updates store stats', async () => {
      const cacheService = getVideoCacheService(TEST_WALLET)

      // Add videos
      await cacheService.cacheVideos([
        createMockVideo({ id: '0x1', owner: TEST_WALLET }),
        createMockVideo({ id: '0x2', owner: TEST_WALLET }),
      ])

      let stats = await cacheService.getStats()
      useCacheStore.getState().setStats(stats)
      expect(useCacheStore.getState().stats?.totalVideos).toBe(2)

      // Clear cache
      await cacheService.clearAll()

      // Update stats
      stats = await cacheService.getStats()
      useCacheStore.getState().setStats(stats)

      expect(useCacheStore.getState().stats?.totalVideos).toBe(0)
    })
  })

  describe('Error handling', () => {
    it('sync errors are tracked in store', () => {
      useCacheStore.getState().setSyncError('IndexedDB unavailable')

      const state = useCacheStore.getState()
      expect(state.lastSyncError).toBe('IndexedDB unavailable')
      expect(state.isSyncing).toBe(false)
    })

    it('multiple sync errors are recorded', () => {
      useCacheStore.getState().setSyncError('First error')
      expect(useCacheStore.getState().lastSyncError).toBe('First error')

      useCacheStore.getState().setSyncError('Second error')
      expect(useCacheStore.getState().lastSyncError).toBe('Second error')
    })

    it('successful sync clears previous error', () => {
      // Set error first
      useCacheStore.getState().setSyncError('Previous error')
      expect(useCacheStore.getState().lastSyncError).toBe('Previous error')

      // Then successful sync
      const result: CacheSyncResult = {
        added: 3,
        updated: 0,
        expired: 0,
        unchanged: 0,
        errors: [],
        syncedAt: Date.now(),
      }
      useCacheStore.getState().setSyncResult(result)

      expect(useCacheStore.getState().lastSyncError).toBeNull()
    })

    it('sync result with errors sets lastSyncError', () => {
      const result: CacheSyncResult = {
        added: 2,
        updated: 0,
        expired: 0,
        unchanged: 0,
        errors: ['Failed to process video 0x1', 'Database write error'],
        syncedAt: Date.now(),
      }

      useCacheStore.getState().setSyncResult(result)

      expect(useCacheStore.getState().lastSyncError).toBe(
        'Failed to process video 0x1; Database write error'
      )
    })
  })

  describe('Initialization state', () => {
    it('isInitialized starts false', () => {
      expect(useCacheStore.getState().isInitialized).toBe(false)
    })

    it('isInitialized can be set to true', () => {
      useCacheStore.getState().setInitialized(true)
      expect(useCacheStore.getState().isInitialized).toBe(true)
    })

    it('isInitialized resets on reset()', () => {
      useCacheStore.getState().setInitialized(true)
      expect(useCacheStore.getState().isInitialized).toBe(true)

      useCacheStore.getState().reset()
      expect(useCacheStore.getState().isInitialized).toBe(false)
    })
  })

  describe('Availability state', () => {
    it('isAvailable starts true', () => {
      expect(useCacheStore.getState().isAvailable).toBe(true)
    })

    it('isAvailable can be set to false', () => {
      useCacheStore.getState().setAvailable(false)
      expect(useCacheStore.getState().isAvailable).toBe(false)
    })

    it('isAvailable resets on reset()', () => {
      useCacheStore.getState().setAvailable(false)
      expect(useCacheStore.getState().isAvailable).toBe(false)

      useCacheStore.getState().reset()
      expect(useCacheStore.getState().isAvailable).toBe(true)
    })
  })
})
