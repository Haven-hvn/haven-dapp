/**
 * Tests for video-prefetch service
 */

import {
  prefetchVideo,
  cancelPrefetch,
  getPrefetchQueue,
  setPrefetchEnabled,
  isPrefetchEnabled,
  setPrefetchWalletAddress,
  getPrefetchWalletAddress,
  clearAllPrefetches,
  shouldPrefetchBasedOnConnection,
  type PrefetchItem,
} from '../video-prefetch'

// Mock dependencies
jest.mock('../video-cache', () => ({
  hasVideo: jest.fn().mockResolvedValue(false),
  putVideo: jest.fn().mockResolvedValue(undefined),
  getCacheStorageEstimate: jest.fn().mockResolvedValue({ usage: 100, quota: 1000, percent: 10 }),
}))

jest.mock('../lit-session-cache', () => ({
  getCachedAuthContext: jest.fn(),
  hasCachedSession: jest.fn().mockReturnValue(true),
}))

jest.mock('../aes-key-cache', () => ({
  hasCachedKey: jest.fn().mockReturnValue(false),
  getCachedKey: jest.fn(),
}))

jest.mock('@/services/ipfsService', () => ({
  fetchFromIpfs: jest.fn().mockResolvedValue({ data: new Uint8Array([1, 2, 3]), size: 3, gateway: 'test' }),
}))

describe('video-prefetch', () => {
  // Mock video
  const mockVideo = {
    id: 'video-1',
    owner: '0x123',
    createdAt: new Date(),
    title: 'Test Video',
    duration: 60,
    isEncrypted: true,
    hasAiData: false,
    encryptedCid: 'QmTest123',
    litEncryptionMetadata: {
      keyHash: 'key-1',
      iv: 'dGVzdGl2',
      originalMimeType: 'video/mp4',
    },
  }

  const mockNonEncryptedVideo = {
    ...mockVideo,
    id: 'video-2',
    isEncrypted: false,
    filecoinCid: 'QmTest456',
  }

  beforeEach(() => {
    // Clear queue and reset state
    clearAllPrefetches()
    setPrefetchEnabled(true)
    setPrefetchWalletAddress('0x123')
  })

  afterEach(() => {
    clearAllPrefetches()
  })

  describe('setPrefetchEnabled / isPrefetchEnabled', () => {
    it('should enable and disable prefetching', () => {
      expect(isPrefetchEnabled()).toBe(true)
      
      setPrefetchEnabled(false)
      expect(isPrefetchEnabled()).toBe(false)
      
      setPrefetchEnabled(true)
      expect(isPrefetchEnabled()).toBe(true)
    })

    it('should cancel pending prefetches when disabled', async () => {
      await prefetchVideo(mockVideo)
      
      setPrefetchEnabled(false)
      
      const queue = getPrefetchQueue()
      expect(queue.queued.length + queue.inProgress.length).toBe(0)
    })
  })

  describe('setPrefetchWalletAddress / getPrefetchWalletAddress', () => {
    it('should set and get wallet address', () => {
      setPrefetchWalletAddress('0xabc')
      expect(getPrefetchWalletAddress()).toBe('0xabc')
      
      setPrefetchWalletAddress(null)
      expect(getPrefetchWalletAddress()).toBe(null)
    })

    it('should normalize address to lowercase', () => {
      setPrefetchWalletAddress('0xABC123')
      expect(getPrefetchWalletAddress()).toBe('0xabc123')
    })
  })

  describe('prefetchVideo', () => {
    it('should not queue non-encrypted videos', async () => {
      const result = await prefetchVideo(mockNonEncryptedVideo)
      expect(result).toBe(false)
    })

    it('should not queue when prefetch is disabled', async () => {
      setPrefetchEnabled(false)
      const result = await prefetchVideo(mockVideo)
      expect(result).toBe(false)
    })

    it('should not queue same video twice', async () => {
      const result1 = await prefetchVideo(mockVideo)
      expect(result1).toBe(true)
      
      const result2 = await prefetchVideo(mockVideo)
      expect(result2).toBe(false)
    })

    it('should queue encrypted video', async () => {
      const result = await prefetchVideo(mockVideo)
      expect(result).toBe(true)
      
      const queue = getPrefetchQueue()
      expect(queue.queued.length + queue.inProgress.length).toBeGreaterThan(0)
    })
  })

  describe('cancelPrefetch', () => {
    it('should cancel a queued prefetch', async () => {
      await prefetchVideo(mockVideo)
      
      const cancelled = cancelPrefetch(mockVideo.id)
      expect(cancelled).toBe(true)
      
      const queue = getPrefetchQueue()
      expect(queue.queued.length).toBe(0)
    })

    it('should return false for non-existent video', () => {
      const cancelled = cancelPrefetch('non-existent')
      expect(cancelled).toBe(false)
    })
  })

  describe('getPrefetchQueue', () => {
    it('should return empty queue initially', () => {
      const queue = getPrefetchQueue()
      expect(queue.total).toBe(0)
      expect(queue.queued).toEqual([])
      expect(queue.inProgress).toEqual([])
      expect(queue.completed).toEqual([])
      expect(queue.failed).toEqual([])
    })

    it('should reflect queued items', async () => {
      await prefetchVideo(mockVideo)
      
      const queue = getPrefetchQueue()
      expect(queue.total).toBeGreaterThan(0)
    })
  })

  describe('clearAllPrefetches', () => {
    it('should clear all prefetches', async () => {
      await prefetchVideo(mockVideo)
      await prefetchVideo({ ...mockVideo, id: 'video-3', encryptedCid: 'QmTest789' })
      
      const cleared = clearAllPrefetches()
      expect(cleared).toBeGreaterThan(0)
      
      const queue = getPrefetchQueue()
      expect(queue.total).toBe(0)
    })
  })

  describe('shouldPrefetchBasedOnConnection', () => {
    it('should return false when disabled', () => {
      setPrefetchEnabled(false)
      expect(shouldPrefetchBasedOnConnection()).toBe(false)
    })

    it('should return true when enabled and no connection API', () => {
      setPrefetchEnabled(true)
      // In test environment, navigator.connection is undefined
      expect(shouldPrefetchBasedOnConnection()).toBe(true)
    })
  })
})
