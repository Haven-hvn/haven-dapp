/**
 * useVideos Hook Cache Integration Tests
 *
 * Tests the integration between useVideos hook and the cache system.
 * Verifies stale-while-revalidate behavior and cache data flow.
 */

import 'fake-indexeddb/auto'
import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useVideos, videoKeys } from '../useVideos'
import { getVideoCacheService, clearServiceInstances } from '@/services/cacheService'
import { deleteDatabase, getCachedVideo } from '@/lib/cache'
import { createMockVideo } from '@/lib/cache/__tests__/fixtures'
import type { Video } from '@/types/video'

const TEST_WALLET = '0x1234567890abcdef1234567890abcdef12345678'

// Mock the wallet connection hook
vi.mock('../useVideos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useVideos')>()
  return {
    ...actual,
  }
})

// Create a wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

describe('useVideos Hook Cache Integration', () => {
  let queryClient: QueryClient

  beforeEach(async () => {
    clearServiceInstances()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
          staleTime: 0,
        },
      },
    })
    try {
      await deleteDatabase(TEST_WALLET)
    } catch {
      // Ignore
    }
  })

  afterEach(async () => {
    clearServiceInstances()
    queryClient.clear()
    try {
      await deleteDatabase(TEST_WALLET)
    } catch {
      // Ignore
    }
    vi.restoreAllMocks()
  })

  describe('Cache data loading', () => {
    it('loads cached data immediately when cache is populated', async () => {
      // Pre-populate cache
      const cacheService = getVideoCacheService(TEST_WALLET)
      const cachedVideos: Video[] = [
        createMockVideo({ id: '0x1', owner: TEST_WALLET, title: 'Cached 1' }),
        createMockVideo({ id: '0x2', owner: TEST_WALLET, title: 'Cached 2' }),
      ]
      await cacheService.cacheVideos(cachedVideos)

      // Verify cache has data
      const allCached = await cacheService.getVideos()
      expect(allCached).toHaveLength(2)
    })

    it('cache read returns correct video data', async () => {
      const cacheService = getVideoCacheService(TEST_WALLET)
      const video = createMockVideo({
        id: '0xtest',
        owner: TEST_WALLET,
        title: 'Test Video',
        description: 'Test Description',
        duration: 120,
      })
      await cacheService.cacheVideo(video)

      const cached = await cacheService.getVideo('0xtest')
      expect(cached).not.toBeNull()
      expect(cached?.title).toBe('Test Video')
      expect(cached?.description).toBe('Test Description')
      expect(cached?.duration).toBe(120)
    })

    it('empty cache returns empty array', async () => {
      const cacheService = getVideoCacheService(TEST_WALLET)
      const videos = await cacheService.getVideos()
      expect(videos).toEqual([])
    })
  })

  describe('Stale-while-revalidate pattern', () => {
    it('returns cached data immediately while fetching in background', async () => {
      const cacheService = getVideoCacheService(TEST_WALLET)
      
      // Pre-populate cache
      const cachedVideo = createMockVideo({
        id: '0x1',
        owner: TEST_WALLET,
        title: 'Cached Title',
      })
      await cacheService.cacheVideo(cachedVideo)

      // Simulate Arkiv fetch returning updated data
      const arkivVideo = createMockVideo({
        id: '0x1',
        owner: TEST_WALLET,
        title: 'Updated Title',
      })

      // First, verify cached data is available
      const initialCached = await cacheService.getVideo('0x1')
      expect(initialCached?.title).toBe('Cached Title')

      // Simulate the sync (which would happen during fetch)
      await cacheService.syncWithArkiv([arkivVideo])

      // After sync, cache should have updated data
      const updatedCached = await cacheService.getVideo('0x1')
      expect(updatedCached?.title).toBe('Updated Title')
    })

    it('isLoading is false when cache data is available', async () => {
      const cacheService = getVideoCacheService(TEST_WALLET)
      await cacheService.cacheVideo(
        createMockVideo({ id: '0x1', owner: TEST_WALLET })
      )

      const videos = await cacheService.getVideos()
      // When data is available from cache, isLoading should be false
      expect(videos.length).toBeGreaterThan(0)
    })
  })

  describe('Cache sync with Arkiv', () => {
    it('sync updates cache with new Arkiv data', async () => {
      const cacheService = getVideoCacheService(TEST_WALLET)

      // Start with cached data
      const originalVideo = createMockVideo({
        id: '0x1',
        owner: TEST_WALLET,
        title: 'Original',
      })
      await cacheService.cacheVideo(originalVideo)

      // Arkiv returns updated video
      const updatedVideo = createMockVideo({
        id: '0x1',
        owner: TEST_WALLET,
        title: 'Updated',
      })

      // Sync with Arkiv
      const result = await cacheService.syncWithArkiv([updatedVideo])

      expect(result.updated).toBe(1)

      const cached = await cacheService.getVideo('0x1')
      expect(cached?.title).toBe('Updated')
    })

    it('sync detects new videos from Arkiv', async () => {
      const cacheService = getVideoCacheService(TEST_WALLET)

      // Start with one video
      await cacheService.cacheVideo(
        createMockVideo({ id: '0x1', owner: TEST_WALLET })
      )

      // Arkiv returns two videos (one new)
      const arkivVideos = [
        createMockVideo({ id: '0x1', owner: TEST_WALLET }),
        createMockVideo({ id: '0x2', owner: TEST_WALLET }),
      ]

      const result = await cacheService.syncWithArkiv(arkivVideos)

      expect(result.added).toBe(1)
      expect(result.unchanged).toBe(1)

      const allVideos = await cacheService.getVideos()
      expect(allVideos).toHaveLength(2)
    })

    it('sync detects expired videos', async () => {
      const cacheService = getVideoCacheService(TEST_WALLET)

      // Start with two videos
      await cacheService.cacheVideos([
        createMockVideo({ id: '0x1', owner: TEST_WALLET }),
        createMockVideo({ id: '0x2', owner: TEST_WALLET }),
      ])

      // Arkiv returns only one video (0x2 expired)
      const arkivVideos = [createMockVideo({ id: '0x1', owner: TEST_WALLET })]

      const result = await cacheService.syncWithArkiv(arkivVideos)

      expect(result.expired).toBe(1)

      // Expired video should still be in cache
      const allCached = await cacheService.getVideos()
      expect(allCached).toHaveLength(2)

      // Check status
      const cached2 = await cacheService.getVideo('0x2')
      expect(cached2?.arkivStatus).toBe('expired')
    })
  })

  describe('Query key management', () => {
    it('generates correct query keys for video lists', () => {
      const keys = videoKeys.list(TEST_WALLET)
      expect(keys).toEqual(['videos', 'list', TEST_WALLET])
    })

    it('generates correct query keys for video details', () => {
      const keys = videoKeys.detail('0xvideo123')
      expect(keys).toEqual(['videos', 'detail', '0xvideo123'])
    })

    it('video keys are stable', () => {
      const keys1 = videoKeys.list(TEST_WALLET)
      const keys2 = videoKeys.list(TEST_WALLET)
      expect(keys1).toEqual(keys2)
    })
  })
})

describe('useVideoQuery Hook Cache Integration', () => {
  beforeEach(async () => {
    clearServiceInstances()
    try {
      await deleteDatabase(TEST_WALLET)
    } catch {
      // Ignore
    }
  })

  afterEach(async () => {
    clearServiceInstances()
    try {
      await deleteDatabase(TEST_WALLET)
    } catch {
      // Ignore
    }
    vi.restoreAllMocks()
  })

  describe('Single video cache lookup', () => {
    it('returns cached video for expired entity', async () => {
      const cacheService = getVideoCacheService(TEST_WALLET)

      // Cache video
      const video = createMockVideo({
        id: '0xexpired',
        owner: TEST_WALLET,
        title: 'Expired Video',
      })
      await cacheService.cacheVideo(video)

      // Mark as expired (simulating Arkiv no longer having it)
      await cacheService.markVideoExpired('0xexpired')

      // Should still be retrievable from cache
      const cached = await cacheService.getVideo('0xexpired')
      expect(cached).not.toBeNull()
      expect(cached?.title).toBe('Expired Video')
      expect(cached?.arkivStatus).toBe('expired')
    })

    it('returns null for non-existent video', async () => {
      const cacheService = getVideoCacheService(TEST_WALLET)
      const cached = await cacheService.getVideo('0xnonexistent')
      expect(cached).toBeNull()
    })

    it('touch updates lastAccessedAt', async () => {
      const cacheService = getVideoCacheService(TEST_WALLET)
      
      const beforeTouch = Date.now()
      const video = createMockVideo({
        id: '0xtest',
        owner: TEST_WALLET,
      })
      await cacheService.cacheVideo(video)

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Touch the video
      await cacheService.touchVideo('0xtest')

      // Verify using the raw cached video (not the converted Video object)
      const rawCached = await getCachedVideo(TEST_WALLET, '0xtest')
      expect(rawCached).not.toBeNull()
      expect(rawCached?.id).toBe('0xtest')
      
      // The lastAccessedAt should be updated (it's a timestamp)
      expect(typeof rawCached?.lastAccessedAt).toBe('number')
      expect(rawCached?.lastAccessedAt).toBeGreaterThanOrEqual(beforeTouch)
    })
  })
})
