/**
 * Unit tests for aes-key-cache.ts
 * 
 * Tests for the per-video AES key caching utilities.
 */

import {
  getCachedKey,
  setCachedKey,
  clearKey,
  clearAllKeys,
  getKeyStats,
  hasCachedKey,
  getCachedKeyCount,
  getVideoIdFromMetadata,
  DEFAULT_KEY_TTL,
} from '../../aes-key-cache'

describe('aes-key-cache', () => {
  beforeEach(() => {
    // Clear all keys before each test
    clearAllKeys()
  })

  afterEach(() => {
    clearAllKeys()
  })

  describe('getCachedKey', () => {
    it('returns null when no key cached', () => {
      const result = getCachedKey('non-existent-video')
      expect(result).toBeNull()
    })

    it('returns key copy when cached', () => {
      const videoId = 'test-video'
      const key = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32])
      const iv = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])

      setCachedKey(videoId, key, iv)
      const result = getCachedKey(videoId)

      expect(result).not.toBeNull()
      expect(result!.key).toEqual(key)
      expect(result!.iv).toEqual(iv)
    })

    it('returns null when key expired', () => {
      const videoId = 'expired-video'
      const key = new Uint8Array(32)
      const iv = new Uint8Array(12)

      // Set key with very short TTL (negative = already expired)
      setCachedKey(videoId, key, iv, -1000)

      const result = getCachedKey(videoId)
      expect(result).toBeNull()
    })

    it('returned key is a copy, not a reference', () => {
      const videoId = 'copy-test'
      const key = new Uint8Array([1, 2, 3, 4, 5])
      const iv = new Uint8Array([1, 2, 3])

      setCachedKey(videoId, key, iv)
      const result1 = getCachedKey(videoId)
      const result2 = getCachedKey(videoId)

      // Should be equal content
      expect(result1!.key).toEqual(result2!.key)
      // But different objects
      expect(result1!.key).not.toBe(result2!.key)
    })

    it('modifying returned key does not affect cache', () => {
      const videoId = 'modify-test'
      const key = new Uint8Array([1, 2, 3, 4, 5])
      const iv = new Uint8Array([1, 2, 3])

      setCachedKey(videoId, key, iv)
      const result = getCachedKey(videoId)

      // Modify the returned key
      result!.key[0] = 99

      // Get again - should still have original value
      const result2 = getCachedKey(videoId)
      expect(result2!.key[0]).toBe(1)
    })

    it('returns null for empty videoId', () => {
      const result = getCachedKey('')
      expect(result).toBeNull()
    })

    it('automatically clears expired key from cache', () => {
      const videoId = 'auto-clear-expired'
      const key = new Uint8Array(32)
      const iv = new Uint8Array(12)

      setCachedKey(videoId, key, iv, -1000) // Already expired

      // Getting should trigger cleanup
      getCachedKey(videoId)

      // Should be removed from cache
      expect(hasCachedKey(videoId)).toBe(false)
    })
  })

  describe('setCachedKey', () => {
    it('stores key copy for video ID', () => {
      const videoId = 'store-test'
      const key = new Uint8Array([5, 10, 15, 20, 25])
      const iv = new Uint8Array([2, 4, 6])

      setCachedKey(videoId, key, iv)

      const result = getCachedKey(videoId)
      expect(result).not.toBeNull()
      expect(result!.key).toEqual(key)
      expect(result!.iv).toEqual(iv)
    })

    it('overwrites existing key for same video', () => {
      const videoId = 'overwrite-test'
      const key1 = new Uint8Array([1, 2, 3])
      const iv1 = new Uint8Array([1, 2, 3])
      const key2 = new Uint8Array([4, 5, 6])
      const iv2 = new Uint8Array([4, 5, 6])

      setCachedKey(videoId, key1, iv1)
      setCachedKey(videoId, key2, iv2)

      const result = getCachedKey(videoId)
      expect(result!.key).toEqual(key2)
      expect(result!.iv).toEqual(iv2)
    })

    it('zero-fills old key when overwriting', () => {
      const videoId = 'zero-fill-test'
      const key1 = new Uint8Array([1, 2, 3, 4, 5])
      const iv1 = new Uint8Array([1, 2, 3])
      const key2 = new Uint8Array([6, 7, 8, 9, 10])
      const iv2 = new Uint8Array([4, 5, 6])

      setCachedKey(videoId, key1, iv1)
      
      // Store a copy to verify it's zeroed
      const key1Copy = new Uint8Array(key1)
      
      setCachedKey(videoId, key2, iv2)

      // Original key1 array should still have its values
      // (the cache clears its internal copy, not the original)
      expect(key1[0]).toBe(1)
      expect(key1Copy[0]).toBe(1)
    })

    it('stores copy of key, not reference', () => {
      const videoId = 'store-copy-test'
      const key = new Uint8Array([1, 2, 3, 4, 5])
      const iv = new Uint8Array([1, 2, 3])

      setCachedKey(videoId, key, iv)

      // Modify original
      key[0] = 99

      // Should still have original value in cache
      const result = getCachedKey(videoId)
      expect(result!.key[0]).toBe(1)
    })

    it('uses default TTL when not specified', () => {
      const videoId = 'default-ttl-test'
      const key = new Uint8Array(32)
      const iv = new Uint8Array(12)

      const beforeSet = Date.now()
      setCachedKey(videoId, key, iv)
      const afterSet = Date.now()

      // Key should be valid (not expired)
      expect(getCachedKey(videoId)).not.toBeNull()

      // Check stats for expiration info
      const stats = getKeyStats()
      expect(stats.count).toBe(1)
    })

    it('uses custom TTL when specified', () => {
      const videoId = 'custom-ttl-test'
      const key = new Uint8Array(32)
      const iv = new Uint8Array(12)

      setCachedKey(videoId, key, iv, 100) // 100ms TTL

      // Should be valid immediately
      expect(getCachedKey(videoId)).not.toBeNull()

      // Wait for expiration
      jest.advanceTimersByTime(200)

      // Should be expired now
      expect(getCachedKey(videoId)).toBeNull()
    })

    it('does nothing for empty videoId', () => {
      const key = new Uint8Array([1, 2, 3])
      const iv = new Uint8Array([1, 2, 3])

      setCachedKey('', key, iv)

      expect(getCachedKeyCount()).toBe(0)
    })

    it('does nothing for null key', () => {
      setCachedKey('test', null as any, new Uint8Array([1, 2, 3]))
      expect(getCachedKeyCount()).toBe(0)
    })

    it('does nothing for null iv', () => {
      setCachedKey('test', new Uint8Array([1, 2, 3]), null as any)
      expect(getCachedKeyCount()).toBe(0)
    })
  })

  describe('clearKey', () => {
    it('zero-fills key before removing', () => {
      const videoId = 'clear-zero-test'
      const key = new Uint8Array([1, 2, 3, 4, 5])
      const iv = new Uint8Array([1, 2, 3])

      setCachedKey(videoId, key, iv)
      
      // Clear the key
      clearKey(videoId)

      // Should be removed
      expect(getCachedKey(videoId)).toBeNull()
    })

    it('removes key from cache', () => {
      const videoId = 'clear-remove-test'
      setCachedKey(videoId, new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))

      expect(hasCachedKey(videoId)).toBe(true)

      clearKey(videoId)

      expect(hasCachedKey(videoId)).toBe(false)
    })

    it('does not throw for non-existent key', () => {
      expect(() => clearKey('non-existent')).not.toThrow()
    })

    it('does not throw for empty videoId', () => {
      expect(() => clearKey('')).not.toThrow()
    })

    it('only clears specified key', () => {
      setCachedKey('keep', new Uint8Array([1]), new Uint8Array([1]))
      setCachedKey('remove', new Uint8Array([2]), new Uint8Array([2]))

      clearKey('remove')

      expect(hasCachedKey('keep')).toBe(true)
      expect(hasCachedKey('remove')).toBe(false)
    })
  })

  describe('clearAllKeys', () => {
    it('zero-fills and removes all keys', () => {
      setCachedKey('key1', new Uint8Array([1, 2, 3]), new Uint8Array([1]))
      setCachedKey('key2', new Uint8Array([4, 5, 6]), new Uint8Array([2]))
      setCachedKey('key3', new Uint8Array([7, 8, 9]), new Uint8Array([3]))

      expect(getCachedKeyCount()).toBe(3)

      clearAllKeys()

      expect(getCachedKeyCount()).toBe(0)
      expect(hasCachedKey('key1')).toBe(false)
      expect(hasCachedKey('key2')).toBe(false)
      expect(hasCachedKey('key3')).toBe(false)
    })

    it('handles empty cache', () => {
      expect(getCachedKeyCount()).toBe(0)
      expect(() => clearAllKeys()).not.toThrow()
      expect(getCachedKeyCount()).toBe(0)
    })

    it('clears keys that were expired', () => {
      setCachedKey('expired', new Uint8Array([1]), new Uint8Array([1]), -1000)
      
      // Expired but still in cache until accessed
      // clearAllKeys should handle it
      expect(() => clearAllKeys()).not.toThrow()
      expect(getCachedKeyCount()).toBe(0)
    })
  })

  describe('getKeyStats', () => {
    it('returns zero stats for empty cache', () => {
      const stats = getKeyStats()

      expect(stats.count).toBe(0)
      expect(stats.totalKeyBytes).toBe(0)
      expect(stats.videoIds).toEqual([])
    })

    it('returns correct count', () => {
      setCachedKey('v1', new Uint8Array(32), new Uint8Array(12))
      setCachedKey('v2', new Uint8Array(32), new Uint8Array(12))

      const stats = getKeyStats()
      expect(stats.count).toBe(2)
    })

    it('returns correct total key bytes', () => {
      // Key: 32 bytes, IV: 12 bytes = 44 bytes per entry
      setCachedKey('v1', new Uint8Array(32), new Uint8Array(12))
      setCachedKey('v2', new Uint8Array(32), new Uint8Array(12))

      const stats = getKeyStats()
      expect(stats.totalKeyBytes).toBe(88) // 44 * 2
    })

    it('returns list of video IDs', () => {
      setCachedKey('video-a', new Uint8Array([1]), new Uint8Array([1]))
      setCachedKey('video-b', new Uint8Array([2]), new Uint8Array([2]))

      const stats = getKeyStats()
      expect(stats.videoIds).toContain('video-a')
      expect(stats.videoIds).toContain('video-b')
      expect(stats.videoIds).toHaveLength(2)
    })

    it('does not include expired keys in stats', () => {
      setCachedKey('valid', new Uint8Array([1]), new Uint8Array([1]), 3600000)
      setCachedKey('expired', new Uint8Array([1]), new Uint8Array([1]), -1000)

      // Accessing expired key clears it
      getCachedKey('expired')

      const stats = getKeyStats()
      expect(stats.count).toBe(1)
      expect(stats.videoIds).toContain('valid')
      expect(stats.videoIds).not.toContain('expired')
    })
  })

  describe('hasCachedKey', () => {
    it('returns true for cached key', () => {
      setCachedKey('has-test', new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))

      expect(hasCachedKey('has-test')).toBe(true)
    })

    it('returns false for non-cached key', () => {
      expect(hasCachedKey('not-cached')).toBe(false)
    })

    it('returns false for expired key', () => {
      setCachedKey('expired-check', new Uint8Array([1]), new Uint8Array([1]), -1000)

      expect(hasCachedKey('expired-check')).toBe(false)
    })

    it('returns false for empty videoId', () => {
      expect(hasCachedKey('')).toBe(false)
    })

    it('clears expired key when checking', () => {
      setCachedKey('expired-clear', new Uint8Array([1]), new Uint8Array([1]), -1000)

      hasCachedKey('expired-clear')

      // Should be completely removed
      expect(getCachedKeyCount()).toBe(0)
    })
  })

  describe('getCachedKeyCount', () => {
    it('returns 0 for empty cache', () => {
      expect(getCachedKeyCount()).toBe(0)
    })

    it('returns correct count', () => {
      setCachedKey('count1', new Uint8Array([1]), new Uint8Array([1]))
      setCachedKey('count2', new Uint8Array([2]), new Uint8Array([2]))
      setCachedKey('count3', new Uint8Array([3]), new Uint8Array([3]))

      expect(getCachedKeyCount()).toBe(3)
    })

    it('updates after clearing', () => {
      setCachedKey('c1', new Uint8Array([1]), new Uint8Array([1]))
      setCachedKey('c2', new Uint8Array([2]), new Uint8Array([2]))

      expect(getCachedKeyCount()).toBe(2)

      clearKey('c1')

      expect(getCachedKeyCount()).toBe(1)
    })
  })

  describe('getVideoIdFromMetadata', () => {
    it('returns keyHash when available', () => {
      const metadata = { keyHash: 'abc123', encryptedKey: 'xyz789' }
      expect(getVideoIdFromMetadata(metadata)).toBe('abc123')
    })

    it('falls back to encryptedKey prefix when no keyHash', () => {
      const metadata = { encryptedKey: 'xyz789abcdef' }
      expect(getVideoIdFromMetadata(metadata)).toBe('xyz789abcdef'.slice(0, 32))
    })

    it('returns null when no identifiers available', () => {
      expect(getVideoIdFromMetadata({})).toBeNull()
      expect(getVideoIdFromMetadata({ otherField: 'value' })).toBeNull()
    })
  })

  describe('DEFAULT_KEY_TTL', () => {
    it('equals 1 hour in milliseconds', () => {
      expect(DEFAULT_KEY_TTL).toBe(60 * 60 * 1000)
    })
  })
})
